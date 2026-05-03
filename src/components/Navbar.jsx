import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_LABELS = {
  admin:          'Administrador',
  admin_paralelo: 'Admin de Paralelo',
  padre:          'Representante',
}

const BASE_LINKS = {
  admin: [
    { to: '/dashboard',   label: 'Dashboard' },
    { to: '/students',    label: 'Estudiantes' },
    { to: '/payments',    label: 'Pagos' },
    { to: '/reports',     label: 'Reportes' },
    { to: '/simulator',   label: 'Simulador' },
    { to: '/admin/users', label: 'Usuarios' },
    { to: '/settings',    label: 'Configuración' },
  ],
  admin_paralelo: [
    { to: '/parallel',  label: 'Mi Paralelo' },
    { to: '/payments',  label: 'Pagos' },
    { to: '/reports',   label: 'Reportes' },
    { to: '/simulator', label: 'Simulador' },
  ],
  padre: [
    { to: '/account',   label: 'Mi Estado de Cuenta' },
    { to: '/simulator', label: 'Simulador' },
  ],
}

export default function Navbar() {
  const { profile, role, isAdmin, isAdminParalelo, hasLinkedStudent, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Admin con estudiante vinculado: agregar "Mi Cuenta" al final
  const links = [
    ...(BASE_LINKS[role] ?? BASE_LINKS.padre),
    ...(isAdmin && hasLinkedStudent ? [{ to: '/account', label: 'Mi Cuenta' }] : []),
  ]

  const roleBadge = {
    admin:          'bg-gold-500 text-navy-900',
    admin_paralelo: 'bg-navy-500 text-white',
    padre:          'bg-navy-800 text-navy-200',
  }[role] ?? 'bg-navy-800 text-navy-200'

  const NavItem = ({ to, label, onClick }) => (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-gold-500 text-navy-900 shadow-gold font-semibold'
            : 'text-navy-100 hover:bg-navy-600 hover:text-white'
        }`
      }
    >
      {label}
    </NavLink>
  )

  return (
    <nav className="bg-navy-700 shadow-lg sticky top-0 z-40">
      <div className="h-1 w-full bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">

          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gold-500 flex items-center justify-center shadow-gold">
              <span className="text-lg leading-none select-none">🎓</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-white text-[15px] leading-tight">GraduaciónApp</p>
              <p className="text-gold-400 text-[10px] font-light tracking-widest uppercase">
                Graduaciones 2028
              </p>
            </div>
          </NavLink>

          {/* Links desktop */}
          <div className="hidden md:flex items-center gap-0.5 flex-wrap justify-center">
            {links.map(link => <NavItem key={link.to} {...link} />)}
          </div>

          {/* Perfil + logout */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-white text-xs font-medium leading-tight truncate max-w-[140px]">
                {profile?.full_name || profile?.email}
              </p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${roleBadge}`}>
                {ROLE_LABELS[role]}
                {isAdminParalelo && profile?.parallels?.name && ` · ${profile.parallels.name}`}
              </span>
            </div>
            <button
              onClick={signOut}
              className="text-xs px-3 py-1.5 rounded-lg border border-navy-500
                         text-navy-200 hover:bg-navy-600 hover:text-white transition-all"
            >
              Salir
            </button>
          </div>

          {/* Hamburguesa mobile */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="md:hidden p-2 rounded-lg text-navy-200 hover:bg-navy-600 transition-colors"
          >
            {mobileOpen
              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            }
          </button>
        </div>
      </div>

      {/* Menú mobile */}
      {mobileOpen && (
        <div className="md:hidden bg-navy-800 border-t border-navy-600 px-4 pt-3 pb-4 space-y-1">
          {links.map(link => (
            <NavItem key={link.to} {...link} onClick={() => setMobileOpen(false)} />
          ))}
          <div className="pt-3 border-t border-navy-600 flex items-center justify-between mt-2">
            <div>
              <p className="text-white text-sm font-medium">{profile?.full_name || profile?.email}</p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${roleBadge}`}>
                {ROLE_LABELS[role]}
              </span>
            </div>
            <button onClick={signOut}
              className="text-xs px-4 py-2 rounded-lg bg-navy-700 text-navy-200
                         hover:bg-navy-600 hover:text-white border border-navy-500">
              Salir
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
