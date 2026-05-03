import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import KPICard from '../components/KPICard'
import Table from '../components/Table'
import ErrorAlert from '../components/ErrorAlert'

// Formatea número a moneda local
const fmt = n => `$${Number(n ?? 0).toFixed(2)}`

export default function Dashboard() {
  const [stats, setStats]       = useState(null)
  const [debtors, setDebtors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Total de estudiantes
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })

      // Total recaudado (suma de pagos)
      const { data: paymentsSum } = await supabase
        .from('payments')
        .select('amount')
      const collected = (paymentsSum ?? []).reduce((s, p) => s + Number(p.amount), 0)

      // Total pendiente (cuotas pendientes o parciales)
      const { data: pending } = await supabase
        .from('installments')
        .select('amount, paid_amount')
        .in('status', ['pendiente', 'parcial'])
      const pendingTotal = (pending ?? []).reduce(
        (s, i) => s + (Number(i.amount) - Number(i.paid_amount)), 0
      )

      // Estudiantes con deuda > 0 (top 10 deudores)
      const { data: studentsRaw, error: sErr } = await supabase
        .from('students')
        .select(`
          id, full_name, representative_name,
          parallels(name),
          installments(amount, paid_amount, status)
        `)
      if (sErr) throw sErr

      const withDebt = (studentsRaw ?? [])
        .map(s => {
          const debt = s.installments
            .filter(i => ['pendiente', 'parcial'].includes(i.status))
            .reduce((sum, i) => sum + (Number(i.amount) - Number(i.paid_amount)), 0)
          return { ...s, debt }
        })
        .filter(s => s.debt > 0)
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 10)

      setStats({ totalStudents, collected, pendingTotal })
      setDebtors(withDebt)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { key: 'full_name',           label: 'Estudiante' },
    { key: 'representative_name', label: 'Representante' },
    {
      key: 'parallel',
      label: 'Paralelo',
      render: row => row.parallels?.name ?? '—'
    },
    {
      key: 'debt',
      label: 'Deuda pendiente',
      render: row => (
        <span className="font-semibold text-red-600">{fmt(row.debt)}</span>
      )
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header con acento dorado */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full bg-gold-500" />
        <h2 className="text-2xl font-bold text-navy-800">Dashboard</h2>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total estudiantes"
          value={loading ? '...' : stats?.totalStudents ?? 0}
          icon="👨‍🎓"
          color="navy"
        />
        <KPICard
          title="Recaudado"
          value={loading ? '...' : fmt(stats?.collected)}
          icon="✅"
          color="green"
        />
        <KPICard
          title="Pendiente de cobro"
          value={loading ? '...' : fmt(stats?.pendingTotal)}
          icon="⏳"
          color="gold"
        />
        <KPICard
          title="Deudores activos"
          value={loading ? '...' : debtors.length}
          icon="🔴"
          color="red"
        />
      </div>

      {/* Top deudores */}
      <div className="card">
        <h3 className="text-lg font-semibold text-navy-800 mb-4">Top deudores</h3>
        <Table
          columns={columns}
          rows={debtors}
          loading={loading}
          emptyText="No hay deudores registrados"
        />
      </div>
    </div>
  )
}
