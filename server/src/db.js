import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL);
CREATE TABLE IF NOT EXISTS dealers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('customer','retailer','dealer')),
  name TEXT NOT NULL, mobile TEXT UNIQUE, shop_id INTEGER REFERENCES shops(id), dealer_id INTEGER REFERENCES dealers(id),
  lang TEXT NOT NULL DEFAULT 'en', last_lat REAL, last_lng REAL, last_label TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_ta TEXT, category_id INTEGER NOT NULL REFERENCES categories(id),
  price REAL NOT NULL CHECK (price >= 0), dealer_price REAL NOT NULL DEFAULT 0, dealer_stock INTEGER NOT NULL DEFAULT 500,
  dealer_id INTEGER REFERENCES dealers(id), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS inventory (
  shop_id INTEGER NOT NULL REFERENCES shops(id), product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty >= 0), threshold INTEGER NOT NULL DEFAULT 5 CHECK (threshold >= 0),
  price REAL, PRIMARY KEY (shop_id, product_id));
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id), total REAL NOT NULL, payment_method TEXT NOT NULL,
  client_ref TEXT, created_at TEXT NOT NULL, UNIQUE (shop_id, client_ref));
CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id), product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0), unit_price REAL NOT NULL);
CREATE TABLE IF NOT EXISTS search_events (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), user_id INTEGER, lat REAL NOT NULL, lng REAL NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_requests (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), user_id INTEGER NOT NULL REFERENCES users(id),
  shop_id INTEGER REFERENCES shops(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saved_reminders (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), product_id INTEGER NOT NULL REFERENCES products(id),
  radius_m INTEGER NOT NULL, saved_lat REAL NOT NULL, saved_lng REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL,
  product_id INTEGER, shop_id INTEGER, dedupe_key TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key));
CREATE TABLE IF NOT EXISTS stock_audits (
  id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id), product_id INTEGER NOT NULL REFERENCES products(id),
  expected INTEGER NOT NULL, physical INTEGER NOT NULL, variance INTEGER NOT NULL, status TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL, confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS dealer_orders (
  id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id), dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dealer_order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES dealer_orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0), unit_price REAL NOT NULL);
