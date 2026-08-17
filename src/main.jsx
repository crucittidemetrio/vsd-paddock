import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min: dati considerati freschi
      gcTime: 5 * 60_000,       // 5 min: poi vengono garbage-collected
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// Service worker solo in produzione: in dev interferirebbe con l'HMR di
// Vite (che riscrive gli asset ad ogni salvataggio). Registrato dopo il
// load per non competere con le risorse critiche del primo render.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installazione PWA non critica per il funzionamento del sito —
      // un errore qui non deve mai apparire come un problema utente.
    });
  });
}