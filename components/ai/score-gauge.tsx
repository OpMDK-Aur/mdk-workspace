/**
 * Anillo de progreso compacto para mostrar el optimization_score del
 * Performance Analyst en lugares reducidos (ej. junto al nombre de un chat
 * en el sidebar). Es solo el gráfico: no renderiza el número al lado.
 */
export function ScoreGauge({ score, size = 18 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  // Reusa los tokens de status ya definidos en globals.css (verde/amarillo/rojo)
  // para mantener la misma semántica de color que el resto del dashboard.
  const colorClass = clamped >= 70 ? 'text-status-verde' : clamped >= 40 ? 'text-status-amarillo' : 'text-status-rojo'

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      role="img"
      aria-label={`Scoring de optimización: ${clamped} de 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={colorClass}
      />
    </svg>
  )
}
