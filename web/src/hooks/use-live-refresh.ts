import { useCallback, useEffect, useRef } from 'react'

export const LIVE_REFRESH_MS = 1000

/** Drops a call when the same loader is already in flight. A new `fn` identity (new args/deps) is allowed through. */
export function useSingleFlight<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  const fnRef = useRef(fn)
  const inFlightRef = useRef(false)
  if (fnRef.current !== fn) {
    fnRef.current = fn
    inFlightRef.current = false
  }

  return useCallback(async (...args: Args) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await fnRef.current(...args)
    } finally {
      inFlightRef.current = false
    }
  }, [fn])
}

export function useLiveRefresh(fn: () => void | Promise<void>, enabled = true, intervalMs = LIVE_REFRESH_MS) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let inFlight = false
    let timer = 0

    function schedule() {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void run()
      }, intervalMs)
    }

    async function run() {
      if (cancelled || inFlight) return
      window.clearTimeout(timer)
      if (document.hidden) {
        schedule()
        return
      }
      inFlight = true
      try {
        await Promise.resolve(fnRef.current())
      } catch {
        // Callers handle their own errors.
      } finally {
        inFlight = false
        if (!cancelled) schedule()
      }
    }

    schedule()

    function onVisibility() {
      if (!document.hidden) void run()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs])
}
