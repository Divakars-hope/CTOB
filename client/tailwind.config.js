export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      brand: { 50: '#FFF8EE', 100: '#FDEBD3', 200: '#F9D6A8', 300: '#F4BE79', 400: '#EDA652', 500: '#E0942F', 600: '#B8731A', 700: '#8F5810' },
      ink: { DEFAULT: '#1B2433', soft: '#475165', mute: '#6B7385' },
      paper: '#FAF6EF', line: '#E8E1D5', ok: '#2F8051', warn: '#B87A0A', bad: '#B0443F',
    },
    borderRadius: { ctl: '12px', card: '16px', panel: '20px', sheet: '28px' },
    fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans Tamil', 'Noto Sans', 'sans-serif'] },
    boxShadow: { card: '0 1px 2px rgba(27,36,51,.05)', float: '0 6px 20px rgba(27,36,51,.12)', sheet: '0 -8px 30px rgba(27,36,51,.14)' },
    keyframes: {
      fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      rise: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
      sheetIn: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      toastIn: { from: { opacity: 0, transform: 'translate(-50%, 12px)' }, to: { opacity: 1, transform: 'translate(-50%, 0)' } },
      shimmer: { '100%': { transform: 'translateX(100%)' } },
      pop: { '0%': { transform: 'scale(.6)', opacity: 0 }, '70%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
    },
    animation: { fadeIn: 'fadeIn .2s ease-out', rise: 'rise .28s cubic-bezier(.2,.8,.2,1)', sheetIn: 'sheetIn .28s cubic-bezier(.2,.8,.2,1)', toastIn: 'toastIn .22s ease-out', pop: 'pop .35s ease-out' },
  } },
};
