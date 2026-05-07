import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './style.css'
import { Toaster } from '@/components/ui/sonner'
import { Sentry, initSentry } from '@/lib/sentry'

initSentry('sidepanel')

function SidepanelErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        The error has been reported automatically. Please reload the side panel to continue.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Reload
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<SidepanelErrorFallback />}>
      <App />
      <Toaster />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
