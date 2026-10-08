import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, IconName } from './icons';
import { useI18n } from './i18n';

export const Logo = ({ size = 36 }: { size?: number }) => <img src="/logo.png" alt="CTOB" width={size} height={size} className="shrink-0 rounded-[22%]" style={{ width: size, height: size }} />;

/* ---------- toast ---------- */
const ToastCtx = createContext<(m: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ m: string; kind: string; id: number } | null>(null);
  const show = useCallback((m: string, kind: 'ok' | 'error' = 'ok') => setT({ m, kind, id: Date.now() }), []);
  useEffect(() => { if (!t) return; const x = setTimeout(() => setT(null), 3000); return () => clearTimeout(x); }, [t?.id]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div key={t.id} role="status" className="fixed left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 animate-toastIn items-center gap-2 rounded-ctl bg-ink px-4 py-3 text-sm font-medium text-white shadow-float" style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
          <Icon name={t.kind === 'error' ? 'alert' : 'check'} size={18} className={t.kind === 'error' ? 'text-red-300' : 'text-green-300'} />{t.m}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- primitives ---------- */
const KIND: Record<string, string> = { primary: 'btn-primary', soft: 'btn-soft', line: 'btn-line', dark: 'btn-dark' };
export function Button({ loading, children, kind = 'primary', small, className = '', ...p }: any) {
  return <button {...p} disabled={p.disabled || loading} className={`${KIND[kind]} ${small ? 'btn-sm' : ''} ${className}`}>{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}{children}</button>;
}
export const IconButton = ({ icon, label, onClick, className = '', size = 22 }: { icon: IconName; label: string; onClick?: () => void; className?: string; size?: number }) => (
  <button aria-label={label} onClick={onClick} className={`flex h-11 w-11 items-center justify-center rounded-full text-ink transition active:scale-95 hover:bg-ink/5 ${className}`}><Icon name={icon} size={size} /></button>
);
export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div role="group" aria-label="Language" className="inline-flex rounded-ctl bg-ink/[.06] p-1">
      {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([k, l]) => <button key={k} onClick={() => setLang(k)} aria-pressed={lang === k} className={`min-h-[36px] rounded-[9px] px-3 text-sm font-semibold transition ${lang === k ? 'bg-white shadow-card' : 'text-ink-soft'}`}>{l}</button>)}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const m: Record<string, string> = { available: 'bg-ok/10 text-ok', low: 'bg-warn/10 text-warn', out: 'bg-bad/10 text-bad', unknown: 'bg-ink/5 text-ink-mute' };
  return <span className={`chip ${m[status] || m.unknown}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{t(status)}</span>;
}
export const LevelBadge = ({ level }: { level: string }) => {
  const m: Record<string, [string, string]> = { high: ['bg-bad/10 text-bad', 'High opportunity'], medium: ['bg-warn/10 text-warn', 'Medium'], low: ['bg-ink/5 text-ink-mute', 'Low'] };
  return <span className={`chip ${m[level][0]}`}>{m[level][1]}</span>;
};
export const Skeleton = ({ className = 'h-4 w-full' }: { className?: string }) => <div className={`skeleton ${className}`} />;
export const SkeletonCards = ({ n = 3, h = 'h-24' }: { n?: number; h?: string }) => <div className="space-y-3" aria-busy="true">{Array.from({ length: n }).map((_, i) => <div key={i} className={`skeleton ${h} rounded-card`} />)}</div>;
export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fadeIn flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600"><Icon name={icon} size={28} /></div>
      <p className="t-section">{title}</p>{text && <p className="t-sub mt-1 max-w-xs">{text}</p>}{action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({ text = 'Something went wrong.', onRetry }: { text?: string; onRetry?: () => void }) {
  return <EmptyState icon="alert" title={text} text="Please check your connection and try again." action={onRetry && <Button kind="line" onClick={onRetry}>Try again</Button>} />;
}
export const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="t-section">{title}</h2>{action}</div>{children}</section>
);
export function MetricCard({ label, value, hint, tone, wide }: { label: string; value: ReactNode; hint?: string; tone?: 'brand' | 'warn' | 'bad'; wide?: boolean }) {
  const c = tone === 'brand' ? 'bg-brand-100 border-brand-200' : 'bg-white border-line';
  const v = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : '';
  return <div className={`rounded-card border p-4 shadow-card ${c} ${wide ? 'col-span-2' : ''}`}><p className="t-sub">{label}</p><p className={`mt-1 text-[28px] font-extrabold leading-8 tracking-tight ${v}`}>{value}</p>{hint && <p className="t-cap mt-0.5">{hint}</p>}</div>;
}
export function OrderTimeline({ status }: { status: string }) {
  const steps = ['Pending', 'Confirmed', 'Dispatched', 'Delivered']; const cur = steps.indexOf(status);
  return (
    <ol className="flex items-start" aria-label={`Order status: ${status}`}>
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= cur ? 'bg-ok' : 'bg-line'}`} />
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-white ${i < cur ? 'border-ok bg-ok' : i === cur ? 'border-brand-500 bg-brand-500' : 'border-line bg-white'}`}>{i <= cur && <Icon name="check" size={13} strokeWidth={3} />}</span>
            <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : i < cur ? 'bg-ok' : 'bg-line'}`} />
          </div>
          <span className={`mt-1.5 text-[11px] font-semibold ${i === cur ? 'text-ink' : 'text-ink-mute'}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- overlays ---------- */
function useEsc(fn: () => void) { useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && fn(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []); }
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 animate-fadeIn sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} className="max-h-[88vh] w-full max-w-md animate-sheetIn overflow-auto rounded-t-sheet bg-paper p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-sheet sm:rounded-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h2 className="t-title">{title}</h2><IconButton icon="close" label="Close" onClick={onClose} /></div>
        {children}
      </div>
    </div>
  );
}
export function Modal({ title, text, confirm, onConfirm, onClose, busy }: { title: string; text: string; confirm: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-6 animate-fadeIn" onClick={onClose}>
      <div role="alertdialog" aria-label={title} className="w-full max-w-sm animate-rise rounded-panel bg-white p-5 shadow-float" onClick={(e) => e.stopPropagation()}>
        <p className="t-title">{title}</p><p className="t-body mt-2 text-ink-soft">{text}</p>
        <div className="mt-5 grid grid-cols-2 gap-2"><Button kind="line" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={onConfirm}>{confirm}</Button></div>
      </div>
    </div>
  );
}

/* ---------- navigation + frame ---------- */
export type NavItem<T extends string> = { id: T; label: string; icon: IconName; badge?: number };
export function AppFrame<T extends string>({ nav, rail, value, onNav, title, right, onBack, children, bare, wide, signOut }: { nav: NavItem<T>[]; rail?: NavItem<T>[]; value: T | null; onNav: (t: T) => void; title?: ReactNode; right?: ReactNode; onBack?: () => void; children: ReactNode; bare?: boolean; wide?: boolean; signOut?: () => void }) {
  return (
    <div className="min-h-full lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2"><Logo size={34} /><span className="text-lg font-extrabold tracking-tight">CTOB</span></div>
        <nav className="space-y-1">
          {(rail || nav).map((n) => <button key={n.id} onClick={() => onNav(n.id)} aria-current={value === n.id} className={`flex min-h-[44px] w-full items-center gap-3 rounded-ctl px-3 text-[15px] font-semibold transition ${value === n.id ? 'bg-brand-100 text-brand-700' : 'text-ink-soft hover:bg-ink/5'}`}><Icon name={n.icon} size={20} />{n.label}{!!n.badge && <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] text-white">{n.badge}</span>}</button>)}
        </nav>
        <div className="mt-auto space-y-3"><LangSwitch />{signOut && <button onClick={signOut} className="flex min-h-[44px] w-full items-center gap-3 rounded-ctl px-3 text-[15px] font-semibold text-ink-soft hover:bg-ink/5"><Icon name="logout" size={20} />Sign out</button>}</div>
      </aside>
      <div className={`mx-auto min-h-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} ${bare ? '' : 'pb-24 lg:pb-10'}`}>
        {!bare && (
          <header className="sticky top-0 z-20 flex min-h-[60px] items-center gap-2 border-b border-line bg-paper/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
            {onBack ? <IconButton icon="back" label="Back" onClick={onBack} className="-ml-2" /> : <span className="lg:hidden"><Logo size={32} /></span>}
            <div className="t-title min-w-0 flex-1 truncate">{title ?? 'CTOB'}</div>{right}
          </header>
        )}
        <main key={String(value)} className={`animate-rise ${bare ? '' : 'px-4 py-4 lg:px-6'}`}>{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
        <div className="mx-auto flex max-w-3xl">
          {nav.map((n) => (
            <button key={n.id} onClick={() => onNav(n.id)} aria-current={value === n.id} className={`relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:scale-95 ${value === n.id ? 'text-brand-700' : 'text-ink-mute'}`}>
              <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition ${value === n.id ? 'bg-brand-100' : ''}`}><Icon name={n.icon} size={21} />{!!n.badge && <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-bad px-1 text-[10px] leading-4 text-white">{n.badge}</span>}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
