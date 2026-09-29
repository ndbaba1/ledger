import type { Signal, SignalKind, SignalMatch, TeamRecord } from '../api/types'

export const SIGNAL_KINDS: { kind: SignalKind; label: string; example: string }[] = [
  { kind: 'alert', label: 'Alert', example: 'CheckoutP99High' },
  { kind: 'metric', label: 'Metric', example: 'pgbouncer_pools_client_waiting_connections' },
  { kind: 'error', label: 'Error', example: 'FATAL: sorry, too many clients already' },
  { kind: 'log', label: 'Log line', example: 'worker 12 timed out after 30s' },
]

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  alert: 'Alert',
  metric: 'Metric',
  error: 'Error',
  log: 'Log',
}

/**
 * Normalize an alert or error so the same problem matches across occurrences:
 * lowercase, split CamelCase and snake_case, and replace the parts that change
 * every time (numbers, hex ids, UUIDs, IPs, quoted values) with placeholders.
 */
export function normalizeSignal(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, ' <id> ')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, ' <ip> ')
    .replace(/\b0x[0-9a-f]+\b|\b[0-9a-f]{10,}\b/g, ' <id> ')
    .replace(/"[^"]*"|'[^']*'/g, ' <value> ')
    .replace(/(?<![a-z0-9])\d+(?:\.\d+)?(?:ms|s|m|h|%|kb|mb|gb)?\b/g, ' <n> ')
    .replace(/[_\-:=/,.()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WEAK = new Set(['<n>', '<id>', '<ip>', '<value>', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'is', 'at', 'and', 'or', 'error', 'fatal', 'warn', 'warning', 'info'])

function tokens(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t && !WEAK.has(t))
}

/**
 * How well a pasted alert or error matches a stored signal, from 0 to 1.
 * 1 = same after normalization, or the stored signal appears whole in the paste.
 */
export function signalScore(pasted: string, signal: Signal): number {
  const a = normalizeSignal(pasted)
  const b = normalizeSignal(signal.value)
  if (!a || !b) return 0
  if (a === b || a.includes(b)) return 1
  const ta = new Set(tokens(a))
  const tb = tokens(b)
  if (!tb.length || !ta.size) return 0
  const shared = tb.filter((t) => ta.has(t)).length
  // Share of the stored signal found in the paste, lightly penalised when the paste is much longer.
  const coverage = shared / tb.length
  const precision = shared / ta.size
  return Math.round((0.8 * coverage + 0.2 * precision) * 100) / 100
}

export function strengthOf(score: number): SignalMatch['strength'] | null {
  if (score >= 0.99) return 'exact'
  if (score >= 0.6) return 'strong'
  if (score >= 0.35) return 'partial'
  return null
}

/** Records whose signals match the pasted text, best first. One entry per record. */
export function matchRecords(pasted: string, records: TeamRecord[]): SignalMatch[] {
  if (!pasted.trim()) return []
  const out: SignalMatch[] = []
  for (const record of records) {
    let best: { signal: Signal; score: number } | null = null
    for (const signal of record.signals ?? []) {
      const score = signalScore(pasted, signal)
      if (!best || score > best.score) best = { signal, score }
    }
    const strength = best && strengthOf(best.score)
    if (best && strength) out.push({ record, signal: best.signal, score: best.score, strength })
  }
  return out.sort((a, b) => b.score - a.score || b.record.publishedAt.localeCompare(a.record.publishedAt))
}
