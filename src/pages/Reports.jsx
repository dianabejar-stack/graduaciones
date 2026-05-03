import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

const fmt  = n => `$${Number(n ?? 0).toFixed(2)}`
const pct  = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '0%'

// ── Tooltip personalizado para recharts ──
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-card-md p-3 text-xs">
      <p className="font-bold text-navy-700 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'financial', label: '1. Financiero' },
  { id: 'parallel',  label: '2. Por paralelo' },
  { id: 'overdue',   label: '3. Morosos' },
  { id: 'projection',label: '4. Proyección' },
  { id: 'guests',    label: '5. Invitados' },
]

export default function Reports() {
  const { isAdminParalelo, profile } = useAuth()
  const [tab,       setTab]       = useState('financial')
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [filterPar, setFilterPar] = useState(
    isAdminParalelo ? profile?.parallel_id : ''
  )

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [
        { data: studs,    error: e1 },
        { data: insts,    error: e2 },
        { data: pays,     error: e3 },
        { data: pars,     error: e4 },
        { data: evArr,    error: e5 },
      ] = await Promise.all([
        supabase.from('students').select(`
          id, full_name, representative_name,
          guests_count, special_discount, event_id, parallel_id,
          parallels(id, name),
          events(base_price, guest_price, initial_fee, installments_count)
        `).order('full_name'),
        supabase.from('installments').select('*').order('due_date'),
        supabase.from('payments').select('*').order('payment_date'),
        supabase.from('parallels').select('*').order('name'),
        supabase.from('events').select('*').limit(1),
      ])

      if (e1||e2||e3||e4||e5) throw e1||e2||e3||e4||e5

      setData({ studs, insts, pays, pars, event: evArr?.[0] })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="section-header">
        <div className="section-header-bar" />
        <div>
          <h2 className="text-2xl font-bold text-navy-800">Reportes</h2>
          <p className="text-sm text-gray-500 mt-0.5">Análisis financiero y de gestión del evento</p>
        </div>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-navy-700 text-white shadow-card'
                : 'bg-white text-navy-600 border border-gray-200 hover:border-navy-300 hover:bg-navy-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-16 text-navy-400">
          Cargando datos...
        </div>
      ) : data ? (
        <>
          {tab === 'financial'  && <ReportFinancial  {...data} />}
          {tab === 'parallel'   && <ReportParallel   {...data} filterPar={filterPar} setFilterPar={setFilterPar} isAdminParalelo={isAdminParalelo} />}
          {tab === 'overdue'    && <ReportOverdue    {...data} />}
          {tab === 'projection' && <ReportProjection {...data} />}
          {tab === 'guests'     && <ReportGuests     {...data} />}
        </>
      ) : null}
    </div>
  )
}

