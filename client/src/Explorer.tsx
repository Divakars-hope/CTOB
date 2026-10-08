import { useCallback, useEffect, useRef, useState } from 'react';
import { api, dist } from './api';
import { useI18n } from './i18n';
import { Icon } from './icons';
import { Button, EmptyState, ErrorState, IconButton, SkeletonCards, StatusBadge, useToast } from './ui';
import { MapShop, MapSheet, NearbyMap, Snap, useMedia } from './Map';

export const RADII = [300, 500, 1000, 2000, 5000];
export const pName = (p: any, lang: string) => (lang === 'ta' && p?.name_ta) || p?.name;
export const radiusLabel = (r: number) => (r < 1000 ? `${r} m` : `${r / 1000} km`);

export function RadiusChips({ radius, setRadius }: { radius: number; setRadius: (r: number) => void }) {
  return <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Search radius">{RADII.map((r) => <button key={r} aria-pressed={radius === r} ref={(el) => { if (el && radius === r) el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }} onClick={() => setRadius(r)} className={radius === r ? 'filter-on !px-3' : 'filter-off !px-3'}>{radiusLabel(r)}</button>)}</div>;
}

function StoreRow({ s, selected, chosen, product, onSelect, onOpen }: { s: MapShop & { area?: string; productCount?: number }; selected: boolean; chosen: boolean; product: any; onSelect: () => void; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div onClick={onSelect} className={`card cursor-pointer p-3.5 transition ${selected ? 'border-brand-500 ring-2 ring-brand-200' : 'hover:border-brand-300'}`} data-shop={s.id}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name="store" size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><p className="t-card truncate">{s.name}</p>{product && s.status && <StatusBadge status={s.status} />}</div>
          <p className="t-sub">{dist(s.distanceM)} away{s.area ? ` · ${s.area.split(',')[0]}` : ''}</p>
          {chosen && <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Icon name="check" size={13} strokeWidth={3} />Your store</p>}
        </div>
      </div>
      {selected && <div className="mt-3 animate-fadeIn"><Button className="w-full" onClick={(e: any) => { e.stopPropagation(); onOpen(); }}>View Store</Button></div>}
    </div>
  );
}

