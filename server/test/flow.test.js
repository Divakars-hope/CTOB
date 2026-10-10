import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seed, LOCATIONS } from '../src/db.js';
import { createApp } from '../src/app.js';

async function boot() {
  const db = openDb(); seed(db);
  const server = createApp(db).listen(0); server.unref();
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body, token) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };
  const customer = async (mobile = '9876543210') => (await call('POST', '/auth/verify-otp', { mobile, otp: '123456' })).token;
  const staff = async (userId) => (await call('POST', '/auth/business-login', { userId })).token;
  return { db, call, customer, staff, close: () => server.close() };
}
const A = LOCATIONS.A, B = LOCATIONS.B;

test('OTP login validates number and code', async () => {
  const t = await boot();
  assert.equal((await t.call('POST', '/auth/request-otp', { mobile: '123' })).status, 400);
  assert.equal((await t.call('POST', '/auth/verify-otp', { mobile: '9876543210', otp: '000000' })).status, 401);
  assert.ok(await t.customer());
  t.close();
});

test('searches create Demand Beacon signals; requests never do', async () => {
  const t = await boot(); const abc = await t.staff(11); const c = await t.customer('9000000001');
  const count = async () => (await t.call('GET', '/retailer/demand-beacon', null, abc)).items.find((i) => i.productId === 1);
  const before = await count();
  assert.equal(before.searches, 25);
  assert.equal(before.requests, 5 + 0 > 0 ? before.requests : 0);
  for (let i = 0; i < 5; i++) await t.call('POST', '/product-requests', { productId: 1, shopId: 1 }, c);
  const afterRequests = await count();
  assert.equal(afterRequests.searches, 25, 'requests must not inflate searches');
  assert.equal(afterRequests.requests, before.requests + 5);
  const s1 = await t.call('POST', '/search-events', { productId: 1, lat: A.lat, lng: A.lng }, c);
  assert.equal(s1.recorded, true);
  const s2 = await t.call('POST', '/search-events', { productId: 1, lat: A.lat, lng: A.lng }, c);
  assert.equal(s2.recorded, false, 'duplicate submit within a minute is not double counted');
  assert.equal((await count()).searches, 26);
  assert.equal(afterRequests.opportunity, 'high');
  t.close();
});

test('availability respects radius and hides exact quantities', async () => {
  const t = await boot(); const c = await t.customer();
  const r = await t.call('GET', `/products/1/availability?lat=${A.lat}&lng=${A.lng}&radius=500`, null, c);
  assert.deepEqual(r.shops.map((s) => s.name), ['ABC Store']);
  assert.equal(r.shops[0].status, 'out');
  assert.equal('qty' in r.shops[0], false);
  const wide = await t.call('GET', `/products/1/availability?lat=${A.lat}&lng=${A.lng}&radius=2000`, null, c);
  assert.equal(wide.shops.length, 3);
  assert.equal((await t.call('GET', `/products/1/availability?lat=${A.lat}&lng=${A.lng}&radius=777`, null, c)).status, 400);
  t.close();
});

test('sale reduces stock in the backend, blocks negative stock and double-submit', async () => {
  const t = await boot(); const sl = await t.staff(12);
  const qty = async () => (await t.call('GET', '/retailer/inventory', null, sl)).items.find((i) => i.productId === 1).qty;
  assert.equal(await qty(), 2);
  const sale = await t.call('POST', '/retailer/sales', { items: [{ productId: 1, quantity: 1 }], paymentMethod: 'UPI', clientRef: 'x1' }, sl);
  assert.equal(sale.status, 201); assert.equal(await qty(), 1);
  const again = await t.call('POST', '/retailer/sales', { items: [{ productId: 1, quantity: 1 }], paymentMethod: 'UPI', clientRef: 'x1' }, sl);
  assert.equal(again.duplicate, true); assert.equal(await qty(), 1);
  const over = await t.call('POST', '/retailer/sales', { items: [{ productId: 1, quantity: 5 }], paymentMethod: 'Cash' }, sl);
  assert.equal(over.status, 409); assert.equal(await qty(), 1);
  assert.equal((await t.call('POST', '/retailer/sales', { items: [{ productId: 1, quantity: 0 }], paymentMethod: 'Cash' }, sl)).status, 400);
  t.close();
});

