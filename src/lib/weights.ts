import type { WeightMode } from '../types'

/**
 * Convert a 0-based preference rank into a satisfaction weight.
 * Rank 0 = top choice → highest weight.
 *
 * - `balanced`: linear points (N, N-1, …, 1). Balances "see more shows"
 *   against "see my favourites".
 * - `top-priority`: squared points, so higher-ranked shows dominate and are
 *   rarely sacrificed to fit several lower-ranked ones.
 */
export function weightForRank(rank: number, total: number, mode: WeightMode): number {
  const base = total - rank // rank 0 → total, last → 1
  return mode === 'top-priority' ? base * base : base
}
