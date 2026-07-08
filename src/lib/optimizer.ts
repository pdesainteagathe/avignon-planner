// Core optimizer.
//
// Problem: we have a set of candidate performances. Each candidate belongs to a
// show and carries that show's satisfaction weight. We must pick a subset such
// that:
//   - at most one performance per show is chosen,
//   - no two chosen performances overlap once each is padded by a buffer
//     (the user is a single person, in one place at a time),
// maximizing the total weight of chosen shows (each show counted once).
//
// This is the Job Interval Selection Problem (NP-hard in general), but real
// instances are tiny and heavily constrained, so an exact branch & bound with
// a greedy warm start solves them instantly. A node cap guarantees termination;
// if hit, we return the best feasible solution found and flag it approximate.

export interface Candidate {
  showId: string
  perfId: string
  /** epoch ms */
  start: number
  /** epoch ms (start + duration) */
  end: number
  weight: number
}

export interface OptimizeResult {
  chosen: Candidate[]
  totalWeight: number
  /** True if the node cap was hit before proving optimality. */
  approximate: boolean
}

function conflictFree(a: Candidate, nextStart: number): boolean {
  return a.start >= nextStart
}

/** Greedy feasible solution, used to warm-start the bound. */
function greedy(items: Candidate[], bufferMs: number): { chosen: Candidate[]; value: number } {
  // Order by weight desc, then earliest end (leaves room for more).
  const order = [...items].sort((a, b) => b.weight - a.weight || a.end - b.end)
  const chosen: Candidate[] = []
  const used = new Set<string>()
  for (const c of order) {
    if (used.has(c.showId)) continue
    const clash = chosen.some(
      (s) => !(c.start >= s.end + bufferMs || s.start >= c.end + bufferMs),
    )
    if (clash) continue
    chosen.push(c)
    used.add(c.showId)
  }
  return { chosen, value: chosen.reduce((s, c) => s + c.weight, 0) }
}

export function optimize(
  candidates: Candidate[],
  bufferMs: number,
  opts: { maxNodes?: number } = {},
): OptimizeResult {
  const maxNodes = opts.maxNodes ?? 3_000_000
  const items = [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)
  const n = items.length

  // suffixWeight[i] = sum over distinct shows appearing in items[i..] of that
  // show's weight. An optimistic (upper) bound on extra value obtainable from i.
  const suffixWeight = new Array<number>(n + 1).fill(0)
  {
    const seen = new Set<string>()
    for (let i = n - 1; i >= 0; i--) {
      const c = items[i]
      suffixWeight[i] = suffixWeight[i + 1] + (seen.has(c.showId) ? 0 : c.weight)
      seen.add(c.showId)
    }
  }

  const warm = greedy(items, bufferMs)
  let best = warm.value
  let bestChosen = warm.chosen

  const used = new Set<string>()
  const chosen: Candidate[] = []
  let nodes = 0
  let approximate = false

  function dfs(i: number, freeAt: number, value: number): void {
    if (approximate) return
    if (++nodes > maxNodes) {
      approximate = true
      return
    }
    // Bound prune: even taking every remaining distinct show can't beat best.
    if (value + suffixWeight[i] <= best) return
    if (i === n) {
      if (value > best) {
        best = value
        bestChosen = chosen.slice()
      }
      return
    }
    const c = items[i]
    // Branch 1: take c, if it fits after the current schedule and its show is free.
    if (conflictFree(c, freeAt) && !used.has(c.showId)) {
      used.add(c.showId)
      chosen.push(c)
      dfs(i + 1, c.end + bufferMs, value + c.weight)
      chosen.pop()
      used.delete(c.showId)
    }
    // Branch 2: skip c.
    dfs(i + 1, freeAt, value)
  }

  dfs(0, -Infinity, 0)

  return {
    chosen: [...bestChosen].sort((a, b) => a.start - b.start),
    totalWeight: best,
    approximate,
  }
}
