// Walking-time buffers between venues, from real lat/lng.

export interface LatLng {
  lat: number
  lng: number
}

export type VenueCoords = Record<string, LatLng>

export interface TravelConfig {
  enabled: boolean
  /** Unhurried walking speed. */
  walkSpeedKmh: number
  /** Never go below this, even for adjacent venues. */
  minBufferMin: number
  /** Fixed overhead (exit hall, find entrance, be seated). */
  marginMin: number
  /** Buffer to use when a venue has no known coordinates. */
  fallbackMin: number
}

const R = 6371000 // Earth radius (m)

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Pure walking time in minutes between two venues (for display), or undefined. */
export function walkMinutes(
  a: LatLng | undefined,
  b: LatLng | undefined,
  walkSpeedKmh: number,
): number | undefined {
  if (!a || !b) return undefined
  const metersPerMin = (walkSpeedKmh * 1000) / 60
  return haversineMeters(a, b) / metersPerMin
}

/** Required buffer (minutes) between two shows at these venues. */
export function travelBufferMin(
  a: LatLng | undefined,
  b: LatLng | undefined,
  cfg: TravelConfig,
): number {
  if (!cfg.enabled) return cfg.fallbackMin
  const walk = walkMinutes(a, b, cfg.walkSpeedKmh)
  if (walk === undefined) return cfg.fallbackMin
  return Math.max(cfg.minBufferMin, Math.ceil(walk + cfg.marginMin))
}