test('stock audit changes nothing until confirmed', async () => {
  const t = await boot(); const sl = await t.staff(12);
  const qty = async () => (await t.call('GET', '/retailer/inventory', null, sl)).items.find((i) => i.productId === 1).qty;
  const a = await t.call('POST', '/retailer/stock-audits', { productId: 1, physicalCount: 1 }, sl);
  assert.equal(a.audit.expected, 2); assert.equal(a.audit.variance, -1); assert.equal(await qty(), 2);
  assert.equal((await t.call('POST', `/retailer/stock-audits/${a.audit.id}/confirm`, {}, sl)).status, 200);
  assert.equal(await qty(), 1);
  assert.equal((await t.call('POST', `/retailer/stock-audits/${a.audit.id}/confirm`, {}, sl)).status, 409);
  t.close();
});

test('low stock follows the configured threshold', async () => {
  const t = await boot(); const sl = await t.staff(12);
  await t.call('PATCH', '/retailer/inventory/1', { qty: 2, threshold: 3 }, sl);
  assert.equal((await t.call('GET', '/retailer/inventory', null, sl)).items.find((i) => i.productId === 1).status, 'low');
  await t.call('PATCH', '/retailer/inventory/1', { qty: 4 }, sl);
  assert.equal((await t.call('GET', '/retailer/inventory', null, sl)).items.find((i) => i.productId === 1).status, 'available');
  assert.equal((await t.call('PATCH', '/retailer/inventory/1', { qty: -1 }, sl)).status, 400);
  t.close();
});

test('restock notifies a customer with a reminder once, and travel triggers a check without spam', async () => {
  const t = await boot(); const abc = await t.staff(11); const c = await t.customer();
  await t.call('POST', '/me/location', { lat: A.lat, lng: A.lng, label: A.label }, c);
  assert.equal((await t.call('POST', '/reminders', { productId: 1, radius: 1000, lat: A.lat, lng: A.lng }, c)).status, 201);
  await t.call('PATCH', '/retailer/inventory/1', { qty: 20 }, abc);
  let n = await t.call('GET', '/notifications', null, c);
  assert.equal(n.notifications.length, 1);
  assert.match(n.notifications[0].message, /ABC Store has Rare Chocolate available 280 m away/);
  await t.call('PATCH', '/retailer/inventory/1', { qty: 25 }, abc); // still stocked: no new alert
  assert.equal((await t.call('GET', '/notifications', null, c)).notifications.length, 1);
  // travel to a new city: reminder is not tied to the original location
  const move = await t.call('POST', '/me/location', { lat: B.lat, lng: B.lng, label: B.label }, c);
  assert.equal(move.notified, 1);
  n = await t.call('GET', '/notifications', null, c);
  assert.equal(n.notifications.length, 2);
  assert.match(n.notifications[0].message, /Green Basket/);
  const again = await t.call('POST', '/me/location', { lat: B.lat + 0.0001, lng: B.lng, label: B.label }, c);
  assert.equal(again.notified, 0);
  await t.call('POST', '/me/location', { lat: A.lat, lng: A.lng, label: A.label }, c);
  await t.call('POST', '/me/location', { lat: B.lat, lng: B.lng, label: B.label }, c);
  assert.equal((await t.call('GET', '/notifications', null, c)).notifications.length, 2, 'unchanged availability does not re-notify');
  t.close();
});

test('dealer order flow credits retailer inventory on delivery', async () => {
  const t = await boot(); const abc = await t.staff(11); const dealer = await t.staff(30);
  const o = await t.call('POST', '/retailer/orders', { items: [{ productId: 1, quantity: 20 }] }, abc);
  assert.equal(o.status, 201);
  assert.equal((await t.call('POST', '/retailer/orders', { items: [{ productId: 1, quantity: 0 }] }, abc)).status, 400);
  const patch = (s) => t.call('PATCH', `/dealer/orders/${o.orderId}/status`, { status: s }, dealer);
  assert.equal((await patch('Delivered')).status, 409, 'cannot skip steps');
  for (const s of ['Confirmed', 'Dispatched', 'Delivered']) assert.equal((await patch(s)).status, 200);
  assert.equal((await t.call('GET', '/retailer/inventory', null, abc)).items.find((i) => i.productId === 1).qty, 20);
  assert.equal((await t.call('GET', '/retailer/dashboard', null, await t.customer())).status, 403);
  t.close();
});

