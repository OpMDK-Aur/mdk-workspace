'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutate } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { getMissingTimerFields, TimerValidationError } from './validate-timer'

export const TIMER_ACTIVE_ERROR = 'TIMER_ACTIVE'

const TASK_TIME_KEY = '/api/tasks/time-totals'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: string | null | undefined): value is string => Boolean(value && UUID_RE.test(value))

let colaboradorCache: { email: string; id: string } | null = null
let colaboradorPromise: Promise<string | null> | null = null
let hasFullEntries = false

async function getSessionEmail(): Promise<string | null> {
  // getSession reads the locally stored session (no network round trip); RLS still validates the JWT server-side.
  const { data: { session } } = await createClient().auth.getSession()
  return session?.user?.email ?? null
}

/** colaboradores.id of the signed-in user, looked up once per session instead of on every timer action. */
async function getMyColaboradorId(): Promise<string | null> {
  const email = await getSessionEmail()
  if (!email) return null
  if (colaboradorCache?.email === email) return colaboradorCache.id
  if (!colaboradorPromise) {
    colaboradorPromise = Promise.resolve(
      createClient().from('colaboradores').select('id').eq('email', email).maybeSingle(),
    )
      .then(({ data }) => {
        if (data?.id) colaboradorCache = { email, id: data.id }
        return data?.id ?? null
      })
      .finally(() => {
        colaboradorPromise = null
      })
  }
  return colaboradorPromise
}

type TaskTimeTotals = Record<string, { total: number; mine: number }>

/** Adds the just-stopped time to the cached task totals so views update without rescanning every entry. */
function addToTaskTotals(taskId: string | null, seconds: number) {
  if (!isUuid(taskId) || seconds <= 0) return
  void mutate<TaskTimeTotals>(
    TASK_TIME_KEY,
    (current) => {
      if (!current) return current
      const prev = current[taskId] ?? { total: 0, mine: 0 }
      return { ...current, [taskId]: { total: prev.total + seconds, mine: prev.mine + seconds } }
    },
    { revalidate: false },
  )
}

export interface TimeEntry {
  id: string
  colaborador_id: string | null
  cliente_id: string | null
  tipo_tarea_id: string | null
  tarea_id?: string | null
  descripcion: string
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  facturable: boolean
}

interface TimerState {
  // Timer state
  isRunning: boolean
  startedAt: string | null
  currentEntryId: string | null
  description: string
  clientId: string | null
  tipoTareaId: string | null
  billable: boolean
  taskId: string | null
  /** When set (2+ ids), the running time is split evenly across these clients on stop. */
  splitClientIds: string[] | null

  // Entries (local cache)
  entries: TimeEntry[]
  isLoading: boolean
  showValidationErrors: boolean

  // Actions
  startTimer: () => Promise<void>
  stopTimer: () => Promise<void>
  setDescription: (desc: string) => void
  setClientId: (id: string | null) => Promise<void>
  setTipoTareaId: (id: string | null) => Promise<void>
  toggleBillable: () => void
  continueEntry: (entry: TimeEntry) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  updateEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  /** With `limit`, only the most recent entries are fetched (enough for the timer bar). */
  loadEntries: (options?: { limit?: number }) => Promise<void>

  // Task-specific actions
  startTimerForTask: (taskId: string, taskTitle: string, clientId: string | null, tipoTareaId: string | null, splitClientIds?: string[]) => Promise<void>
  syncRunningEntry: () => Promise<boolean>

  // Computed
  getElapsedSeconds: () => number
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      // Initial state
      isRunning: false,
      startedAt: null,
      currentEntryId: null,
      description: '',
      clientId: null,
      tipoTareaId: null,
      billable: true,
      taskId: null,
      splitClientIds: null,
      entries: [],
      isLoading: false,
      showValidationErrors: false,

