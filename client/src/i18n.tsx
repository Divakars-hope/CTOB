import { createContext, useContext, useState, ReactNode } from 'react';
const D: Record<string, [string, string]> = {
  tagline: ['Find Nearby. Buy Local. Grow Together.', 'அருகில் தேடுங்கள். உள்ளூரில் வாங்குங்கள். சேர்ந்து வளருங்கள்.'],
  signin: ['Continue', 'தொடரவும்'], mobile: ['Mobile number', 'மொபைல் எண்'], sendOtp: ['Send code', 'குறியீடு அனுப்பு'], otp: ['Verification code', 'சரிபார்ப்பு குறியீடு'],
  verify: ['Verify & continue', 'சரிபார்த்து தொடரவும்'], business: ['Shop owner or distributor? Sign in here', 'கடைக்காரர் / விநியோகஸ்தரா? இங்கே உள்நுழையவும்'], customerLogin: ['I am a customer', 'நான் ஒரு வாடிக்கையாளர்'],
  search: ['Search for a product', 'பொருளைத் தேடுங்கள்'], categories: ['Categories', 'வகைகள்'], home: ['Home', 'முகப்பு'], reminders: ['Reminders', 'நினைவூட்டல்கள்'], alerts: ['Alerts', 'அறிவிப்புகள்'], walk: ['Walk & Save', 'நடந்து சேமி'],
  radius: ['Search radius', 'தேடல் தூரம்'], location: ['Current location', 'தற்போதைய இடம்'], changeLocation: ['Change location', 'இடத்தை மாற்று'], useMyLocation: ['Use my current location', 'என் தற்போதைய இடத்தைப் பயன்படுத்து'],
  available: ['Available', 'கிடைக்கிறது'], low: ['Low Stock', 'குறைவான இருப்பு'], out: ['Out of Stock', 'இருப்பு இல்லை'], list: ['List', 'பட்டியல்'], map: ['Map', 'வரைபடம்'],
  chooseShop: ['Choose this shop', 'இந்தக் கடையைத் தேர்ந்தெடு'], yourShop: ['Your shop', 'உங்கள் கடை'], request: ['Request Product', 'பொருளைக் கோரு'], saveReminder: ['Save Reminder', 'நினைவூட்டலைச் சேமி'],
  nothingNearby: ['Not available nearby right now', 'இப்போது அருகில் கிடைக்கவில்லை'], noStores: ['No nearby stores found.', 'அருகில் கடைகள் இல்லை.'], caughtUp: ["You're all caught up.", 'புதிய அறிவிப்புகள் இல்லை.'],
  dashboard: ["Dashboard", 'டாஷ்போர்டு'], todaysSales: ["Today's Sales", 'இன்றைய விற்பனை'], currentStock: ['Current Stock', 'தற்போதைய இருப்பு'], lowStock: ['Low Stock', 'குறைந்த இருப்பு'], demandOpp: ['Demand Opportunities', 'தேவை வாய்ப்புகள்'], variance: ['Stock Variance', 'இருப்பு வேறுபாடு'],
  billing: ['Billing', 'பில்லிங்'], inventory: ['Inventory', 'இருப்பு'], demand: ['Demand Beacon', 'தேவை சமிக்ஞை'], audit: ['Stock Audit', 'இருப்பு தணிக்கை'], replenish: ['Replenishment', 'மறுநிரப்பல்'], orders: ['Orders', 'ஆர்டர்கள்'],
  catalogue: ['Product Catalogue', 'பொருள் பட்டியல்'], retailerOrders: ['Retailer Orders', 'கடை ஆர்டர்கள்'], signout: ['Sign out', 'வெளியேறு'], cancel: ['Cancel', 'ரத்து'], save: ['Save', 'சேமி'],
  nearby: ['Nearby', 'அருகில்'], account: ['Account', 'கணக்கு'], searchTab: ['Search', 'தேடல்'], unknown: ['Not stocked', 'இல்லை'],
  total: ['Total', 'மொத்தம்'], completeSale: ['Complete Sale', 'விற்பனையை முடி'], cash: ['Cash', 'பணம்'], addToBill: ['Add', 'சேர்'], home2: ['Home', 'முகப்பு'],
};
type Lang = 'en' | 'ta';
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({ lang: 'en', setLang: () => {}, t: (k) => k });
export function I18n({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>((localStorage.getItem('ctob.lang') as Lang) || 'en');
  const setLang = (l: Lang) => { localStorage.setItem('ctob.lang', l); document.documentElement.lang = l; set(l); };
  return <Ctx.Provider value={{ lang, setLang, t: (k) => (D[k] ? D[k][lang === 'ta' ? 1 : 0] : k) }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
