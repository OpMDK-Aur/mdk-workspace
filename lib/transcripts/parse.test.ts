import { describe, expect, it } from 'vitest'
import { cleanTranscriptText, extractGoogleDocId, isTranscriptDocName, parseTranscriptDocName, stripSubtitleTimings, transcriptExcerpt } from './parse'

describe('nombres de transcripciones de Meet', () => {
  it('reconoce transcripciones y notas de Gemini en inglés y español', () => {
    expect(isTranscriptDocName('Revisión Soy Aurelia - 2026/11/20 15:00 GMT-03:00 - Transcript')).toBe(true)
    expect(isTranscriptDocName('Revisión Soy Aurelia (2026-11-20 15:00 GMT-3) - Transcripción')).toBe(true)
    expect(isTranscriptDocName('Kickoff – 2026/11/20 15:00 GMT-03:00 – Notas de Gemini')).toBe(true)
    expect(isTranscriptDocName('Propuesta comercial Soy Aurelia')).toBe(false)
  })

  it('separa título y fecha con formato barra', () => {
    expect(parseTranscriptDocName('Revisión Soy Aurelia - 2026/11/20 15:00 GMT-03:00 - Transcript')).toEqual({ meetingTitle: 'Revisión Soy Aurelia', meetingDate: '2026-11-20T18:00:00.000Z' })
  })

  it('separa título y fecha con formato paréntesis', () => {
    expect(parseTranscriptDocName('Revisión Soy Aurelia (2026-11-20 9:30 GMT-3) - Transcripción')).toEqual({ meetingTitle: 'Revisión Soy Aurelia', meetingDate: '2026-11-20T12:30:00.000Z' })
  })

  it('si no hay fecha conserva el título', () => {
    expect(parseTranscriptDocName('Reunión semanal - Transcript')).toEqual({ meetingTitle: 'Reunión semanal', meetingDate: null })
  })
})

describe('utilidades', () => {
  it('extrae el ID de un link de Google Docs', () => {
    expect(extractGoogleDocId('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?tab=t.0')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz012345')
    expect(extractGoogleDocId('https://docs.google.com/document/u/1/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz012345')
    expect(extractGoogleDocId('https://example.com/doc')).toBeNull()
  })

  it('deja solo el texto de un .vtt o .srt', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nErika: Hola, arrancamos\n\n2\n00:00:04,500 --> 00:00:06,000\nJuan: Dale'
    expect(cleanTranscriptText(stripSubtitleTimings(vtt))).toBe('Erika: Hola, arrancamos\n\nJuan: Dale')
  })

  it('limpia el texto y arma un extracto corto', () => {
    expect(cleanTranscriptText('\uFEFFHola\r\n\r\n\r\n\r\nChau')).toBe('Hola\n\nChau')
    const excerpt = transcriptExcerpt('palabra '.repeat(200), 50)
    expect(excerpt.length).toBeLessThanOrEqual(51)
    expect(excerpt.endsWith('…')).toBe(true)
  })
})
