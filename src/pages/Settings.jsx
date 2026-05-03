import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ErrorAlert from '../components/ErrorAlert'

export default function Settings() {
  const [event,     setEvent]     = useState(null)
  const [parallels, setParallels] = useState([])
  const [admins,    setAdmins]    = useState([])   // usuarios con rol admin_paralelo
  const [parents,   setParents]   = useState([])   // usuarios disponibles para asignar
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(null)

  // Formulario del evento
  const [evForm, setEvForm] = useState(null)

  // Gestión de paralelos
  const [newParName, setNewParName] = useState('')
  const [addingPar,  setAddingPar]  = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: ev }, { data: pars }, { data: allUsers }] = await Promise.all([
        supabase.from('events').select('*').limit(1).single(),
        supabase.from('parallels').select('*').order('name'),
        supabase.from('users').select('*, parallels(name)').order('full_name'),
      ])

      setEvent(ev)
      setEvForm(ev ? { ...ev } : null)
      setParallels(pars ?? [])
      setAdmins((allUsers ?? []).filter(u => u.role === 'admin_paralelo'))
      setParents((allUsers ?? []).filter(u => u.role !== 'admin'))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Guardar datos del evento ──
  async function saveEvent(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload = {
      name:               evForm.name,
      event_date:         evForm.event_date || null,
      base_price:         Number(evForm.base_price),
      guest_price:        Number(evForm.guest_price),
      initial_fee:        Number(evForm.initial_fee),
      installments_count: Number(evForm.installments_count),
      first_due_date:     evForm.first_due_date || null,
      guest_deadline:     evForm.guest_deadline || null,
    }

    const { error } = await supabase.from('events').update(payload).eq('id', event.id)

    if (error) { setError(error) }
    else       { setSuccess('Evento actualizado correctamente.'); loadData() }
    setSaving(false)
  }

  // ── Agregar paralelo ──
  async function addParallel() {
    if (!newParName.trim() || !event) return
    setAddingPar(true)
    const { error } = await supabase
      .from('parallels')
      .insert({ event_id: event.id, name: newParName.trim() })
    if (error) setError(error)
    else { setNewParName(''); loadData() }
    setAddingPar(false)
  }

  // ── Eliminar paralelo ──
  async function deleteParallel(par) {
    if (!confirm(`¿Eliminar el paralelo "${par.name}"? Los estudiantes perderán su asignación.`)) return
    const { error } = await supabase.from('parallels').delete().eq('id', par.id)
    if (error) setError(error)
    else loadData()
  }

  // ── Asignar admin_paralelo ──
  async function assignAdmin(userId, parallelId) {
    const { error } = await supabase
      .from('users')
      .update({ role: 'admin_paralelo', parallel_id: parallelId || null })
      .eq('id', userId)
    if (error) setError(error)
    else loadData()
  }

  // ── Revocar admin_paralelo (volver a padre) ──
  async function revokeAdmin(userId) {
    if (!confirm('¿Revocar el acceso de administrador de paralelo?')) return
    const { error } = await supabase
      .from('users')
      .update({ role: 'padre', parallel_id: null })
      .eq('id', userId)
    if (error) setError(error)
    else loadData()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-navy-400">
      Cargando configuración...
    </div>
  )

  return (
    <div className="space-y-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="section-header">
        <div className="section-header-bar" />
        <h2 className="text-2xl font-bold text-navy-800">Configuración</h2>
      </div>

      <ErrorAlert error={error}   onClose={() => setError(null)} />

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
          ✓ {success}
        </div>
      )}

      {/* ── Sección: Datos del evento ── */}
      <section className="card space-y-5">
        <h3 className="text-lg font-bold text-navy-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gold-500 text-navy-900 text-xs font-extrabold flex items-center justify-center">1</span>
          Datos del evento
        </h3>

        {evForm && (
          <form onSubmit={saveEvent} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nombre del evento</label>
                <input className="input" value={evForm.name}
                  onChange={e => setEvForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Fecha del evento</label>
                <input className="input" type="date" value={evForm.event_date ?? ''}
                  onChange={e => setEvForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha primera cuota</label>
                <input className="input" type="date" value={evForm.first_due_date ?? ''}
                  onChange={e => setEvForm(f => ({ ...f, first_due_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Precio base ($)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={evForm.base_price}
                  onChange={e => setEvForm(f => ({ ...f, base_price: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Precio por invitado ($)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={evForm.guest_price}
                  onChange={e => setEvForm(f => ({ ...f, guest_price: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Cuota inicial / anticipo ($)</label>
                <input className="input" type="number" min="0" step="0.01"
                  value={evForm.initial_fee ?? 50}
                  onChange={e => setEvForm(f => ({ ...f, initial_fee: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Número de cuotas mensuales</label>
                <input className="input" type="number" min="1" max="60"
                  value={evForm.installments_count}
                  onChange={e => setEvForm(f => ({ ...f, installments_count: e.target.value }))} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Fecha límite cambio de invitados</label>
                <input className="input" type="date" value={evForm.guest_deadline ?? ''}
                  onChange={e => setEvForm(f => ({ ...f, guest_deadline: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">
                  Después de esta fecha, invitados adicionales se pagan en su totalidad.
                </p>
              </div>
            </div>

            {/* Vista previa de fórmula */}
            <div className="rounded-xl bg-navy-50 border border-navy-100 p-4 text-sm text-navy-700">
              <p className="font-semibold mb-1">Vista previa de fórmula:</p>
              <p className="font-mono text-xs text-navy-600">
                total = ${Number(evForm.base_price||0).toFixed(2)} + (invitados × ${Number(evForm.guest_price||0).toFixed(2)})<br/>
                saldo = total − ${Number(evForm.initial_fee||50).toFixed(2)}<br/>
                cuota mensual = saldo ÷ {evForm.installments_count}
              </p>
            </div>

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios del evento'}
            </button>
          </form>
        )}
      </section>

      {/* ── Sección: Paralelos ── */}
      <section className="card space-y-4">
        <h3 className="text-lg font-bold text-navy-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gold-500 text-navy-900 text-xs font-extrabold flex items-center justify-center">2</span>
          Paralelos
        </h3>

        {/* Lista de paralelos */}
        <div className="space-y-2">
          {parallels.length === 0 ? (
            <p className="text-sm text-gray-400">No hay paralelos configurados.</p>
          ) : (
            parallels.map(par => (
              <div key={par.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50">
                <span className="font-semibold text-navy-700">{par.name}</span>
                <button onClick={() => deleteParallel(par)} className="btn-danger py-1 px-2 text-xs">
                  Eliminar
                </button>
              </div>
            ))
          )}
        </div>

        {/* Agregar paralelo */}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Nombre del paralelo (ej: Ciencias A)"
            value={newParName}
            onChange={e => setNewParName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addParallel()}
          />
          <button
            onClick={addParallel}
            className="btn-primary shrink-0"
            disabled={!newParName.trim() || addingPar}
          >
            {addingPar ? '...' : '+ Agregar'}
          </button>
        </div>
      </section>

      {/* ── Sección: Administradores de paralelo ── */}
      <section className="card space-y-4">
        <h3 className="text-lg font-bold text-navy-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gold-500 text-navy-900 text-xs font-extrabold flex items-center justify-center">3</span>
          Administradores de paralelo
        </h3>
        <p className="text-sm text-gray-500">
          Asigna hasta 3 padres como administradores de paralelo. Tendrán acceso a gestionar
          pagos y ver reportes de su propio paralelo.
        </p>

        {/* Admins actuales */}
        {admins.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-navy-700 uppercase tracking-wide">Actuales admins de paralelo</p>
            {admins.map(u => (
              <div key={u.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-navy-50 border border-navy-100">
                <div>
                  <p className="font-semibold text-navy-700">{u.full_name || u.email}</p>
                  <p className="text-xs text-navy-400">
                    Paralelo: {u.parallels?.name ?? '—'}
                  </p>
                </div>
                <button onClick={() => revokeAdmin(u.id)} className="btn-secondary py-1 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50">
                  Revocar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Asignar nuevo admin de paralelo */}
        <AssignAdminForm
          parents={parents.filter(u => u.role !== 'admin_paralelo')}
          parallels={parallels}
          onAssign={assignAdmin}
          maxAdmins={3}
          currentCount={admins.length}
        />
      </section>
    </div>
  )
}

// Sub-formulario para asignar admin_paralelo
function AssignAdminForm({ parents, parallels, onAssign, maxAdmins, currentCount }) {
  const [userId,     setUserId]     = useState('')
  const [parallelId, setParallelId] = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handle() {
    if (!userId || !parallelId) return
    setSaving(true)
    await onAssign(userId, parallelId)
    setUserId('')
    setParallelId('')
    setSaving(false)
  }

  if (currentCount >= maxAdmins) {
    return (
      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
        ⚠️ Ya hay {maxAdmins} administradores de paralelo asignados (máximo permitido).
      </p>
    )
  }

  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      <p className="text-xs font-semibold text-navy-700 uppercase tracking-wide">
        Asignar nuevo administrador de paralelo
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Usuario (padre)</label>
          <select className="select" value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">Seleccionar usuario...</option>
            {parents.map(u => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Paralelo asignado</label>
          <select className="select" value={parallelId} onChange={e => setParallelId(e.target.value)}>
            <option value="">Seleccionar paralelo...</option>
            {parallels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <button
        onClick={handle}
        className="btn-primary"
        disabled={!userId || !parallelId || saving}
      >
        {saving ? 'Asignando...' : 'Asignar como admin de paralelo'}
      </button>
    </div>
  )
}
