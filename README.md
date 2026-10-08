# CTOB — Find Nearby. Buy Local. Grow Together.

Local-commerce platform with three roles: **Customer → Local Retailer → Dealer**.
Stack: React + Vite + TypeScript + Tailwind (PWA) · Node + Express + SQLite (better-sqlite3) · Capacitor (Android).

## Run it
```
npm run install:all
npm run build          # builds the client into client/dist
npm start              # http://localhost:3001  (serves API + app)
npm test               # 8 backend tests (rules below)
npm run reset          # re-seed the database to its starting state
```
Hot reload: `npm run dev:server` and `npm run dev:client` (client on :5173 proxies /api).
Data lives in `server/data/ctob.sqlite`. Run `npm run reset` before each presentation for a clean start.

## Sign-in
- **Customer:** any valid 10-digit mobile number. The verification code is always **123456** (no SMS provider is used). Seeded customer: `9876543210`.
- **Shop owner / Distributor:** tap *"Shop owner or distributor? Sign in here"* and pick ABC Store, Sri Lakshmi Stores, Kannan Mart, Anand Super Market, Green Basket, Velan Mart, Murugan Traders, or CTOB Distribution.

## Interface
- **Customer:** Home, Search, Nearby (map), Reminders, Account. Alerts open from the bell on Home. Map and list are synchronised; on tablet/desktop they sit side by side.
- **Shop owner:** Dashboard, Billing, Inventory, Demand Beacon, More (Stock Audit, Replenishment, Orders). Desktop shows a left sidebar.
- **Distributor:** Overview, Orders, Catalogue.
- The map is a self-contained interactive map (pan, zoom, markers) that needs no tiles, keys or network.

## Main story (works end to end on real application state)
1. Customer: search **Rare Chocolate**. ABC Store is *Out of Stock*, Sri Lakshmi *Low Stock* (1 km).
2. Tap **Request Product** and **Save Reminder** (separate actions).
3. Sign in as **ABC Store**, open *Demand Beacon*: 25+ searches, opportunity **High**, with the reason shown. Direct requests are listed separately and never added to searches.
4. ABC Store: *Inventory*, Rare Chocolate, set stock to 20. The customer gets an in-app alert: "ABC Store has Rare Chocolate available 280 m away."
5. Customer opens the alert and **chooses ABC Store** (kept for that product). ABC Store bills it in *Billing*; stock drops automatically.
6. *Stock Audit*: count 1 fewer than expected, variance −1, **Confirm Adjustment** (nothing changes before confirmation).
7. *Replenishment*, **Order stock**, then sign in as **CTOB Distribution**: Confirm, Dispatch, Deliver. Retailer inventory is credited on delivery.
8. **Travel reminder:** a customer in *Thanjavur · Gandhiji Road* saves a reminder, then taps *Change location* and picks *Tiruchirappalli · Thillai Nagar*. Saved products are re-checked and an alert for Green Basket appears. No repeat alerts for unchanged stock.

## Rules enforced in the backend (and tested)
- Searches create Demand Beacon signals; requests never do. A duplicate submit within 60 s is not counted twice.
- Sales run in one transaction: stock cannot go negative, and bills are idempotent (no duplicate sale on double-tap).
- Stock audit changes stock only on confirmation; stale audits are rejected.
- Dealer order status only moves forward; delivery credits retailer stock; order quantity must be at least 1.
- Radius must be 300 m, 500 m, 1 km, 2 km or 5 km. Customers never see exact quantities or other customers' data.
- Demand opportunity is a transparent rule (searches vs. nearby units vs. recent sales), not machine learning.

## Android (Capacitor)
The APK could not be built where this was generated (it needs the Android SDK and JDK 17). Build it on your machine:
```
cd client
VITE_API_URL=http://<your-computer-LAN-IP>:3001 npm run build
npx cap add android          # first time only
npx cap sync android
npx cap open android         # Build > Build APK(s) in Android Studio
```
The phone must be able to reach that server address.

## Layout
`server/src`: db.js (schema + seed), logic.js (notifications, demand, scoring), app.js (REST API). `server/test`: backend tests.
`client/src`: Login, Customer, Retailer, Dealer, i18n (English / தமிழ்).