`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export const LOCATIONS = {
  A: { key: 'A', label: 'Thanjavur · Gandhiji Road', lat: 10.787, lng: 79.1378 },
  B: { key: 'B', label: 'Tiruchirappalli · Thillai Nagar', lat: 10.8155, lng: 78.6854 },
};

const CATS = ['Grocery', 'Bakery', 'Vegetables', 'Hardware', 'Electrical', 'Electronics', 'Household', 'Stationery'];
// id, name, Tamil, category, price, dealer price
const PRODUCTS = [
  [1, 'Rare Chocolate', 'அரிய சாக்லேட்', 'Grocery', 120, 96], [2, 'Aachi Masala', 'ஆச்சி மசாலா', 'Grocery', 45, 36],
  [3, 'LED Bulb', 'எல்இடி பல்பு', 'Electrical', 99, 72], [4, 'Fresh Tomato', 'தக்காளி', 'Vegetables', 30, 22],
  [5, 'Notebook', 'நோட்டுப் புத்தகம்', 'Stationery', 60, 44], [6, 'Extension Board', 'எக்ஸ்டென்ஷன் போர்டு', 'Electrical', 260, 200],
  [7, 'Bread', 'ரொட்டி', 'Bakery', 40, 32], [8, 'Detergent', 'சலவைத் தூள்', 'Household', 110, 88],
  [9, 'Basmati Rice 1 kg', 'பாஸ்மதி அரிசி', 'Grocery', 95, 80], [10, 'Sunflower Oil 1 L', 'சூரியகாந்தி எண்ணெய்', 'Grocery', 150, 128],
  [11, 'Tea Powder 250 g', 'தேயிலைத் தூள்', 'Grocery', 130, 108], [12, 'Biscuit Pack', 'பிஸ்கட்', 'Grocery', 20, 16],
  [13, 'Fresh Onion', 'வெங்காயம்', 'Vegetables', 40, 30], [14, 'Potato', 'உருளைக்கிழங்கு', 'Vegetables', 35, 26],
  [15, 'Plum Cake', 'பிளம் கேக்', 'Bakery', 70, 54], [16, 'Claw Hammer', 'சுத்தியல்', 'Hardware', 220, 170],
  [17, 'Screwdriver Set', 'ஸ்க்ரூடிரைவர் செட்', 'Hardware', 180, 140], [18, 'Switch Board', 'சுவிட்ச் போர்டு', 'Electrical', 85, 62],
  [19, 'USB Charging Cable', 'யூஎஸ்பி கேபிள்', 'Electronics', 149, 105], [20, 'Earphones', 'இயர்போன்', 'Electronics', 299, 220],
  [21, 'Dishwash Liquid', 'பாத்திரம் கழுவும் திரவம்', 'Household', 99, 78], [22, 'Floor Cleaner', 'தரை சுத்தம் செய்யும் திரவம்', 'Household', 120, 95],
  [23, 'Ball Pen Pack', 'பேனா பேக்', 'Stationery', 50, 38], [24, 'Chart Paper', 'சார்ட் பேப்பர்', 'Stationery', 15, 10],
];
const M = 111320; // metres per degree latitude
const off = (loc, north, east) => ({ lat: loc.lat + north / M, lng: loc.lng + east / (M * Math.cos((loc.lat * Math.PI) / 180)) });
const A = LOCATIONS.A, B = LOCATIONS.B;
const SHOPS = [
  [1, 'ABC Store', 'Gandhiji Road, Thanjavur', off(A, 280, 0)],
  [2, 'Sri Lakshmi Stores', 'Gandhiji Road, Thanjavur', off(A, 0, 650)],
  [3, 'Kannan Mart', 'Medical College Road, Thanjavur', off(A, -950, -580)],
  [4, 'Anand Super Market', 'Vallam Road, Thanjavur', off(A, 3000, 440)],
  [5, 'Green Basket', 'Thillai Nagar, Tiruchirappalli', off(B, 180, 120)],
  [6, 'Velan Mart', 'Thillai Nagar, Tiruchirappalli', off(B, -420, 380)],
  [7, 'Murugan Traders', 'Cantonment, Tiruchirappalli', off(B, 1400, -600)],
];

export function seed(db, now = Date.now()) {
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const H = 3600e3, D = 24 * H;
  const tx = db.transaction(() => {
    CATS.forEach((c, i) => db.prepare('INSERT INTO categories VALUES (?,?)').run(i + 1, c));
    db.prepare('INSERT INTO dealers VALUES (1, ?)').run('CTOB Distribution');
    for (const [id, name, ta, cat, price, dp] of PRODUCTS)
      db.prepare('INSERT INTO products (id,name,name_ta,category_id,price,dealer_price,dealer_stock,dealer_id) VALUES (?,?,?,?,?,?,?,1)')
        .run(id, name, ta, CATS.indexOf(cat) + 1, price, dp, id === 1 ? 300 : 500);
    for (const [id, name, area, p] of SHOPS) db.prepare('INSERT INTO shops VALUES (?,?,?,?,?)').run(id, name, area, p.lat, p.lng);

    // inventory: deterministic pattern, with explicit story overrides
    const ins = db.prepare('INSERT INTO inventory (shop_id,product_id,qty,threshold) VALUES (?,?,?,?)');
    for (const [sid] of SHOPS) for (const [pid] of PRODUCTS) {
      if (pid === 1 || (sid * 5 + pid * 3) % 7 === 0) continue;
      if (pid === 3 && sid <= 4) { ins.run(sid, pid, [14, 6, 3, 9][sid - 1], 5); continue; }
      ins.run(sid, pid, ((sid * 7 + pid * 11) % 26) + 2, 5);
    }
    // the main story product
    [[1, 0], [2, 2], [3, 0], [5, 12], [6, 0]].forEach(([sid, q]) => ins.run(sid, 1, q, 3));
    db.prepare('UPDATE inventory SET qty=2, threshold=5 WHERE shop_id=1 AND product_id=7').run();
    db.prepare('UPDATE inventory SET qty=9, threshold=5 WHERE shop_id=1 AND product_id=2').run();

    // users
    const u = db.prepare('INSERT INTO users (id,role,name,mobile,shop_id,dealer_id,lang,last_lat,last_lng,last_label,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    u.run(1, 'customer', 'Customer', '9876543210', null, null, 'en', A.lat, A.lng, A.label, iso(30 * D));
    u.run(2, 'customer', 'Customer', '9876543211', null, null, 'en', A.lat, A.lng, A.label, iso(30 * D));
    SHOPS.forEach(([sid, name], i) => u.run(10 + sid, 'retailer', name, null, sid, null, 'en', null, null, null, iso(60 * D)));
    u.run(30, 'dealer', 'CTOB Distribution', null, null, 1, 'en', null, null, null, iso(60 * D));

    // search events: area-level signals only
    const se = db.prepare('INSERT INTO search_events (product_id,user_id,lat,lng,created_at) VALUES (?,?,?,?,?)');
    const burst = (pid, n, base, maxR) => {
      for (let i = 0; i < n; i++) {
        const ang = i * 2.399963, r = 120 + ((i * 53 + pid * 17) % (maxR - 120));
        const p = off(base, Math.sin(ang) * r, Math.cos(ang) * r);
        se.run(pid, null, p.lat, p.lng, iso(((i * 37) % 13) * D + (i % 9) * H + 5 * 60e3));
      }
    };
    burst(1, 25, A, 760); burst(3, 18, A, 900); burst(2, 4, A, 900); burst(7, 7, A, 900); burst(8, 5, A, 900); burst(5, 3, A, 800);
    burst(1, 6, B, 800); burst(20, 9, B, 800);

    // requests are personal intent: stored separately, never part of the beacon
    const pr = db.prepare('INSERT INTO product_requests (product_id,user_id,shop_id,created_at) VALUES (?,?,?,?)');
    for (let i = 0; i < 10; i++) pr.run(1, i % 2 ? 1 : 2, i % 3 === 0 ? 2 : 1, iso(i * D / 2));

    // sales history
    const sale = (sid, daysAgo, hAgo, items, pay, total) => {
      const t = iso(daysAgo * D + hAgo * H);
      const r = db.prepare('INSERT INTO sales (shop_id,total,payment_method,client_ref,created_at) VALUES (?,?,?,?,?)').run(sid, 0, pay, `seed-${sid}-${daysAgo}-${hAgo}-${items[0][0]}`, t);
      let sum = 0;
      for (const [pid, q] of items) {
        const price = db.prepare('SELECT price FROM products WHERE id=?').get(pid).price; sum += price * q;
        db.prepare('INSERT INTO sale_items (sale_id,product_id,quantity,unit_price) VALUES (?,?,?,?)').run(r.lastInsertRowid, pid, q, price);
      }
      db.prepare('UPDATE sales SET total=? WHERE id=?').run(sum, r.lastInsertRowid);
    };
    sale(1, 0, 0.3, [[2, 3], [7, 2]], 'Cash'); sale(1, 0, 0.2, [[3, 2]], 'UPI'); sale(1, 0, 0.1, [[5, 4], [23, 2]], 'Cash');
    sale(1, 1, 3, [[1, 2]], 'UPI'); sale(1, 2, 5, [[1, 1], [12, 5]], 'Card'); sale(1, 3, 2, [[1, 3]], 'Cash'); sale(1, 4, 4, [[8, 1], [21, 1]], 'Cash');
    sale(2, 0, 0.5, [[1, 1], [9, 2]], 'UPI'); sale(2, 0, 0.4, [[10, 1], [11, 1]], 'Cash'); sale(2, 1, 2, [[1, 2]], 'Cash'); sale(2, 2, 6, [[4, 3], [13, 2]], 'Cash');
    sale(3, 0, 0.6, [[3, 4]], 'Cash'); sale(5, 0, 0.6, [[1, 2], [14, 3]], 'UPI'); sale(5, 1, 4, [[1, 3]], 'Cash');

    // earlier audit + dealer orders
    db.prepare("INSERT INTO stock_audits (shop_id,product_id,expected,physical,variance,status,created_by,created_at,confirmed_at) VALUES (1,7,4,3,-1,'confirmed',11,?,?)").run(iso(2 * D), iso(2 * D));
    const dord = db.prepare('INSERT INTO dealer_orders (id,shop_id,dealer_id,status,created_at,updated_at) VALUES (?,?,1,?,?,?)');
    const doi = db.prepare('INSERT INTO dealer_order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)');
    dord.run(1021, 2, 'Delivered', iso(6 * D), iso(4 * D)); doi.run(1021, 2, 30, 36);
    dord.run(1022, 3, 'Dispatched', iso(1 * D), iso(4 * H)); doi.run(1022, 3, 24, 72);
    dord.run(1023, 5, 'Pending', iso(5 * H), iso(5 * H)); doi.run(1023, 20, 12, 220);
  });
  tx();
}
