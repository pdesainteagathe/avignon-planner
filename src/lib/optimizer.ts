// Core optimizer.
//
// Problem: we have a set of candidate items on a single timeline. Each belongs
// to a "show" (real show, or a mandatory meal break) and carries a weight. We
// pick a subset such that:
//   - at most one item per show is chosen,
//   - consecutive chosen items are separated by the required gap,
// maximizing total weight (each show counted once).
//
// The gap between two consecutive items is the buffer only when BOTH are real
// shows; a meal break needs no buffer on either side (it is itself the break).
//
// This is the Job Interval Selection Problem (NP-hard in general), but real
// instances are tiny and heavily constrained, so an exact branch & bound with
// a greedy warm start solves them instantly. A node cap guarantees termination.

export interface Candidate {
  showId: string
  perfId: string
  /** epoch ms */
  start: number
  /** epoch ms (start + duration) */
  end: number
  weight: number
  /** True for meal breaks: no inter-show buffer applies around them. */
  isBreak?: boolean
}

export interface OptimizeResult {
  chosen: Candidate[]
  totalWeight: number
  /** True if the node cap was hit before proving optimality. */
  approximate: boolean
}

/** Required gap (ms) between two consecutive items. */
function gap(aBreak: boolean, bBreak: boolean, bufferMs: number): number {
  return aBreak || bBreak ? 0 : bufferMs
}

/** Greedy feasible solution, used to warm-start the bound. */
function greedy(items: Candidate[], bufferMs: number): { chosen: Candidate[]; value: number } {
  const order = [...items].sort((a, b) => b.weight - a.weight || a.end - b.end)
  const chosen: Candidate[] = []
  const used = new Set<string>()
  for (const c of order) {
    if (used.has(c.showId)) continue
    const clash = chosen.some((s) => {
      const g = gap(!!s.isBreak, !!c.isBreak, bufferMs)
      return !(c.start >= s.end + g || s.start >= c.end + g)
    })
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

  // suffixWeight[i] = sum over distinct shows in items[i..] of that show's
  // weight — an optimistic (upper) bound on extra value obtainable from i.
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

  function dfs(i: number, prevEnd: number, prevBreak: boolean, value: number): void {
    if (approximate) return
    if (++nodes > maxNodes) {
      approximate = true
      return
    }
    if (value + suffixWeight[i] <= best) return
    if (i === n) {
      if (value > best) {
        best = value
        bestChosen = chosen.slice()
      }
      return
    }
    const c = items[i]
    // Branch 1: take c, if it fits after the previous item and its show is free.
    if (!used.has(c.showId) && c.start >= prevEnd + gap(prevBreak, !!c.isBreak, bufferMs)) {
      used.add(c.showId)
      chosen.push(c)
      dfs(i + 1, c.end, !!c.isBreak, value + c.weight)
      chosen.pop()
      used.delete(c.showId)
    }
    // Branch 2: skip c.
    dfs(i + 1, prevEnd, prevBreak, value)
  }

  dfs(0, -Infinity, false, 0)

  return {
    chosen: [...bestChosen].sort((a, b) => a.start - b.start),
    totalWeight: best,
    approximate,
  }
}
