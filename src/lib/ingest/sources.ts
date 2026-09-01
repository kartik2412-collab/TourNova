import { sourceClassificationEnum, sourceAccessMethodEnum } from "@/lib/db/schema";

/**
 * Source registry for the ingestion pipeline (Milestone 3B).
 *
 * Every entry documents the REAL source it fetches: organization, official URL,
 * licence/usage terms, access method, coverage and freshness. These values are
 * researched facts recorded in docs/DATA_SOURCES.md — not guesses. Nothing here
 * classifies a source as trusted; the pipeline seeds classification/reliability
 * as UNKNOWN and the source only becomes PUBLISHABLE through the existing admin
 * workflow.
 */

export interface IngestSourceConfig {
  /** Stable key used to reference the source from CLI/scripts. */
  key: string;
  name: string;
  organizationName: string;
  /** Official URL of the source itself (registry reference URL). */
  referenceUrl: string;
  classification: string;
  license: string;
  usageTerms: string;
  accessMethod: string;
  geographicCoverage: string;
  freshnessClass: string;
  updateFrequency: string;
  /** Pages to fetch; each may map to a concept category for normalizers. */
  fetchTargets: { url: string; category?: string | null }[];
  parser: "gujarat-trail" | "asi-lines";
  /** For documents bundling several sections, keep only this heading's section. */
  sectionHeading?: string;
  entityType: "destination";
  notes?: string;
}

/** Concept categories understood by the normalizer/validation rules. */
export const SUPPORTED_CATEGORIES = [
  "beaches",
  "bird_watching",
  "flora_fauna",
  "gandhi_circuit",
  "heritage",
  "religious",
  "buddhist_circuit",
  "unesco_world_heritage",
  "indus_valley",
  "weekend_getaway",
  "museums",
  "golf_tourism",
  "art_craft",
  "cuisine",
  "wellness",
  "local_attraction",
  "other",
] as const;

export type IngestCategory = (typeof SUPPORTED_CATEGORIES)[number];

const GT_REFERENCE_URL = "https://www.gujarattourism.com/";

export const INGEST_SOURCE_REGISTRY: Record<string, IngestSourceConfig> = {
  "gujarat-tourism": {
    key: "gujarat-tourism",
    name: "Gujarat Tourism — destination listings",
    organizationName: "Tourism Corporation of Gujarat Ltd (TCGL)",
    referenceUrl: GT_REFERENCE_URL,
    classification: sourceClassificationEnum.OFFICIAL_AUTHORITY,
    license: "Copyright © TCGL — reproduction by prior written permission",
    usageTerms:
      "Reproduce only with prior written permission from TCGL; content must be reproduced accurately, never in a misleading or derogatory context, and the source must be prominently acknowledged. Third-party copyrighted material is excluded. Automated scraping is not documented as permitted; ingestion is staged for manual review.",
    accessMethod: sourceAccessMethodEnum.WEBPAGE,
    geographicCoverage: "STATE",
    freshnessClass: "default",
    updateFrequency: "ON_UPDATE",
    parser: "gujarat-trail",
    entityType: "destination",
    fetchTargets: [
      { url: "https://www.gujarattourism.com/beaches.html", category: "beaches" },
      { url: "https://www.gujarattourism.com/bird-watching-sites.html", category: "bird_watching" },
      { url: "https://www.gujarattourism.com/flora-fauna.html", category: "flora_fauna" },
      { url: "https://www.gujarattourism.com/gandhi-circuit.html", category: "gandhi_circuit" },
      { url: "https://www.gujarattourism.com/heritage-sites.html", category: "heritage" },
      { url: "https://www.gujarattourism.com/religious-site.html", category: "religious" },
      { url: "https://www.gujarattourism.com/buddhist-circuit.html", category: "buddhist_circuit" },
      {
        url: "https://www.gujarattourism.com/unesco-world-heritage-site.html",
        category: "unesco_world_heritage",
      },
      {
        url: "https://www.gujarattourism.com/indus-valley-civilization-sites.html",
        category: "indus_valley",
      },
      { url: "https://www.gujarattourism.com/weekend-get-aways.html", category: "weekend_getaway" },
      { url: "https://www.gujarattourism.com/museums.html", category: "museums" },
      { url: "https://www.gujarattourism.com/golf-tourism.html", category: "golf_tourism" },
      { url: "https://www.gujarattourism.com/handicrafts.html", category: "art_craft" },
      { url: "https://www.gujarattourism.com/gujarati-cuisines.html", category: "cuisine" },
      { url: "https://www.gujarattourism.com/wellness-tourism.html", category: "wellness" },
    ],
    notes:
      "Destination listing pages under 'Pick Your Trail'. Only names, districts and reference URLs are extracted — no fabricated facts. See docs/DATA_SOURCES.md.",
  },
  "asi-gujarat": {
    key: "asi-gujarat",
    name: "ASI — Centrally Protected Monuments / Sites of Gujarat",
    organizationName: "Archaeological Survey of India (ASI)",
    referenceUrl: "https://asi.nic.in/admin/whatsnew/download/719",
    classification: sourceClassificationEnum.OFFICIAL_GOVERNMENT,
    license: "Government of India publication — no explicit open-data licence",
    usageTerms:
      "Centrally protected monuments list is a Government of India publication under the Ancient Monuments and Archaeological Sites and Remains Act, 1958. No explicit machine-readable reuse licence is granted; reuse follows GoI disclosure policy with attribution to ASI. Automated download is limited to this single public document.",
    accessMethod: sourceAccessMethodEnum.DOCUMENT,
    geographicCoverage: "STATE",
    freshnessClass: "default",
    updateFrequency: "ON_UPDATE",
    parser: "asi-lines",
    sectionHeading: "Gujarat (Vadodara Circle and Rajkot Circle)",
    entityType: "destination",
    fetchTargets: [
      {
        url: "https://asi.nic.in/admin/whatsnew/download/719",
        category: "heritage",
      },
    ],
    notes:
      "Official PDF 'List of Centrally Protected Monuments/Sites under the jurisdiction of Gujarat (Vadodara Circle and Rajkot Circle)'. Parsed as text; each row = a legally protected monument. No coordinates are provided in the source document.",
  },
};

export function getIngestSourceConfig(key: string): IngestSourceConfig {
  const config = INGEST_SOURCE_REGISTRY[key];
  if (!config) throw new Error(`Unknown ingest source key: ${key}`);
  return config;
}
