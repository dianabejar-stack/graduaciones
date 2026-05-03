import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout            from './components/Layout'
import Login             from './pages/Login'
import Dashboard         from './pages/Dashboard'
import Students          from './pages/Students'
import Payments          from './pages/Payments'
import AccountStatus     from './pages/AccountStatus'
import GuestSimulator    from './pages/GuestSimulator'
import Reports           from './pages/Reports'
import Settings          from './pages/Settings'
import ParallelDashboard from './pages/ParallelDashboard'

// Pantalla de carga inicial
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg">
      <div className="w-12 h-12 rounded-full bg-navy-700 flex items-center justify-center mb-4 animate-pulse">
        <span className="text-2xl">🎓</span>
      </div>
      <p className="text-navy-400 text-sm">Cargando sistema...</p>
    </div>
  )
}

// Guarda de ruta — verifica sesión y rol mínimo requerido
function ProtectedRoute({ children, roles }) {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />

  // Si se especifican roles permitidos, verificar
  if (roles && !roles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}

export default function App() {
  const { session, homeRoute, loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route
          path="/login"
          element={session ? <Navigate to={homeRoute} replace /> : <Login />}
        />

        {/* Rutas con layout compartido */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>

          {/* ── Admin total ── */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['admin']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute roles={['admin']}>
                <Students />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute roles={['admin']}>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* ── Admin + admin_paralelo ── */}
          <Route
            path="/payments"
            element={
              <ProtectedRoute roles={['admin', 'admin_paralelo']}>
                <Payments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute roles={['admin', 'admin_paralelo']}>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/parallel"
            element={
              <ProtectedRoute roles={['admin', 'admin_paralelo']}>
                <ParallelDashboard />
              </ProtectedRoute>
            }
          />

          {/* ── Todos los roles autenticados ── */}
          <Route path="/account"   element={<AccountStatus />} />
          <Route path="/simulator" element={<GuestSimulator />} />
        </Route>

        {/* Raíz → según rol */}
        <Route
          path="/"
          element={session ? <Navigate to={homeRoute} replace /> : <Navigate to="/login" replace />}
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
