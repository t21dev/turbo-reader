/**
 * A small fuzzy matcher for names: feeds, folders and settings. Every word of
 * the query must appear in the text, either as a substring or as letters in
 * order ("mkubr" finds "make use of", "drk" finds "dark"). Returns a score,
 * higher is better, or null for no match. Kept simple on purpose: no
 * dictionary, no typo distance, so results are predictable.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0
  const t = text.toLowerCase()
  let total = 0
  for (const w of words) {
    const s = wordScore(w, t)
    if (s === null) return null
    total += s
  }
  // Shorter texts win ties: "Dark" beats "Dark mode for the reader".
  return total - t.length * 0.05
}

function wordScore(w: string, t: string): number | null {
  const at = t.indexOf(w)
  if (at >= 0) {
    // A substring: best at the start of the text or of a word.
    const wordStart = at === 0 || /[\s\-_./>]/.test(t[at - 1])
    return 100 + w.length * 4 + (at === 0 ? 30 : wordStart ? 20 : 0)
  }
  // Letters in order, rewarding runs and word starts, penalising gaps.
  let score = 0
  let from = 0
  let last = -2
  for (const ch of w) {
    const pos = t.indexOf(ch, from)
    if (pos < 0) return null
    if (pos === last + 1) score += 6
    else score += Math.max(0, 4 - (pos - last - 1) * 0.5)
    if (pos === 0 || /[\s\-_./>]/.test(t[pos - 1])) score += 5
    last = pos
    from = pos + 1
  }
  return score
}

/** Sort by fuzzy score against the fields given, dropping non-matches. */
export function fuzzyFilter<T>(query: string, items: T[], fields: (item: T) => (string | null | undefined)[]): T[] {
  if (!query.trim()) return items
  const scored: { item: T; score: number }[] = []
  for (const item of items) {
    let best: number | null = null
    for (const f of fields(item)) {
      if (!f) continue
      const s = fuzzyScore(query, f)
      if (s !== null && (best === null || s > best)) best = s
    }
    if (best !== null) scored.push({ item, score: best })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item)
}
