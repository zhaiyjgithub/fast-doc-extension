/**
 * Deterministic avatar fallback colors from the first character of a display name.
 * Same leading letter (A–Z, case-insensitive) → same palette entry.
 */
const LETTER_PALETTE = [
  'bg-rose-200 text-rose-950 dark:bg-rose-900/55 dark:text-rose-50',
  'bg-orange-200 text-orange-950 dark:bg-orange-900/55 dark:text-orange-50',
  'bg-amber-200 text-amber-950 dark:bg-amber-900/55 dark:text-amber-50',
  'bg-yellow-200 text-yellow-950 dark:bg-yellow-900/50 dark:text-yellow-50',
  'bg-lime-200 text-lime-950 dark:bg-lime-900/50 dark:text-lime-50',
  'bg-green-200 text-green-950 dark:bg-green-900/55 dark:text-green-50',
  'bg-emerald-200 text-emerald-950 dark:bg-emerald-900/55 dark:text-emerald-50',
  'bg-teal-200 text-teal-950 dark:bg-teal-900/55 dark:text-teal-50',
  'bg-cyan-200 text-cyan-950 dark:bg-cyan-900/55 dark:text-cyan-50',
  'bg-sky-200 text-sky-950 dark:bg-sky-900/55 dark:text-sky-50',
  'bg-blue-200 text-blue-950 dark:bg-blue-900/55 dark:text-blue-50',
  'bg-indigo-200 text-indigo-950 dark:bg-indigo-900/55 dark:text-indigo-50',
  'bg-violet-200 text-violet-950 dark:bg-violet-900/55 dark:text-violet-50',
  'bg-purple-200 text-purple-950 dark:bg-purple-900/55 dark:text-purple-50',
  'bg-fuchsia-200 text-fuchsia-950 dark:bg-fuchsia-900/55 dark:text-fuchsia-50',
  'bg-pink-200 text-pink-950 dark:bg-pink-900/55 dark:text-pink-50',
  'bg-rose-300 text-rose-950 dark:bg-rose-800/60 dark:text-rose-50',
  'bg-orange-300 text-orange-950 dark:bg-orange-800/60 dark:text-orange-50',
  'bg-amber-300 text-amber-950 dark:bg-amber-800/60 dark:text-amber-50',
  'bg-lime-300 text-lime-950 dark:bg-lime-800/55 dark:text-lime-50',
  'bg-emerald-300 text-emerald-950 dark:bg-emerald-800/55 dark:text-emerald-50',
  'bg-cyan-300 text-cyan-950 dark:bg-cyan-800/55 dark:text-cyan-50',
  'bg-sky-300 text-sky-950 dark:bg-sky-800/55 dark:text-sky-50',
  'bg-indigo-300 text-indigo-950 dark:bg-indigo-800/55 dark:text-indigo-50',
  'bg-violet-300 text-violet-950 dark:bg-violet-800/55 dark:text-violet-50',
  'bg-slate-300 text-slate-950 dark:bg-slate-700/70 dark:text-slate-50',
] as const

function paletteIndexForFirstChar(first: string): number {
  if (!first) return 0
  const upper = first.toUpperCase()
  if (upper >= 'A' && upper <= 'Z') {
    return upper.charCodeAt(0) - 65
  }
  return Math.abs(first.codePointAt(0) ?? 0) % LETTER_PALETTE.length
}

/** Tailwind classes for `AvatarFallback` (replaces default `bg-muted`). */
export function avatarFallbackClassForName(name: string): string {
  const first = name.trim().slice(0, 1)
  return LETTER_PALETTE[paletteIndexForFirstChar(first)] ?? LETTER_PALETTE[0]
}