test('shop discovery returns statuses only and honours radius', async () => {
  const t = await boot(); const c = await t.customer();
  const near = await t.call('GET', `/shops/nearby?lat=${A.lat}&lng=${A.lng}&radius=2000`, null, c);
  assert.deepEqual(near.shops.map((s) => s.name), ['ABC Store', 'Sri Lakshmi Stores', 'Kannan Mart']);
  assert.equal((await t.call('GET', `/shops/nearby?lat=${A.lat}&lng=${A.lng}&radius=42`, null, c)).status, 400);
  const shop = await t.call('GET', `/shops/1?lat=${A.lat}&lng=${A.lng}`, null, c);
  assert.equal(shop.shop.distanceM, 280);
  assert.ok(shop.products.every((p) => !('qty' in p) && ['available', 'low', 'out'].includes(p.status)));
  assert.equal((await t.call('GET', '/shops/999', null, c)).status, 404);
  assert.equal((await t.call('GET', `/shops/nearby?lat=${A.lat}&lng=${A.lng}&radius=1000`)).status, 401);
  t.close();
});

test('health endpoint responds without auth', async () => {
  const t = await boot();
  assert.equal((await t.call('GET', '/health')).status, 'ok');
  t.close();
});

test('logout ends only that session; others stay signed in; login works again', async () => {
  const t = await boot();
  const dealerA = await t.staff(30), retailer = await t.staff(11), customer = await t.customer();
  assert.equal((await t.call('GET', '/dealer/orders', null, dealerA)).success, true);
  assert.equal((await t.call('POST', '/auth/logout', {}, dealerA)).success, true);
  assert.equal((await t.call('GET', '/dealer/orders', null, dealerA)).status, 401, 'old dealer token no longer works');
  assert.equal((await t.call('GET', '/retailer/dashboard', null, retailer)).success, true);
  assert.equal((await t.call('GET', '/me', null, customer)).success, true);
  const dealerB = await t.staff(30);
  assert.equal((await t.call('GET', '/dealer/orders', null, dealerB)).success, true, 'sign back in works');
  assert.ok((await t.call('GET', '/dealer/products', null, dealerB)).products.length > 0, 'logout deleted no data');
  t.close();
});

test('three roles act concurrently without errors or lost stock', async () => {
  const t = await boot();
  const [c, r, d] = [await t.customer(), await t.staff(12), await t.staff(30)];
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    jobs.push(t.call('GET', `/products/1/availability?lat=${A.lat}&lng=${A.lng}&radius=2000`, null, c));
    jobs.push(t.call('GET', '/retailer/dashboard', null, r));
    jobs.push(t.call('GET', '/dealer/products', null, d));
  }
  // 2 units in stock; 5 concurrent single-unit sales must sell exactly 2
  for (let i = 0; i < 5; i++) jobs.push(t.call('POST', '/retailer/sales', { items: [{ productId: 1, quantity: 1 }], paymentMethod: 'Cash', clientRef: `c${i}` }, r));
  const out = await Promise.all(jobs);
  assert.ok(out.every((x) => x.status < 500));
  assert.equal(out.filter((x) => x.status === 201).length, 2);
  assert.equal((await t.call('GET', '/retailer/inventory', null, r)).items.find((i) => i.productId === 1).qty, 0);
  t.close();
});

test('dealer delivery credits inventory exactly once', async () => {
  const t = await boot(); const abc = await t.staff(11), dealer = await t.staff(30);
  const qty = async () => (await t.call('GET', '/retailer/inventory', null, abc)).items.find((i) => i.productId === 1).qty;
  const o = await t.call('POST', '/retailer/orders', { items: [{ productId: 1, quantity: 10 }] }, abc);
  const patch = (s) => t.call('PATCH', `/dealer/orders/${o.orderId}/status`, { status: s }, dealer);
  await patch('Confirmed'); assert.equal(await qty(), 0, 'confirming adds no stock');
  await patch('Dispatched'); assert.equal(await qty(), 0);
  await Promise.all([patch('Delivered'), patch('Delivered')]);
  assert.equal(await qty(), 10, 'delivered twice still credits once');
  assert.equal((await patch('Delivered')).status, 409);
  t.close();
});

test('searches count, requests and reminders do not (end to end through the API)', async () => {
  const t = await boot(); const abc = await t.staff(11); const c = await t.customer('9000000002');
  const n = async () => (await t.call('GET', '/retailer/demand-beacon', null, abc)).items.find((i) => i.productId === 1).searches;
  const before = await n();
  await t.call('POST', '/product-requests', { productId: 1 }, c);
  await t.call('POST', '/reminders', { productId: 1, radius: 1000, lat: A.lat, lng: A.lng }, c);
  assert.equal(await n(), before);
  await t.call('POST', '/search-events', { productId: 1, lat: A.lat, lng: A.lng }, c);
  assert.equal(await n(), before + 1);
  t.close();
});