// ════════════════════════════════════════
// REPORTE 1 — Resumen financiero general
// ════════════════════════════════════════
function ReportFinancial({ studs, pays, insts, pars, event }) {
  if (!event) return <EmptyCard />

  const base    = Number(event.base_price)
  const gPrice  = Number(event.guest_price)
  const iFee    = Number(event.initial_fee ?? 50)
  const nCuotas = Number(event.installments_count ?? 25)

  // Total a recaudar (cuotas mensuales + cuotas iniciales)
  const totalToCollect = studs.reduce((s, st) => {
    const total = base + Number(st.guests_count) * gPrice - Number(st.special_discount)
    return s + Math.max(total, 0)
  }, 0)

  const totalCollected = pays.reduce((s, p) => s + Number(p.amount), 0)
  const totalPending   = Math.max(totalToCollect - totalCollected, 0)
  const compliance     = totalToCollect > 0 ? (totalCollected / totalToCollect) * 100 : 0

  // Por paralelo
  const byParallel = pars.map(par => {
    const parStuds = studs.filter(s => s.parallel_id === par.id)
    const parTotal = parStuds.reduce((s, st) => {
      const t = base + Number(st.guests_count) * gPrice - Number(st.special_discount)
      return s + Math.max(t, 0)
    }, 0)
    const parStudIds = new Set(parStuds.map(s => s.id))
    const parPaid = pays.filter(p => parStudIds.has(p.student_id))
      .reduce((s, p) => s + Number(p.amount), 0)
    return { ...par, total: parTotal, paid: parPaid, pending: Math.max(parTotal - parPaid, 0) }
  })

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total a recaudar"  value={fmt(totalToCollect)} color="navy"  icon="📊" />
        <KpiCard title="Total recaudado"   value={fmt(totalCollected)} color="green" icon="✅" />
        <KpiCard title="Total pendiente"   value={fmt(totalPending)}   color="gold"  icon="⏳" />
        <KpiCard title="Cumplimiento"      value={`${compliance.toFixed(1)}%`} color="purple" icon="📈" />
      </div>

      {/* Barra de progreso general */}
      <div className="card">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-semibold text-navy-700">Progreso general de recaudación</span>
          <span className="text-2xl font-extrabold text-navy-700">{compliance.toFixed(1)}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill-green" style={{ width: `${Math.min(compliance, 100)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-green-600 font-semibold">{fmt(totalCollected)} recaudado</span>
          <span className="text-red-500 font-semibold">{fmt(totalPending)} pendiente</span>
        </div>
      </div>

      {/* Desglose por paralelo */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-navy-800">Desglose por paralelo</h3>
        </div>
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">Paralelo</th>
              <th className="table-th text-center">Alumnos</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th text-right">Recaudado</th>
              <th className="table-th text-right">Pendiente</th>
              <th className="table-th text-center">Cumplimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byParallel.map(par => (
              <tr key={par.id} className="table-row">
                <td className="table-td font-semibold text-navy-700">{par.name}</td>
                <td className="table-td text-center">
                  {studs.filter(s => s.parallel_id === par.id).length}
                </td>
                <td className="table-td text-right font-mono text-xs">{fmt(par.total)}</td>
                <td className="table-td text-right text-green-600 font-semibold font-mono text-xs">{fmt(par.paid)}</td>
                <td className="table-td text-right text-red-500 font-semibold font-mono text-xs">{fmt(par.pending)}</td>
                <td className="table-td text-center">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 progress-bar h-1.5">
                      <div className="progress-fill-green" style={{ width: pct(par.paid, par.total) }} />
                    </div>
                    <span className="text-xs font-semibold text-navy-600 w-10 text-right">
                      {pct(par.paid, par.total)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// REPORTE 2 — Estado por paralelo
// ════════════════════════════════════════
function ReportParallel({ studs, pays, insts, pars, event, filterPar, setFilterPar, isAdminParalelo }) {
  if (!event) return <EmptyCard />

  const base   = Number(event.base_price)
  const gPrice = Number(event.guest_price)

  const filtered = filterPar
    ? studs.filter(s => s.parallel_id === filterPar)
    : studs

  const today = new Date().toISOString().slice(0, 10)

  const rows = filtered.map(st => {
    const total   = Math.max(base + Number(st.guests_count) * gPrice - Number(st.special_discount), 0)
    const stInsts = insts.filter(i => i.student_id === st.id)
    const stPays  = pays.filter(p => p.student_id === st.id)
    const paid    = stPays.reduce((s, p) => s + Number(p.amount), 0)
    const pending = Math.max(total - paid, 0)
    const overdueCount = stInsts.filter(i => i.status !== 'pagado' && i.due_date < today).length
    const paidCount    = stInsts.filter(i => i.status === 'pagado').length
    const totalInsts   = stInsts.length

    return { ...st, total, paid, pending, overdueCount, paidCount, totalInsts }
  })

  return (
    <div className="space-y-4">
      {!isAdminParalelo && (
        <div className="flex items-center gap-3">
          <label className="label mb-0">Filtrar por paralelo</label>
          <select
            className="select w-48"
            value={filterPar}
            onChange={e => setFilterPar(e.target.value)}
          >
            <option value="">Todos</option>
            {pars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="text-sm text-gray-400">{rows.length} estudiantes</span>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">Alumno</th>
              <th className="table-th">Paralelo</th>
              <th className="table-th text-center">Invitados</th>
              <th className="table-th text-right">Total</th>
              <th className="table-th text-right">Pagado</th>
              <th className="table-th text-right">Pendiente</th>
              <th className="table-th text-center">Cuotas al día</th>
              <th className="table-th text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="table-td text-center text-gray-400 py-8">Sin datos</td></tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} className={`table-row ${row.overdueCount > 0 ? 'bg-red-50/30' : ''}`}>
                  <td className="table-td">
                    <p className="font-semibold text-navy-700">{row.full_name}</p>
                    <p className="text-xs text-gray-400">{row.representative_name}</p>
                  </td>
                  <td className="table-td text-gray-500">{row.parallels?.name ?? '—'}</td>
                  <td className="table-td text-center">{row.guests_count}</td>
                  <td className="table-td text-right font-mono text-xs">{fmt(row.total)}</td>
                  <td className="table-td text-right text-green-600 font-semibold font-mono text-xs">{fmt(row.paid)}</td>
                  <td className="table-td text-right text-red-500 font-semibold font-mono text-xs">{fmt(row.pending)}</td>
                  <td className="table-td text-center">
                    <span className="text-xs text-gray-600">
                      {row.paidCount}/{row.totalInsts}
                    </span>
                    {row.overdueCount > 0 && (
                      <span className="ml-1 badge-red">{row.overdueCount} venc.</span>
                    )}
                  </td>
                  <td className="table-td text-center">
                    {row.pending === 0
                      ? <span className="badge-green">Al día</span>
                      : row.overdueCount > 0
                      ? <span className="badge-red">Con mora</span>
                      : <span className="badge-yellow">Pendiente</span>
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// REPORTE 3 — Morosos
// ════════════════════════════════════════
function ReportOverdue({ studs, pays, insts, event }) {
  const today = new Date().toISOString().slice(0, 10)
  const base   = Number(event?.base_price ?? 0)
  const gPrice = Number(event?.guest_price ?? 0)

  const overdue = studs
    .map(st => {
      const overdueInsts = insts.filter(
        i => i.student_id === st.id && i.status !== 'pagado' && i.due_date < today
      )
      if (!overdueInsts.length) return null

      const total   = Math.max(base + Number(st.guests_count) * gPrice - Number(st.special_discount), 0)
      const stPays  = pays.filter(p => p.student_id === st.id)
      const paid    = stPays.reduce((s, p) => s + Number(p.amount), 0)
      const pending = Math.max(total - paid, 0)
      const oldest  = overdueInsts.reduce((m, i) => i.due_date < m ? i.due_date : m, today)
      const daysLate = Math.floor((new Date() - new Date(oldest)) / 86400000)

      return { ...st, pending, daysLate, overdueCount: overdueInsts.length }
    })
    .filter(Boolean)
    .sort((a, b) => b.pending - a.pending)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Total morosos" value={overdue.length} color="red" icon="🔴" />
        <KpiCard title="Monto en mora" value={fmt(overdue.reduce((s, r) => s + r.pending, 0))} color="red" icon="💸" />
        <KpiCard title="Promedio días atraso" value={
          overdue.length ? Math.round(overdue.reduce((s, r) => s + r.daysLate, 0) / overdue.length) + 'd' : '—'
        } color="gold" icon="📅" />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">#</th>
              <th className="table-th">Alumno</th>
              <th className="table-th">Paralelo</th>
              <th className="table-th text-center">Cuotas vencidas</th>
              <th className="table-th text-right">Monto pendiente</th>
              <th className="table-th text-center">Días de atraso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {overdue.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">
                🎉 No hay morosos activos
              </td></tr>
            ) : (
              overdue.map((row, i) => (
                <tr key={row.id} className="table-row">
                  <td className="table-td text-gray-400 text-xs">{i + 1}</td>
                  <td className="table-td">
                    <p className="font-semibold text-navy-700">{row.full_name}</p>
                    <p className="text-xs text-gray-400">{row.representative_name}</p>
                  </td>
                  <td className="table-td text-gray-500">{row.parallels?.name ?? '—'}</td>
                  <td className="table-td text-center">
                    <span className="badge-red">{row.overdueCount}</span>
                  </td>
                  <td className="table-td text-right font-bold text-red-600">{fmt(row.pending)}</td>
                  <td className="table-td text-center">
                    <span className={`badge ${row.daysLate > 60 ? 'badge-red' : row.daysLate > 30 ? 'badge-yellow' : 'badge-gray'}`}>
                      {row.daysLate}d
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// REPORTE 4 — Proyección de recaudación
// ════════════════════════════════════════
function ReportProjection({ insts, pays }) {
  // Agrupar cuotas por mes (esperado)
  const expectedByMonth = {}
  insts.forEach(i => {
    const month = i.due_date.slice(0, 7) // "YYYY-MM"
    expectedByMonth[month] = (expectedByMonth[month] ?? 0) + Number(i.amount)
  })

  // Agrupar pagos regulares por mes (real)
  const actualByMonth = {}
  pays.filter(p => !p.is_initial_fee).forEach(p => {
    const month = p.payment_date.slice(0, 7)
    actualByMonth[month] = (actualByMonth[month] ?? 0) + Number(p.amount)
  })

  // Unir meses
  const months = Array.from(new Set([
    ...Object.keys(expectedByMonth),
    ...Object.keys(actualByMonth),
  ])).sort()

  const chartData = months.map(m => ({
    mes:      new Date(m + '-15').toLocaleDateString('es-EC', { month: 'short', year: '2-digit' }),
    Esperado: Number((expectedByMonth[m] ?? 0).toFixed(2)),
    Real:     Number((actualByMonth[m] ?? 0).toFixed(2)),
  }))

  const totalExpected = Object.values(expectedByMonth).reduce((s, v) => s + v, 0)
  const totalActual   = Object.values(actualByMonth).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <KpiCard title="Total esperado (cuotas)" value={fmt(totalExpected)} color="navy"  icon="📋" />
        <KpiCard title="Total recaudado"          value={fmt(totalActual)}  color="green" icon="✅" />
      </div>

      <div className="card">
        <h3 className="text-base font-bold text-navy-800 mb-1">Esperado vs. Real por mes</h3>
        <p className="text-xs text-gray-400 mb-4">
          Azul marino = cuotas esperadas · Dorado = pagos reales registrados
        </p>

        {chartData.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Sin datos suficientes para graficar</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={v => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Esperado" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Real"     fill="#f0c040" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// REPORTE 5 — Invitados
// ════════════════════════════════════════
function ReportGuests({ studs }) {
  const PEOPLE_PER_TABLE = 10

  // Distribución de invitados
  const dist = {}
  studs.forEach(s => {
    const n = s.guests_count
    dist[n]  = (dist[n] ?? 0) + 1
  })

  const maxGuests = Math.max(...studs.map(s => s.guests_count), 0)
  const distRows  = Array.from({ length: maxGuests + 1 }, (_, n) => ({
    n,
    count: dist[n] ?? 0,
  }))

  const totalStudents = studs.length
  const totalGuests   = studs.reduce((s, st) => s + st.guests_count, 0)
  const totalPeople   = totalStudents + totalGuests
  const tablesNeeded  = Math.ceil(totalPeople / PEOPLE_PER_TABLE)
  const avgGuests     = totalStudents ? (totalGuests / totalStudents).toFixed(2) : 0

  const chartData = distRows.map(r => ({
    invitados: `${r.n} inv.`,
    Familias:  r.count,
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard title="Graduados"     value={totalStudents} color="navy"  icon="👨‍🎓" />
        <KpiCard title="Invitados"     value={totalGuests}   color="gold"  icon="👥" />
        <KpiCard title="Total personas" value={totalPeople}  color="green" icon="🎉" />
        <KpiCard title="Mesas (~10 p/m)" value={tablesNeeded} color="purple" icon="🪑" />
      </div>

      <div className="card">
        <h3 className="text-base font-bold text-navy-800 mb-1">Distribución de invitados</h3>
        <p className="text-xs text-gray-400 mb-4">
          Promedio: {avgGuests} invitados por familia
        </p>
        {chartData.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Sin datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="invitados" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="Familias" fill="#1e3a5f" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-navy-800">Detalle de distribución</h3>
        </div>
        <table className="table-base">
          <thead className="table-head">
            <tr>
              <th className="table-th">Invitados</th>
              <th className="table-th text-center">Familias</th>
              <th className="table-th text-center">% del total</th>
              <th className="table-th text-center">Personas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {distRows.filter(r => r.count > 0).map(r => (
              <tr key={r.n} className="table-row">
                <td className="table-td font-semibold text-navy-700">{r.n} invitado{r.n !== 1 ? 's' : ''}</td>
                <td className="table-td text-center">{r.count}</td>
                <td className="table-td text-center text-gray-500">
                  {totalStudents ? ((r.count / totalStudents) * 100).toFixed(1) : 0}%
                </td>
                <td className="table-td text-center text-gray-600">
                  {r.count * (1 + r.n)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-footer">
            <tr>
              <td className="table-td text-navy-700">Total</td>
              <td className="table-td text-center text-navy-700">{totalStudents}</td>
              <td className="table-td text-center">100%</td>
              <td className="table-td text-center text-navy-700 font-bold">{totalPeople}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl bg-navy-50 border border-navy-100 p-4 text-sm text-navy-700">
        <strong>Estimación de mesas:</strong> {totalPeople} personas ÷ {PEOPLE_PER_TABLE} por mesa
        = <strong>{tablesNeeded} mesas</strong> necesarias
      </div>
    </div>
  )
}

// ── Componentes auxiliares ──
function KpiCard({ title, value, color, icon }) {
  const variants = {
    navy:   'bg-navy-700 text-white',
    gold:   'bg-gold-500 text-navy-900',
    green:  'bg-green-600 text-white',
    red:    'bg-red-600 text-white',
    purple: 'bg-purple-600 text-white',
  }
  return (
    <div className={`rounded-2xl p-5 ${variants[color]}`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{title}</p>
        <span className="text-xl opacity-80">{icon}</span>
      </div>
      <p className="text-3xl font-extrabold">{value}</p>
    </div>
  )
}

function EmptyCard() {
  return (
    <div className="card text-center py-12 text-gray-400">
      No se encontraron datos de evento.
    </div>
  )
}