      startTimer: async () => {
        const state = get()
        const missing = getMissingTimerFields(state)
        if (missing.length > 0) {
          set({ showValidationErrors: true })
          throw new TimerValidationError(missing)
        }
        const supabase = createClient()
        const startedAt = new Date().toISOString()
        const colaboradorId = await getMyColaboradorId()

        const { data: newEntry, error } = await supabase
          .from('entradas_de_tiempo')
          .insert({
            colaborador_id: colaboradorId,
            cliente_id: state.clientId,
            tipo_tarea_id: state.tipoTareaId,
            tarea_id: state.taskId,
            descripcion: state.description.trim(),
            iniciado_en: startedAt,
            finalizado_en: null,
            duracion_seg: null,
            facturable: state.billable,
          })
          .select()
          .single()

        if (error) {
          console.error('[v0] Error creating time entry:', error)
          throw new Error(error.message || 'No se pudo iniciar el timer.')
        }

        set({
          isRunning: true,
          startedAt: startedAt,
          currentEntryId: newEntry.id,
          showValidationErrors: false,
          entries: [newEntry as TimeEntry, ...get().entries],
        })
      },

      stopTimer: async () => {
        const state = get()

        // Always clear local state first to prevent phantom timers
        const clearState = {
          isRunning: false,
          startedAt: null,
          currentEntryId: null,
          description: '',
          clientId: null,
          tipoTareaId: null,
          billable: true,
          taskId: null,
          splitClientIds: null,
        }

        if (!state.startedAt) {
          set(clearState)
          return
        }

        const finalizado_en = new Date().toISOString()
        const startTime = new Date(state.startedAt).getTime()
        const endTime = new Date(finalizado_en).getTime()
        const duracion_seg = Math.floor((endTime - startTime) / 1000)

        const supabase = createClient()
        let entryIdToUpdate = state.currentEntryId

        if (!entryIdToUpdate) {
          const { data: runningEntries } = await supabase
            .from('entradas_de_tiempo')
            .select('id')
            .is('finalizado_en', null)
            .order('iniciado_en', { ascending: false })
            .limit(1)

          if (runningEntries && runningEntries.length > 0) {
            entryIdToUpdate = runningEntries[0].id
          }
        }

        const split = state.splitClientIds && state.splitClientIds.length > 1 ? state.splitClientIds : null

        if (entryIdToUpdate && split) {
          // Consecutive slices so both duracion_seg and start/end timestamps add up to the real total.
          const base = Math.floor(duracion_seg / split.length)
          const remainder = duracion_seg - base * split.length
          let cursor = startTime
          const slices = split.map((clientId, i) => {
            const seconds = base + (i === 0 ? remainder : 0)
            const from = new Date(cursor).toISOString()
            cursor += seconds * 1000
            return { clientId, seconds, from, to: i === split.length - 1 ? finalizado_en : new Date(cursor).toISOString() }
          })
          const descripcion = state.description || 'Sin descripción'
          const [first, ...rest] = slices

          const { error } = await supabase
            .from('entradas_de_tiempo')
            .update({
              finalizado_en: first.to,
              duracion_seg: first.seconds,
              descripcion,
              cliente_id: first.clientId,
              tipo_tarea_id: state.tipoTareaId,
              facturable: state.billable,
            })
            .eq('id', entryIdToUpdate)
          if (error) {
            console.error('[v0] Error stopping split time entry:', error)
            throw new Error(error.message || 'No se pudo guardar la entrada de tiempo.')
          }

          const cached = get().entries.find((e) => e.id === entryIdToUpdate)
          const original = cached
            ? { colaborador_id: cached.colaborador_id, tarea_id: cached.tarea_id ?? null }
            : (await supabase.from('entradas_de_tiempo').select('colaborador_id, tarea_id').eq('id', entryIdToUpdate).maybeSingle()).data

          const { data: inserted, error: insertError } = await supabase
            .from('entradas_de_tiempo')
            .insert(
              rest.map((s) => ({
                colaborador_id: original?.colaborador_id ?? null,
                tarea_id: original?.tarea_id ?? null,
                cliente_id: s.clientId,
                tipo_tarea_id: state.tipoTareaId,
                descripcion,
                iniciado_en: s.from,
                finalizado_en: s.to,
                duracion_seg: s.seconds,
                facturable: state.billable,
              })),
            )
            .select()
          if (insertError) {
            console.error('[v0] Error inserting split time entries:', insertError)
            // The first slice is already saved; drop the split so a retry doesn't re-slice it.
            set(clearState)
            throw new Error('Se guardó el tiempo del primer cliente pero no el del resto.')
          }

          set((s) => ({
            entries: [
              ...((inserted ?? []) as TimeEntry[]),
              ...s.entries.map((e) =>
                e.id === entryIdToUpdate
                  ? { ...e, finalizado_en: first.to, duracion_seg: first.seconds, cliente_id: first.clientId, descripcion }
                  : e,
              ),
            ],
          }))
        } else if (entryIdToUpdate) {
          const updateData = {
            finalizado_en,
            duracion_seg,
            descripcion: state.description || 'Sin descripción',
            cliente_id: state.clientId,
            tipo_tarea_id: state.tipoTareaId,
            facturable: state.billable,
          }
          
          const { error } = await supabase
            .from('entradas_de_tiempo')
            .update(updateData)
            .eq('id', entryIdToUpdate)

          if (error) {
            console.error('[v0] Error stopping time entry:', error)
            // Do not clear the timer when persistence fails: the user must be able to retry.
            throw new Error(error.message || 'No se pudo guardar la entrada de tiempo.')
          }

          set((s) => ({
            entries: s.entries.map((e) =>
              e.id === entryIdToUpdate
                ? { ...e, ...updateData }
                : e
            ),
          }))
        }

        // Always clear state at the end
        set(clearState)
        if (entryIdToUpdate) addToTaskTotals(state.taskId, duracion_seg)
      },

