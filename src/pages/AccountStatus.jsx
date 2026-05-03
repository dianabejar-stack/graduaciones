import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

const fmt = n => `$${Number(n ?? 0).toFixed(2)}`

// Determina el badge de una cuota según su estado y fecha
function installmentBadge(installment) {
  const today = new Date().toISOString().slice(0, 10)
  if (installment.status === 'pagado') {
    return <span className="badge-green">✓ Pagado</span>
  }
  if (installment.status === 'parcial') {
    return <span className="badge-yellow">◑ Parcial</span>
  }
  // pendiente
  if (installment.due_date < today) {
    return <span className="badge-red">✗ Vencida</span>
  }
  return <span className="badge-gray">○ Pendiente</span>
}

export default function AccountStatus() {
  const { session } = useAuth()
  const [student,      setStudent]      = useState(null)
  const [event,        setEvent]        = useState(null)
  const [installments, setInstallments] = useState([])
  const [payments,     setPayments]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const { data: stud, error: sErr } = await supabase
        .from('students')
        .select('*, parallels(name), events(*)')
        .eq('user_id', session.user.id)
        .single()

      if (sErr || !stud) {
        setError('No se encontró un estudiante vinculado a este usuario. Contacta al administrador.')
        setLoading(false)
        return
      }

      setStudent(stud)
      setEvent(stud.events)

      const [{ data: inst }, { data: pays }] = await Promise.all([
        supabase
          .from('installments')
          .select('*')
          .eq('student_id', stud.id)
          .order('installment_number'),
        supabase
          .from('payments')
          .select('*')
          .eq('student_id', stud.id)
          .order('payment_date', { ascending: false }),
      ])

      setInstallments(inst ?? [])
      setPayments(pays ?? [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-navy-400">
      Cargando estado de cuenta...
    </div>
  )

  if (!student || !event) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <ErrorAlert error={error} />
      </div>
    )
  }

  // ── Cálculos financieros ──
  const baseAmount    = Number(event.base_price)
  const guestsAmount  = Number(student.guests_count) * Number(event.guest_price)
  const discount      = Number(student.special_discount)
  const totalFinal    = Math.max(baseAmount + guestsAmount - discount, 0)
  const initialFee    = Number(event.initial_fee ?? 50)
  const saldo         = Math.max(totalFinal - initialFee, 0)
  const cuotaMensual  = saldo / Number(event.installments_count ?? 25)

  // Cuota inicial pagada?
  const initialFeePay = payments.find(p => p.is_initial_fee)

  // Pagos regulares (excluir cuota inicial)
  const regularPayments = payments.filter(p => !p.is_initial_fee)

  // Total abonado en cuotas mensuales
  const totalPaidInst = installments.reduce((s, i) => s + Number(i.paid_amount), 0)

  // Saldo pendiente en cuotas
  const pendingTotal  = Math.max(saldo - totalPaidInst, 0)

  // Porcentaje de progreso
  const pct = saldo > 0 ? Math.min((totalPaidInst / saldo) * 100, 100) : 100

  // Fecha límite de invitados
  const guestDeadline = event.guest_deadline
    ? new Date(event.guest_deadline + 'T12:00:00').toLocaleDateString('es-EC', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="section-header">
        <div className="section-header-bar" />
        <h2 className="text-2xl font-bold text-navy-800">Mi Estado de Cuenta</h2>
      </div>

      {/* ── Tarjeta hero — info del estudiante ── */}
      <div className="card-hero">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs uppercase tracking-widest mb-1">{event.name}</p>
            <h3 className="text-2xl font-extrabold text-white">{student.full_name}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-navy-200">
              <span>Representante: <strong className="text-white">{student.representative_name}</strong></span>
              {student.parallels && (
                <span>Paralelo: <strong className="text-white">{student.parallels.name}</strong></span>
              )}
              {student.table_number && (
                <span>Mesa: <strong className="text-white">#{student.table_number}</strong></span>
              )}
            </div>
          </div>
          {event.event_date && (
            <div className="text-right shrink-0">
              <p className="text-navy-300 text-xs uppercase tracking-wide">Fecha de graduación</p>
              <p className="text-white font-bold mt-0.5">
                {new Date(event.event_date + 'T12:00:00').toLocaleDateString('es-EC', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Resumen financiero ── */}
      <div className="card">
        <h3 className="text-base font-bold text-navy-800 mb-5">Resumen financiero</h3>

        {/* Grid de valores */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <FinanceItem label="Precio base"                 value={fmt(baseAmount)} />
          <FinanceItem
            label={`Invitados (×${student.guests_count})`}
            value={fmt(guestsAmount)}
            muted={student.guests_count === 0}
          />
          {discount > 0 && (
            <FinanceItem label="Descuento especial" value={`−${fmt(discount)}`} green />
          )}
          <FinanceItem label="Total del paquete" value={fmt(totalFinal)} bold />
          <FinanceItem label="Cuota inicial"      value={fmt(initialFee)} />
          <FinanceItem label="Saldo a financiar"  value={fmt(saldo)} />
          <FinanceItem label="Cuota mensual"      value={fmt(cuotaMensual)}
            sub={`× ${event.installments_count} meses`} />
        </div>

        {/* Estado de la cuota inicial */}
        <div className={`flex items-center gap-3 rounded-xl p-4 mb-5 border ${
          initialFeePay
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-2xl">{initialFeePay ? '✅' : '❌'}</span>
          <div>
            <p className={`text-sm font-bold ${initialFeePay ? 'text-green-700' : 'text-red-700'}`}>
              Cuota inicial ({fmt(initialFee)}) — {initialFeePay ? 'Pagada' : 'Pendiente'}
            </p>
            {initialFeePay && (
              <p className="text-xs text-green-600 mt-0.5">
                Registrada el{' '}
                {new Date(initialFeePay.payment_date + 'T12:00:00').toLocaleDateString('es-EC')}
              </p>
            )}
          </div>
        </div>

        {/* Barra de progreso de cuotas mensuales */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-xs font-semibold text-navy-700 uppercase tracking-wide">
              Progreso de cuotas mensuales
            </span>
            <span className="text-lg font-extrabold text-navy-700">{pct.toFixed(0)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill-green" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-green-600 font-semibold">Pagado: {fmt(totalPaidInst)}</span>
            <span className="text-red-500 font-semibold">Pendiente: {fmt(pendingTotal)}</span>
          </div>
        </div>
      </div>

      {/* ── Invitados ── */}
      <div className="card">
        <h3 className="text-base font-bold text-navy-800 mb-3">Invitados adicionales</h3>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-navy-700 flex items-center justify-center shrink-0">
            <span className="text-2xl font-extrabold text-white">{student.guests_count}</span>
          </div>
          <div>
            <p className="text-sm text-gray-600">
              Tienes <strong className="text-navy-700">{student.guests_count}</strong> invitado{student.guests_count !== 1 ? 's' : ''} adicionale{student.guests_count !== 1 ? 's' : ''} registrado{student.guests_count !== 1 ? 's' : ''}.
              El costo adicional por invitados es de{' '}
              <strong className="text-navy-700">{fmt(guestsAmount)}</strong>.
            </p>
            {guestDeadline && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3 border border-amber-200">
                ⚠️ Después del <strong>{guestDeadline}</strong>, los invitados adicionales
                deberán pagarse en su totalidad de inmediato.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabla de cuotas ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-navy-800">Detalle de cuotas mensuales</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="table-th">N°</th>
                <th className="table-th">Vencimiento</th>
                <th className="table-th text-right">Valor</th>
                <th className="table-th text-right">Abonado</th>
                <th className="table-th text-right">Saldo</th>
                <th className="table-th text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {installments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-td text-center text-gray-400 py-8">
                    No hay cuotas generadas
                  </td>
                </tr>
              ) : (
                installments.map(inst => {
                  const today   = new Date().toISOString().slice(0, 10)
                  const balance = Number(inst.amount) - Number(inst.paid_amount)
                  const isOverdue = inst.status === 'pendiente' && inst.due_date < today

                  return (
                    <tr key={inst.id} className={`table-row ${isOverdue ? 'bg-red-50/40' : ''}`}>
                      <td className="table-td font-semibold text-navy-700">#{inst.installment_number}</td>
                      <td className="table-td text-gray-600">
                        {new Date(inst.due_date + 'T12:00:00').toLocaleDateString('es-EC', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                        {isOverdue && (
                          <span className="ml-2 text-xs text-red-400">
                            ({Math.floor((new Date() - new Date(inst.due_date)) / 86400000)}d)
                          </span>
                        )}
                      </td>
                      <td className="table-td text-right font-mono text-xs">{fmt(inst.amount)}</td>
                      <td className="table-td text-right">
                        <span className="text-green-600 font-semibold font-mono text-xs">
                          {fmt(inst.paid_amount)}
                        </span>
                      </td>
                      <td className="table-td text-right font-mono text-xs">
                        {balance > 0
                          ? <span className="text-red-500">{fmt(balance)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="table-td text-center">
                        {installmentBadge(inst)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {installments.length > 0 && (
              <tfoot className="table-footer">
                <tr>
                  <td colSpan={2} className="table-td text-navy-700">Total</td>
                  <td className="table-td text-right font-mono text-xs">{fmt(saldo)}</td>
                  <td className="table-td text-right">
                    <span className="text-green-600 font-mono text-xs">{fmt(totalPaidInst)}</span>
                  </td>
                  <td className="table-td text-right">
                    <span className="text-red-500 font-mono text-xs">{fmt(pendingTotal)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Historial de pagos ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-navy-800">Historial de pagos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="table-th">Fecha</th>
                <th className="table-th text-right">Monto</th>
                <th className="table-th">Método</th>
                <th className="table-th">Concepto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-td text-center text-gray-400 py-8">
                    No hay pagos registrados
                  </td>
                </tr>
              ) : (
                payments.map(pay => (
                  <tr key={pay.id} className={`table-row ${pay.is_initial_fee ? 'bg-gold-50' : ''}`}>
                    <td className="table-td">
                      {new Date(pay.payment_date + 'T12:00:00').toLocaleDateString('es-EC', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="table-td text-right font-bold text-green-600">
                      {fmt(pay.amount)}
                    </td>
                    <td className="table-td capitalize text-gray-500">{pay.method}</td>
                    <td className="table-td">
                      {pay.is_initial_fee
                        ? <span className="badge-gold">⭐ Cuota inicial</span>
                        : <span className="text-gray-500 text-xs">{pay.notes || 'Cuota mensual'}</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

// Sub-componentes locales
function FinanceItem({ label, value, bold, green, muted, sub }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-500 mb-1 leading-tight">{label}</p>
      <p className={`text-sm ${
        bold  ? 'text-navy-800 text-base font-extrabold' :
        green ? 'text-green-600 font-bold' :
        muted ? 'text-gray-400 font-semibold' :
                'text-navy-700 font-bold'
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
