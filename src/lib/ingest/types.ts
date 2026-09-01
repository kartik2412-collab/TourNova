/**
 * Intermediate representation of a parsed source record before validation.
 *
 * `raw` keeps the verbatim claimed fields from the source so nothing the source
 * said is lost; `key` is the canonical entityId used for dedup, change detection
 * and cross-source conflict detection.
 */

export interface RawDestination {
  entityType: string;
  /** Claimed name as appearing on the source. */
  name: string;
  /** Canonical entityId (slug of name + district). */
  key: string;
  /**
   * Optional full-identity key used ONLY for within-run duplicate detection.
   * Some sources (e.g. the ASI numbered register) list distinct entities that
   * share a name+district; the canonical `key` stays as the cross-source
   * "same thing" identifier while this key keeps such rows apart.
   */
  duplicateKey?: string;
  districtName?: string | null;
  locality?: string | null;
  referenceUrl?: string | null;
  category?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Verbatim fields as parsed, for provenance and audit. */
  raw: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface NormalizedDestination {
  name: string;
  category?: string | null;
  districtName?: string | null;
  locality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  referenceUrl?: string | null;
  description?: string | null;
}
