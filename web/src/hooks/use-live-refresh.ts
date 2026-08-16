import { useEffect, useRef } from 'react'

export const LIVE_REFRESH_MS = 1000

export function useLiveRefresh(fn: () => void | Promise<void>, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let inFlight = false

    async function run() {
      if (cancelled || inFlight || document.hidden) return
      inFlight = true
      try {
        await fnRef.current()
      } finally {
        inFlight = false
      }
    }

    const timer = window.setInterval(() => {
      void run()
    }, LIVE_REFRESH_MS)

    function onVisibility() {
      if (!document.hidden) void run()
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}
