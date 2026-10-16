export interface SubtaskUser {
  id: string
  name: string
}

function addDays(d: Date, n: number) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() + n)
  return r
}

function nextDow(d: Date, dow: number) {
  return addDays(d, (dow - d.getDay() + 7) % 7 || 7)
}

const DAYS: Record<string, (d: Date) => Date> = {
  hoy: d => addDays(d, 0),
  mañana: d => addDays(d, 1),
  pasado: d => addDays(d, 2),
  lunes: d => nextDow(d, 1),
  martes: d => nextDow(d, 2),
  miércoles: d => nextDow(d, 3),
  miercoles: d => nextDow(d, 3),
  jueves: d => nextDow(d, 4),
  viernes: d => nextDow(d, 5),
  sábado: d => nextDow(d, 6),
  sabado: d => nextDow(d, 6),
  domingo: d => nextDow(d, 0),
}

function findUser(team: SubtaskUser[], q: string) {
  return team.find(u => u.name.toLowerCase().startsWith(q)) ?? null
}

export function parseSubtask(input: string, team: SubtaskUser[], today = new Date()) {
  let text = input
  let assignee: SubtaskUser | null = null
  let due: Date | null = null

  const m = text.match(/@([\p{L}]+)(?:\s([\p{L}]+))?/u)
  if (m) {
    const first = m[1].toLowerCase()
    const full = m[2] ? `${first} ${m[2].toLowerCase()}` : null
    const byFull = full ? findUser(team, full) : null
    if (byFull) {
      assignee = byFull
      text = text.replace(m[0], ' ')
    } else {
      assignee =
        findUser(team, first) ?? team.find(u => u.name.toLowerCase().split(' ')[0] === first) ?? null
      if (assignee) text = text.replace(`@${m[1]}`, ' ')
    }
  }

  const dm = text.match(/(?:^|\s)(?:el\s|para\s(?:el\s)?)?(\d{1,2})\/(\d{1,2})(?=\s|$)/)
  if (dm) {
    due = new Date(today.getFullYear(), +dm[2] - 1, +dm[1])
    text = text.replace(dm[0], ' ')
  } else {
    for (const k of Object.keys(DAYS)) {
      const r = new RegExp(`(?:^|\\s)(?:el\\s|para\\s(?:el\\s)?)?${k}(?=\\s|$)`, 'i')
      if (r.test(text)) {
        due = DAYS[k](today)
        text = text.replace(r, ' ')
        break
      }
    }
  }

  const mentionQuery = /@([\p{L}]*)$/u.exec(input)?.[1] ?? null
  return {
    title: text.replace(/\s+/g, ' ').trim(),
    assignee,
    due,
    mentionQuery: assignee ? null : mentionQuery,
  }
}

export function trailingMention(input: string) {
  return /(?:^|\s)@([\p{L}]*)$/u.exec(input)?.[1] ?? null
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
