/**
 * Great-circle distance (Milestone 5 — Nearby).
 *
 * Honesty note: distances are only meaningful between APPROVED coordinates.
 * "Near" is never computed against guessed or interpolated positions.
 */

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function withinRadiusMeters(
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
  radiusMeters: number,
): boolean {
  return haversineMeters(origin, target) <= radiusMeters;
}

export function formatKm(meters: number): string {
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
