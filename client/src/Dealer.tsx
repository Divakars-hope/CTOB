import { useCallback, useEffect, useState } from 'react';
import { api, money } from './api';
import { useI18n } from './i18n';
import { Icon } from './icons';
import { AppFrame, Button, EmptyState, ErrorState, LangSwitch, LevelBadge, MetricCard, NavItem, Section, SkeletonCards, useToast } from './ui';
import { OrderCards } from './Retailer';

type Tab = 'overview' | 'orders' | 'catalogue' | 'account';
const NEXT: Record<string, string> = { Pending: 'Confirmed', Confirmed: 'Dispatched', Dispatched: 'Delivered' };

export default function Dealer({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const { t } = useI18n(); const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview'); const [p, setP] = useState<any[] | null>(null); const [o, setO] = useState<any[] | null>(null); const [err, setErr] = useState(false); const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => { setErr(false); api('/dealer/products').then((r) => setP(r.products)).catch(() => setErr(true)); api('/dealer/orders').then((r) => setO(r.orders)).catch(() => setErr(true)); }, []);
  useEffect(load, []);
  const count = (s: string) => (o || []).filter((x) => x.status === s).length;
  const opps = (p || []).filter((x) => x.demand !== 'low').sort((a, b) => (a.demand === 'high' ? 0 : 1) - (b.demand === 'high' ? 0 : 1) || b.retailerInterest - a.retailerInterest);
  const nav: NavItem<Tab>[] = [{ id: 'overview', label: 'Overview', icon: 'home' }, { id: 'orders', label: t('retailerOrders').replace('Retailer ', ''), icon: 'truck', badge: count('Pending') }, { id: 'catalogue', label: 'Catalogue', icon: 'box' }, { id: 'account', label: t('account'), icon: 'user' }];
  const advance = async (x: any) => { setBusy(x.id); try { await api(`/dealer/orders/${x.id}/status`, 'PATCH', { status: NEXT[x.status] }); toast(`Order #${x.id} ${NEXT[x.status].toLowerCase()}`); load(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const orderAction = (x: any) => NEXT[x.status] ? <Button className="w-full" loading={busy === x.id} onClick={() => advance(x)}>Mark {NEXT[x.status].toLowerCase()}</Button> : <p className="t-cap text-center">Delivered — retailer stock updated</p>;
  const Orders = !o ? <SkeletonCards n={3} h="h-40" /> : <OrderCards orders={o} action={orderAction} />;
  return (
    <AppFrame nav={nav} value={tab} onNav={setTab} wide signOut={onSignOut} title={tab === 'overview' ? user.name : nav.find((n) => n.id === tab)?.label}
      >
      {tab === 'account' ? (
        <div className="space-y-4">
          <div className="card flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name="truck" size={22} /></span><div><p className="t-card">{user.name}</p><p className="t-cap">Distributor account</p></div></div>
          <div className="card flex items-center justify-between gap-3 p-4"><span className="t-card">Language</span><LangSwitch /></div>
          <Button kind="line" className="w-full" onClick={onSignOut}><Icon name="logout" size={18} />{t('signout')}</Button>
        </div>
      ) : err ? <ErrorState text="We couldn’t load your data." onRetry={load} /> : tab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard tone="brand" label="Pending orders" value={count('Pending')} hint="need your confirmation" /><MetricCard label="Confirmed" value={count('Confirmed')} /><MetricCard label="Dispatched" value={count('Dispatched')} /><MetricCard label="Delivered" value={count('Delivered')} /></div>
          <Section title={t('demandOpp')} action={<span className="t-cap">across retailers</span>}>
            {!p ? <SkeletonCards n={2} h="h-16" /> : !opps.length ? <EmptyState icon="trend" title="No demand opportunities right now" /> : <div className="card divide-y divide-line">{opps.map((x) => <div key={x.id} className="flex min-h-[64px] items-center justify-between gap-3 px-4"><div><p className="t-card">{x.name}</p><p className="t-sub">{x.retailerInterest} {x.retailerInterest === 1 ? 'store' : 'stores'} with local demand</p></div><LevelBadge level={x.demand} /></div>)}</div>}
          </Section>
          <Section title="Recent orders" action={<button className="text-sm font-semibold text-brand-700" onClick={() => setTab('orders')}>View all</button>}>{o && <OrderCards orders={o.slice(0, 2)} action={orderAction} />}</Section>
        </div>
      ) : tab === 'orders' ? Orders : (
        !p ? <SkeletonCards n={6} h="h-[68px]" /> : <div className="card divide-y divide-line">{p.map((x) => <div key={x.id} className="flex min-h-[68px] items-center justify-between gap-3 px-4 py-2"><div className="min-w-0"><p className="t-card truncate">{x.name}</p><p className="t-cap">{x.category} · {x.stock} available</p></div><div className="flex items-center gap-3 text-right"><div><p className="font-bold">{money(x.price)}</p><p className="t-cap">per unit</p></div>{x.demand !== 'low' && <LevelBadge level={x.demand} />}</div></div>)}</div>
      )}
    </AppFrame>
  );
}
