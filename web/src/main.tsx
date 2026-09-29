import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createHttpApi } from './api/httpApi'
import { createMockApi } from './api/mockApi'
import './styles.css'

// VITE_API=http talks to the real Rails backend; anything else (the default)
// keeps the app on the in-memory mock, so tests and the preview keep working.
const api =
  import.meta.env.VITE_API === 'http'
    ? createHttpApi({ base: '/api/v1', fallback: createMockApi() })
    : createMockApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
)
