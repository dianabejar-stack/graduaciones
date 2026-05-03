// Tarjeta de indicador clave para el dashboard
export default function KPICard({ title, value, subtitle, color = 'navy', icon }) {
  const variants = {
    navy:  'bg-navy-700 text-white border-navy-600',
    gold:  'bg-gold-500 text-navy-900 border-gold-400',
    green: 'bg-emerald-600 text-white border-emerald-500',
    red:   'bg-red-600 text-white border-red-500',
  }

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${variants[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider opacity-75">
          {title}
        </span>
        {icon && (
          <span className="text-xl opacity-80">{icon}</span>
        )}
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {subtitle && (
        <p className="text-xs mt-1.5 opacity-60">{subtitle}</p>
      )}
    </div>
  )
}
