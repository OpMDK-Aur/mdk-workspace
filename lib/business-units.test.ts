import { describe, expect, it } from 'vitest'
import { homeForAccess, isDashboardPathAllowed, resolveUnitAccess } from './business-units'

describe('business units', () => {
  it('gives Master access to both units', () => {
    expect(resolveUnitAccess('Master', ['Aurelia'])).toEqual({ mdk: true, aurelia: true })
  })

  it('defaults to MDK when the column is missing or empty', () => {
    expect(resolveUnitAccess('Usuario', undefined)).toEqual({ mdk: true, aurelia: false })
    expect(resolveUnitAccess('Usuario', [])).toEqual({ mdk: true, aurelia: false })
  })

  it('keeps Aurelia-only users inside Aurelia', () => {
    const access = resolveUnitAccess('Usuario', ['Aurelia'])
    expect(isDashboardPathAllowed('/dashboard/aurelia', access)).toBe(true)
    expect(isDashboardPathAllowed('/dashboard/tasks', access)).toBe(false)
    expect(isDashboardPathAllowed('/dashboard/perfil', access)).toBe(true)
    expect(homeForAccess(access)).toBe('/dashboard/aurelia')
  })

  it('keeps MDK-only users out of Aurelia', () => {
    const access = resolveUnitAccess('Usuario', ['MDK'])
    expect(isDashboardPathAllowed('/dashboard/aurelia', access)).toBe(false)
    expect(isDashboardPathAllowed('/dashboard/aureliax', access)).toBe(true)
    expect(isDashboardPathAllowed('/dashboard/clients', access)).toBe(true)
  })
})
