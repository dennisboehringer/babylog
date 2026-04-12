import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </AppProvider>
  </StrictMode>,
);
