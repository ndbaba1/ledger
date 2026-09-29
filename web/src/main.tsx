import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createHttpApi } from './api/httpApi'
import { createMockApi } from './api/mockApi'
import { isLive } from './lib/features'
import './styles.css'

// VITE_API=http is live mode: talk to the real Rails backend only, with no
// mock fallback. Anything else (the default) runs entirely on the mock, so
// tests and the preview keep working without a backend.
const api = isLive ? createHttpApi({ base: '/api/v1' }) : createMockApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
)
