import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ago, money } from './api';
import { useI18n } from './i18n';
import { Icon, IconName } from './icons';
import { AppFrame, Button, EmptyState, ErrorState, LangSwitch, LevelBadge, MetricCard, Modal, NavItem, OrderTimeline, Section, Sheet, SkeletonCards, StatusBadge, useToast } from './ui';

type Page = 'dashboard' | 'billing' | 'inventory' | 'demand' | 'audit' | 'replenish' | 'orders' | 'more';
const nm = (p: any, lang: string) => (lang === 'ta' && p.name_ta) || p.name;
const useLoad = <T,>(path: string, deps: any[] = []) => {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(false);
  const load = useCallback(() => { setErr(false); api<T>(path).then(setData).catch(() => setErr(true)); }, [path, ...deps]);
  useEffect(load, [load]); return { data, err, reload: load, setData };
};

export default function Retailer({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>('dashboard'); const [orderFor, setOrderFor] = useState<any>(null);
  const nav: NavItem<Page>[] = [{ id: 'dashboard', label: t('dashboard'), icon: 'home' }, { id: 'billing', label: t('billing'), icon: 'cart' }, { id: 'inventory', label: t('inventory'), icon: 'box' }, { id: 'demand', label: 'Demand', icon: 'trend' }, { id: 'more', label: 'More', icon: 'list' }];
  const rail: NavItem<Page>[] = [{ id: 'dashboard', label: t('dashboard'), icon: 'home' }, { id: 'billing', label: t('billing'), icon: 'cart' }, { id: 'inventory', label: t('inventory'), icon: 'box' }, { id: 'demand', label: t('demand'), icon: 'trend' }, { id: 'audit', label: t('audit'), icon: 'clipboard' }, { id: 'replenish', label: t('replenish'), icon: 'truck' }, { id: 'orders', label: t('orders'), icon: 'list' }];
  const active: Page = ['audit', 'replenish', 'orders'].includes(page) ? 'more' : page;
  const titles: Record<Page, string> = { dashboard: user.name, billing: t('billing'), inventory: t('inventory'), demand: t('demand'), audit: t('audit'), replenish: t('replenish'), orders: t('orders'), more: 'More' };
  return (
    <AppFrame nav={nav} rail={rail} value={page} onNav={setPage} wide signOut={onSignOut} title={titles[page]} onBack={['audit', 'replenish', 'orders'].includes(page) ? () => setPage('more') : undefined}>
      {page === 'dashboard' && <Dashboard go={setPage} order={setOrderFor} />}
      {page === 'billing' && <Billing />}
      {page === 'inventory' && <Inventory />}
      {page === 'demand' && <Demand order={setOrderFor} />}
      {page === 'audit' && <Audit />}
      {page === 'replenish' && <Replenish order={setOrderFor} />}
      {page === 'orders' && <Orders />}
      {page === 'more' && (
        <div className="space-y-3 lg:hidden">
          {([['audit', 'clipboard', t('audit'), 'Count stock and fix differences'], ['replenish', 'truck', t('replenish'), 'Restock recommendations'], ['orders', 'list', t('orders'), 'Orders to your distributor']] as [Page, IconName, string, string][]).map(([p, ic, l, d]) => (
            <button key={p} onClick={() => setPage(p)} className="card flex min-h-[72px] w-full items-center gap-3 px-4 text-left"><span className="flex h-11 w-11 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name={ic} size={22} /></span><span className="flex-1"><span className="t-card block">{l}</span><span className="t-sub">{d}</span></span><Icon name="chevron" size={18} className="text-ink-mute" /></button>))}
          <div className="card flex items-center justify-between p-4"><span className="t-card">Language</span><LangSwitch /></div>
          <Button kind="line" className="w-full" onClick={onSignOut}><Icon name="logout" size={18} />{t('signout')}</Button>
        </div>
      )}
      {orderFor && <OrderSheet item={orderFor} onClose={() => setOrderFor(null)} onDone={() => { setOrderFor(null); setPage('orders'); }} />}
    </AppFrame>
  );
}

function Dashboard({ go, order }: { go: (p: Page) => void; order: (o: any) => void }) {
  const { t, lang } = useI18n();
  const d = useLoad<any>('/retailer/dashboard'); const b = useLoad<any>('/retailer/demand-beacon');
  if (d.err) return <ErrorState text="We couldn’t load your dashboard." onRetry={d.reload} />;
  if (!d.data) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 rounded-card" />)}</div>;
  const x = d.data; const top = b.data?.items.find((i: any) => i.opportunity !== 'low');
  return (
    <div className="space-y-6">
      <div><p className="t-sub">{x.shop.area}</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard tone="brand" wide label={t('todaysSales')} value={money(x.todaysSales)} hint={`${x.todaysBills} bills today`} />
        <MetricCard label={t('currentStock')} value={x.currentStock} hint="units in store" />
        <MetricCard label={t('lowStock')} value={x.lowStock} tone={x.lowStock ? 'warn' : undefined} hint="products to watch" />
        <MetricCard label={t('demandOpp')} value={x.demandOpportunities} hint="from local searches" />
        <MetricCard label={t('variance')} value={x.stockVariance} tone={x.stockVariance < 0 ? 'bad' : undefined} hint={x.pendingAudits ? `${x.pendingAudits} awaiting confirmation` : 'last 30 days'} />
      </div>
      {top && (
        <div className="card overflow-hidden border-brand-300"><div className="flex items-start gap-3 bg-brand-50 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl bg-brand-500 text-ink"><Icon name="trend" size={22} /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="t-section">{nm(top, lang)}</p><LevelBadge level={top.opportunity} /></div><p className="t-body font-semibold">{top.searches} searches nearby</p><p className="t-sub">{top.reason}</p></div></div>
          <div className="grid grid-cols-2 gap-2 p-3"><Button kind="soft" onClick={() => go('demand')}>See demand</Button><Button onClick={() => order({ productId: top.productId, name: top.name, suggestedQty: 20 })}>Order stock</Button></div></div>
      )}
      <Section title="Quick actions">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {([['billing', 'cart', t('billing')], ['inventory', 'box', t('inventory')], ['demand', 'trend', t('demand')], ['audit', 'clipboard', t('audit')], ['replenish', 'truck', t('replenish')]] as [Page, IconName, string][]).map(([p, ic, l]) => (
            <button key={p} onClick={() => go(p)} className="card flex min-h-[88px] flex-col items-start justify-between p-4 text-left transition hover:border-brand-300 active:scale-[.98]"><Icon name={ic} size={24} className="text-brand-600" /><span className="t-card">{l}</span></button>))}
        </div>
      </Section>
    </div>
  );
}

function Billing() {
  const { t, lang } = useI18n(); const toast = useToast();
  const inv = useLoad<any>('/retailer/inventory');
  const [q, setQ] = useState(''); const [cart, setCart] = useState<Record<number, number>>({}); const [pay, setPay] = useState('Cash');
  const [ref, setRef] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [receipt, setReceipt] = useState<any>(null); const [open, setOpen] = useState(false);
  const items: any[] = inv.data?.items || [];
  const lines = items.filter((i) => cart[i.productId]); const total = lines.reduce((a, i) => a + i.price * cart[i.productId], 0); const count = lines.reduce((a, i) => a + cart[i.productId], 0);
  const shown = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.toLowerCase()) || (i.name_ta || '').includes(q));
  const set = (id: number, n: number, max: number) => setCart((c) => { const x = { ...c }; if (n <= 0) delete x[id]; else x[id] = Math.min(n, max); return x; });
  const complete = async () => {
    if (busy) return; setBusy(true);
    try {
      const r = await api('/retailer/sales', 'POST', { items: lines.map((i) => ({ productId: i.productId, quantity: cart[i.productId] })), paymentMethod: pay, clientRef: ref });
      setReceipt({ total: r.total, pay, count }); setCart({}); setRef(crypto.randomUUID()); setQ(''); setOpen(false); inv.reload();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const CartPanel = (
    <div className="space-y-4">
      {!lines.length ? <p className="t-sub py-6 text-center">Tap products to add them to the bill.</p> : <div className="divide-y divide-line">{lines.map((i) => (
        <div key={i.productId} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="t-card truncate">{nm(i, lang)}</p><p className="t-cap">{money(i.price)} × {cart[i.productId]} = {money(i.price * cart[i.productId])}</p></div>
          <Stepper value={cart[i.productId]} max={i.qty} onChange={(n) => set(i.productId, n, i.qty)} /></div>))}</div>}
      <div className="flex items-baseline justify-between border-t border-line pt-3"><span className="t-sub">{count} {count === 1 ? 'item' : 'items'} · Subtotal</span><span className="text-[28px] font-extrabold tracking-tight">{money(total)}</span></div>
      <div><p className="t-cap mb-2">Payment method</p><div className="grid grid-cols-3 gap-2" role="group">{['Cash', 'UPI', 'Card'].map((m) => <button key={m} aria-pressed={pay === m} onClick={() => setPay(m)} className={`min-h-[48px] rounded-ctl border text-[15px] font-semibold transition ${pay === m ? 'border-brand-500 bg-brand-100 text-brand-700' : 'border-line bg-white'}`}>{m === 'Cash' ? t('cash') : m}</button>)}</div></div>
      <Button className="w-full min-h-[54px] text-base" loading={busy} disabled={!lines.length} onClick={complete}>{busy ? 'Processing…' : `${t('completeSale')} · ${money(total)}`}</Button>
    </div>
  );
  if (receipt) return (
    <div className="mx-auto max-w-sm animate-rise pt-10 text-center"><span className="mx-auto flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={40} strokeWidth={2.5} /></span>
      <h2 className="t-title mt-5">Sale completed</h2><p className="mt-1 text-[32px] font-extrabold tracking-tight">{money(receipt.total)}</p><p className="t-sub">{receipt.count} items · {receipt.pay} · Inventory updated</p>
      <Button className="mt-6 w-full" onClick={() => setReceipt(null)}>New bill</Button></div>
  );
  return (
    <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6">
      <div className="space-y-3 pb-24 lg:pb-0">
        <div className="relative"><Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" /><input className="input pl-12" placeholder={t('search')} aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {inv.err ? <ErrorState onRetry={inv.reload} /> : !inv.data ? <SkeletonCards n={5} h="h-16" /> : !shown.length ? <EmptyState icon="search" title="No matching products" /> : (
          <div className="card divide-y divide-line">{shown.map((i) => {
            const n = cart[i.productId] || 0;
            return <div key={i.productId} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-2"><div className="min-w-0"><p className="t-card truncate">{nm(i, lang)}</p><p className="t-cap">{money(i.price)} · <span className={i.status === 'out' ? 'text-bad' : i.status === 'low' ? 'text-warn' : ''}>{i.qty} in stock</span></p></div>
              {n ? <Stepper value={n} max={i.qty} onChange={(v) => set(i.productId, v, i.qty)} /> : <Button small kind="soft" disabled={i.qty === 0} onClick={() => set(i.productId, 1, i.qty)}><Icon name="plus" size={16} />{t('addToBill')}</Button>}</div>;
          })}</div>)}
      </div>
      <aside className="hidden lg:block"><div className="card sticky top-4 p-4"><h2 className="t-section mb-2">Current bill</h2>{CartPanel}</div></aside>
      {count > 0 && <div className="fixed inset-x-0 z-20 px-4 lg:hidden" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}><button onClick={() => setOpen(true)} className="btn-dark mx-auto flex w-full max-w-3xl animate-rise justify-between shadow-float"><span>{count} {count === 1 ? 'item' : 'items'}</span><span>View bill · {money(total)}</span></button></div>}
      {open && <Sheet title="Current bill" onClose={() => setOpen(false)}>{CartPanel}</Sheet>}
    </div>
  );
}
function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return <div className="inline-flex items-center rounded-ctl border border-line bg-white"><button aria-label="Decrease" className="flex h-11 w-11 items-center justify-center active:bg-brand-50" onClick={() => onChange(value - 1)}><Icon name="minus" size={18} /></button><span className="w-8 text-center font-bold" aria-live="polite">{value}</span><button aria-label="Increase" disabled={value >= max} className="flex h-11 w-11 items-center justify-center active:bg-brand-50 disabled:opacity-40" onClick={() => onChange(value + 1)}><Icon name="plus" size={18} /></button></div>;
}

