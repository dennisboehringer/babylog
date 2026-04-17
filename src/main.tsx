import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { MealAnalysisProvider } from './context/MealAnalysisContext';
import { detectLanguage, translate } from './i18n';
import App from './App';
import './index.css';

// Register service worker with update detection
async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update();
      }, 60 * 1000);

      // Listen for new service worker
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            // New version activated — show update toast
            showUpdateToast();
          }
        });
      });

      // If a new SW is already waiting, activate it
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }
}

function showUpdateToast() {
  // Only show if there's an existing page (not first load)
  if (document.visibilityState === 'visible') {
    const toast = document.createElement('div');
    toast.id = 'update-toast';
    toast.innerHTML = `
      <div style="
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #4A9EFF, #3B82F6);
        color: white; padding: 12px 20px; border-radius: 14px;
        font-size: 14px; font-weight: 600; z-index: 9999;
        box-shadow: 0 4px 20px rgba(74, 158, 255, 0.4);
        cursor: pointer; font-family: -apple-system, system-ui, sans-serif;
        max-width: 320px; text-align: center;
        animation: slideUp 0.3s ease-out;
      " onclick="window.location.reload()">
        ${translate(detectLanguage(), 'app.updateAvailable')}
      </div>
    `;
    document.body.appendChild(toast);
  }
}

registerSW();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <AppProvider>
          <SyncProvider>
            <MealAnalysisProvider>
              <App />
            </MealAnalysisProvider>
          </SyncProvider>
        </AppProvider>
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
);