/** Map + list experience. With a product it shows availability; without one it shows participating shops. */
export function Explorer({ product, loc, radius, setRadius, chosenShop, onOpenStore, onSearch, onBack, onChanged }: any) {
  const { t, lang } = useI18n(); const toast = useToast();
  const wide = useMedia('(min-width: 768px)');
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(false);
  const [sel, setSel] = useState<number | null>(null); const [snap, setSnap] = useState<Snap>('peek');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [done, setDone] = useState({ req: false, rem: false }); const [busy, setBusy] = useState('');
  const root = useRef<HTMLDivElement>(null); const [h, setH] = useState(600);
  useEffect(() => { if (!root.current) return; const ro = new ResizeObserver(([e]) => setH(e.contentRect.height)); ro.observe(root.current); return () => ro.disconnect(); }, []);

  const load = useCallback(() => {
    setErr(false);
    const url = product ? `/products/${product.id}/availability?lat=${loc.lat}&lng=${loc.lng}&radius=${radius}` : `/shops/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=${radius}`;
    api(url).then((r) => setData(r)).catch(() => setErr(true));
  }, [product?.id, loc.lat, loc.lng, radius]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { setSel(null); }, [product?.id, radius]);

  const shops: any[] = data?.shops || [];
  const unavailable = !!product && !!data && !shops.some((s) => s.status !== 'out');
  const scarce = !!product && !!data && !shops.some((s) => s.status === 'available'); // everything nearby is low or out
  useEffect(() => { if (data && scarce) setSnap('half'); }, [scarce, data]);
  const pick = (id: number) => { setSel(id); if (!wide) { if (view === 'map') setSnap((s) => (s === 'peek' ? 'peek' : s)); } if (wide || view === 'list') setTimeout(() => document.querySelector(`[data-shop="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); };

  const act = async (kind: 'req' | 'rem') => {
    setBusy(kind);
    try {
      const r = kind === 'req' ? await api('/product-requests', 'POST', { productId: product.id, shopId: chosenShop || shops[0]?.id }) : await api('/reminders', 'POST', { productId: product.id, radius, lat: loc.lat, lng: loc.lng });
      setDone((d) => ({ ...d, [kind]: true })); toast(kind === 'req' ? 'Request sent to nearby shops' : 'Reminder saved'); onChanged?.();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(''); }
  };

  const Unavail = scarce && (
    <div className="card mb-3 animate-rise space-y-3 border-brand-200 bg-brand-50 p-4">
      <div><p className="t-section">{unavailable ? 'Not available nearby' : 'Limited stock nearby'}</p><p className="t-sub">{unavailable ? `${pName(product, lang)} isn’t in stock at shops within ${radiusLabel(radius)}.` : `${pName(product, lang)} is running low at nearby shops.`} Choose what suits you:</p></div>
      <div className="space-y-2">
        <div><Button className="w-full" loading={busy === 'rem'} disabled={done.rem} onClick={() => act('rem')}><Icon name={done.rem ? 'check' : 'bookmark'} size={18} />{done.rem ? 'Reminder saved' : t('saveReminder')}</Button><p className="t-cap mt-1">We’ll alert you when it’s available near you — even if you travel.</p></div>
        <div><Button kind="line" className="w-full" loading={busy === 'req'} disabled={done.req} onClick={() => act('req')}>{done.req ? 'Request sent' : t('request')}</Button><p className="t-cap mt-1">Ask nearby shops to start stocking it.</p></div>
      </div>
    </div>
  );
  const Rows = !data ? <SkeletonCards n={3} h="h-20" /> : err ? null : shops.length === 0 ? <EmptyState icon="store" title="No nearby stores found" text={`There are no participating shops within ${radiusLabel(radius)}. Try a wider radius.`} action={radius < 5000 && <Button kind="soft" onClick={() => setRadius(RADII[Math.min(RADII.indexOf(radius) + 1, 4)])}>Search wider</Button>} /> : (
    <div className="space-y-2.5">{shops.map((s) => <StoreRow key={s.id} s={s} selected={sel === s.id} chosen={chosenShop === s.id} product={product} onSelect={() => pick(s.id)} onOpen={() => onOpenStore(s.id)} />)}</div>
  );
  const count = data ? `${shops.length} ${shops.length === 1 ? 'store' : 'stores'} within ${radiusLabel(radius)}` : 'Finding stores…';
  const mapShops: MapShop[] = shops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, distanceM: s.distanceM, status: product ? s.status : undefined }));
  const selShop = shops.find((s) => s.id === sel);

  const top = (
    <div className="pointer-events-auto space-y-2 px-3 pt-[calc(12px+env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        {onBack && <IconButton icon="back" label="Back" onClick={onBack} className="bg-white shadow-float" />}
        <button onClick={onSearch} className="flex min-h-[48px] flex-1 items-center gap-2.5 rounded-ctl bg-white px-4 text-left shadow-float"><Icon name="search" size={20} className="text-ink-mute" /><span className={`truncate text-[15px] ${product ? 'font-semibold' : 'text-ink-mute'}`}>{product ? pName(product, lang) : 'Search products nearby'}</span></button>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><RadiusChips radius={radius} setRadius={setRadius} /></div>
        {!wide && <div className="inline-flex shrink-0 rounded-ctl bg-white p-1 shadow-float" role="group" aria-label="View">{(['map', 'list'] as const).map((m) => <button key={m} aria-pressed={view === m} onClick={() => setView(m)} aria-label={t(m)} className={`flex h-9 w-10 items-center justify-center rounded-[9px] ${view === m ? 'bg-ink text-white' : 'text-ink-soft'}`}><Icon name={m} size={18} /></button>)}</div>}
      </div>
    </div>
  );

  if (wide) return ( // desktop / tablet: list panel + map, always in sync
    <div ref={root} className="relative flex h-[calc(100dvh-60px-env(safe-area-inset-bottom))] lg:h-[100dvh]">
      <div className="flex w-[400px] shrink-0 flex-col border-r border-line bg-paper">
        <div className="space-y-3 border-b border-line p-4"><div className="flex items-center gap-2">{onBack && <IconButton icon="back" label="Back" onClick={onBack} className="-ml-2" />}<button onClick={onSearch} className="input flex flex-1 items-center gap-2 text-left"><Icon name="search" size={18} className="text-ink-mute" /><span className={product ? 'font-semibold' : 'text-ink-mute'}>{product ? pName(product, lang) : 'Search products nearby'}</span></button></div><RadiusChips radius={radius} setRadius={setRadius} /><p className="t-sub">{count}</p></div>
        <div className="flex-1 overflow-y-auto p-4">{err ? <ErrorState text="We couldn’t load nearby stores." onRetry={load} /> : <>{Unavail}{Rows}</>}</div>
      </div>
      <div className="relative flex-1"><NearbyMap center={loc} radius={radius} shops={mapShops} selectedId={sel} onSelect={pick} /></div>
    </div>
  );

  return (
    <div ref={root} className="relative h-[calc(100dvh-60px-env(safe-area-inset-bottom))] overflow-hidden bg-paper">
      {view === 'map' ? (
        <>
          <NearbyMap center={loc} radius={radius} shops={mapShops} selectedId={sel} onSelect={(id) => { pick(id); if (!scarce) setSnap('peek'); }} topInset={118} bottomInset={snap === 'peek' ? 168 : snap === 'half' ? Math.round(h * 0.5) : 0} controlsBottom={(snap === 'peek' ? 168 : snap === 'half' ? h * 0.5 : 24) + 16} />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">{top}</div>
          {err ? <div className="absolute inset-x-4 bottom-4 z-10 rounded-panel bg-white p-2 shadow-float"><ErrorState text="We couldn’t load nearby stores." onRetry={load} /></div> : (
            <MapSheet snap={snap} setSnap={setSnap} parentH={h} header={<div><p className="t-section">{count}</p>{snap === 'peek' && !selShop && <p className="t-sub">{scarce ? 'Save a reminder or send a request' : 'Tap a marker to preview a store'}</p>}</div>}>
              {Unavail}
              {selShop && snap === 'peek' ? <StoreRow s={selShop} selected chosen={chosenShop === selShop.id} product={product} onSelect={() => {}} onOpen={() => onOpenStore(selShop.id)} /> : Rows}
            </MapSheet>
          )}
        </>
      ) : (
        <div className="h-full overflow-y-auto px-4 pb-6 pt-[124px]"><div className="pointer-events-none fixed inset-x-0 top-0 z-20 bg-paper/95 pb-2 backdrop-blur"><div className="mx-auto max-w-3xl">{top}</div></div>{err ? <ErrorState text="We couldn’t load nearby stores." onRetry={load} /> : <><p className="t-sub mb-3">{count}</p>{Unavail}{Rows}</>}</div>
      )}
    </div>
  );
}
