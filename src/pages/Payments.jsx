import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Table from '../components/Table'
import ErrorAlert from '../components/ErrorAlert'

const EMPTY_FORM = {
  student_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10),
  method: 'efectivo', notes: '',
}

const METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro']

export default function Payments() {
  const [payments,  setPayments]  = useState([])
  const [students,  setStudents]  = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: pays, error: pErr }, { data: studs }] = await Promise.all([
        supabase
          .from('payments')
          .select('*, students(full_name, representative_name), users(full_name)')
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('students')
          .select('id, full_name, representative_name')
          .order('full_name'),
      ])
      if (pErr) throw pErr

      setPayments(pays ?? [])
      setStudents(studs ?? [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  function openNew(studentId = '') {
    setForm({ ...EMPTY_FORM, student_id: studentId })
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.student_id) { setError('Selecciona un estudiante'); return }
    setSaving(true)
    setError(null)

    const payload = {
      student_id:   form.student_id,
      amount:       Number(form.amount),
      payment_date: form.payment_date,
      method:       form.method,
      notes:        form.notes || null,
    }

    const { error } = await supabase.from('payments').insert(payload)
    // El trigger en la BD aplica automáticamente el pago a las cuotas
    if (error) { setError(error); setSaving(false); return }

    setShowForm(false)
    loadData()
    setSaving(false)
  }

  const fmt = n => `$${Number(n ?? 0).toFixed(2)}`

  const methodBadge = method => {
    const styles = {
      efectivo:      'bg-green-100 text-green-700',
      transferencia: 'bg-blue-100 text-blue-700',
      tarjeta:       'bg-purple-100 text-purple-700',
      otro:          'bg-gray-100 text-gray-600',
    }
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[method] ?? ''}`}>
        {method}
      </span>
    )
  }

  const columns = [
    {
      key: 'student',
      label: 'Estudiante',
      render: row => (
        <div>
          <p className="font-medium">{row.students?.full_name}</p>
          <p className="text-xs text-gray-400">{row.students?.representative_name}</p>
        </div>
      )
    },
    {
      key: 'amount',
      label: 'Monto',
      render: row => <span className="font-semibold text-green-600">{fmt(row.amount)}</span>
    },
    {
      key: 'payment_date',
      label: 'Fecha',
      render: row => new Date(row.payment_date + 'T12:00:00').toLocaleDateString('es-EC')
    },
    {
      key: 'method',
      label: 'Método',
      render: row => methodBadge(row.method)
    },
    { key: 'notes', label: 'Notas' },
    {
      key: 'created_by',
      label: 'Registrado por',
      render: row => row.users?.full_name ?? '—'
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Pagos</h2>
        <button onClick={() => openNew()} className="btn-primary">+ Registrar pago</button>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      <div className="card p-0 overflow-hidden">
        <Table
          columns={columns}
          rows={payments}
          loading={loading}
          emptyText="No hay pagos registrados"
        />
      </div>

      {/* Modal formulario de pago */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-5">Registrar pago</h3>
              <p className="text-sm text-gray-500 mb-4">
                El pago se aplicará automáticamente a las cuotas pendientes en orden cronológico.
              </p>

              <ErrorAlert error={error} onClose={() => setError(null)} />

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="label">Estudiante *</label>
                  <select className="select" required value={form.student_id}
                    onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}>
                    <option value="">Seleccionar estudiante...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} — {s.representative_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Monto ($) *</label>
                    <input className="input" type="number" min="0.01" step="0.01" required
                      value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Fecha *</label>
                    <input className="input" type="date" required
                      value={form.payment_date}
                      onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="label">Método de pago *</label>
                  <select className="select" value={form.method}
                    onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="label">Notas</label>
                  <textarea className="input" rows={3} placeholder="Observaciones opcionales..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary flex-1" disabled={saving}>
                    {saving ? 'Registrando...' : 'Registrar pago'}
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
