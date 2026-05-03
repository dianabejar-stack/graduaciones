import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

const fmt = n => `$${Number(n ?? 0).toFixed(2)}`

const METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro']

const EMPTY_PAY = {
  student_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10),
  method: 'efectivo', notes: '',
}

export default function ParallelDashboard() {
  const { profile, isAdmin } = useAuth()
  const [students,   setStudents]   = useState([])
  const [parallels,  setParallels]  = useState([])
  const [payments,   setPayments]   = useState([])
  const [insts,      setInsts]      = useState([])
  const [event,      setEvent]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  // Filtros
  const [filterPar,  setFilterPar]  = useState('')
  const [search,     setSearch]     = useState('')

  // Formulario de pago
  const [showPay,    setShowPay]    = useState(false)
  const [payForm,    setPayForm]    = useState(EMPTY_PAY)
  const [savingPay,  setSavingPay]  = useState(false)

  const myParallelId = profile?.parallel_id ?? null

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [
        { data: ev },
        { data: pars },
        { data: studs, error: sErr },
        { data: pays },
        { data: instData },
      ] = await Promise.all([
        supabase.from('events').select('*').limit(1).single(),
        supabase.from('parallels').select('*').order('name'),
        supabase.from('students')
          .select('*, parallels(name)')
          .order('full_name'),
        supabase.from('payments').select('*'),
        supabase.from('installments').select('*'),
      ])

      if (sErr) throw sErr

      setEvent(ev)
      setParallels(pars ?? [])
      setStudents(studs ?? [])
      setPayments(pays ?? [])
      setInsts(instData ?? [])

      // admin_paralelo: pre-filtrar su paralelo
      if (!isAdmin && myParallelId) setFilterPar(myParallelId)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  async function submitPayment(e) {
    e.preventDefault()
    setSavingPay(true)
    setError(null)

    const { error } = await supabase.from('payments').insert({
      student_id:   payForm.student_id,
      amount:       Number(payForm.amount),
      payment_date: payForm.payment_date,
      method:       payForm.method,
      notes:        payForm.notes || null,
    })

    if (error) { setError(error); setSavingPay(false); return }
    setShowPay(false)
    setPayForm(EMPTY_PAY)
    loadData()
    setSavingPay(false)
  }

  const today = new Date().toISOString().slice(0, 10)
  const base   = Number(event?.base_price ?? 0)
  const gPrice = Number(event?.guest_price ?? 0)

  // Filtrado
  const filtered = students.filter(s => {
    const matchPar    = !filterPar || s.parallel_id === filterPar
    const matchSearch = !search    || s.full_name.toLowerCase().includes(search.toLowerCase())
                                   || s.representative_name.toLowerCase().includes(search.toLowerCase())
    return matchPar && matchSearch
  })

  // Enriquecer con financiero
  const enriched = filtered.map(st => {
    const total   = Math.max(base + st.guests_count * gPrice - Number(st.special_discount), 0)
    const stPays  = payments.filter(p => p.student_id === st.id)
    const paid    = stPays.reduce((s, p) => s + Number(p.amount), 0)
    const pending = Math.max(total - paid, 0)
    const overdue = insts.filter(i =>
      i.student_id === st.id && i.status !== 'pagado' && i.due_date < today
    ).length
    return { ...st, total, paid, pending, overdue }
  })

  // KPIs del paralelo/vista actual
  const kTotal   = enriched.reduce((s, r) => s + r.total,   0)
  const kPaid    = enriched.reduce((s, r) => s + r.paid,    0)
  const kPending = enriched.reduce((s, r) => s + r.pending, 0)
  const kOverdue = enriched.filter(r => r.overdue > 0).length

  const parallelName = myParallelId
    ? parallels.find(p => p.id === myParallelId)?.name ?? ''
    : filterPar
    ? parallels.find(p => p.id === filterPar)?.name ?? 'Todos'
    : 'Todos los paralelos'

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-navy-400">
      Cargando paralelo...
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="section-header mb-0">
          <div className="section-header-bar" />
          <div>
            <h2 className="text-2xl font-bold text-navy-800">
              {isAdmin ? 'Gestión de Paralelos' : `Mi Paralelo — ${parallelName}`}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {enriched.length} estudiantes · {fmt(kPaid)} recaudado
            </p>
          </div>
        </div>
        <button onClick={() => { setShowPay(true); setError(null) }} className="btn-gold shrink-0">
          + Registrar pago
        </button>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSmall label="Alumnos"     value={enriched.length} color="navy" />
        <KpiSmall label="Recaudado"   value={fmt(kPaid)}      color="green" />
        <KpiSmall label="Pendiente"   value={fmt(kPending)}   color="gold" />
        <KpiSmall label="Con mora"    value={kOverdue}        color="red" />
      </div>

      {/* Filtros — solo admin ve selector de paralelo */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="input sm:w-72"
          placeholder="Buscar alumno o representante..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {isAdmin && (
          <select
            className="select sm:w-52"
            value={filterPar}
            onChange={e => setFilterPar(e.target.value)}
          >
            <option value="">Todos los paralelos</option>
            {parallels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Tabla de estudiantes */}
      <div className="card p-0 overflow-hidden">
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">Alumno</th>
              <th className="table-th">Paralelo</th>
              <th className="table-th text-center">Inv.</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th text-right">Pagado</th>
              <th className="table-th text-right">Pendiente</th>
              <th className="table-th text-center">Estado</th>
              <th className="table-th text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {enriched.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-td text-center text-gray-400 py-10">
                  No hay estudiantes que coincidan con el filtro
                </td>
              </tr>
            ) : (
              enriched.map(row => (
                <tr key={row.id} className={`table-row ${row.overdue > 0 ? 'bg-red-50/30' : ''}`}>
                  <td className="table-td">
                    <p className="font-semibold text-navy-700">{row.full_name}</p>
                    <p className="text-xs text-gray-400">{row.representative_name}</p>
                  </td>
                  <td className="table-td text-gray-500">{row.parallels?.name ?? '—'}</td>
                  <td className="table-td text-center text-gray-600">{row.guests_count}</td>
                  <td className="table-td text-right font-mono text-xs">{fmt(row.total)}</td>
                  <td className="table-td text-right text-green-600 font-semibold font-mono text-xs">
                    {fmt(row.paid)}
                  </td>
                  <td className="table-td text-right text-red-500 font-semibold font-mono text-xs">
                    {row.pending > 0 ? fmt(row.pending) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td text-center">
                    {row.pending === 0
                      ? <span className="badge-green">Al día</span>
                      : row.overdue > 0
                      ? <span className="badge-red">{row.overdue} venc.</span>
                      : <span className="badge-yellow">Pendiente</span>
                    }
                  </td>
                  <td className="table-td text-center">
                    <button
                      onClick={() => { setPayForm(f => ({ ...f, student_id: row.id })); setShowPay(true) }}
                      className="btn-secondary py-1 px-2 text-xs"
                    >
                      Registrar pago
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {enriched.length > 0 && (
            <tfoot className="table-footer">
              <tr>
                <td colSpan={3} className="table-td text-navy-700">Totales</td>
                <td className="table-td text-right font-mono text-xs">{fmt(kTotal)}</td>
                <td className="table-td text-right text-green-600 font-mono text-xs">{fmt(kPaid)}</td>
                <td className="table-td text-right text-red-500 font-mono text-xs">{fmt(kPending)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal de pago */}
      {showPay && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-gold-700 via-gold-400 to-gold-700" />
            <div className="p-6">
              <h3 className="text-xl font-bold text-navy-800 mb-4">Registrar pago</h3>

              <ErrorAlert error={error} onClose={() => setError(null)} />

              <form onSubmit={submitPayment} className="space-y-4 mt-3">
                <div>
                  <label className="label">Estudiante *</label>
                  <select className="select" required value={payForm.student_id}
                    onChange={e => setPayForm(f => ({ ...f, student_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {(filterPar ? students.filter(s => s.parallel_id === filterPar) : students).map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Monto ($) *</label>
                    <input className="input" type="number" min="0.01" step="0.01" required
                      value={payForm.amount}
                      onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Fecha *</label>
                    <input className="input" type="date" required
                      value={payForm.payment_date}
                      onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Método *</label>
                  <select className="select" value={payForm.method}
                    onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Notas</label>
                  <textarea className="input" rows={2} value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="submit" className="btn-primary flex-1" disabled={savingPay}>
                    {savingPay ? 'Registrando...' : 'Registrar'}
                  </button>
                  <button type="button" className="btn-secondary flex-1"
                    onClick={() => setShowPay(false)}>
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

function KpiSmall({ label, value, color }) {
  const colors = {
    navy:  'bg-navy-700 text-white',
    green: 'bg-green-600 text-white',
    gold:  'bg-gold-500 text-navy-900',
    red:   'bg-red-600 text-white',
  }
  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  )
}
