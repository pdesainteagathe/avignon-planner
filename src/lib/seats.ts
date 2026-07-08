// Availability thresholds for remaining seats (data-nb-place from Ticket'Off).

export type SeatStatus = 'plenty' | 'low' | 'critical' | 'unknown'

const CRITICAL = 5
const LOW = 15

export function seatStatus(seatsLeft: number | undefined): SeatStatus {
  if (seatsLeft == null) return 'unknown'
  if (seatsLeft <= CRITICAL) return 'critical'
  if (seatsLeft <= LOW) return 'low'
  return 'plenty'
}

/** Short badge label, or null when there's nothing worth showing. */
export function seatLabel(seatsLeft: number | undefined): string | null {
  const status = seatStatus(seatsLeft)
  if (status === 'critical') return `plus que ${seatsLeft} places !`
  if (status === 'low') return `${seatsLeft} places restantes`
  return null // plenty / unknown → don't clutter
}

/** True when a booking is worth doing soon (favourite filling up). */
export function isFillingUp(seatsLeft: number | undefined): boolean {
  const s = seatStatus(seatsLeft)
  return s === 'low' || s === 'critical'
}