function Inventory() {
  const { lang } = useI18n(); const inv = useLoad<any>('/retailer/inventory');
  const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [edit, setEdit] = useState<any>(null); const [adding, setAdding] = useState(false);
  const items: any[] = inv.data?.items || [];
  const counts = useMemo(() => ({ all: items.length, available: items.filter((i) => i.status === 'available').length, low: items.filter((i) => i.status === 'low').length, out: items.filter((i) => i.status === 'out').length }), [items]);
  const rows = items.filter((i) => (f === 'all' || i.status === f) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const labels: Record<string, string> = { all: 'All', available: 'Healthy', low: 'Low Stock', out: 'Out of Stock' };
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><div className="relative flex-1"><Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" /><input className="input pl-12" placeholder="Search inventory" aria-label="Search inventory" value={q} onChange={(e) => setQ(e.target.value)} /></div><Button onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add</Button></div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">{Object.keys(labels).map((k) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)} className={f === k ? 'filter-on' : 'filter-off'}>{labels[k]} <span className="ml-1.5 opacity-70">{(counts as any)[k]}</span></button>)}</div>
      {inv.err ? <ErrorState onRetry={inv.reload} /> : !inv.data ? <SkeletonCards n={6} h="h-[68px]" /> : !rows.length ? <EmptyState icon="box" title="No products in inventory" text={f === 'all' ? 'Add your first product to start selling.' : 'Nothing in this view.'} /> : (
        <div className="card divide-y divide-line">{rows.map((i) => (
          <button key={i.productId} onClick={() => setEdit(i)} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-brand-50"><div className="min-w-0 flex-1"><p className="t-card truncate">{nm(i, lang)}</p><p className="t-cap">{i.category} · low at {i.threshold} · {money(i.price)}</p></div><div className="text-right"><p className="text-xl font-extrabold leading-6">{i.qty}</p><StatusBadge status={i.status} /></div></button>))}</div>)}
      {edit && <EditSheet item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); inv.reload(); }} />}
      {adding && <AddSheet existing={items} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); inv.reload(); }} />}
    </div>
  );
}
function EditSheet({ item, onClose, onSaved }: any) {
  const { t } = useI18n(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ qty: item.qty, threshold: String(item.threshold), price: String(item.price) });
  const err = f.qty < 0 || !Number.isInteger(Number(f.threshold)) || Number(f.threshold) < 0 || !(Number(f.price) >= 0);
  const save = async () => { setBusy(true); try { await api(`/retailer/inventory/${item.productId}`, 'PATCH', { qty: f.qty, threshold: Number(f.threshold), price: Number(f.price) }); toast('Stock updated'); onSaved(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return (
    <Sheet title={item.name} onClose={onClose}>
      <div className="space-y-5">
        <div><p className="t-cap mb-2">Current stock</p><div className="flex items-center gap-3"><Button kind="line" aria-label="Decrease stock" onClick={() => setF({ ...f, qty: Math.max(0, f.qty - 1) })}><Icon name="minus" size={18} /></Button><input className="input text-center text-2xl font-bold" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value.replace(/\D/g, '')) })} aria-label="Stock" /><Button kind="line" aria-label="Increase stock" onClick={() => setF({ ...f, qty: f.qty + 1 })}><Icon name="plus" size={18} /></Button></div>
          <div className="mt-2 flex gap-2">{[5, 10, 20].map((n) => <Button key={n} kind="soft" small className="flex-1" onClick={() => setF({ ...f, qty: f.qty + n })}>Restock +{n}</Button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><label className="t-cap">Low-stock level<input className="input mt-1" inputMode="numeric" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value.replace(/\D/g, '') })} /></label><label className="t-cap">Price (₹)<input className="input mt-1" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label></div>
        <Button className="w-full" loading={busy} disabled={err} onClick={save}>{t('save')}</Button>
      </div>
    </Sheet>
  );
}
function AddSheet({ existing, onClose, onSaved }: any) {
  const toast = useToast(); const [cat, setCat] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ productId: '', name: '', price: '', categoryId: '1', qty: '0', threshold: '5' });
  useEffect(() => { api('/retailer/catalogue').then((r) => setCat(r.products)); api('/categories').then((r) => setCats(r.categories)); }, []);
  const have = new Set(existing.map((e: any) => e.productId));
  const submit = async () => {
    setBusy(true);
    try { await api('/retailer/inventory', 'POST', f.productId ? { productId: Number(f.productId), qty: Number(f.qty), threshold: Number(f.threshold) } : { name: f.name, price: Number(f.price), categoryId: Number(f.categoryId), qty: Number(f.qty), threshold: Number(f.threshold) }); toast('Product added'); onSaved(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Add product" onClose={onClose}>
      <div className="space-y-3">
        <select className="input" aria-label="Product" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}><option value="">New product…</option>{cat.filter((c) => !have.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {!f.productId && <><input className="input" placeholder="Product name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="input" inputMode="decimal" placeholder="Price (₹)" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /><select className="input" aria-label="Category" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>}
        <div className="grid grid-cols-2 gap-3"><label className="t-cap">Stock<input className="input mt-1" inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} /></label><label className="t-cap">Low-stock level<input className="input mt-1" inputMode="numeric" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value.replace(/\D/g, '') })} /></label></div>
        <Button className="w-full" loading={busy} onClick={submit}>Add to inventory</Button>
      </div>
    </Sheet>
  );
}

