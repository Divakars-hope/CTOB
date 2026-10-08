import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { dist } from './api';

export type MapShop = { id: number; name: string; lat: number; lng: number; distanceM: number; status?: string };
const COLOR: Record<string, string> = { available: '#2F8051', low: '#B87A0A', out: '#B0443F', neutral: '#1B2433' };
const M = 111320;

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}
function useSize(ref: React.RefObject<HTMLElement>) {
  const [s, setS] = useState({ w: 360, h: 480 });
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(([e]) => setS({ w: e.contentRect.width, h: e.contentRect.height })); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return s;
}

/** Self-contained interactive map: pan, pinch/scroll zoom, custom markers. Needs no tiles, keys or network. */
export function NearbyMap({ center, radius, shops, selectedId, onSelect, bottomInset = 0, topInset = 0, controlsBottom = 24 }: { center: { lat: number; lng: number }; radius: number; shops: MapShop[]; selectedId: number | null; onSelect: (id: number) => void; bottomInset?: number; topInset?: number; controlsBottom?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(box);
  const cosL = Math.cos((center.lat * Math.PI) / 180);
  const usableH = Math.max(120, h - bottomInset - topInset);
  const fit = Math.min(w, usableH) / 2 / (radius * 1.12);
  const [scale, setScale] = useState(fit);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef({ x: 0, y: 0, d: 0, moved: 0 });
  const cy = topInset + usableH / 2; const cx = w / 2;
  const clampScale = (s: number) => Math.min(Math.max(s, fit * 0.35), fit * 12);

  useEffect(() => { setScale(fit); setOff({ x: 0, y: 0 }); }, [radius, w > 0, center.lat, center.lng, Math.round(bottomInset)]);
  const proj = (lat: number, lng: number) => ({ x: cx + (lng - center.lng) * cosL * M * scale, y: cy - (lat - center.lat) * M * scale });
  const focus = useCallback((lat: number, lng: number) => {
    const dx = (lng - center.lng) * cosL * M * scale, dy = -(lat - center.lat) * M * scale;
    setOff({ x: -dx, y: -dy });
  }, [center.lat, center.lng, scale, cosL]);
  useEffect(() => { const s = shops.find((x) => x.id === selectedId); if (s) focus(s.lat, s.lng); }, [selectedId]);

  const onDown = (e: React.PointerEvent) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); last.current = { x: e.clientX, y: e.clientY, d: 0, moved: 0 }; setDragging(true); };
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (last.current.d) setScale((s) => clampScale((s * d) / last.current.d));
      last.current.d = d;
    } else { setOff((o) => ({ x: o.x + e.clientX - last.current.x, y: o.y + e.clientY - last.current.y })); last.current.x = e.clientX; last.current.y = e.clientY; }
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); last.current.d = 0; if (!ptrs.current.size) setDragging(false); };
  useEffect(() => { // wheel zoom (needs a non-passive listener)
    const el = box.current; if (!el) return;
    const f = (e: WheelEvent) => { e.preventDefault(); setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); };
    el.addEventListener('wheel', f, { passive: false }); return () => el.removeEventListener('wheel', f);
  }, [fit]);

  // nice grid step (~90px)
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000]; const step = steps.find((s) => s * scale >= 70) || 5000;
  const lines: ReactNode[] = []; const span = Math.max(w, h) / scale;
  for (let m = -Math.ceil(span / step) * step; m <= span; m += step) {
    const x = cx + off.x + m * scale, y = cy + off.y + m * scale;
    lines.push(<line key={'v' + m} x1={x} y1={0} x2={x} y2={h} />, <line key={'h' + m} x1={0} y1={y} x2={w} y2={y} />);
  }
  const me = proj(center.lat, center.lng);
  const ordered = [...shops].sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
  const barM = [100, 200, 500, 1000, 2000, 5000].find((m) => m * scale >= 50) || 5000;

  return (
    <div ref={box} className="absolute inset-0 touch-none select-none overflow-hidden bg-[#F3EDE1]" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <svg width="100%" height="100%" role="application" aria-label="Map of nearby shops" className={dragging ? 'cursor-grabbing' : 'cursor-grab'}>
        <g stroke="#E4DACA" strokeWidth="1">{lines}</g>
        <g style={{ transform: `translate(${off.x}px, ${off.y}px)`, transition: dragging ? 'none' : 'transform .35s cubic-bezier(.2,.8,.2,1)' }}>
          <circle cx={me.x} cy={me.y} r={radius * scale} fill="#E0942F" fillOpacity=".07" stroke="#E0942F" strokeOpacity=".55" strokeDasharray="5 5" />
          <circle cx={me.x} cy={me.y} r={(radius * scale) / 2} fill="none" stroke="#E0942F" strokeOpacity=".2" />
          <circle cx={me.x} cy={me.y} r="16" fill="#2B6CB0" fillOpacity=".15"><animate attributeName="r" values="10;22;10" dur="3s" repeatCount="indefinite" /></circle>
          <circle cx={me.x} cy={me.y} r="7" fill="#2B6CB0" stroke="#fff" strokeWidth="3" />
          {ordered.map((s) => {
            const p = proj(s.lat, s.lng), sel = s.id === selectedId, c = COLOR[s.status || 'neutral'];
            const r = sel ? 19 : 14;
            return (
              <g key={s.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer outline-none" role="button" aria-label={`${s.name}, ${dist(s.distanceM)}`} tabIndex={0}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => onSelect(s.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}>
                <circle r="26" fill="transparent" />
                <ellipse cy={r + 4} rx={r * 0.55} ry="3" fill="#1B2433" fillOpacity=".15" />
                <path d={`M0 ${r + 6} L${-r * 0.5} ${r * 0.55} L${r * 0.5} ${r * 0.55}Z`} fill={c} />
                <circle r={r} fill={c} stroke="#fff" strokeWidth="3" style={{ transition: 'r .2s' }} />
                <g transform={`translate(${-r * 0.55},${-r * 0.55}) scale(${(r * 1.1) / 24})`} stroke="#fff" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3" /></g>
                {sel && (
                  <g transform={`translate(0,${-r - 14})`}>
                    <rect x={-(s.name.length * 3.9 + 12)} y="-13" width={s.name.length * 7.8 + 24} height="26" rx="13" fill="#1B2433" />
                    <text textAnchor="middle" y="4.5" fontSize="12" fontWeight="600" fill="#fff">{s.name}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
        <g transform={`translate(16, ${h - controlsBottom - 4})`}><rect width={barM * scale} height="3" fill="#1B2433" fillOpacity=".6" rx="1.5" /><text y="-6" fontSize="11" fontWeight="600" fill="#475165">{dist(barM)}</text></g>
      </svg>
      <div className="absolute right-3 flex flex-col gap-2" style={{ bottom: controlsBottom }} onPointerDown={(e) => e.stopPropagation()}>
        {[['plus', 'Zoom in', 1.3], ['minus', 'Zoom out', 1 / 1.3]].map(([ic, lb, k]: any) => <button key={lb} aria-label={lb} onClick={() => setScale((s) => clampScale(s * k))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-float active:scale-95"><Icon name={ic} size={20} /></button>)}
        <button aria-label="Recentre map" onClick={() => { setScale(fit); setOff({ x: 0, y: 0 }); }} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-700 shadow-float active:scale-95"><Icon name="locate" size={20} /></button>
      </div>
    </div>
  );
}

/** Draggable bottom sheet with three snap points, positioned inside its (relative) parent. */
export type Snap = 'peek' | 'half' | 'full';
export function MapSheet({ snap, setSnap, peek = 168, children, parentH, header }: { snap: Snap; setSnap: (s: Snap) => void; peek?: number; children: ReactNode; parentH: number; header: ReactNode }) {
  const full = Math.max(260, parentH - 72), half = Math.max(peek + 40, Math.round(parentH * 0.5));
  const y = (s: Snap) => (s === 'full' ? 0 : s === 'half' ? full - half : full - peek);
  const [drag, setDrag] = useState<number | null>(null);
  const st = useRef({ y0: 0, base: 0, t: 0, v: 0, last: 0 });
  const down = (e: React.PointerEvent) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); st.current = { y0: e.clientY, base: y(snap), t: performance.now(), v: 0, last: e.clientY }; setDrag(y(snap)); };
  const move = (e: React.PointerEvent) => {
    if (drag === null) return; const dt = performance.now() - st.current.t || 1;
    st.current.v = (e.clientY - st.current.last) / Math.max(1, dt - 0); st.current.last = e.clientY; st.current.t = performance.now();
    setDrag(Math.min(y('peek'), Math.max(0, st.current.base + e.clientY - st.current.y0)));
  };
  const up = () => {
    if (drag === null) return; const v = st.current.v; let target: Snap;
    if (Math.abs(v) > 0.5) target = v < 0 ? (snap === 'peek' ? 'half' : 'full') : (snap === 'full' ? 'half' : 'peek');
    else target = (['peek', 'half', 'full'] as Snap[]).reduce((a, b) => (Math.abs(y(a) - drag) < Math.abs(y(b) - drag) ? a : b));
    setDrag(null); setSnap(target);
  };
  const cycle = () => setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-sheet border-t border-line bg-paper shadow-sheet" style={{ height: full, transform: `translateY(${drag ?? y(snap)}px)`, transition: drag === null ? 'transform .3s cubic-bezier(.2,.8,.2,1)' : 'none' }}>
      <div className="touch-none px-4 pb-2 pt-2" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button aria-label="Expand or collapse" onClick={cycle} className="mx-auto mb-2 block h-5 w-16"><span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-ink/20" /></button>
        {header}
      </div>
      <div className={`overscroll-contain px-4 pb-6 ${snap === 'peek' ? 'overflow-hidden' : 'overflow-y-auto'}`} style={{ height: full - y(snap) - 64 }}>{children}</div>
    </div>
  );
}
