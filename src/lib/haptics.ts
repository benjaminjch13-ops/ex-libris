/**
 * A light tap under the finger on phones that support it (Android; iOS Safari ignores it).
 * Kept short and rare: finishing a book, completing the streak, a scanned code, a returned loan.
 */
const PATTERNS = { tap: 10, success: [12, 40, 18], warn: [30, 60, 30] } as const

export function haptic(kind: keyof typeof PATTERNS = 'tap') {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate?.(PATTERNS[kind] as number | number[])
  } catch { /* not supported */ }
}
