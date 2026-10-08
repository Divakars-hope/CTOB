import { distanceM } from './geo.js';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const now = () => new Date().toISOString();
export const stockStatus = (qty, threshold) => (qty <= 0 ? 'out' : qty <= threshold ? 'low' : 'available');

/** Transparent rule-based opportunity scoring. No ML. */
export function opportunity({ searches, nearbyUnits, recentSales }) {
  let level = 'low', reason = 'Limited local search interest so far.';
  if ((searches >= 20 && nearbyUnits <= 5) || (searches >= 10 && nearbyUnits === 0)) {
    level = 'high'; reason = 'High local search interest with low nearby availability.';
  } else if (searches >= 10) {
    level = 'medium'; reason = 'Steady local search interest; nearby stock is currently adequate.';
  }
  if (level !== 'low' && recentSales >= 5) reason += ' Recent sales are strong.';
  return { level, reason };
}

export function createLogic(db) {
  const L = {};

  L.shopsWithStock = (productId) =>
    db.prepare(`SELECT s.id, s.name, s.area, s.lat, s.lng, i.qty, i.threshold FROM inventory i JOIN shops s ON s.id=i.shop_id WHERE i.product_id=?`).all(productId);

  // ---- notifications -------------------------------------------------
  L.notify = (userId, { title, message, productId = null, shopId = null, dedupeKey = null }) => {
    const r = db.prepare('INSERT OR IGNORE INTO notifications (user_id,title,message,product_id,shop_id,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(userId, title, message, productId, shopId, dedupeKey, now());
    return r.changes > 0;
  };
  const fmtDist = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

  /** A shop just restocked a product: tell customers (by current location) with a matching active reminder. */
  L.notifyAvailability = (productId, shopId) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id=?').get(shopId);
    const product = db.prepare('SELECT name FROM products WHERE id=?').get(productId);
    const reminders = db.prepare(`SELECT r.*, u.last_lat, u.last_lng FROM saved_reminders r JOIN users u ON u.id=r.user_id
      WHERE r.product_id=? AND r.active=1 AND u.last_lat IS NOT NULL`).all(productId);
    let sent = 0;
    for (const r of reminders) {
      const d = distanceM(r.last_lat, r.last_lng, shop.lat, shop.lng);
      if (d <= r.radius_m && L.notify(r.user_id, {
        title: `${product.name} is available near you`,
        message: `${shop.name} has ${product.name} available ${fmtDist(d)} away.`,
        productId, shopId, dedupeKey: `avail:${productId}:${shopId}`,
      })) sent++;
    }
    return sent;
  };

  /** Meaningful location change: re-check every active reminder against nearby stock. */
  L.checkReminders = (userId) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (u.last_lat == null) return 0;
    let sent = 0;
    for (const r of db.prepare('SELECT * FROM saved_reminders WHERE user_id=? AND active=1').all(userId)) {
      const product = db.prepare('SELECT name FROM products WHERE id=?').get(r.product_id);
      const near = L.shopsWithStock(r.product_id)
        .filter((s) => s.qty > 0)
        .map((s) => ({ ...s, d: distanceM(u.last_lat, u.last_lng, s.lat, s.lng) }))
        .filter((s) => s.d <= r.radius_m)
        .sort((a, b) => a.d - b.d)[0];
      if (near && L.notify(userId, {
        title: `${product.name} is available near you`,
        message: `${near.name} has ${product.name} available ${fmtDist(near.d)} away.`,
        productId: r.product_id, shopId: near.id, dedupeKey: `avail:${r.product_id}:${near.id}`,
      })) sent++;
    }
    return sent;
  };

  /** Single choke point for every stock change. */
  L.afterStockChange = (shopId, productId, oldQty, newQty) => {
    const inv = db.prepare('SELECT * FROM inventory WHERE shop_id=? AND product_id=?').get(shopId, productId);
    const status = stockStatus(newQty, inv.threshold);
    if (newQty === 0) db.prepare(`UPDATE notifications SET dedupe_key=NULL WHERE dedupe_key=? AND dedupe_key IS NOT NULL`).run(`avail:${productId}:${shopId}`);
    if (newQty > 0 && oldQty <= 0) L.notifyAvailability(productId, shopId);
    const owner = db.prepare("SELECT id FROM users WHERE role='retailer' AND shop_id=?").get(shopId);
    const product = db.prepare('SELECT name FROM products WHERE id=?').get(productId);
    if (owner) {
      const clear = (st) => db.prepare('UPDATE notifications SET dedupe_key=NULL WHERE user_id=? AND dedupe_key=?').run(owner.id, `stock:${productId}:${st}`);
      if (status === 'available') { clear('low'); clear('out'); }
      if (status === 'low') clear('out');
      if (status !== 'available' && newQty < oldQty) L.notify(owner.id, {
        title: status === 'out' ? 'Out of stock' : 'Stock level is low',
        message: status === 'out' ? `${product.name} is out of stock.` : `${product.name} is running low.`,
        productId, shopId, dedupeKey: `stock:${productId}:${status}`,
      });
    }
  };

  // ---- demand beacon: SEARCH EVENTS ONLY ------------------------------
  L.beacon = (shopId, radiusM = 2000, days = 30) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id=?').get(shopId);
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const events = db.prepare('SELECT product_id, lat, lng FROM search_events WHERE created_at>=?').all(since);
    const counts = new Map();
    for (const e of events) if (distanceM(shop.lat, shop.lng, e.lat, e.lng) <= radiusM) counts.set(e.product_id, (counts.get(e.product_id) || 0) + 1);
    const out = [];
    for (const [productId, searches] of counts) {
      const p = db.prepare('SELECT id, name, name_ta FROM products WHERE id=?').get(productId);
      const stock = L.shopsWithStock(productId).filter((s) => distanceM(shop.lat, shop.lng, s.lat, s.lng) <= radiusM);
      const nearbyUnits = stock.reduce((a, s) => a + s.qty, 0);
      const mine = db.prepare('SELECT qty, threshold FROM inventory WHERE shop_id=? AND product_id=?').get(shopId, productId);
      const recentSales = db.prepare(`SELECT COALESCE(SUM(si.quantity),0) n FROM sale_items si JOIN sales s ON s.id=si.sale_id
        WHERE s.shop_id=? AND si.product_id=? AND s.created_at>=?`).get(shopId, productId, new Date(Date.now() - 14 * 864e5).toISOString()).n;
      const requests = db.prepare('SELECT COUNT(*) n FROM product_requests WHERE product_id=? AND shop_id=?').get(productId, shopId).n;
      const opp = opportunity({ searches, nearbyUnits, recentSales });
      out.push({
        productId, name: p.name, name_ta: p.name_ta, searches, radiusM, nearbyUnits, recentSales, requests, // requests shown separately, never added
        availability: mine ? stockStatus(mine.qty, mine.threshold) : 'not_stocked', myQty: mine ? mine.qty : 0,
        opportunity: opp.level, reason: opp.reason,
      });
    }
    const rank = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => rank[a.opportunity] - rank[b.opportunity] || b.searches - a.searches);
  };
  return L;
}
