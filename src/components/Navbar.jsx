import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_LABELS = {
  admin:          'Administrador',
  admin_paralelo: 'Admin de Paralelo',
  padre:          'Representante',
}

// Links por rol
const NAV_LINKS = {
  admin: [
    { to: '/dashboard',  label: 'Dashboard' },
    { to: '/students',   label: 'Estudiantes' },
    { to: '/payments',   label: 'Pagos' },
    { to: '/reports',    label: 'Reportes' },
    { to: '/simulator',  label: 'Simulador' },
    { to: '/settings',   label: 'Configuración' },
  ],
  admin_paralelo: [
    { to: '/parallel',   label: 'Mi Paralelo' },
    { to: '/payments',   label: 'Pagos' },
    { to: '/reports',    label: 'Reportes' },
    { to: '/simulator',  label: 'Simulador' },
  ],
  padre: [
    { to: '/account',    label: 'Mi Estado de Cuenta' },
    { to: '/simulator',  label: 'Simulador' },
  ],
}

export default function Navbar() {
  const { profile, role, isAdmin, isAdminParalelo, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const links = NAV_LINKS[role] ?? NAV_LINKS.padre

  const roleBadgeClass = {
    admin:          'bg-gold-500 text-navy-900',
    admin_paralelo: 'bg-navy-500 text-white',
    padre:          'bg-navy-800 text-navy-200',
  }[role] ?? 'bg-navy-800 text-navy-200'

  return (
    <nav className="bg-navy-700 shadow-lg sticky top-0 z-40">
      {/* Franja dorada superior */}
      <div className="h-1 w-full bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15 py-3">

          {/* ── Logo ── */}
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gold-500 flex items-center justify-center shadow-gold shrink-0">
              <span className="text-lg leading-none select-none">🎓</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-white text-[15px] leading-tight">GraduaciónApp</p>
              <p className="text-gold-400 text-[10px] leading-none font-light tracking-widest uppercase">
                Graduaciones 2028
              </p>
            </div>
          </NavLink>

          {/* ── Links desktop ── */}
          <div className="hidden md:flex items-center gap-0.5">
            {links.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-gold-500 text-navy-900 shadow-gold font-semibold'
                      : 'text-navy-100 hover:bg-navy-600 hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {/* ── Perfil + logout desktop ── */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-white text-xs font-medium leading-tight truncate max-w-[140px]">
                {profile?.full_name || profile?.email}
              </p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${roleBadgeClass}`}>
                {ROLE_LABELS[role]}
                {isAdminParalelo && profile?.parallels?.name && ` · ${profile.parallels.name}`}
              </span>
            </div>
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-lg border border-navy-500
                         text-navy-200 hover:bg-navy-600 hover:text-white hover:border-navy-400
                         transition-all duration-150"
            >
              Salir
            </button>
          </div>

          {/* ── Botón hamburguesa mobile ── */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden p-2 rounded-lg text-navy-200 hover:bg-navy-600 transition-colors"
            aria-label="Menú"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Menú mobile desplegable ── */}
      {mobileOpen && (
        <div className="md:hidden bg-navy-800 border-t border-navy-600 px-4 pt-3 pb-4 space-y-1">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gold-500 text-navy-900 font-semibold'
                    : 'text-navy-100 hover:bg-navy-700'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <div className="pt-3 border-t border-navy-600 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">
                {profile?.full_name || profile?.email}
              </p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${roleBadgeClass}`}>
                {ROLE_LABELS[role]}
              </span>
            </div>
            <button
              onClick={signOut}
              className="text-xs px-4 py-2 rounded-lg bg-navy-700 text-navy-200
                         hover:bg-navy-600 hover:text-white transition-colors border border-navy-500"
            >
              Salir
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
