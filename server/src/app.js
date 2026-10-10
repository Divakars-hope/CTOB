import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { distanceM, RADIUS_OPTIONS } from './geo.js';
import { LOCATIONS } from './db.js';
import { AppError, createLogic, now, stockStatus, opportunity } from './logic.js';

const OTP = '123456'; // fixed one-time code: no SMS provider is connected
const int = (v, name, { min = 0, max = 1e6 } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(400, `${name} must be a whole number between ${min} and ${max}`);
  return n;
};
const coord = (lat, lng) => {
  lat = Number(lat); lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError(400, 'Location is not valid');
  return [lat, lng];
};

export function createApp(db, { clientDir } = {}) {
  const L = createLogic(db);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const h = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
  const ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, ...data });
  const api = express.Router();
  const health = (req, res) => { db.prepare('SELECT 1').get(); res.json({ success: true, status: 'ok', uptime: Math.round(process.uptime()) }); };
  app.get('/health', h(health)); api.get('/health', h(health));

  // ---------- auth ----------
  api.post('/auth/request-otp', h((req, res) => {
    if (!/^[6-9]\d{9}$/.test(String(req.body.mobile || ''))) throw new AppError(400, 'Enter a valid 10-digit mobile number');
    ok(res, { message: 'A verification code has been sent' });
  }));
  const session = (userId) => {
    const token = crypto.randomUUID();
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, userId, now());
    return token;
  };
  api.post('/auth/verify-otp', h((req, res) => {
    const { mobile, otp } = req.body;
    if (!/^[6-9]\d{9}$/.test(String(mobile || ''))) throw new AppError(400, 'Enter a valid 10-digit mobile number');
    if (String(otp) !== OTP) throw new AppError(401, 'That code is not correct');
    let u = db.prepare("SELECT * FROM users WHERE mobile=? AND role='customer'").get(mobile);
    if (!u) {
      const r = db.prepare("INSERT INTO users (role,name,mobile,lang,created_at) VALUES ('customer','Customer',?, 'en', ?)").run(mobile, now());
      u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    }
    ok(res, { token: session(u.id), user: publicUser(u) });
  }));
  api.post('/auth/logout', h((req, res) => { // ends only this device's session
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    ok(res);
  }));
  api.get('/auth/accounts', h((req, res) => {
    ok(res, { accounts: db.prepare("SELECT id, name, role FROM users WHERE role IN ('retailer','dealer') ORDER BY role, id").all() });
  }));
  api.post('/auth/business-login', h((req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id=? AND role IN ('retailer','dealer')").get(Number(req.body.userId));
    if (!u) throw new AppError(404, 'Account not found');
    ok(res, { token: session(u.id), user: publicUser(u) });
  }));
  const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, lang: u.lang, shopId: u.shop_id, dealerId: u.dealer_id, mobile: u.role === 'customer' ? u.mobile : null,
    location: u.last_lat == null ? null : { lat: u.last_lat, lng: u.last_lng, label: u.last_label } });

  const auth = (roles) => (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const row = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
    if (!row) return next(new AppError(401, 'Please sign in to continue'));
    if (roles && !roles.includes(row.role)) return next(new AppError(403, 'You do not have access to this section'));
    req.user = row; next();
  };

  api.get('/locations', (req, res) => ok(res, { locations: Object.values(LOCATIONS), radii: RADIUS_OPTIONS }));
  api.get('/categories', (req, res) => ok(res, { categories: db.prepare('SELECT id, name FROM categories ORDER BY id').all() }));
  api.get('/me', auth(), (req, res) => ok(res, { user: publicUser(req.user) }));
  api.patch('/me', auth(), h((req, res) => {
    if (!['en', 'ta'].includes(req.body.lang)) throw new AppError(400, 'Unsupported language');
    db.prepare('UPDATE users SET lang=? WHERE id=?').run(req.body.lang, req.user.id);
    ok(res);
  }));
  // Update where the customer is. A meaningful move (>= 500 m) re-checks saved reminders.
  api.post('/me/location', auth(['customer']), h((req, res) => {
    const [lat, lng] = coord(req.body.lat, req.body.lng);
    const u = req.user;
    const moved = u.last_lat == null ? Infinity : distanceM(u.last_lat, u.last_lng, lat, lng);
    db.prepare('UPDATE users SET last_lat=?, last_lng=?, last_label=? WHERE id=?').run(lat, lng, String(req.body.label || '').slice(0, 80) || null, u.id);
    const notified = moved >= 500 ? L.checkReminders(u.id) : 0;
    ok(res, { moved: moved === Infinity ? null : moved, notified });
  }));

  // ---------- catalogue / search ----------
  api.get('/products', auth(), h((req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const cat = req.query.category ? Number(req.query.category) : null;
    const rows = db.prepare(`SELECT p.id, p.name, p.name_ta, p.price, c.id category_id, c.name category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name`).all()
      .filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.name_ta || '').includes(q)) && (!cat || p.category_id === cat));
    ok(res, { products: rows });
  }));
  api.get('/products/:id/availability', auth(), h((req, res) => {
    const p = db.prepare('SELECT id, name, name_ta, price FROM products WHERE id=? AND active=1').get(Number(req.params.id));
    if (!p) throw new AppError(404, 'Product not found');
    const [lat, lng] = coord(req.query.lat, req.query.lng);
    const radius = int(req.query.radius || 1000, 'radius', { min: 1, max: 5000 });
    if (!RADIUS_OPTIONS.includes(radius)) throw new AppError(400, 'Choose a valid search radius');
    const shops = L.shopsWithStock(p.id)
      .map((s) => ({ id: s.id, name: s.name, area: s.area, lat: s.lat, lng: s.lng, distanceM: distanceM(lat, lng, s.lat, s.lng), status: stockStatus(s.qty, s.threshold) }))
      .filter((s) => s.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM);
    ok(res, { product: p, radius, shops, anyAvailable: shops.some((s) => s.status !== 'out') });
  }));
  // One event per submitted search (not per keystroke). Same user + product within 60 s is ignored.
  api.post('/search-events', auth(['customer']), h((req, res) => {
    const pid = int(req.body.productId, 'productId', { min: 1 });
    if (!db.prepare('SELECT 1 FROM products WHERE id=? AND active=1').get(pid)) throw new AppError(404, 'Product not found');
    const [lat, lng] = coord(req.body.lat, req.body.lng);
    const since = new Date(Date.now() - 60e3).toISOString();
    if (db.prepare('SELECT 1 FROM search_events WHERE user_id=? AND product_id=? AND created_at>=?').get(req.user.id, pid, since)) return ok(res, { recorded: false });
    db.prepare('INSERT INTO search_events (product_id,user_id,lat,lng,created_at) VALUES (?,?,?,?,?)').run(pid, req.user.id, lat, lng, now());
    ok(res, { recorded: true }, 201);
  }));

  // ---------- shops (customer discovery; statuses only, never quantities) ----------
  api.get('/shops/nearby', auth(['customer']), h((req, res) => {
    const [lat, lng] = coord(req.query.lat, req.query.lng);
    const radius = int(req.query.radius || 1000, 'radius', { min: 1, max: 5000 });
    if (!RADIUS_OPTIONS.includes(radius)) throw new AppError(400, 'Choose a valid search radius');
    const shops = db.prepare('SELECT id,name,area,lat,lng FROM shops').all()
      .map((s) => ({ ...s, distanceM: distanceM(lat, lng, s.lat, s.lng) })).filter((s) => s.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM);
    for (const s of shops) s.productCount = db.prepare('SELECT COUNT(*) n FROM inventory WHERE shop_id=? AND qty>0').get(s.id).n;
    ok(res, { radius, shops });
  }));
  api.get('/shops/:id', auth(['customer']), h((req, res) => {
    const shop = db.prepare('SELECT id,name,area,lat,lng FROM shops WHERE id=?').get(Number(req.params.id));
    if (!shop) throw new AppError(404, 'Shop not found');
    if (req.query.lat !== undefined) { const [la, ln] = coord(req.query.lat, req.query.lng); shop.distanceM = distanceM(la, ln, shop.lat, shop.lng); }
    const products = db.prepare(`SELECT p.id, p.name, p.name_ta, c.name category, i.qty, i.threshold FROM inventory i JOIN products p ON p.id=i.product_id
      JOIN categories c ON c.id=p.category_id WHERE i.shop_id=? AND p.active=1 ORDER BY p.name`).all(shop.id)
      .map((p) => ({ id: p.id, name: p.name, name_ta: p.name_ta, category: p.category, status: stockStatus(p.qty, p.threshold) }));
    ok(res, { shop, products });
  }));

  // ---------- requests & reminders (never touch search_events) ----------
  api.post('/product-requests', auth(['customer']), h((req, res) => {
    const pid = int(req.body.productId, 'productId', { min: 1 });
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(pid)) throw new AppError(404, 'Product not found');
    const shopId = req.body.shopId ? int(req.body.shopId, 'shopId', { min: 1 }) : null;
    if (shopId && !db.prepare('SELECT 1 FROM shops WHERE id=?').get(shopId)) throw new AppError(404, 'Shop not found');
    db.prepare('INSERT INTO product_requests (product_id,user_id,shop_id,created_at) VALUES (?,?,?,?)').run(pid, req.user.id, shopId, now());
    ok(res, { message: 'Your request has been sent to nearby shops' }, 201);
  }));
  api.post('/reminders', auth(['customer']), h((req, res) => {
    const pid = int(req.body.productId, 'productId', { min: 1 });
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(pid)) throw new AppError(404, 'Product not found');
    const radius = int(req.body.radius, 'radius', { min: 1, max: 5000 });
    if (!RADIUS_OPTIONS.includes(radius)) throw new AppError(400, 'Choose a valid search radius');
    const [lat, lng] = coord(req.body.lat, req.body.lng);
    const existing = db.prepare('SELECT id FROM saved_reminders WHERE user_id=? AND product_id=? AND active=1').get(req.user.id, pid);
    if (existing) { db.prepare('UPDATE saved_reminders SET radius_m=? WHERE id=?').run(radius, existing.id); return ok(res, { id: existing.id, message: 'Reminder updated' }); }
    const r = db.prepare('INSERT INTO saved_reminders (user_id,product_id,radius_m,saved_lat,saved_lng,created_at) VALUES (?,?,?,?,?,?)').run(req.user.id, pid, radius, lat, lng, now());
    ok(res, { id: r.lastInsertRowid, message: 'Reminder saved' }, 201);
  }));
  api.get('/reminders', auth(['customer']), (req, res) => ok(res, { reminders: db.prepare(`SELECT r.id, r.product_id productId, p.name, p.name_ta, r.radius_m radius, r.created_at createdAt, r.active
    FROM saved_reminders r JOIN products p ON p.id=r.product_id WHERE r.user_id=? AND r.active=1 ORDER BY r.id DESC`).all(req.user.id) }));
  api.delete('/reminders/:id', auth(['customer']), h((req, res) => {
    const r = db.prepare('UPDATE saved_reminders SET active=0 WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
    if (!r.changes) throw new AppError(404, 'Reminder not found');
    ok(res);
  }));

  // ---------- notifications (any role) ----------
  api.get('/notifications', auth(), (req, res) => {
    const rows = db.prepare('SELECT id,title,message,product_id productId,shop_id shopId,read,created_at createdAt FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id);
    ok(res, { notifications: rows.map((n) => ({ ...n, read: !!n.read })), unread: rows.filter((n) => !n.read).length });
  });
  api.patch('/notifications/:id/read', auth(), h((req, res) => {
    db.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id); ok(res);
  }));
  api.post('/notifications/read-all', auth(), (req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); ok(res); });

  // ---------- retailer ----------
  const R = express.Router();
  R.use(auth(['retailer']));
  const shopOf = (req) => req.user.shop_id;
  const invRow = (shopId, pid) => db.prepare(`SELECT i.product_id productId, p.name, p.name_ta, c.name category, i.qty, i.threshold, COALESCE(i.price,p.price) price
    FROM inventory i JOIN products p ON p.id=i.product_id JOIN categories c ON c.id=p.category_id WHERE i.shop_id=? AND i.product_id=?`).get(shopId, pid);

  R.get('/dashboard', h((req, res) => {
    const sid = shopOf(req);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = db.prepare('SELECT COALESCE(SUM(total),0) t, COUNT(*) n FROM sales WHERE shop_id=? AND created_at>=?').get(sid, start.toISOString());
    const inv = db.prepare('SELECT qty, threshold FROM inventory WHERE shop_id=?').all(sid);
    const beacon = L.beacon(sid);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const audits = db.prepare("SELECT variance, status FROM stock_audits WHERE shop_id=? AND created_at>=?").all(sid, since);
    ok(res, {
      shop: db.prepare('SELECT id,name,area FROM shops WHERE id=?').get(sid),
      todaysSales: today.t, todaysBills: today.n, currentStock: inv.reduce((a, r) => a + r.qty, 0),
      lowStock: inv.filter((r) => stockStatus(r.qty, r.threshold) !== 'available').length,
      demandOpportunities: beacon.filter((b) => b.opportunity !== 'low').length,
      stockVariance: audits.filter((a) => a.status === 'confirmed').reduce((a, r) => a + r.variance, 0),
      pendingAudits: audits.filter((a) => a.status === 'pending').length,
    });
  }));
  R.get('/inventory', (req, res) => ok(res, {
    items: db.prepare(`SELECT i.product_id productId, p.name, p.name_ta, c.name category, i.qty, i.threshold, COALESCE(i.price,p.price) price
      FROM inventory i JOIN products p ON p.id=i.product_id JOIN categories c ON c.id=p.category_id WHERE i.shop_id=? ORDER BY p.name`).all(shopOf(req))
      .map((r) => ({ ...r, status: stockStatus(r.qty, r.threshold) })),
  }));
  R.get('/catalogue', (req, res) => ok(res, { products: db.prepare('SELECT p.id, p.name, c.name category, p.price FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name').all() }));
  // add a product to this shop's inventory (existing catalogue product, or create a new one)
  R.post('/inventory', h((req, res) => {
    const sid = shopOf(req);
    const qty = int(req.body.qty ?? 0, 'Stock');
    const threshold = int(req.body.threshold ?? 5, 'Low-stock level');
    let pid = req.body.productId ? int(req.body.productId, 'productId', { min: 1 }) : null;
    db.transaction(() => {
      if (!pid) {
        const name = String(req.body.name || '').trim();
        const price = Number(req.body.price);
        if (!name || name.length > 80) throw new AppError(400, 'Enter a product name');
        if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'Enter a valid price');
        const cat = db.prepare('SELECT id FROM categories WHERE id=?').get(Number(req.body.categoryId));
        if (!cat) throw new AppError(400, 'Choose a category');
        pid = db.prepare('INSERT INTO products (name,category_id,price,dealer_price,dealer_id) VALUES (?,?,?,?,1)').run(name, cat.id, price, Math.round(price * 0.8)).lastInsertRowid;
      } else if (!db.prepare('SELECT 1 FROM products WHERE id=? AND active=1').get(pid)) throw new AppError(404, 'Product not found');
      if (db.prepare('SELECT 1 FROM inventory WHERE shop_id=? AND product_id=?').get(sid, pid)) throw new AppError(409, 'This product is already in your inventory');
      db.prepare('INSERT INTO inventory (shop_id,product_id,qty,threshold) VALUES (?,?,0,?)').run(sid, pid, threshold);
      db.prepare('UPDATE inventory SET qty=? WHERE shop_id=? AND product_id=?').run(qty, sid, pid);
      L.afterStockChange(sid, pid, 0, qty);
    })();
    ok(res, { item: invRow(sid, pid) }, 201);
  }));
  R.patch('/inventory/:productId', h((req, res) => {
    const sid = shopOf(req), pid = Number(req.params.productId);
    db.transaction(() => {
      const cur = db.prepare('SELECT * FROM inventory WHERE shop_id=? AND product_id=?').get(sid, pid);
      if (!cur) throw new AppError(404, 'Product not found in your inventory');
      const qty = req.body.qty === undefined ? cur.qty : int(req.body.qty, 'Stock');
      const threshold = req.body.threshold === undefined ? cur.threshold : int(req.body.threshold, 'Low-stock level');
      let price = cur.price;
      if (req.body.price !== undefined) { price = Number(req.body.price); if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'Enter a valid price'); }
      db.prepare('UPDATE inventory SET qty=?, threshold=?, price=? WHERE shop_id=? AND product_id=?').run(qty, threshold, price, sid, pid);
      if (qty !== cur.qty) L.afterStockChange(sid, pid, cur.qty, qty);
    })();
    ok(res, { item: invRow(sid, pid) });
  }));

  // POS: one transaction per bill; stock is reduced in the backend and can never go negative.
  R.post('/sales', h((req, res) => {
    const sid = shopOf(req);
    const { items, paymentMethod, clientRef } = req.body;
    if (!Array.isArray(items) || !items.length || items.length > 50) throw new AppError(400, 'Add at least one item to the bill');
    if (!['Cash', 'UPI', 'Card'].includes(paymentMethod)) throw new AppError(400, 'Choose a payment method');
    const merged = new Map();
    for (const it of items) { const pid = int(it.productId, 'productId', { min: 1 }); merged.set(pid, (merged.get(pid) || 0) + int(it.quantity, 'Quantity', { min: 1, max: 10000 })); }
    if (clientRef) {
      const dup = db.prepare('SELECT id,total FROM sales WHERE shop_id=? AND client_ref=?').get(sid, String(clientRef));
      if (dup) return ok(res, { saleId: dup.id, total: dup.total, duplicate: true });
    }
    const result = db.transaction(() => {
      let total = 0; const lines = [];
      for (const [pid, q] of merged) {
        const row = db.prepare('SELECT i.qty, i.threshold, COALESCE(i.price,p.price) price, p.name FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.shop_id=? AND i.product_id=?').get(sid, pid);
        if (!row) throw new AppError(404, 'One of the products is not in your inventory');
        if (row.qty < q) throw new AppError(409, `Only ${row.qty} of ${row.name} in stock`);
        lines.push({ pid, q, row }); total += row.price * q;
      }
      const sale = db.prepare('INSERT INTO sales (shop_id,total,payment_method,client_ref,created_at) VALUES (?,?,?,?,?)').run(sid, total, paymentMethod, clientRef ? String(clientRef) : null, now());
      for (const { pid, q, row } of lines) {
        db.prepare('INSERT INTO sale_items (sale_id,product_id,quantity,unit_price) VALUES (?,?,?,?)').run(sale.lastInsertRowid, pid, q, row.price);
        db.prepare('UPDATE inventory SET qty=qty-? WHERE shop_id=? AND product_id=? AND qty>=?').run(q, sid, pid, q);
        L.afterStockChange(sid, pid, row.qty, row.qty - q);
      }
      return { saleId: sale.lastInsertRowid, total };
    })();
    ok(res, result, 201);
  }));
  R.get('/sales', (req, res) => {
    const sales = db.prepare('SELECT id,total,payment_method paymentMethod,created_at createdAt FROM sales WHERE shop_id=? ORDER BY id DESC LIMIT 30').all(shopOf(req));
    for (const s of sales) s.items = db.prepare('SELECT p.name, si.quantity, si.unit_price unitPrice FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?').all(s.id);
    ok(res, { sales });
  });

  R.get('/demand-beacon', h((req, res) => {
    const radius = int(req.query.radius || 2000, 'radius', { min: 1, max: 5000 });
    if (!RADIUS_OPTIONS.includes(radius)) throw new AppError(400, 'Choose a valid radius');
    ok(res, { radius, items: L.beacon(shopOf(req), radius) });
  }));
  R.get('/replenishment', (req, res) => {
    const sid = shopOf(req);
    const beacon = new Map(L.beacon(sid).map((b) => [b.productId, b]));
    const rows = db.prepare(`SELECT i.product_id productId, p.name, p.name_ta, i.qty, i.threshold, p.dealer_price dealerPrice FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.shop_id=?`).all(sid);
    const items = rows.filter((r) => r.qty <= r.threshold).map((r) => {
      const b = beacon.get(r.productId);
      const demand = b ? b.opportunity : 'low';
      return { ...r, status: stockStatus(r.qty, r.threshold), searches: b ? b.searches : 0, demand,
        reason: b && demand !== 'low' ? b.reason : 'Stock is below your low-stock level.',
        recommendation: demand !== 'low' ? 'Consider restocking' : 'Restock when convenient', suggestedQty: Math.max(10, r.threshold * 4 - r.qty) };
    });
    const rank = { high: 0, medium: 1, low: 2 };
    ok(res, { items: items.sort((a, b) => rank[a.demand] - rank[b.demand] || a.qty - b.qty) });
  });
  R.get('/requests', (req, res) => ok(res, { requests: db.prepare(`SELECT p.name, COUNT(*) n FROM product_requests r JOIN products p ON p.id=r.product_id WHERE r.shop_id=? GROUP BY r.product_id ORDER BY n DESC`).all(shopOf(req)) }));

  // stock audit: nothing changes until the retailer confirms
  R.post('/stock-audits', h((req, res) => {
    const sid = shopOf(req), pid = int(req.body.productId, 'productId', { min: 1 });
    const physical = int(req.body.physicalCount, 'Physical count');
    const inv = db.prepare('SELECT qty FROM inventory WHERE shop_id=? AND product_id=?').get(sid, pid);
    if (!inv) throw new AppError(404, 'Product not found in your inventory');
    const variance = physical - inv.qty;
    const status = variance === 0 ? 'matched' : 'pending';
    const r = db.prepare('INSERT INTO stock_audits (shop_id,product_id,expected,physical,variance,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').run(sid, pid, inv.qty, physical, variance, status, req.user.id, now());
    ok(res, { audit: { id: r.lastInsertRowid, expected: inv.qty, physical, variance, status } }, 201);
  }));
  R.post('/stock-audits/:id/confirm', h((req, res) => {
    const sid = shopOf(req);
    const out = db.transaction(() => {
      const a = db.prepare('SELECT * FROM stock_audits WHERE id=? AND shop_id=?').get(Number(req.params.id), sid);
      if (!a) throw new AppError(404, 'Audit not found');
      if (a.status !== 'pending') throw new AppError(409, 'This audit has already been completed');
      const inv = db.prepare('SELECT qty FROM inventory WHERE shop_id=? AND product_id=?').get(sid, a.product_id);
      if (inv.qty !== a.expected) throw new AppError(409, 'Stock changed since this count. Please count again.');
      db.prepare('UPDATE inventory SET qty=? WHERE shop_id=? AND product_id=?').run(a.physical, sid, a.product_id);
      db.prepare("UPDATE stock_audits SET status='confirmed', confirmed_at=? WHERE id=?").run(now(), a.id);
      L.afterStockChange(sid, a.product_id, a.expected, a.physical);
      return { id: a.id, expected: a.physical };
    })();
    ok(res, { audit: out });
  }));
  R.get('/stock-audits', (req, res) => ok(res, { audits: db.prepare(`SELECT a.id, p.name, a.expected, a.physical, a.variance, a.status, a.created_at createdAt, u.name retailer
    FROM stock_audits a JOIN products p ON p.id=a.product_id LEFT JOIN users u ON u.id=a.created_by WHERE a.shop_id=? ORDER BY a.id DESC LIMIT 30`).all(shopOf(req)) }));

  const ordersQuery = (where, arg) => {
    const rows = db.prepare(`SELECT o.id, o.status, o.created_at createdAt, o.updated_at updatedAt, s.name shopName FROM dealer_orders o JOIN shops s ON s.id=o.shop_id WHERE ${where} ORDER BY o.id DESC`).all(arg);
    for (const o of rows) o.items = db.prepare('SELECT p.name, i.quantity, i.unit_price unitPrice FROM dealer_order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=?').all(o.id);
    return rows;
  };
  R.get('/orders', (req, res) => ok(res, { orders: ordersQuery('o.shop_id=?', shopOf(req)) }));
  R.post('/orders', h((req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) throw new AppError(400, 'Add at least one product to the order');
    const id = db.transaction(() => {
      const o = db.prepare("INSERT INTO dealer_orders (shop_id,dealer_id,status,created_at,updated_at) VALUES (?,1,'Pending',?,?)").run(shopOf(req), now(), now());
      for (const it of items) {
        const pid = int(it.productId, 'productId', { min: 1 }), q = int(it.quantity, 'Quantity', { min: 1, max: 10000 });
        const p = db.prepare('SELECT dealer_price FROM products WHERE id=? AND active=1').get(pid);
        if (!p) throw new AppError(404, 'Product not found');
        db.prepare('INSERT INTO dealer_order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)').run(o.lastInsertRowid, pid, q, p.dealer_price);
      }
      return o.lastInsertRowid;
    })();
    ok(res, { orderId: id }, 201);
  }));
  api.use('/retailer', R);

  // ---------- dealer ----------
  const D = express.Router();
  D.use(auth(['dealer']));
  D.get('/products', (req, res) => {
    const demand = new Map();
    for (const s of db.prepare('SELECT id FROM shops').all()) for (const b of L.beacon(s.id)) {
      if (b.opportunity === 'low') continue;
      const d = demand.get(b.productId) || { searches: 0, shops: 0, level: 'medium' };
      d.searches += b.searches; d.shops += 1; if (b.opportunity === 'high') d.level = 'high';
      demand.set(b.productId, d);
    }
    const products = db.prepare('SELECT p.id, p.name, p.name_ta, c.name category, p.dealer_price price, p.dealer_stock stock FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name').all()
      .map((p) => ({ ...p, demand: demand.get(p.id)?.level || 'low', retailerInterest: demand.get(p.id)?.shops || 0 }));
    ok(res, { products });
  });
  D.get('/orders', (req, res) => ok(res, { orders: ordersQuery('o.dealer_id=?', req.user.dealer_id) }));
  const FLOW = ['Pending', 'Confirmed', 'Dispatched', 'Delivered'];
  D.patch('/orders/:id/status', h((req, res) => {
    const next = req.body.status;
    db.transaction(() => {
      const o = db.prepare('SELECT * FROM dealer_orders WHERE id=? AND dealer_id=?').get(Number(req.params.id), req.user.dealer_id);
      if (!o) throw new AppError(404, 'Order not found');
      if (FLOW.indexOf(next) !== FLOW.indexOf(o.status) + 1) throw new AppError(409, `An order that is ${o.status} cannot be marked ${next}`);
      const items = db.prepare('SELECT * FROM dealer_order_items WHERE order_id=?').all(o.id);
      if (next === 'Confirmed') for (const it of items) {
        const r = db.prepare('UPDATE products SET dealer_stock=dealer_stock-? WHERE id=? AND dealer_stock>=?').run(it.quantity, it.product_id, it.quantity);
        if (!r.changes) throw new AppError(409, 'Not enough catalogue stock to confirm this order');
      }
      if (next === 'Delivered') for (const it of items) { // credit the retailer's inventory
        const cur = db.prepare('SELECT qty FROM inventory WHERE shop_id=? AND product_id=?').get(o.shop_id, it.product_id);
        if (cur) db.prepare('UPDATE inventory SET qty=qty+? WHERE shop_id=? AND product_id=?').run(it.quantity, o.shop_id, it.product_id);
        else db.prepare('INSERT INTO inventory (shop_id,product_id,qty,threshold) VALUES (?,?,?,5)').run(o.shop_id, it.product_id, it.quantity);
        L.afterStockChange(o.shop_id, it.product_id, cur ? cur.qty : 0, (cur ? cur.qty : 0) + it.quantity);
      }
      db.prepare('UPDATE dealer_orders SET status=?, updated_at=? WHERE id=?').run(next, now(), o.id);
    })();
    ok(res);
  }));
  api.use('/dealer', D);

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  if (clientDir && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get('*', (req, res) => res.sendFile(path.resolve(clientDir, 'index.html')));
  }
  app.use((err, req, res, next) => {
    if (err instanceof AppError) return res.status(err.status).json({ success: false, message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid request' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  });
  return app;
}