      setDescription: (desc) => set({ description: desc }),

      setTipoTareaId: async (id) => {
        const state = get()
        set({ tipoTareaId: id })
        
        // Si el timer está corriendo, actualizar la entrada activa en la BD
        if (state.isRunning && state.currentEntryId) {
          const supabase = createClient()
          await supabase
            .from('entradas_de_tiempo')
            .update({ tipo_tarea_id: id })
            .eq('id', state.currentEntryId)
        }
      },

      setClientId: async (id) => {
        const state = get()
        // Picking a single client manually overrides an even split.
        set({ clientId: id, splitClientIds: null })
        
        // Si el timer está corriendo, actualizar la entrada activa en la BD
        if (state.isRunning && state.currentEntryId && id !== state.clientId) {
          const supabase = createClient()
          await supabase
            .from('entradas_de_tiempo')
            .update({ cliente_id: id })
            .eq('id', state.currentEntryId)
        }
      },

      toggleBillable: () => set((s) => ({ billable: !s.billable })),

      continueEntry: async (entry) => {
        const state = get()
        // Always sync with DB first to ensure consistency
        if (state.isRunning || (await get().syncRunningEntry())) {
          throw new Error(TIMER_ACTIVE_ERROR)
        }

        set({
          description: entry.descripcion,
          clientId: entry.cliente_id,
          tipoTareaId: entry.tipo_tarea_id,
          billable: entry.facturable,
        })
        await get().startTimer()
      },

      startTimerForTask: async (taskId: string, taskTitle: string, clientId: string | null, tipoTareaId: string | null, splitClientIds?: string[]) => {
        if (get().isRunning) {
          throw new Error(TIMER_ACTIVE_ERROR)
        }
        const split = splitClientIds && splitClientIds.length > 1 ? splitClientIds : null

        const supabase = createClient()
        const descripcion = `[Tarea] ${taskTitle}`

        const resolveTipo = async () => {
          if (isUuid(tipoTareaId)) return tipoTareaId
          if (!tipoTareaId) return null
          const { data: tipo } = await supabase
            .from('tipo_de_tareas')
            .select('id')
            .ilike('nombre', tipoTareaId)
            .eq('activo', true)
            .maybeSingle()
          return (tipo?.id as string | undefined) ?? null
        }
        const [alreadyRunning, resolvedTipoTareaId, colaboradorId] = await Promise.all([
          get().syncRunningEntry(),
          resolveTipo(),
          getMyColaboradorId(),
        ])
        if (alreadyRunning) {
          throw new Error(TIMER_ACTIVE_ERROR)
        }
        const startedAt = new Date().toISOString()
        const missing = getMissingTimerFields({ description: descripcion, tipoTareaId: resolvedTipoTareaId, clientId })
        if (missing.length > 0) {
          // Preload what the task has so the user only fills the gaps in the timer bar.
          set({
            description: descripcion,
            clientId,
            tipoTareaId: resolvedTipoTareaId,
            billable: true,
            taskId,
            splitClientIds: split,
            showValidationErrors: true,
          })
          throw new TimerValidationError(missing)
        }

        const { data: newEntry, error } = await supabase
          .from('entradas_de_tiempo')
          .insert({
            colaborador_id: colaboradorId,
            cliente_id: clientId,
            tipo_tarea_id: resolvedTipoTareaId,
            tarea_id: isUuid(taskId) ? taskId : null,
            descripcion,
            iniciado_en: startedAt,
            finalizado_en: null,
            duracion_seg: null,
            facturable: true,
          })
          .select()
          .single()

        if (error) {
          console.error('Error creating time entry for task:', error)
          throw new Error(error.message || 'No se pudo iniciar el timer.')
        }

        set({
          showValidationErrors: false,
          description: descripcion,
          clientId: clientId,
          tipoTareaId: resolvedTipoTareaId,
          billable: true,
          taskId: taskId,
          splitClientIds: split,
          isRunning: true,
          startedAt: startedAt,
          currentEntryId: newEntry.id,
          entries: [newEntry as TimeEntry, ...get().entries],
        })
      },

