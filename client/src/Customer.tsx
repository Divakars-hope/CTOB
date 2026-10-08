import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ago, dist } from './api';
import { useI18n } from './i18n';
import { Icon, IconName } from './icons';
import { AppFrame, Button, EmptyState, ErrorState, IconButton, LangSwitch, Modal, NavItem, Section, Sheet, Skeleton, SkeletonCards, StatusBadge, useToast } from './ui';
import { Explorer, RADII, pName, radiusLabel, RadiusChips } from './Explorer';

type Tab = 'home' | 'search' | 'nearby' | 'reminders' | 'account';
type Screen = { type: 'results'; product: any } | { type: 'store'; shopId: number; product?: any } | { type: 'alerts' };
type Loc = { lat: number; lng: number; label: string };
const CAT_ICON: Record<string, IconName> = { Grocery: 'basket', Bakery: 'bread', Vegetables: 'leaf', Hardware: 'hammer', Electrical: 'bolt', Electronics: 'chip', Household: 'spray', Stationery: 'pencil' };
const recentGet = (): any[] => { try { return JSON.parse(localStorage.getItem('ctob.recent') || '[]'); } catch { return []; } };

export default function Customer({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const { t, lang } = useI18n(); const toast = useToast();
  const [tab, setTab] = useState<Tab>('home'); const [stack, setStack] = useState<Screen[]>([]);
  const [loc, setLoc] = useState<Loc | null>(user.location);
  const [radius, setRadius] = useState<number>(() => Number(localStorage.getItem('ctob.radius')) || 1000);
  const [locations, setLocations] = useState<any[]>([]); const [locOpen, setLocOpen] = useState(!user.location);
  const [notes, setNotes] = useState<any[] | null>(null); const [unread, setUnread] = useState(0);
  const [reminders, setReminders] = useState<any[] | null>(null);
  const [preset, setPreset] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Record<number, number>>(() => { try { return JSON.parse(localStorage.getItem('ctob.chosen') || '{}'); } catch { return {}; } });

  const loadNotes = useCallback(() => api('/notifications').then((r) => { setNotes(r.notifications); setUnread(r.unread); }).catch(() => setNotes([])), []);
  const loadReminders = useCallback(() => api('/reminders').then((r) => setReminders(r.reminders)).catch(() => setReminders([])), []);
  useEffect(() => { api('/locations').then((r) => setLocations(r.locations)).catch(() => {}); loadNotes(); loadReminders(); }, []);
  useEffect(() => { localStorage.setItem('ctob.radius', String(radius)); }, [radius]);

  const push = (s: Screen) => setStack((st) => [...st, s]); const pop = () => setStack((st) => st.slice(0, -1));
  const goTab = (x: Tab) => { setStack([]); setTab(x); if (x !== 'search') setPreset(null); };
  const choose = (productId: number | undefined, shopId: number) => { if (!productId) return; const n = { ...chosen, [productId]: shopId }; setChosen(n); localStorage.setItem('ctob.chosen', JSON.stringify(n)); };
  const openProduct = (p: any) => {
    const r = [{ id: p.id, name: p.name, name_ta: p.name_ta }, ...recentGet().filter((x) => x.id !== p.id)].slice(0, 6);
    localStorage.setItem('ctob.recent', JSON.stringify(r)); push({ type: 'results', product: p });
  };
  const changeLoc = async (l: Loc) => {
    try {
      const r = await api('/me/location', 'POST', l); setLoc(l); setLocOpen(false);
      if (r.notified) toast('Your saved product is available nearby'); loadNotes();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const useGps = () => {
    if (!navigator.geolocation) return toast('Location is not available on this device', 'error');
    navigator.geolocation.getCurrentPosition((p) => changeLoc({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Current location' }), () => toast('We couldn’t get your location. Choose one from the list.', 'error'), { timeout: 8000 });
  };

  const nav: NavItem<Tab>[] = [{ id: 'home', label: t('home'), icon: 'home' }, { id: 'search', label: t('searchTab'), icon: 'search' }, { id: 'nearby', label: t('nearby'), icon: 'pin' }, { id: 'reminders', label: t('reminders'), icon: 'bookmark', badge: 0 }, { id: 'account', label: t('account'), icon: 'user' }];
  const top = stack[stack.length - 1]; const place = loc?.label.split('·').pop()?.trim() || 'Set location';
  const locSheet = locOpen && (
    <Sheet title={t('changeLocation')} onClose={() => loc && setLocOpen(false)}>
      <div className="space-y-2">
        <Button className="w-full" onClick={useGps}><Icon name="locate" size={18} />{t('useMyLocation')}</Button>
        {locations.map((l) => <button key={l.key} onClick={() => changeLoc({ lat: l.lat, lng: l.lng, label: l.label })} className={`card flex min-h-[56px] w-full items-center gap-3 px-4 text-left ${loc?.label === l.label ? 'border-brand-500 bg-brand-50' : ''}`}><Icon name="pin" size={20} className="text-brand-600" /><span className="t-card">{l.label}</span>{loc?.label === l.label && <Icon name="check" size={18} className="ml-auto text-brand-600" />}</button>)}
      </div>
    </Sheet>
  );
  const resultsProps = (product: any) => ({ product, loc, radius, setRadius, chosenShop: chosen[product.id], onOpenStore: (id: number) => push({ type: 'store', shopId: id, product }), onSearch: () => goTab('search'), onBack: pop, onChanged: loadReminders });

  let body;
  if (!loc) body = <div className="p-6"><EmptyState icon="pin" title="Choose your location" text="We’ll show shops near you." action={<Button onClick={() => setLocOpen(true)}>{t('changeLocation')}</Button>} /></div>;
  else if (top?.type === 'results') body = <Explorer key={top.product.id} {...resultsProps(top.product)} />;
  else if (top?.type === 'store') body = <StorePage key={top.shopId} shopId={top.shopId} product={top.product} loc={loc} chosen={top.product ? chosen[top.product.id] === top.shopId : false} onChoose={() => { choose(top.product?.id, top.shopId); toast('Store selected'); }} onBack={pop} />;
  else if (top?.type === 'alerts') body = <Alerts items={notes} reload={loadNotes} onBack={pop} onOpen={(n: any) => n.shopId ? push({ type: 'store', shopId: n.shopId, product: n.productId ? { id: n.productId, name: n.title.replace(' is available near you', '') } : undefined }) : null} />;
  else if (tab === 'home') body = <Home loc={loc} place={place} unread={unread} onLoc={() => setLocOpen(true)} onBell={() => push({ type: 'alerts' })} onSearch={() => goTab('search')} onCat={(id: number) => { setPreset(id); setTab('search'); }} onShop={(id: number) => push({ type: 'store', shopId: id })} reminders={reminders} goReminders={() => goTab('reminders')} />;
  else if (tab === 'search') body = <SearchScreen preset={preset} onPick={openProduct} />;
  else if (tab === 'nearby') body = <Explorer loc={loc} radius={radius} setRadius={setRadius} product={null} chosenShop={null} onOpenStore={(id: number) => push({ type: 'store', shopId: id })} onSearch={() => goTab('search')} />;
  else if (tab === 'reminders') body = <Reminders items={reminders} reload={loadReminders} onOpen={(r: any) => openProduct({ id: r.productId, name: r.name, name_ta: r.name_ta })} onSearch={() => goTab('search')} />;
  else body = <Account user={user} loc={loc} onLoc={() => setLocOpen(true)} reminders={reminders?.length || 0} goReminders={() => goTab('reminders')} onSignOut={onSignOut} />;

  const bare = top?.type === 'results' || (!top && tab === 'nearby') || (!top && tab === 'home') || (!top && tab === 'search');
  return (
    <>
      <AppFrame nav={nav} value={tab} onNav={goTab} bare={bare} wide={top?.type === 'results' || tab === 'nearby'} title={top?.type === 'store' ? 'Store' : top?.type === 'alerts' ? t('alerts') : tab === 'reminders' ? t('reminders') : t('account')} onBack={top ? pop : undefined}>
        {body}
      </AppFrame>
      {locSheet}
    </>
  );
}

function Home({ loc, place, unread, onLoc, onBell, onSearch, onCat, onShop, reminders, goReminders }: any) {
  const { t } = useI18n();
  const [cats, setCats] = useState<any[]>([]); const [shops, setShops] = useState<any[] | null>(null); const [err, setErr] = useState(false);
  const load = useCallback(() => { setErr(false); api(`/shops/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=2000`).then((r) => setShops(r.shops)).catch(() => setErr(true)); }, [loc.lat, loc.lng]);
  useEffect(() => { api('/categories').then((r) => setCats(r.categories)).catch(() => {}); }, []);
  useEffect(() => { setShops(null); load(); }, [load]);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-[calc(8px+env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 py-2">
        <img src="/logo.png" alt="CTOB" className="h-10 w-10 rounded-[22%] lg:hidden" />
        <button onClick={onLoc} className="min-w-0 flex-1 text-left" aria-label="Change location"><p className="t-cap">Shopping near</p><p className="flex items-center gap-1 text-[17px] font-bold"><span className="truncate">{place}</span><Icon name="chevron" size={16} className="rotate-90 shrink-0" /></p></button>
        <div className="relative"><IconButton icon="bell" label="Notifications" onClick={onBell} className="bg-white shadow-card" />{unread > 0 && <span key={unread} className="absolute -right-0.5 -top-0.5 min-w-[18px] animate-pop rounded-full bg-bad px-1 text-center text-[11px] font-bold leading-[18px] text-white">{unread}</span>}</div>
      </header>
      <h1 className="t-display mt-3">What are you<br />looking for?</h1>
      <button onClick={onSearch} className="mt-4 flex min-h-[56px] w-full items-center gap-3 rounded-panel border border-line bg-white px-4 text-left shadow-float"><Icon name="search" size={22} className="text-brand-600" /><span className="t-body text-ink-mute">Search products near you</span></button>
      <div className="mt-6 grid grid-cols-4 gap-x-2 gap-y-4">
        {cats.map((c) => <button key={c.id} onClick={() => onCat(c.id)} className="flex flex-col items-center gap-1.5 transition active:scale-95"><span className="flex h-14 w-14 items-center justify-center rounded-card bg-brand-100 text-brand-700"><Icon name={CAT_ICON[c.name] || 'box'} size={26} /></span><span className="text-xs font-semibold">{c.name}</span></button>)}
      </div>
      {reminders?.length > 0 && <button onClick={goReminders} className="card mt-6 flex w-full items-center gap-3 p-4 text-left"><span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name="bookmark" size={20} /></span><span className="min-w-0 flex-1"><span className="t-card block">{reminders.length} saved {reminders.length === 1 ? 'reminder' : 'reminders'}</span><span className="t-sub block truncate">{reminders.map((r: any) => r.name).join(', ')}</span></span><Icon name="chevron" size={18} className="text-ink-mute" /></button>}
      <div className="mt-7"><Section title="Available near you">
        {err ? <ErrorState text="We couldn’t load nearby stores." onRetry={load} /> : !shops ? <SkeletonCards n={3} h="h-[76px]" /> : !shops.length ? <EmptyState icon="store" title="No nearby stores found" text="Try changing your location." /> : (
          <div className="space-y-2.5">{shops.slice(0, 4).map((s) => (
            <button key={s.id} onClick={() => onShop(s.id)} className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:border-brand-300 active:scale-[.99]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name="store" size={24} /></span>
              <span className="min-w-0 flex-1"><span className="t-card block truncate">{s.name}</span><span className="t-sub block">{dist(s.distanceM)} away · {s.area.split(',')[0]}</span></span>
              <Icon name="chevron" size={18} className="text-ink-mute" />
            </button>))}</div>)}
      </Section></div>
      <div className="card mt-7 flex items-center gap-3 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-ok/10 text-ok"><Icon name="walk" size={20} /></span><div><p className="t-card">Walk &amp; Save</p><p className="t-sub">Walk to a nearby shop and unlock offers funded by the retailer. Coming to participating shops soon.</p></div></div>
    </div>
  );
}

function SearchScreen({ preset, onPick }: { preset: number | null; onPick: (p: any) => void }) {
  const { lang } = useI18n();
  const [q, setQ] = useState(''); const [cats, setCats] = useState<any[]>([]); const [cat, setCat] = useState<number | null>(preset);
  const [res, setRes] = useState<any[] | null>(null); const [err, setErr] = useState(false); const [recent, setRecent] = useState(recentGet());
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { api('/categories').then((r) => setCats(r.categories)).catch(() => {}); if (!preset) inp.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim() && !cat) { setRes(null); return; }
    const x = setTimeout(() => api(`/products?q=${encodeURIComponent(q.trim())}${cat ? `&category=${cat}` : ''}`).then((r) => { setRes(r.products); setErr(false); }).catch(() => setErr(true)), 180);
    return () => clearTimeout(x);
  }, [q, cat]);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-[calc(12px+env(safe-area-inset-top))]">
      <div className="relative"><Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && res?.[0] && onPick(res[0])} placeholder="Search products near you" enterKeyHint="search" aria-label="Search products" className="input min-h-[56px] rounded-panel pl-12 pr-12 shadow-float" />
        {q && <button aria-label="Clear" onClick={() => { setQ(''); inp.current?.focus(); }} className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-ink-mute"><Icon name="close" size={18} /></button>}</div>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">{cats.map((c) => <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} className={cat === c.id ? 'filter-on' : 'filter-off'}><Icon name={CAT_ICON[c.name] || 'box'} size={16} className="mr-1.5" />{c.name}</button>)}</div>
      <div className="mt-5">
        {err ? <ErrorState text="We couldn’t search right now." onRetry={() => setQ(q + ' ')} /> : res === null ? (
          recent.length ? <Section title="Recent searches" action={<button className="text-sm font-semibold text-brand-700" onClick={() => { localStorage.removeItem('ctob.recent'); setRecent([]); }}>Clear</button>}>
            <div className="card divide-y divide-line">{recent.map((r) => <button key={r.id} onClick={() => onPick(r)} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left"><Icon name="search" size={18} className="text-ink-mute" /><span className="t-body">{pName(r, lang)}</span></button>)}</div></Section>
          : <EmptyState icon="search" title="Find what you need nearby" text="Search for a product to see which shops around you have it." />
        ) : res.length === 0 ? <EmptyState icon="search" title="No results" text="Try a different spelling or pick a category." /> : (
          <div className="card animate-fadeIn divide-y divide-line">{res.map((p) => <button key={p.id} onClick={() => onPick(p)} className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition active:bg-brand-50"><span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name={CAT_ICON[p.category] || 'box'} size={20} /></span><span className="min-w-0 flex-1"><span className="t-card block truncate">{pName(p, lang)}</span><span className="t-sub block">{p.category}</span></span><Icon name="chevron" size={18} className="text-ink-mute" /></button>)}</div>
        )}
      </div>
    </div>
  );
}

function StorePage({ shopId, product, loc, chosen, onChoose, onBack }: any) {
  const { lang } = useI18n(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(false); const [q, setQ] = useState('');
  const load = () => { setErr(false); api(`/shops/${shopId}?lat=${loc.lat}&lng=${loc.lng}`).then(setD).catch(() => setErr(true)); };
  useEffect(load, [shopId]);
  if (err) return <ErrorState text="We couldn’t load this store." onRetry={load} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-36 rounded-card" /><SkeletonCards n={4} h="h-16" /></div>;
  const s = d.shop; const mine = product && d.products.find((p: any) => p.id === product.id);
  const list = d.products.filter((p: any) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex items-start gap-3"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-100 text-brand-700"><Icon name="store" size={28} /></span><div className="min-w-0"><h1 className="t-title">{s.name}</h1><p className="t-sub">{s.area}</p><p className="t-sub font-semibold text-ink">{dist(s.distanceM)} away</p></div></div>
        {mine && <div className="mt-4 flex items-center justify-between rounded-ctl bg-paper p-3"><div><p className="t-cap">{pName(product, lang)}</p><StatusBadge status={mine.status} /></div>{mine.status !== 'out' ? (chosen ? <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ok"><Icon name="check" size={16} strokeWidth={3} />Your store</span> : <Button small onClick={onChoose}>Choose this store</Button>) : <p className="t-cap max-w-[9rem] text-right">Not in stock here right now</p>}</div>}
        <a className="btn-line mt-3 w-full" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=walking`}><Icon name="map" size={18} />Get directions</a>
      </div>
      <Section title="Products in this store">
        <input className="input" placeholder="Search this store" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this store" />
        {!list.length ? <EmptyState icon="search" title="No matching products" /> : <div className="card divide-y divide-line">{list.map((p: any) => <div key={p.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4"><span className="min-w-0"><span className="t-card block truncate">{pName(p, lang)}</span><span className="t-cap">{p.category}</span></span><StatusBadge status={p.status} /></div>)}</div>}
      </Section>
    </div>
  );
}

function Reminders({ items, reload, onOpen, onSearch }: any) {
  const toast = useToast(); const [rm, setRm] = useState<any>(null);
  if (!items) return <SkeletonCards n={3} />;
  if (!items.length) return <EmptyState icon="bookmark" title="No saved reminders" text="When a product isn’t available nearby, save a reminder and we’ll tell you the moment it is — wherever you are." action={<Button onClick={onSearch}>Search products</Button>} />;
  return (
    <div className="space-y-3">
      <p className="t-sub">Your shopping memory travels with you. We’ll alert you when these become available near you.</p>
      {items.map((r: any) => (
        <div key={r.id} className="card flex items-center gap-3 p-4">
          <button onClick={() => onOpen(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name="bookmark" size={22} /></span><span className="min-w-0"><span className="t-card block truncate">{r.name}</span><span className="t-sub block">Within {radiusLabel(r.radius)} · saved {ago(r.createdAt)}</span></span></button>
          <IconButton icon="close" label={`Remove ${r.name}`} onClick={() => setRm(r)} className="text-ink-mute" />
        </div>))}
      {rm && <Modal title="Remove reminder?" text={`You’ll no longer be alerted about ${rm.name}.`} confirm="Remove" onClose={() => setRm(null)} onConfirm={() => api(`/reminders/${rm.id}`, 'DELETE').then(() => { toast('Reminder removed'); setRm(null); reload(); }).catch((e) => toast(e.message, 'error'))} />}
    </div>
  );
}

function Alerts({ items, reload, onOpen, onBack }: any) {
  const [f, setF] = useState<'all' | 'unread'>('all');
  if (!items) return <SkeletonCards n={3} />;
  const list = f === 'unread' ? items.filter((n: any) => !n.read) : items;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><div className="flex gap-2">{(['all', 'unread'] as const).map((k) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)} className={f === k ? 'filter-on' : 'filter-off'}>{k === 'all' ? 'All' : 'Unread'}</button>)}</div>
        {items.some((n: any) => !n.read) && <button className="text-sm font-semibold text-brand-700" onClick={() => api('/notifications/read-all', 'POST').then(reload)}>Mark all read</button>}</div>
      {!list.length ? <EmptyState icon="bell" title="You’re all caught up." text="Alerts about saved products and nearby availability will appear here." /> : list.map((n: any) => (
        <div key={n.id} className={`card animate-rise p-4 ${n.read ? '' : 'border-brand-300 bg-brand-50'}`}>
          <div className="flex gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${n.read ? 'bg-ink/5 text-ink-mute' : 'bg-brand-500 text-ink'}`}><Icon name={n.shopId ? 'store' : 'bell'} size={20} /></span>
            <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="t-card">{n.title}</p><span className="t-cap shrink-0">{ago(n.createdAt)}</span></div><p className="t-sub">{n.message}</p>
              {n.shopId && <Button small kind={n.read ? 'line' : 'primary'} className="mt-3" onClick={() => { api(`/notifications/${n.id}/read`, 'PATCH').then(reload); onOpen(n); }}>View Store</Button>}</div></div>
        </div>))}
    </div>
  );
}

function Account({ user, loc, onLoc, reminders, goReminders, onSignOut }: any) {
  const { t } = useI18n();
  const row = (icon: IconName, label: string, value: string | undefined, onClick?: () => void) => <button onClick={onClick} disabled={!onClick} className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left"><Icon name={icon} size={20} className="text-brand-600" /><span className="flex-1"><span className="t-cap block">{label}</span><span className="t-card">{value}</span></span>{onClick && <Icon name="chevron" size={18} className="text-ink-mute" />}</button>;
  return (
    <div className="space-y-5">
      <div className="card divide-y divide-line">{row('user', 'Mobile number', user.mobile ? `+91 ${user.mobile}` : '—')}{row('pin', t('location'), loc?.label, onLoc)}{row('bookmark', t('reminders'), `${reminders} saved`, goReminders)}</div>
      <div className="card flex items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><Icon name="globe" size={20} className="text-brand-600" /><span className="t-card">Language</span></div><LangSwitch /></div>
      <div className="card divide-y divide-line">
        <div className="flex items-start gap-3 p-4"><Icon name="info" size={20} className="mt-0.5 text-brand-600" /><div><p className="t-card">About CTOB</p><p className="t-sub">CTOB Seva (C to B Sevai) helps you discover what’s available in shops near you and helps local shops stock what neighbours are looking for.</p></div></div>
        <div className="flex items-start gap-3 p-4"><Icon name="shield" size={20} className="mt-0.5 text-brand-600" /><div><p className="t-card">Your privacy</p><p className="t-sub">Shops only see how many people searched for a product nearby — never who they are.</p></div></div>
      </div>
      <Button kind="line" className="w-full" onClick={onSignOut}><Icon name="logout" size={18} />{t('signout')}</Button>
    </div>
  );
}
