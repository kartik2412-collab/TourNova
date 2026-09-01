/**
 * Regional boundaries used to sanity-check candidate coordinates.
 *
 * These are mechanical plausibility guards (is a candidate even inside the
 * region we operate in?), NOT accuracy checks. Gujarat roughly spans
 * 20.0°N–24.8°N and 68.0°E–74.6°E. The `evaluateCandidate` helper expands the
 * box by a small margin so a coordinate sitting on the boundary is not
 * rejected outright.
 */

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export const GUJARAT_BOUNDS: Bounds = {
  minLat: 20.0,
  maxLat: 24.8,
  minLon: 68.0,
  maxLon: 74.6,
};

export const INDIA_BOUNDS: Bounds = {
  minLat: 6.5,
  maxLat: 37.5,
  minLon: 68.0,
  maxLon: 97.5,
};

export function isInside(value: { latitude: number; longitude: number }, bounds: Bounds): boolean {
  return (
    value.latitude >= bounds.minLat &&
    value.latitude <= bounds.maxLat &&
    value.longitude >= bounds.minLon &&
    value.longitude <= bounds.maxLon
  );
}

export function expanded(bounds: Bounds, degrees: number): Bounds {
  const EPS = 1e-9;
  return {
    minLat: bounds.minLat - degrees - EPS,
    maxLat: bounds.maxLat + degrees + EPS,
    minLon: bounds.minLon - degrees - EPS,
    maxLon: bounds.maxLon + degrees + EPS,
  };
}
