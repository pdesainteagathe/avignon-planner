// Core optimizer.
//
// Problem: candidate items on a single timeline. Each belongs to a "show" (real
// show or a mandatory meal break) and carries a weight. Pick a subset such that:
//   - at most one item per show is chosen,
//   - consecutive chosen items are separated by the required gap,
// maximizing total weight (each show counted once).
//
// The gap between two consecutive items is 0 when either is a meal break;
// otherwise it is either a fixed buffer or, when a `gapMs` function is supplied,
// a pair-dependent value (e.g. walking time between the two venues).
//
// Job Interval Selection Problem (NP-hard), but instances are tiny and heavily
// constrained: exact branch & bound with a greedy warm start + node cap.

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
  /** Venue key, used by a pair-dependent gap function. */
  venueKey?: string
}

export interface OptimizeOptions {
  maxNodes?: number
  /** Required gap (ms) between two real shows a→b. Overrides the fixed buffer. */
  gapMs?: (a: Candidate, b: Candidate) => number
}

export interface OptimizeResult {
  chosen: Candidate[]
  totalWeight: number
  approximate: boolean
}

export function optimize(
  candidates: Candidate[],
  bufferMs: number,
  opts: OptimizeOptions = {},
): OptimizeResult {
  const maxNodes = opts.maxNodes ?? 3_000_000
  const gapFn = (a: Candidate, b: Candidate): number =>
    a.isBreak || b.isBreak ? 0 : opts.gapMs ? opts.gapMs(a, b) : bufferMs

  const items = [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)
  const n = items.length

  const suffixWeight = new Array<number>(n + 1).fill(0)
  {
    const seen = new Set<string>()
    for (let i = n - 1; i >= 0; i--) {
      const c = items[i]
      suffixWeight[i] = suffixWeight[i + 1] + (seen.has(c.showId) ? 0 : c.weight)
      seen.add(c.showId)
    }
  }

  const warm = greedy(items, gapFn)
  let best = warm.value
  let bestChosen = warm.chosen

  const used = new Set<string>()
  const chosen: Candidate[] = []
  let nodes = 0
  let approximate = false

  function dfs(i: number, prev: Candidate | null, value: number): void {
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
    // Branch 1: take c, if its show is free and it fits after the previous item.
    if (!used.has(c.showId) && (prev === null || c.start >= prev.end + gapFn(prev, c))) {
      used.add(c.showId)
      chosen.push(c)
      dfs(i + 1, c, value + c.weight)
      chosen.pop()
      used.delete(c.showId)
    }
    // Branch 2: skip c.
    dfs(i + 1, prev, value)
  }

  dfs(0, null, 0)

  return {
    chosen: [...bestChosen].sort((a, b) => a.start - b.start),
    totalWeight: best,
    approximate,
  }
}

/** Greedy feasible solution, used to warm-start the bound. */
function greedy(
  items: Candidate[],
  gapFn: (a: Candidate, b: Candidate) => number,
): { chosen: Candidate[]; value: number } {
  const order = [...items].sort((a, b) => b.weight - a.weight || a.end - b.end)
  const chosen: Candidate[] = []
  const used = new Set<string>()
  for (const c of order) {
    if (used.has(c.showId)) continue
    const clash = chosen.some(
      (s) => !(c.start >= s.end + gapFn(s, c) || s.start >= c.end + gapFn(c, s)),
    )
    if (clash) continue
    chosen.push(c)
    used.add(c.showId)
  }
  return { chosen, value: chosen.reduce((s, c) => s + c.weight, 0) }
}
