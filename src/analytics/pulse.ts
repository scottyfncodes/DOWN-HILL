/**
 * HaveAnApp Pulse product events. The tracker itself is loaded by the
 * snippet in index.html (data-app="downhill"); this only queues events
 * through its global. Events carry short tokens only: no coordinates,
 * timings or anything about the person.
 */

type Props = Record<string, string | number | boolean>

declare global {
  interface Window {
    pulse?: (name: string, props?: Props) => void
  }
}

export function track(name: string, props?: Props) {
  try {
    window.pulse?.(name, props)
  } catch {
    /* analytics must never affect play */
  }
}
