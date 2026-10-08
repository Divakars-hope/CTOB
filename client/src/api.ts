const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';
let token: string | null = localStorage.getItem('ctob.token');
export const setToken = (t: string | null) => { token = t; t ? localStorage.setItem('ctob.token', t) : localStorage.removeItem('ctob.token'); };
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error('Cannot reach CTOB right now. Check your connection and try again.'); }
  let data: any = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || data.success === false) {
    if (res.status === 401 && token) { setToken(null); location.reload(); }
    throw new Error(data.message || 'Something went wrong. Please try again.');
  }
  return data as T;
}
export const money = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const dist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
export const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'Just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
