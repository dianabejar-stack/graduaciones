import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import ErrorAlert from '../components/ErrorAlert'

export default function Login() {
  const { signIn } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'success'

  // Login
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Registro
  const [regEmail,    setRegEmail]    = useState('')
  const [regName,     setRegName]     = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regLoading,  setRegLoading]  = useState(false)
  const [regError,    setRegError]    = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const err = await signIn(email, password)
    if (err) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setRegLoading(true)
    setRegError(null)

    // 1. Verificar que el correo existe en students
    const { data: exists, error: checkErr } = await supabase
      .rpc('student_email_exists', { p_email: regEmail })

    if (checkErr) {
      setRegError('Error al verificar el correo. Intenta de nuevo.')
      setRegLoading(false)
      return
    }

    if (!exists) {
      setRegError('Tu correo no está registrado en el sistema. Contacta al administrador.')
      setRegLoading(false)
      return
    }

    // 2. Crear cuenta en Supabase Auth
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email:    regEmail,
      password: regPassword,
      options:  { data: { full_name: regName, role: 'padre' } },
    })

    if (signUpErr) {
      setRegError(signUpErr.message)
      setRegLoading(false)
      return
    }

    // 3. Vincular estudiante por email (el trigger lo hace automáticamente,
    //    pero si ya hay sesión activa lo hacemos también vía RPC por si acaso)
    if (data?.user?.id) {
      await supabase.rpc('link_student_by_email', {
        p_user_id: data.user.id,
        p_email:   regEmail,
      })
    }

    setMode('success')
    setRegLoading(false)
  }

  function switchMode(next) {
    setError(null)
    setRegError(null)
    setMode(next)
  }

  return (
    <div
      className="min-h-screen bg-navy-700 flex items-center justify-center p-4"
      style={{ backgroundImage: 'radial-gradient(ellipse at 60% 0%, #2d6aa6 0%, #1e3a5f 50%, #0d1e30 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />
      </div>

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-full bg-navy-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl">🎓</span>
            </div>
            <h1 className="text-2xl font-bold text-navy-800">GraduaciónApp</h1>
            <p className="text-sm text-gray-500 mt-1">Sistema de Gestión de Graduaciones</p>
          </div>

          {/* ── Éxito ── */}
          {mode === 'success' && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <span className="text-3xl">✅</span>
              </div>
              <div>
                <p className="text-navy-800 font-bold text-lg">¡Cuenta creada!</p>
                <p className="text-gray-500 text-sm mt-2">
                  Tu cuenta ha sido registrada y vinculada a tu estudiante.
                  Ya puedes iniciar sesión.
                </p>
              </div>
              <button onClick={() => switchMode('login')} className="btn-primary w-full">
                Iniciar sesión
              </button>
            </div>
          )}

          {/* ── Login ── */}
          {mode === 'login' && (
            <>
              <ErrorAlert error={error} onClose={() => setError(null)} />
              <form onSubmit={handleLogin} className="mt-4 space-y-4">
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" placeholder="tu@correo.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" />
                </div>
                <div>
                  <label className="label">Contraseña</label>
                  <input type="password" className="input" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required autoComplete="current-password" />
                </div>
                <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                  {loading ? 'Ingresando...' : 'Ingresar al sistema'}
                </button>
              </form>
              <div className="mt-6 text-center">
                <button onClick={() => switchMode('register')}
                  className="text-sm text-navy-600 hover:text-navy-800 font-medium hover:underline">
                  ¿Primera vez? Crear cuenta
                </button>
              </div>
            </>
          )}

          {/* ── Registro ── */}
          {mode === 'register' && (
            <>
              <p className="text-xs text-gray-500 bg-navy-50 rounded-lg px-3 py-2 mb-4 border border-navy-100">
                Solo puedes crear cuenta si tu correo está registrado en el sistema por el administrador.
              </p>
              <ErrorAlert error={regError} onClose={() => setRegError(null)} />
              <form onSubmit={handleRegister} className="mt-3 space-y-4">
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" placeholder="tu@correo.com"
                    value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    required autoComplete="email" />
                </div>
                <div>
                  <label className="label">Nombre completo</label>
                  <input type="text" className="input" placeholder="Juan Pérez"
                    value={regName} onChange={e => setRegName(e.target.value)}
                    required autoComplete="name" />
                </div>
                <div>
                  <label className="label">Contraseña</label>
                  <input type="password" className="input" placeholder="Mínimo 6 caracteres"
                    value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    required minLength={6} autoComplete="new-password" />
                </div>
                <button type="submit" className="btn-gold w-full py-2.5" disabled={regLoading}>
                  {regLoading ? 'Verificando...' : 'Crear cuenta'}
                </button>
              </form>
              <div className="mt-5 text-center">
                <button onClick={() => switchMode('login')}
                  className="text-sm text-gray-400 hover:text-navy-600 transition-colors">
                  ← Volver al inicio de sesión
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-1 w-full bg-gradient-to-r from-navy-700 via-gold-500 to-navy-700" />
      </div>
    </div>
  )
}
