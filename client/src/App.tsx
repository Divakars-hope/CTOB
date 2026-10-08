import { useEffect, useState } from 'react';
import { api, setToken } from './api';
import { I18n, useI18n } from './i18n';
import Login from './Login';
import Customer from './Customer';
import Retailer from './Retailer';
import Dealer from './Dealer';
import { Logo, ToastProvider } from './ui';

function Root() {
  const { setLang } = useI18n();
  const [user, setUser] = useState<any>(null); const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('ctob.token')) return setReady(true);
    api('/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  const signOut = () => { setToken(null); setUser(null); };
  if (!ready) return <div className="flex h-full items-center justify-center"><Logo size={72} /></div>;
  if (!user) return <Login onAuth={setUser} />;
  if (user.role === 'retailer') return <Retailer user={user} onSignOut={signOut} />;
  if (user.role === 'dealer') return <Dealer user={user} onSignOut={signOut} />;
  return <Customer user={user} onSignOut={signOut} />;
}
export default function App() { return <I18n><ToastProvider><Root /></ToastProvider></I18n>; }