function Demand({ order }: { order: (o: any) => void }) {
  const { t, lang } = useI18n(); const [radius, setRadius] = useState(2000); const d = useLoad<any>(`/retailer/demand-beacon?radius=${radius}`, [radius]);
  const max = Math.max(1, ...(d.data?.items.map((i: any) => i.searches) || [1]));
  return (
    <div className="space-y-4">
      <div><p className="t-sub">What customers around your shop have searched for in the last 30 days. Only totals are shown — never individual customers.</p></div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">{[500, 1000, 2000, 5000].map((r) => <button key={r} aria-pressed={radius === r} onClick={() => setRadius(r)} className={radius === r ? 'filter-on' : 'filter-off'}>within {r < 1000 ? `${r} m` : `${r / 1000} km`}</button>)}</div>
      {d.err ? <ErrorState onRetry={d.reload} /> : !d.data ? <SkeletonCards n={3} h="h-40" /> : !d.data.items.length ? <EmptyState icon="trend" title="No local demand yet" text="When customers nearby search for products, you’ll see them here." /> : (
        <div className="grid gap-3 lg:grid-cols-2">{d.data.items.map((b: any) => (
          <div key={b.productId} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-2"><div><p className="t-section">{nm(b, lang)}</p><p className="t-sub">within {radius < 1000 ? `${radius} m` : `${radius / 1000} km`}</p></div><LevelBadge level={b.opportunity} /></div>
            <div><div className="flex items-baseline gap-1.5"><span className="text-[28px] font-extrabold leading-8">{b.searches}</span><span className="t-sub">searches</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[.07]"><div className={`h-full rounded-full ${b.opportunity === 'high' ? 'bg-bad' : b.opportunity === 'medium' ? 'bg-warn' : 'bg-ink-mute'}`} style={{ width: `${(b.searches / max) * 100}%`, transition: 'width .5s' }} /></div></div>
            <div className="grid grid-cols-3 gap-2 rounded-ctl bg-paper p-3 text-center"><div><p className="text-lg font-bold">{b.myQty}</p><p className="t-cap">your stock</p></div><div><p className="text-lg font-bold">{b.nearbyUnits}</p><p className="t-cap">nearby units</p></div><div><p className="text-lg font-bold">{b.recentSales}</p><p className="t-cap">sold, 14 days</p></div></div>
            <p className="t-sub"><b className="text-ink">Why:</b> {b.reason}</p>
            {b.requests > 0 && <p className="t-cap">{b.requests} customers also requested this product directly (not included in searches).</p>}
            {b.opportunity !== 'low' && <Button className="w-full" onClick={() => order({ productId: b.productId, name: b.name, suggestedQty: 20 })}>Consider restocking · Order stock</Button>}
          </div>))}</div>)}
    </div>
  );
}

