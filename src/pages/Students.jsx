import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Table from '../components/Table'
import ErrorAlert from '../components/ErrorAlert'

const EMPTY_FORM = {
  full_name: '', representative_name: '', email: '',
  parallel_id: '', guests_count: 0, table_number: '',
  special_case: false, special_discount: 0,
}

export default function Students() {
  const [students,   setStudents]   = useState([])
  const [parallels,  setParallels]  = useState([])
  const [eventId,    setEventId]    = useState(null)
  const [filter,     setFilter]     = useState('')        // filtro por paralelo
  const [search,     setSearch]     = useState('')        // búsqueda por nombre
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState(null)      // student en edición
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Obtener primer evento activo
      const { data: ev } = await supabase.from('events').select('id').limit(1).single()
      setEventId(ev?.id)

      const [{ data: studs, error: sErr }, { data: pars }] = await Promise.all([
        supabase
          .from('students')
          .select('*, parallels(name)')
          .order('full_name'),
        supabase.from('parallels').select('*').order('name'),
      ])
      if (sErr) throw sErr

      setStudents(studs ?? [])
      setParallels(pars ?? [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  // Filtrado combinado: paralelo + búsqueda por nombre
  const filtered = students.filter(s => {
    const matchParallel = !filter || s.parallel_id === filter
    const matchSearch   = !search  || s.full_name.toLowerCase().includes(search.toLowerCase())
                                   || s.representative_name.toLowerCase().includes(search.toLowerCase())
    return matchParallel && matchSearch
  })

  function openNew() {
    setForm({ ...EMPTY_FORM, event_id: eventId })
    setEditing(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(student) {
    setForm({
      full_name:           student.full_name,
      representative_name: student.representative_name,
      email:               student.email,
      parallel_id:         student.parallel_id ?? '',
      guests_count:        student.guests_count,
      table_number:        student.table_number ?? '',
      special_case:        student.special_case,
      special_discount:    student.special_discount,
    })
    setEditing(student)
    setShowForm(true)
    setError(null)
  }

  async function handleDelete(student) {
    if (!confirm(`¿Eliminar a ${student.full_name}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('students').delete().eq('id', student.id)
    if (error) { setError(error); return }
    setStudents(prev => prev.filter(s => s.id !== student.id))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      ...form,
      event_id:         eventId,
      parallel_id:      form.parallel_id || null,
      table_number:     form.table_number === '' ? null : Number(form.table_number),
      guests_count:     Number(form.guests_count),
      special_discount: Number(form.special_discount),
    }

    let err
    if (editing) {
      ({ error: err } = await supabase.from('students').update(payload).eq('id', editing.id))
    } else {
      ({ error: err } = await supabase.from('students').insert(payload))
    }

    if (err) { setError(err); setSaving(false); return }

    setShowForm(false)
    loadData()
    setSaving(false)
  }

  const columns = [
    { key: 'full_name',           label: 'Estudiante' },
    { key: 'representative_name', label: 'Representante' },
    { key: 'email',               label: 'Correo' },
    {
      key: 'parallel',
      label: 'Paralelo',
      render: row => row.parallels?.name ?? '—'
    },
    { key: 'guests_count',    label: 'Invitados' },
    { key: 'table_number',    label: 'Mesa' },
    {
      key: 'special_case',
      label: 'Caso especial',
      render: row => row.special_case
        ? <span className="text-orange-600 font-medium">Sí</span>
        : <span className="text-gray-400">No</span>
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: row => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(row)} className="btn-secondary py-1 px-2 text-xs">
            Editar
          </button>
          <button onClick={() => handleDelete(row)} className="btn-danger py-1 px-2 text-xs">
            Eliminar
          </button>
        </div>
      )
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Estudiantes</h2>
        <button onClick={openNew} className="btn-primary">+ Nuevo estudiante</button>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          className="input sm:w-64"
          placeholder="Buscar por nombre o representante..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="select sm:w-48" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos los paralelos</option>
          {parallels.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <Table columns={columns} rows={filtered} loading={loading} emptyText="No hay estudiantes registrados" />

      {/* Modal formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-5">
                {editing ? 'Editar estudiante' : 'Nuevo estudiante'}
              </h3>

              <ErrorAlert error={error} onClose={() => setError(null)} />

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input className="input" required value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>

                <div>
                  <label className="label">Nombre del representante *</label>
                  <input className="input" required value={form.representative_name}
                    onChange={e => setForm(f => ({ ...f, representative_name: e.target.value }))} />
                </div>

                <div>
                  <label className="label">Correo electrónico *</label>
                  <input className="input" type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Paralelo</label>
                    <select className="select" value={form.parallel_id}
                      onChange={e => setForm(f => ({ ...f, parallel_id: e.target.value }))}>
                      <option value="">Sin paralelo</option>
                      {parallels.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mesa #</label>
                    <input className="input" type="number" min="1" value={form.table_number}
                      onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Invitados adicionales</label>
                    <input className="input" type="number" min="0" value={form.guests_count}
                      onChange={e => setForm(f => ({ ...f, guests_count: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Descuento ($)</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.special_discount}
                      onChange={e => setForm(f => ({ ...f, special_discount: e.target.value }))} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="special_case"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    checked={form.special_case}
                    onChange={e => setForm(f => ({ ...f, special_case: e.target.checked }))}
                  />
                  <label htmlFor="special_case" className="text-sm text-gray-700">
                    Caso especial
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary flex-1" disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" className="btn-secondary flex-1"
                    onClick={() => setShowForm(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
