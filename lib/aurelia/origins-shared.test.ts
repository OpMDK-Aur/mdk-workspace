import { describe, expect, it } from 'vitest'
import { NO_CONTACT_LABEL, ORGANIC_LABEL, describeGhlAttribution, groupOrigins, mergeOrigins, originFromGhlTouches, originCampaign, originChannelLabel, originFromLabel, phoneKey, type ClientOrigin } from './origins-shared'

describe('phoneKey', () => {
  it('matches Argentine numbers with or without country code and mobile 9', () => {
    expect(phoneKey('+54 9 379 498-4900')).toBe(phoneKey('3794984900'))
    expect(phoneKey('5493794984900')).toBe('3794984900')
    expect(phoneKey('1234')).toBeNull()
  })
})

describe('origins', () => {
  it('splits channel and campaign from the label', () => {
    const origin = originFromLabel('Meta WhatsApp · Campaña Nov', '2026-11-01')
    expect(origin).toMatchObject({ kind: 'referral', channel: 'Meta WhatsApp' })
    expect(originCampaign(origin)).toBe('Campaña Nov')
    expect(originFromLabel(null, null).kind).toBe('organic')
  })

  it('groups clients by channel and campaign', () => {
    const origins: Record<string, ClientOrigin> = {
      a: originFromLabel('Meta WhatsApp · A', 'x'),
      b: originFromLabel('Meta WhatsApp · A', 'x'),
      c: originFromLabel('Google · B', 'x'),
      d: originFromLabel(null, null),
      e: { kind: 'no-contact', channel: null, label: null, referralAt: null },
    }
    const groups = groupOrigins(['a', 'b', 'c', 'd', 'e', 'missing'], origins)
    expect(groups[0]).toEqual({ channel: 'Meta WhatsApp', count: 2, campaigns: [{ name: 'A', count: 2 }] })
    expect(groups.find((group) => group.channel === NO_CONTACT_LABEL)?.count).toBe(2)
    expect(groups.find((group) => group.channel === ORGANIC_LABEL)?.campaigns).toEqual([])
  })
})

describe('mergeOrigins', () => {
  const noContact: ClientOrigin = { kind: 'no-contact', channel: null, label: null, referralAt: null }
  it('keeps the CRM referral over GHL', () => {
    const crm = originFromLabel('Meta WhatsApp · A', 'x')
    expect(mergeOrigins(crm, originFromLabel('Google · B', 'y', 'ghl'))).toMatchObject({ label: 'Meta WhatsApp · A', source: 'crm' })
  })
  it('falls back to GHL attribution', () => {
    const ghl = originFromLabel('Google · B', 'y', 'ghl')
    expect(mergeOrigins(originFromLabel(null, null), ghl)).toBe(ghl)
    expect(mergeOrigins(noContact, originFromLabel(null, null, 'ghl')).kind).toBe('organic')
    expect(mergeOrigins(noContact, null)).toBe(noContact)
  })
})

describe('describeGhlAttribution', () => {
  it('describes organic social and direct touches', () => {
    expect(describeGhlAttribution({ sessionSource: 'Direct Traffic' })).toEqual({ channel: 'Directo', label: 'Directo', paid: false })
    expect(describeGhlAttribution({ sessionSource: 'Social media', medium: 'calendar', referrer: 'http://instagram.com' })).toEqual({ channel: 'Redes orgánicas', label: 'Redes orgánicas · Instagram · Calendario', paid: false })
    expect(describeGhlAttribution({ sessionSource: 'CRM UI', medium: 'csv_import' })?.label).toBe('Carga manual · Importación CSV')
    expect(describeGhlAttribution(null)).toBeNull()
  })
  it('reads the campaign of paid touches from the landing URL', () => {
    const touch = describeGhlAttribution({ sessionSource: 'Paid Social', medium: 'cpc', utmSource: 'meta', fbclid: 'x', adName: 'VD|Diferencial', url: 'https://www.soyaurelia.com/diagnostico?utm_campaign=Potenciales' })
    expect(touch).toEqual({ channel: 'Meta Formulario', label: 'Meta Formulario · Potenciales', paid: true })
  })
})

describe('originFromGhlTouches', () => {
  it('prefers a paid touch, otherwise the first organic one', () => {
    const direct = { channel: 'Directo', label: 'Directo', paid: false }
    const ad = { channel: 'Google', label: 'Google · Marca', paid: true }
    expect(originFromGhlTouches(direct, ad, 'd').label).toBe('Google · Marca')
    const social = { channel: 'Redes orgánicas', label: 'Redes orgánicas · Instagram', paid: false }
    expect(originFromGhlTouches(direct, social, 'd').label).toBe('Redes orgánicas · Instagram')
    const organic = originFromGhlTouches(direct, null, 'd')
    expect(organic.kind).toBe('organic')
    expect(originChannelLabel(organic)).toBe('Directo')
  })
})
