import { ProjectComposerScreen } from './screens/ProjectComposerScreen'
import { ProjectScreen } from './screens/ProjectScreen'
import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react'
import { HashRouter, Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ApiProvider } from './api/ApiContext'
import type { LedgerApi } from './api/client'
import { AppShell } from './app/AppShell'
import { RequireAuth, ReturnToAfterSignIn, SessionProvider } from './app/session'
import { Loading } from './components/States'
import { CasesScreen } from './screens/CasesScreen'
import { DraftScreen } from './screens/DraftScreen'
import { InboxScreen } from './screens/InboxScreen'
import { LandingScreen } from './screens/LandingScreen'
import { NewWriteupScreen } from './screens/NewWriteupScreen'
import { PostScreen } from './screens/PostScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { PromoteScreen } from './screens/PromoteScreen'
import { RecordScreen } from './screens/RecordScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { SearchScreen } from './screens/SearchScreen'
import { TopicScreen } from './screens/TopicScreen'
import { JoinScreen } from './screens/JoinScreen'
import { WorkspaceSettingsScreen } from './screens/WorkspaceSettingsScreen'

// The editor pulls in TipTap; load it only when someone opens a write-up.
const WriteupScreen = lazy(() => import('./screens/WriteupScreen').then((m) => ({ default: m.WriteupScreen })))

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<LandingScreen />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="inbox" element={<InboxScreen />} />
        <Route path="drafts/:id" element={<DraftScreen />} />
        <Route path="new" element={<NewWriteupScreen />} />
        <Route
          path="write/:id"
          element={
            <Suspense fallback={<Loading label="Opening editor" />}>
              <WriteupScreen />
            </Suspense>
          }
        />
        <Route path="cases" element={<CasesScreen />} />
        <Route path="records" element={<RecordsScreen />} />
        <Route path="records/:id" element={<RecordScreen />} />
        <Route path="records/:id/promote" element={<PromoteScreen />} />
        <Route path="search" element={<SearchScreen />} />
        <Route path="settings" element={<WorkspaceSettingsScreen />} />
        <Route path="projects/:id" element={<ProjectComposerScreen />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="t/:tag" element={<TopicScreen />} />
      <Route path="join/:token" element={<JoinScreen />} />
      <Route path="u/:handle" element={<ProfileScreen />} />
      <Route path="u/:handle/projects/:slug" element={<ProjectScreen />} />
      <Route path="u/:handle/:slug" element={<PostScreen />} />
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="state">
      <strong>Page not found</strong>
      <Link to="/inbox" className="btn">
        Back to inbox
      </Link>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="state state--error" role="alert">
          <strong>Ledger hit an unexpected error</strong>
          <span className="muted">{this.state.error.message}</span>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Embedded previews (VITE_ROUTER=memory) keep routes in memory instead of the URL.
function Router({ children }: { children: ReactNode }) {
  return import.meta.env.VITE_ROUTER === 'memory' ? (
    <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
  ) : (
    <HashRouter>{children}</HashRouter>
  )
}

/**
 * Hash routing keeps deep links working on any static host. Switch to
 * BrowserRouter once the app is served by a backend with a catch-all route.
 */
export default function App({ api }: { api: LedgerApi }) {
  return (
    <ErrorBoundary>
      <ApiProvider api={api}>
        <Router>
          <ScrollToTop />
          <SessionProvider fallback={<Loading label="Starting Ledger" />}>
            <ReturnToAfterSignIn />
            <AppRoutes />
          </SessionProvider>
        </Router>
      </ApiProvider>
    </ErrorBoundary>
  )
}
