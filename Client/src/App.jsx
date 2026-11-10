import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { SocketProvider } from './context/SocketContext.jsx'
import Auth from './components/Auth.jsx'
import Dashboard from './components/Dashboard.jsx'

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        Restoring your session…
      </main>
    )
  }
  return user ? children : <Navigate to="/auth" replace />
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-300">
        Restoring your session…
      </main>
    )
  }
  return user ? <Navigate to="/" replace /> : children
}

function App() {
  const { user } = useAuth()

  return (
    <SocketProvider key={user?.userId ?? 'anonymous'}>
      <Routes>
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <Auth />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SocketProvider>
  )
}

export default App
