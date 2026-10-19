import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/tasks/subtasks-api'
import type { DesignAssignee } from '@/lib/conexa/agents/creative-strategy-types'

type ColaboradorRow = {
  id: string
  nombre: string | null
  apellido: string | null
  avatar_url: string | null
  departamentos: { nombre: string | null } | { nombre: string | null }[] | null
}

const isDesignDepartment = (name: string | null | undefined) => !!name && /dise[ñn]o/i.test(name)

export async function GET() {
  const { supabase, error } = await requireUser()
  if (error) return error

  const [{ data: people, error: peopleError }, { data: recentTasks }] = await Promise.all([
    supabase.from('colaboradores').select('id, nombre, apellido, avatar_url, departamentos(nombre)').eq('activo', true).order('nombre'),
    supabase.from('tareas').select('asignado_a, tipo_de_tareas:tipo_tarea_id(nombre)').not('asignado_a', 'is', null).order('created_at', { ascending: false }).limit(60),
  ])
  if (peopleError) return NextResponse.json({ error: 'No pudimos leer el equipo' }, { status: 500 })

  const recentIds = new Set(
    (recentTasks ?? [])
      .filter((task) => {
        const type = task.tipo_de_tareas as { nombre?: string | null } | { nombre?: string | null }[] | null
        const name = Array.isArray(type) ? type[0]?.nombre : type?.nombre
        return isDesignDepartment(name)
      })
      .map((task) => task.asignado_a as string),
  )

  const assignees: DesignAssignee[] = ((people ?? []) as ColaboradorRow[]).map((person) => {
    const department = Array.isArray(person.departamentos) ? person.departamentos[0] : person.departamentos
    return {
      id: person.id,
      name: [person.nombre, person.apellido].filter(Boolean).join(' ') || 'Sin nombre',
      avatarUrl: person.avatar_url,
      isDesign: isDesignDepartment(department?.nombre),
      recent: recentIds.has(person.id),
    }
  })

  assignees.sort((a, b) => Number(b.isDesign) - Number(a.isDesign) || Number(b.recent) - Number(a.recent) || a.name.localeCompare(b.name))
  return NextResponse.json({ assignees })
}