      // Lightweight check against the DB so a timer started in another tab,
      // device or page is detected even if local persisted state is stale.
      syncRunningEntry: async () => {
        const supabase = createClient()
        const colaboradorId = await getMyColaboradorId()
        if (!colaboradorId) return get().isRunning

        const { data: running } = await supabase
          .from('entradas_de_tiempo')
          .select('*')
          .eq('colaborador_id', colaboradorId)
          .is('finalizado_en', null)
          .order('iniciado_en', { ascending: false })
          .limit(1)
          .maybeSingle()

        const MAX_AGE_MS = 24 * 60 * 60 * 1000
        const startMs = running?.iniciado_en ? new Date(running.iniciado_en).getTime() : NaN
        const isValid = Boolean(running) && !isNaN(startMs) && Date.now() - startMs < MAX_AGE_MS

        if (isValid && running) {
          const state = get()
          if (state.currentEntryId !== running.id || !state.isRunning) {
            set({
              isRunning: true,
              startedAt: running.iniciado_en,
              currentEntryId: running.id,
              description: running.descripcion ?? '',
              clientId: running.cliente_id ?? null,
              tipoTareaId: running.tipo_tarea_id ?? null,
              billable: running.facturable ?? true,
              taskId: running.tarea_id ?? (state.currentEntryId === running.id ? state.taskId : null),
              splitClientIds: state.currentEntryId === running.id ? state.splitClientIds : null,
            })
          }
          return true
        }

        if (get().isRunning) {
          set({
            isRunning: false,
            startedAt: null,
            currentEntryId: null,
            description: '',
            clientId: null,
            tipoTareaId: null,
            billable: true,
            taskId: null,
            splitClientIds: null,
          })
        }
        return false
      },

      deleteEntry: async (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
        const supabase = createClient()
        await supabase.from('entradas_de_tiempo').delete().eq('id', id)
      },

