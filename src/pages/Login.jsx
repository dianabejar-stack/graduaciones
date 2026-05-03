import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

export default function Login() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const err = await signIn(email, password)
    if (err) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
      setLoading(false)
    }
    // La redirección la maneja App.jsx al detectar la sesión
  }

  return (
    <div className="min-h-screen bg-navy-700 flex items-center justify-center p-4"
         style={{ backgroundImage: 'radial-gradient(ellipse at 60% 0%, #2d6aa6 0%, #1e3a5f 50%, #0d1e30 100%)' }}>

      {/* Decoración de fondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />
      </div>

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Franja dorada superior */}
        <div className="h-1.5 w-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-navy-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl">🎓</span>
            </div>
            <h1 className="text-2xl font-bold text-navy-800">GraduaciónApp</h1>
            <p className="text-sm text-gray-500 mt-1 tracking-wide">
              Sistema de Gestión de Graduaciones
            </p>
          </div>

          <ErrorAlert error={error} onClose={() => setError(null)} />

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                className="input"
                placeholder="tu@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full mt-2 py-2.5"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Acceso exclusivo para miembros del comité y representantes
          </p>
        </div>

        {/* Franja dorada inferior */}
        <div className="h-1 w-full bg-gradient-to-r from-navy-700 via-gold-500 to-navy-700" />
      </div>
    </div>
  )
}
