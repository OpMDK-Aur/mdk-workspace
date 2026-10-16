'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'tasks.activityWidth'
const MIN_WIDTH = 360
const MAX_RATIO = 0.55

/**
 * Width of the task panel's activity column. 0 means "use the CSS clamp default".
 * The value is a per-browser UI preference, so it lives in localStorage.
 */
export function useResizableActivity() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && stored >= MIN_WIDTH) setWidth(stored)
  }, [])

  const startResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const container = containerRef.current
    if (!container || event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setIsResizing(true)
    let latest = 0

    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const max = Math.max(MIN_WIDTH, rect.width * MAX_RATIO)
      latest = Math.round(Math.min(max, Math.max(MIN_WIDTH, rect.right - e.clientX)))
      setWidth(latest)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      setIsResizing(false)
      if (latest) window.localStorage.setItem(STORAGE_KEY, String(latest))
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }, [])

  return { width, isResizing, containerRef, startResize }
}