      updateEntry: async (id, updates) => {
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }))
        const supabase = createClient()
        await supabase.from('entradas_de_tiempo').update(updates).eq('id', id)
      },

      loadEntries: async (options) => {
        const limit = options?.limit
        set({ isLoading: true })
        try {
          const supabase = createClient()
          
          const email = await getSessionEmail()
          if (!email) {
            // Clear timer state if no user
            set({ 
              entries: [], 
              isLoading: false,
              isRunning: false,
              startedAt: null,
              currentEntryId: null,
              description: '',
              clientId: null,
              tipoTareaId: null,
              billable: true,
              taskId: null,
              splitClientIds: null,
            })
            return
          }
          
          // Use colaboradores.id consistently; it is the foreign key in entradas_de_tiempo.
          const colaboradorId = await getMyColaboradorId()
          if (!colaboradorId) {
            set({ entries: [], isLoading: false })
            return
          }

          const pageSize = limit ?? 1000
          const allEntries: TimeEntry[] = []
          let page = 0
          let error: { message?: string } | null = null

          while (true) {
            const from = page * pageSize
            const to = from + pageSize - 1
            const { data: pageEntries, error: pageError } = await supabase
              .from('entradas_de_tiempo')
              .select('*')
              .eq('colaborador_id', colaboradorId)
              .order('iniciado_en', { ascending: false })
              .range(from, to)

            if (pageError) {
              error = pageError
              break
            }
            allEntries.push(...(pageEntries ?? []))
            if (limit || !pageEntries || pageEntries.length < pageSize) break
            page += 1
          }

          if (!error) {
            // Filter out entries with invalid iniciado_en
            const validEntries = allEntries.filter((e) => e.iniciado_en && !isNaN(new Date(e.iniciado_en).getTime()))
            // A recent-only load must not shrink a full history another view already loaded.
            if (!limit) hasFullEntries = true
            if (!limit || !hasFullEntries) set({ entries: validEntries })

            // Check if there's actually a running entry in the database
            const runningEntry = validEntries.find((e) => e.finalizado_en === null)
            if (runningEntry) {
              // Validate that the running entry is not too old (more than 24 hours)
              const startTime = new Date(runningEntry.iniciado_en).getTime()
              const elapsed = Date.now() - startTime
              const MAX_REASONABLE_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
              
              if (elapsed > MAX_REASONABLE_MS || elapsed < 0) {
                // Entry is too old or invalid - auto-stop it
                console.warn('[Timer] Found stale running entry, auto-stopping:', runningEntry.id)
                const supabase = createClient()
                const now = new Date().toISOString()
                await supabase
                  .from('entradas_de_tiempo')
                  .update({ 
                    finalizado_en: now, 
                    duracion_seg: Math.min(Math.floor(elapsed / 1000), MAX_REASONABLE_MS / 1000) 
                  })
                  .eq('id', runningEntry.id)
                
                // Clear local timer state
                set({
                  isRunning: false,
                  startedAt: null,
                  currentEntryId: null,
                  description: '',
                  clientId: null,
                  tipoTareaId: null,
                  billable: true,
                  taskId: null,
                  splitClientIds: null,
                })
              } else {
                // Sync local state with the actual running entry from DB
                set({
                  isRunning: true,
                  startedAt: runningEntry.iniciado_en,
                  currentEntryId: runningEntry.id,
                  description: runningEntry.descripcion,
                  clientId: runningEntry.cliente_id,
                  tipoTareaId: runningEntry.tipo_tarea_id,
                  billable: runningEntry.facturable,
                })
              }
            } else {
              // No running entry in DB - clear local timer state
              // This fixes the issue where localStorage says timer is running but DB says otherwise
              set({
                isRunning: false,
                startedAt: null,
                currentEntryId: null,
                description: '',
                clientId: null,
                tipoTareaId: null,
                billable: true,
                taskId: null,
                splitClientIds: null,
              })
            }
          } else {
            // Error loading or no data - clear timer state to be safe
            set({
              isRunning: false,
              startedAt: null,
              currentEntryId: null,
            })
          }
        } catch (err) {
          console.error('Error loading entries:', err)
          // On error, clear timer state to prevent phantom timers
          set({
            isRunning: false,
            startedAt: null,
            currentEntryId: null,
          })
        } finally {
          set({ isLoading: false })
        }
      },

      getElapsedSeconds: () => {
        const state = get()
        if (!state.isRunning || !state.startedAt) return 0
        
        const startTime = new Date(state.startedAt).getTime()
        // Validate startedAt is not invalid or too old (more than 24 hours)
        if (isNaN(startTime)) return 0
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        
        // If elapsed time is more than 24 hours, something is wrong - return 0
        // and trigger a state reset
        const MAX_REASONABLE_SECONDS = 24 * 60 * 60 // 24 hours
        if (elapsed > MAX_REASONABLE_SECONDS || elapsed < 0) {
          // Schedule state reset (can't call set directly in getter)
          setTimeout(() => {
            const currentState = get()
            if (currentState.isRunning && currentState.startedAt === state.startedAt) {
              set({
                isRunning: false,
                startedAt: null,
                currentEntryId: null,
                description: '',
                clientId: null,
                tipoTareaId: null,
                billable: true,
                taskId: null,
                splitClientIds: null,
              })
            }
          }, 0)
          return 0
        }
        
        return elapsed
      },
    }),
    {
      name: 'mdk-timer-storage',
      skipHydration: true,
      partialize: (state) => ({
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        currentEntryId: state.currentEntryId,
        description: state.description,
        clientId: state.clientId,
        tipoTareaId: state.tipoTareaId,
        billable: state.billable,
        taskId: state.taskId,
        splitClientIds: state.splitClientIds,
      }),
    }
  )
)
