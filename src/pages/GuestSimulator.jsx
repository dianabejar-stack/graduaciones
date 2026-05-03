import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ErrorAlert from '../components/ErrorAlert'

const fmt = n => `$${Number(n ?? 0).toFixed(2)}`

// Filas de la tabla (0–12 invitados)
const MAX_GUESTS = 12

export default function GuestSimulator() {
  const { isParent } = useAuth()
  const [event,    setEvent]   = useState(null)
  const [loading,  setLoading] = useState(true)
  const [error,    setError]   = useState(null)
  const [selected, setSelected] = useState(0)   // fila destacada por el slider

  useEffect(() => {
    supabase.from('events').select('*').limit(1).single()
      .then(({ data, error }) => {
        if (error) setError(error)
        else       setEvent(data)
        setLoading(false)
      })
  }, [])

  // Calcular tabla de precios para cada cantidad de invitados
  const rows = useMemo(() => {
    if (!event) return []

    const base         = Number(event.base_price)
    const guestPrice   = Number(event.guest_price)
    const initialFee   = Number(event.initial_fee ?? 50)
    const installments = Number(event.installments_count ?? 25)

    return Array.from({ length: MAX_GUESTS + 1 }, (_, n) => {
      const total        = base + n * guestPrice
      const saldo        = Math.max(total - initialFee, 0)
      const cuotaMensual = saldo / installments
      return { n, total, initialFee, saldo, cuotaMensual }
    })
  }, [event])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-navy-400">
      Cargando simulador...
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="section-header">
        <div className="section-header-bar" />
        <div>
          <h2 className="text-2xl font-bold text-navy-800">Simulador de Precios</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Visualiza el costo total y las cuotas mensuales según el número de invitados
          </p>
        </div>
      </div>

      <ErrorAlert error={error} onClose={() => setError(null)} />

      {event && (
        <>
          {/* Tarjeta del evento */}
          <div className="card-hero">
            {/* patrón decorativo (viene del CSS) */}
            <div className="relative z-10">
              <p className="text-gold-400 text-xs uppercase tracking-widest font-semibold mb-1">
                Evento activo
              </p>
              <p className="text-2xl font-bold mb-3">{event.name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <EventStat label="Precio base"     value={fmt(event.base_price)} />
                <EventStat label="Por invitado"    value={fmt(event.guest_price)} />
                <EventStat label="Cuota inicial"   value={fmt(event.initial_fee ?? 50)} />
                <EventStat label="N° de cuotas"    value={`${event.installments_count} meses`} />
              </div>
            </div>
          </div>

          {/* Slider de selección */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-navy-700 mb-0.5">
                  Invitados adicionales
                </p>
                <p className="text-xs text-gray-400">
                  Mueve el slider para resaltar la fila correspondiente
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-extrabold text-navy-700">{selected}</p>
                <p className="text-xs text-gray-400 mt-0.5">invitado{selected !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={MAX_GUESTS}
              step={1}
              value={selected}
              onChange={e => setSelected(Number(e.target.value))}
              className="slider-navy w-full"
            />

            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>0</span>
              {[2, 4, 6, 8, 10, MAX_GUESTS].map(n => (
                <span key={n}>{n}</span>
              ))}
            </div>

            {/* Atajos rápidos */}
            <div className="flex flex-wrap gap-2 mt-4">
              {Array.from({ length: MAX_GUESTS + 1 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => setSelected(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                    selected === n
                      ? 'bg-navy-700 text-white shadow-card-md scale-110'
                      : 'bg-gray-100 text-gray-600 hover:bg-navy-100 hover:text-navy-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Resumen de la fila seleccionada */}
          {rows[selected] && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Total del paquete"  value={fmt(rows[selected].total)}        color="navy" />
              <SummaryCard label="Cuota inicial"      value={fmt(rows[selected].initialFee)}   color="gold" />
              <SummaryCard label="Saldo a financiar"  value={fmt(rows[selected].saldo)}        color="gray" />
              <SummaryCard label="Cuota mensual"      value={fmt(rows[selected].cuotaMensual)} color="green"
                subtitle={`× ${event.installments_count} meses`} />
            </div>
          )}

          {/* Tabla completa */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-navy-800">
                Tabla de precios completa
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Fórmula: total = {fmt(event.base_price)} + (invitados × {fmt(event.guest_price)}) &nbsp;·&nbsp;
                saldo = total − {fmt(event.initial_fee ?? 50)} &nbsp;·&nbsp;
                cuota = saldo ÷ {event.installments_count}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-navy-700 text-white">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">
                      # Invitados
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider">
                      Cuota Inicial
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider">
                      Saldo
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider">
                      Cuota Mensual ({event.installments_count})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const isSelected = row.n === selected
                    return (
                      <tr
                        key={row.n}
                        onClick={() => setSelected(row.n)}
                        className={`border-b border-gray-100 cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? 'bg-gold-100 border-gold-300'
                            : 'hover:bg-navy-50'
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-gold-500 shrink-0" />
                            )}
                            <span className={`font-bold text-base ${
                              isSelected ? 'text-navy-800' : 'text-gray-700'
                            }`}>
                              {row.n}
                              {row.n === 0 && (
                                <span className="ml-2 text-xs text-gray-400 font-normal">
                                  (familia)
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className={`px-5 py-3.5 text-right font-semibold ${
                          isSelected ? 'text-navy-800' : 'text-gray-700'
                        }`}>
                          {fmt(row.total)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-gray-500 font-mono text-xs">
                          {fmt(row.initialFee)}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-mono text-xs ${
                          isSelected ? 'text-navy-700 font-bold' : 'text-gray-600'
                        }`}>
                          {fmt(row.saldo)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`font-bold text-base ${
                            isSelected ? 'text-gold-700' : 'text-navy-600'
                          }`}>
                            {fmt(row.cuotaMensual)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Nota sobre fecha límite de invitados */}
          {event.guest_deadline && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
              <span className="text-amber-500 text-lg shrink-0">⚠️</span>
              <p className="text-sm text-amber-800">
                <strong>Fecha límite de cambio de invitados:</strong>{' '}
                {new Date(event.guest_deadline + 'T12:00:00').toLocaleDateString('es-EC', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}.
                Después de esta fecha, los invitados adicionales deberán pagarse en su totalidad de inmediato.
              </p>
            </div>
          )}

          {/* Botón para padres */}
          {isParent && (
            <div className="flex justify-center">
              <Link to="/account" className="btn-gold px-8 py-3 text-base">
                Ver mi estado de cuenta
              </Link>
            </div>
          )}
        </>
      )}

      {!event && !loading && (
        <div className="card text-center py-12 text-gray-400">
          No se encontró ningún evento activo.
        </div>
      )}
    </div>
  )
}

function EventStat({ label, value }) {
  return (
    <div>
      <p className="text-navy-300 text-xs uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-white font-bold text-lg">{value}</p>
    </div>
  )
}

function SummaryCard({ label, value, subtitle, color }) {
  const colors = {
    navy:  'bg-navy-700 text-white',
    gold:  'bg-gold-500 text-navy-900',
    gray:  'bg-gray-100 text-gray-700',
    green: 'bg-green-600 text-white',
  }
  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      {subtitle && <p className="text-xs mt-0.5 opacity-60">{subtitle}</p>}
    </div>
  )
}
