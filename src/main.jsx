import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App.jsx'
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx'
window.__STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID ?? '';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>
)