function Replenish({ order }: { order: (o: any) => void }) {
  const { lang } = useI18n(); const r = useLoad<any>('/retailer/replenishment');
  if (r.err) return <ErrorState onRetry={r.reload} />; if (!r.data) return <SkeletonCards n={3} h="h-36" />;
  if (!r.data.items.length) return <EmptyState icon="truck" title="Nothing needs restocking" text="Products at or below their low-stock level will appear here." />;
  return <div className="grid gap-3 lg:grid-cols-2">{r.data.items.map((x: any) => (
    <div key={x.productId} className="card space-y-2 p-4"><div className="flex items-start justify-between"><p className="t-section">{nm(x, lang)}</p><StatusBadge status={x.status} /></div>
      <p className="t-sub">{x.reason}</p><p className="t-body"><b>{x.recommendation}</b> · {x.qty} left · {x.searches} searches nearby · {money(x.dealerPrice)}/unit</p>
      <Button className="w-full" onClick={() => order({ productId: x.productId, name: x.name, suggestedQty: x.suggestedQty })}>Order stock</Button></div>))}</div>;
}
function OrderSheet({ item, onClose, onDone }: any) {
  const toast = useToast(); const [q, setQ] = useState(String(item.suggestedQty || 20)); const [busy, setBusy] = useState(false); const n = Number(q);
  return (
    <Sheet title={`Order ${item.name}`} onClose={onClose}>
      <div className="space-y-4"><p className="t-sub">Your order goes to CTOB Distribution.</p>
        <div><p className="t-cap mb-2">Quantity</p><div className="flex items-center gap-3"><Button kind="line" aria-label="Decrease" onClick={() => setQ(String(Math.max(1, n - 5)))}><Icon name="minus" size={18} /></Button><input className="input text-center text-2xl font-bold" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} /><Button kind="line" aria-label="Increase" onClick={() => setQ(String(n + 5))}><Icon name="plus" size={18} /></Button></div>{!(n >= 1) && <p className="mt-1 text-sm text-bad">Enter a quantity of 1 or more</p>}</div>
        <Button className="w-full" loading={busy} disabled={!(n >= 1)} onClick={async () => { setBusy(true); try { const r = await api('/retailer/orders', 'POST', { items: [{ productId: item.productId, quantity: n }] }); toast(`Order #${r.orderId} placed`); onDone(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } }}>Place order</Button></div>
    </Sheet>
  );
}

