import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
