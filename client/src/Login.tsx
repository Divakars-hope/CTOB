import { useEffect, useState } from 'react';
import { api, setToken } from './api';
import { useI18n } from './i18n';
import { Icon } from './icons';
import { Button, LangSwitch, Logo, Skeleton } from './ui';

export default function Login({ onAuth }: { onAuth: (u: any) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'customer' | 'business'>('customer'); const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState(''); const [otp, setOtp] = useState('');
  const [accounts, setAccounts] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (mode === 'business') api('/auth/accounts').then((r) => setAccounts(r.accounts)).catch((e) => setErr(e.message)); }, [mode]);
  const run = async (fn: () => Promise<void>) => { setErr(''); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const valid = /^[6-9]\d{9}$/.test(mobile);
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-8 pt-[calc(20px+env(safe-area-inset-top))]">
      <div className="flex justify-end"><LangSwitch /></div>
      <div className="mt-8 flex animate-rise flex-col items-center text-center">
        <Logo size={88} /><h1 className="t-display mt-5">CTOB</h1><p className="t-body mt-1 max-w-[18rem] text-ink-soft">{t('tagline')}</p>
      </div>
      <div className="mt-9 flex-1">
        {mode === 'customer' ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (step === 'mobile') run(async () => { await api('/auth/request-otp', 'POST', { mobile }); setStep('otp'); }); else run(async () => { const r = await api('/auth/verify-otp', 'POST', { mobile, otp }); setToken(r.token); onAuth(r.user); }); }}>
            <div><label htmlFor="m" className="mb-1.5 block text-sm font-semibold">{t('mobile')}</label>
              <div className="flex gap-2"><span className="flex min-h-[52px] items-center rounded-ctl border border-line bg-white px-3.5 font-semibold text-ink-soft">+91</span>
                <input id="m" className="input min-h-[52px] text-lg tracking-wide" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile} disabled={step === 'otp'} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} placeholder="98765 43210" /></div>
              {mobile.length === 10 && !valid && <p className="mt-1.5 text-sm text-bad">Enter a valid Indian mobile number</p>}</div>
            {step === 'otp' && <div className="animate-rise"><label htmlFor="o" className="mb-1.5 block text-sm font-semibold">{t('otp')}</label>
              <input id="o" className="input min-h-[52px] text-center text-2xl tracking-[.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} autoFocus onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              <p className="t-sub mt-1.5">We sent a 6-digit code to +91 {mobile}. <button type="button" className="font-semibold text-brand-700 underline" onClick={() => { setStep('mobile'); setOtp(''); setErr(''); }}>Change number</button></p></div>}
            {err && <p role="alert" className="rounded-ctl bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
            <Button type="submit" loading={busy} disabled={step === 'mobile' ? !valid : otp.length !== 6} className="w-full min-h-[52px]">{step === 'mobile' ? t('sendOtp') : t('verify')}</Button>
          </form>
        ) : (
          <div className="space-y-2.5 animate-rise">
            <p className="t-sub mb-1">Choose your business account</p>
            {err && <p role="alert" className="rounded-ctl bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
            {!accounts && !err && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-card" />)}
            {accounts?.map((a) => (
              <button key={a.id} disabled={busy} onClick={() => run(async () => { const r = await api('/auth/business-login', 'POST', { userId: a.id }); setToken(r.token); onAuth(r.user); })} className="card flex min-h-[64px] w-full items-center gap-3 px-4 text-left transition hover:border-brand-300 active:scale-[.99]">
                <span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-brand-100 text-brand-700"><Icon name={a.role === 'retailer' ? 'store' : 'truck'} size={20} /></span>
                <span className="flex-1"><span className="t-card block">{a.name}</span><span className="t-cap">{a.role === 'retailer' ? 'Shop owner' : 'Distributor'}</span></span><Icon name="chevron" size={18} className="text-ink-mute" /></button>))}
          </div>
        )}
      </div>
      <button className="mt-8 min-h-[44px] text-center text-[15px] font-semibold text-brand-700" onClick={() => { setMode(mode === 'customer' ? 'business' : 'customer'); setErr(''); }}>{mode === 'customer' ? t('business') : t('customerLogin')}</button>
    </div>
  );
}