function Audit() {
  const { lang } = useI18n(); const toast = useToast();
  const inv = useLoad<any>('/retailer/inventory'); const hist = useLoad<any>('/retailer/stock-audits');
  const [pid, setPid] = useState(''); const [count, setCount] = useState(''); const [res, setRes] = useState<any>(null); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const cur = inv.data?.items.find((i: any) => String(i.productId) === pid);
  const check = async () => { setBusy(true); try { const r = await api('/retailer/stock-audits', 'POST', { productId: Number(pid), physicalCount: Number(count) }); setRes(r.audit); hist.reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const doConfirm = async () => { setBusy(true); try { await api(`/retailer/stock-audits/${res.id}/confirm`, 'POST'); toast('Audit confirmed — stock adjusted'); setConfirm(false); setRes(null); setCount(''); inv.reload(); hist.reload(); } catch (e: any) { toast(e.message, 'error'); setConfirm(false); } finally { setBusy(false); } };
  const v = res?.variance; const step = (n: number) => `flex-1 rounded-ctl border p-3 text-center ${n}`;
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      <div className="card space-y-4 p-4 lg:self-start">
        <select className="input" aria-label="Product" value={pid} onChange={(e) => { setPid(e.target.value); setRes(null); }}><option value="">Choose a product to count</option>{inv.data?.items.map((i: any) => <option key={i.productId} value={i.productId}>{nm(i, lang)}</option>)}</select>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-1.5 text-center">
          <div className="rounded-ctl bg-paper p-3"><p className="t-cap">Expected</p><p className="text-2xl font-extrabold">{res ? res.expected : cur ? cur.qty : '–'}</p></div><Icon name="chevron" size={16} className="self-center text-ink-mute" />
          <div className="rounded-ctl bg-paper p-3"><p className="t-cap">Physical</p><p className="text-2xl font-extrabold">{count === '' ? '–' : count}</p></div><Icon name="chevron" size={16} className="self-center text-ink-mute" />
          <div className={`rounded-ctl p-3 ${res ? (v === 0 ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad') : 'bg-paper'}`}><p className="t-cap">Difference</p><p className="text-2xl font-extrabold">{res ? `${v > 0 ? '+' : ''}${v}` : '–'}</p></div>
        </div>
        <input className="input text-center text-xl font-bold" inputMode="numeric" placeholder="Enter physical count" aria-label="Physical count" value={count} onChange={(e) => { setCount(e.target.value.replace(/\D/g, '')); setRes(null); }} />
        {!res && <Button className="w-full" loading={busy} disabled={!pid || count === ''} onClick={check}>Check count</Button>}
        {res && (v === 0 ? <p className="animate-rise rounded-ctl bg-ok/10 p-3 font-semibold text-ok">Count matches — no adjustment needed.</p> : (
          <div className="animate-rise space-y-3 rounded-ctl bg-bad/10 p-3"><p className="flex items-center gap-2 font-bold text-bad"><Icon name="alert" size={18} />Stock discrepancy detected</p><p className="t-sub">Expected {res.expected}, counted {res.physical}. Stock stays unchanged until you confirm.</p><Button className="w-full" onClick={() => setConfirm(true)}>Confirm Adjustment</Button></div>))}
      </div>
      <Section title="Audit history">
        {hist.err ? <ErrorState onRetry={hist.reload} /> : !hist.data ? <SkeletonCards n={3} h="h-20" /> : !hist.data.audits.length ? <EmptyState icon="clipboard" title="No audits yet" /> : <div className="card divide-y divide-line">{hist.data.audits.map((a: any) => <div key={a.id} className="px-4 py-3"><div className="flex items-center justify-between"><span className="t-card">{a.name}</span><span className={`chip ${a.status === 'confirmed' ? 'bg-ok/10 text-ok' : a.status === 'pending' ? 'bg-warn/10 text-warn' : 'bg-ink/5 text-ink-mute'}`}>{a.status === 'matched' ? 'Matched' : a.status === 'confirmed' ? 'Adjusted' : 'Awaiting confirmation'}</span></div><p className="t-cap">Expected {a.expected} · Counted {a.physical} · Difference {a.variance} · {ago(a.createdAt)} · {a.retailer}</p></div>)}</div>}
      </Section>
      {confirm && <Modal title="Adjust stock?" text={`Stock will change from ${res.expected} to ${res.physical}. This is recorded in your audit history.`} confirm="Confirm Adjustment" busy={busy} onConfirm={doConfirm} onClose={() => setConfirm(false)} />}
    </div>
  );
}

function Orders() { const o = useLoad<any>('/retailer/orders'); if (o.err) return <ErrorState onRetry={o.reload} />; if (!o.data) return <SkeletonCards n={3} h="h-36" />; return <OrderCards orders={o.data.orders} />; }
export function OrderCards({ orders, action }: { orders: any[]; action?: (o: any) => React.ReactNode }) {
  if (!orders.length) return <EmptyState icon="truck" title="No orders yet" text="Orders you place with your distributor appear here." />;
  return <div className="grid gap-3 lg:grid-cols-2">{orders.map((o) => (
    <div key={o.id} className="card space-y-3 p-4"><div className="flex items-center justify-between"><p className="t-section">Order #{o.id}</p><span className="t-cap">{ago(o.createdAt)}</span></div><p className="t-sub">{o.shopName}</p>
      <div className="space-y-1">{o.items.map((i: any, k: number) => <p key={k} className="t-body">{i.name} <span className="text-ink-mute">× {i.quantity}</span> <span className="float-right font-semibold">{money(i.unitPrice * i.quantity)}</span></p>)}</div>
      <OrderTimeline status={o.status} />{action?.(o)}</div>))}</div>;
}
