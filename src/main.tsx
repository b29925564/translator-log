import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DataProvider } from './db/data';
import './styles.css';
import './features/install';
import { setRegistration, startUpdateChecks } from './features/update';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
);

if (!__DEMO_BUILD__ && 'serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true, onRegisteredSW: (_url, r) => setRegistration(r) }))
    .catch(() => {
      /* offline support is a bonus, never a blocker */
    });
}

startUpdateChecks();
