import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ErrorAlert from '../components/ErrorAlert'

const ROLES = ['admin', 'admin_paralelo', 'padre']
const ROLE_LABELS = { admin: 'Admin', admin_paralelo: 'Admin Paralelo', padre: 'Representante' }
const ROLE_BADGE  = {
  admin:          'badge-gold',
  admin_paralelo: 'badge-navy',
  padre:          'badge-gray',
}

export default function AdminUsers() {
  const [users,     setUsers]     = useState([])
  const [students,  setStudents]  = useState([])
  const [parallels, setParallels] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(null)

  // Panel lateral de edición
  const [editing,   setEditing]   = useState(null) // usuario seleccionado
  const [editRole,  setEditRole]  = useState('')
  const [editPar,   setEditPar]   = useState('')
  const [editStud,  setEditStud]  = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: u, error: uErr }, { data: s }, { data: p }] = await Promise.all([
        supabase
          .from('users')
          .select('*, parallels(name), students!students_user_id_fkey(id, full_name)')
          .order('full_name'),
        supabase.from('students').select('id, full_name, email, user_id, parallel_id').order('full_name'),
        supabase.from('parallels').select('*').order('name'),
      ])
      if (uErr) throw uErr
      setUsers(u ?? [])
      setStudents(s ?? [])
      setParallels(p ?? [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  function openEdit(user) {
    setEditing(user)
    setEditRole(user.role)
    setEditPar(user.parallel_id ?? '')
    // Buscar estudiante vinculado (puede haber más de uno en edge cases)
    const linked = students.find(s => s.user_id === user.id)
    setEditStud(linked?.id ?? '')
    setSuccess(null)
    setError(null)
  }

  async function saveUser() {
    if (!editing) return
    setSaving(true)
    setError(null)

    // 1. Actualizar rol y parallel_id en users
    const { error: roleErr } = await supabase
      .from('users')
      .update({
        role:        editRole,
        parallel_id: editRole === 'admin_paralelo' ? (editPar || null) : null,
      })
      .eq('id', editing.id)

    if (roleErr) { setError(roleErr); setSaving(false); return }

    // 2. Desvincular estudiante anterior (si cambió)
    const prevLinked = students.find(s => s.user_id === editing.id)
    if (prevLinked && prevLinked.id !== editStud) {
      await supabase.from('students').update({ user_id: null }).eq('id', prevLinked.id)
    }

    // 3. Vincular nuevo estudiante (si se seleccionó uno)
    if (editStud) {
      const { error: linkErr } = await supabase
        .from('students')
        .update({ user_id: editing.id })
        .eq('id', editStud)
      if (linkErr) { setError(linkErr); setSaving(false); return }
    }

    setSuccess(`Usuario "${editing.full_name || editing.email}" actualizado correctamente.`)
    setSaving(false)
    setEditing(null)
    loadData()
  }

  async function unlinkStudent(userId) {
    const linked = students.find(s => s.user_id === userId)
    if (!linked) return
    const { error } = await supabase.from('students').update({ user_id: null }).eq('id', linked.id)
    if (error) setError(error)
    else loadData()
  }

  // Estudiantes disponibles para vincular (sin usuario o el del usuario actual)
  const availableStudents = students.filter(
    s => !s.user_id || s.user_id === editing?.id
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="section-header">
        <div className="section-header-bar" />
        <div>
          <h2 className="text-2xl font-bold text-navy-800">Gestión de Usuarios</h2>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} usuarios registrados</p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
          ✓ {success}
        </div>
      )}
      <ErrorAlert error={error} onClose={() => setError(null)} />

      <div className="flex gap-6">

        {/* ── Tabla de usuarios ── */}
        <div className="flex-1 card p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-navy-400">Cargando...</div>
          ) : (
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="table-th">Nombre</th>
                  <th className="table-th">Correo</th>
                  <th className="table-th text-center">Rol</th>
                  <th className="table-th">Estudiante vinculado</th>
                  <th className="table-th text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 ? (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-10">Sin usuarios</td></tr>
                ) : (
                  users.map(user => {
                    const linked = students.find(s => s.user_id === user.id)
                    const isSelected = editing?.id === user.id
                    return (
                      <tr key={user.id} className={`table-row ${isSelected ? 'bg-navy-50' : ''}`}>
                        <td className="table-td">
                          <p className="font-semibold text-navy-700">{user.full_name || '—'}</p>
                        </td>
                        <td className="table-td text-gray-500 text-xs">{user.email}</td>
                        <td className="table-td text-center">
                          <span className={ROLE_BADGE[user.role]}>
                            {ROLE_LABELS[user.role]}
                          </span>
                          {user.parallels?.name && (
                            <p className="text-xs text-gray-400 mt-0.5">{user.parallels.name}</p>
                          )}
                        </td>
                        <td className="table-td">
                          {linked ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-navy-700">{linked.full_name}</span>
                              <button
                                onClick={() => unlinkStudent(user.id)}
                                className="text-xs text-red-400 hover:text-red-600"
                                title="Desvincular"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">Sin vincular</span>
                          )}
                        </td>
                        <td className="table-td text-center">
                          <button
                            onClick={() => openEdit(user)}
                            className={`btn-secondary py-1 px-3 text-xs ${isSelected ? 'bg-navy-100' : ''}`}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Panel lateral de edición ── */}
        {editing && (
          <div className="w-72 shrink-0">
            <div className="card sticky top-24 space-y-5">
              <div>
                <h3 className="font-bold text-navy-800 text-base">Editar usuario</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {editing.full_name || editing.email}
                </p>
              </div>

              {/* Rol */}
              <div>
                <label className="label">Rol</label>
                <select className="select" value={editRole} onChange={e => setEditRole(e.target.value)}>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {editRole === 'admin' && 'Acceso total al sistema.'}
                  {editRole === 'admin_paralelo' && 'Acceso solo a su paralelo asignado.'}
                  {editRole === 'padre' && 'Solo ve su propio estado de cuenta.'}
                </p>
              </div>

              {/* Paralelo (solo si es admin_paralelo) */}
              {editRole === 'admin_paralelo' && (
                <div>
                  <label className="label">Paralelo asignado</label>
                  <select className="select" value={editPar} onChange={e => setEditPar(e.target.value)}>
                    <option value="">Sin paralelo</option>
                    {parallels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {/* Estudiante vinculado */}
              <div>
                <label className="label">Estudiante vinculado</label>
                <select className="select" value={editStud} onChange={e => setEditStud(e.target.value)}>
                  <option value="">Sin vincular</option>
                  {availableStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Solo se muestran estudiantes sin usuario asignado.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button onClick={saveUser} className="btn-primary w-full" disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button onClick={() => setEditing(null)} className="btn-secondary w-full text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
