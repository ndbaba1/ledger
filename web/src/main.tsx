import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createMockApi } from './api/mockApi'
import './styles.css'

// Swap createMockApi() for an HTTP implementation of LedgerApi when the backend exists.
const api = createMockApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
)
