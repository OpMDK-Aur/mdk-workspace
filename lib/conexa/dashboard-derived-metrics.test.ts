import { describe, expect, it } from 'vitest'
import { withDerivedDashboardMetrics } from './dashboard-derived-metrics'

describe('withDerivedDashboardMetrics', () => {
  it('calcula CPL solo con leads explícitos y costo por resultado con resultados', () => {
    const source = {
      meta: [
        { label: 'Inversión', value: 9000 },
        { label: 'Resultados', value: 30 },
        { label: 'Leads', value: 15 },
      ],
    }

    const result = withDerivedDashboardMetrics(source)

    expect(result.meta).toContainEqual({ label: 'CPL', value: 600 })
    expect(result.meta).toContainEqual({ label: 'Costo por resultado', value: 300 })
    expect(source.meta).toHaveLength(3)
  })

  it('no etiqueta resultados genéricos como CPL', () => {
    const result = withDerivedDashboardMetrics({
      meta: [
        { label: 'Inversión', value: 9000 },
        { label: 'Resultados', value: 30 },
      ],
    })

    expect(result.meta).not.toContainEqual(expect.objectContaining({ label: 'CPL' }))
    expect(result.meta).toContainEqual({ label: 'Costo por resultado', value: 300 })
  })

  it('calcula costo por conversión en Google', () => {
    const result = withDerivedDashboardMetrics({
      google: [
        { label: 'Inversión', value: 12000 },
        { label: 'Conversiones', value: 8 },
      ],
    })

    expect(result.google).toContainEqual({ label: 'Costo por conversión', value: 1500 })
  })
})
