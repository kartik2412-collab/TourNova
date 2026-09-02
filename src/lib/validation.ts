import { z } from "zod";
import {
  reviewDecisionEnum,
  sourceClassificationEnum,
  sourceAccessMethodEnum,
  geographicCoverageEnum,
  freshnessClassEnum,
  ingestionStatusEnum,
  updateFrequencyEnum,
  confidenceEnum,
  sourceConflictDecisionEnum,
  workflowStatusEnum,
  ingestionRunStatusEnum,
  ingestionItemStatusEnum,
  ingestionItemDecisionEnum,
  coordinateCandidateStatusEnum,
  coordinateCandidateSourceEnum,
  priceCategoryEnum,
  currencyEnum,
  type ReviewDecision,
  type WorkflowStatus,
  type IngestionStatus,
  type IngestionRunStatus,
  type IngestionItemStatus,
  type IngestionItemDecision,
} from "@/lib/db/schema";

/**
 * Request validation — every public API endpoint parses its body/params through
 * these schemas. Rejects malformed input before it reaches service code.
 */

const ENUM = <const T extends readonly string[]>(values: T) => z.enum(values);

type Classification = (typeof sourceClassificationEnum)[keyof typeof sourceClassificationEnum];
type AccessMethod = (typeof sourceAccessMethodEnum)[keyof typeof sourceAccessMethodEnum];
type Coverage = (typeof geographicCoverageEnum)[keyof typeof geographicCoverageEnum];
type FreshnessClass = (typeof freshnessClassEnum)[keyof typeof freshnessClassEnum];
type UpdateFrequency = (typeof updateFrequencyEnum)[keyof typeof updateFrequencyEnum];
type Confidence = (typeof confidenceEnum)[keyof typeof confidenceEnum];

export const emailSchema = z.email().max(320);

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(128);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(32).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const targetTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z_]+$/, "targetType must be lowercase letters and underscores (e.g. attraction).");
export const targetIdSchema = z.string().trim().min(1).max(160);

export const createSubmissionSchema = z.object({
  targetType: targetTypeSchema,
  targetId: targetIdSchema,
  reportType: z.string().trim().max(160).optional(),
  payload: z.string().max(8000).optional(),
  note: z.string().max(2000).optional(),
});

export const createSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceType: ENUM(
    Object.values(sourceClassificationEnum) as [Classification, ...Classification[]],
  ).default(sourceClassificationEnum.UNKNOWN),
  organizationName: z.string().trim().max(200).optional(),
  referenceUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional(),
  contact: z.string().trim().max(500).optional(),
  license: z.string().trim().max(500).optional(),
  usageTerms: z.string().trim().max(4000).optional(),
  accessMethod: ENUM(
    Object.values(sourceAccessMethodEnum) as [AccessMethod, ...AccessMethod[]],
  ).default(sourceAccessMethodEnum.UNKNOWN),
  reliability: ENUM(Object.values(confidenceEnum) as [Confidence, ...Confidence[]]).default(
    confidenceEnum.UNKNOWN,
  ),
  updateFrequency: ENUM(
    Object.values(updateFrequencyEnum) as [UpdateFrequency, ...UpdateFrequency[]],
  ).default(updateFrequencyEnum.MANUAL),
  freshnessClass: ENUM(
    Object.values(freshnessClassEnum) as [FreshnessClass, ...FreshnessClass[]],
  ).default(freshnessClassEnum.DEFAULT),
  geographicCoverage: ENUM(
    Object.values(geographicCoverageEnum) as [Coverage, ...Coverage[]],
  ).default(geographicCoverageEnum.UNKNOWN),
  notes: z.string().trim().max(4000).optional(),
});

export const advanceIngestionSchema = z.object({
  to: ENUM(Object.values(ingestionStatusEnum) as [IngestionStatus, ...IngestionStatus[]]),
  note: z.string().trim().max(4000).optional().default(""),
});

export const recordSourceCheckSchema = z.object({
  ok: z.boolean(),
  note: z.string().trim().max(4000).optional().default(""),
});

export const flagSourceConflictSchema = z.object({
  entityType: targetTypeSchema,
  entityId: targetIdSchema,
  recordAId: z.string().trim().min(1).max(160),
  recordBId: z.string().trim().min(1).max(160),
  note: z.string().trim().max(4000).optional(),
});

/**
 * CANONICAL conflict-decisions (Chunk 3).
 *
 * One discriminated union for every caller that resolves a conflict. Each
 * supported decision explicitly names the human choice:
 *
 *   KEEP_A      — acceptedRecordId must be the conflict's recordA; only that
 *                 record stays eligible for publication.
 *   KEEP_B      — acceptedRecordId must be the conflict's recordB.
 *   REJECT_BOTH — neither record becomes published; both stay for history.
 *   MERGE       — recognised so the API answers precisely, but UNSUPPORTED by
 *                 the current conflict data model; the service rejects it.
 */
export const resolveConflictDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal(sourceConflictDecisionEnum.KEEP_A),
    acceptedRecordId: z.string().trim().min(1).max(160),
    note: z.string().trim().max(4000).optional().default(""),
  }),
  z.object({
    decision: z.literal(sourceConflictDecisionEnum.KEEP_B),
    acceptedRecordId: z.string().trim().min(1).max(160),
    note: z.string().trim().max(4000).optional().default(""),
  }),
  z.object({
    decision: z.literal(sourceConflictDecisionEnum.REJECT_BOTH),
    note: z.string().trim().max(4000).optional().default(""),
  }),
  z.object({
    decision: z.literal(sourceConflictDecisionEnum.MERGE),
    note: z.string().trim().max(4000).optional().default(""),
  }),
]);

/** Backward-compatible export name for the canonical conflict-decision schema. */
export const resolveSourceConflictSchema = resolveConflictDecisionSchema;

export const reviewDecisionSchema = ENUM(
  Object.values(reviewDecisionEnum) as [ReviewDecision, ...ReviewDecision[]],
);

export const verifySubmissionSchema = z.object({
  decision: reviewDecisionSchema,
  reason: z.string().trim().max(4000).optional().default(""),
  confidence: ENUM(Object.values(confidenceEnum) as [Confidence, ...Confidence[]]).optional(),
  conflictWithId: z.string().trim().max(160).optional(),
});

export const listSubmissionsSchema = z.object({
  status: ENUM(
    Object.values(workflowStatusEnum) as [WorkflowStatus, ...WorkflowStatus[]],
  ).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const updateUserSchema = z.object({
  role: z.enum(["TOURIST", "BUSINESS", "AUTHORITY", "ADMIN"] as const).optional(),
  isActive: z.boolean().optional(),
});

// --- Ingestion review (Milestone 3B) ----------------------------------------

type RunStatus = (typeof ingestionRunStatusEnum)[keyof typeof ingestionRunStatusEnum];
type ItemStatus = (typeof ingestionItemStatusEnum)[keyof typeof ingestionItemStatusEnum];
type Decision = (typeof ingestionItemDecisionEnum)[keyof typeof ingestionItemDecisionEnum];

export const ingestionRunStatusSchema = ENUM(
  Object.values(ingestionRunStatusEnum) as [RunStatus, ...RunStatus[]],
);

export const ingestionItemStatusSchema = ENUM(
  Object.values(ingestionItemStatusEnum) as [ItemStatus, ...ItemStatus[]],
);

export const ingestionItemDecision = ENUM(
  Object.values(ingestionItemDecisionEnum) as [Decision, ...Decision[]],
);

export const listIngestionRunsSchema = z.object({
  status: ingestionRunStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const listIngestionItemsSchema = z.object({
  status: ingestionItemStatusSchema.optional(),
  runId: z.string().trim().max(200).optional(),
  sourceId: z.string().trim().max(200).optional(),
  entityType: targetTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
  conflict: z.enum(["open", "none", "any"]).default("any"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** One review action applied to one ingestion item (batch or single decision). */
export const reviewActionSchema = z.enum(["APPROVE", "REJECT", "UNAVAILABLE"]);

export const decideIngestionItemSchema = z.object({
  decision: ingestionItemDecision,
  reason: z.string().trim().max(4000).optional().default(""),
  confidence: ENUM(Object.values(confidenceEnum) as [Confidence, ...Confidence[]]).optional(),
});

/** Hard ceiling for one batch review, enforced by both the API and the service. */
export const MAX_BATCH_REVIEW_SIZE = 50 as const;

/**
 * Safe batch review (Chunk 4): zero-or-n → all item ids are decided with the
 * SAME decision and reason, atomically (all-or-nothing). Everything returns to
 * its prior state if any single item fails. Ceiling: MAX_BATCH_REVIEW_SIZE.
 */
export const batchReviewIngestionItemsSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_BATCH_REVIEW_SIZE),
  decision: reviewActionSchema,
  reason: z.string().trim().max(4000).optional().default(""),
  confidence: ENUM(Object.values(confidenceEnum) as [Confidence, ...Confidence[]]).optional(),
});

// --- Geo / coordinate candidates (Milestone 3C) -------------------------------

type CoordinateSource =
  (typeof coordinateCandidateSourceEnum)[keyof typeof coordinateCandidateSourceEnum];
type CoordinateStatus =
  (typeof coordinateCandidateStatusEnum)[keyof typeof coordinateCandidateStatusEnum];

export const coordinateCandidateStatusSchema = ENUM(
  Object.values(coordinateCandidateStatusEnum) as [CoordinateStatus, ...CoordinateStatus[]],
);

export const coordinateCandidateSourceSchema = ENUM(
  Object.values(coordinateCandidateSourceEnum) as [CoordinateSource, ...CoordinateSource[]],
);

export const createCoordinateCandidateSchema = z.object({
  entityType: targetTypeSchema,
  entityId: targetIdSchema,
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  source: coordinateCandidateSourceSchema.optional(),
  provider: z.string().trim().max(64).optional().nullable(),
  query: z.string().trim().max(1000).optional().nullable(),
  placeName: z.string().trim().max(500).optional().nullable(),
  confidence: ENUM(Object.values(confidenceEnum) as [Confidence, ...Confidence[]]).optional(),
  attribution: z.string().trim().max(500).optional().nullable(),
  referenceUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const decideCoordinateCandidateSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const listCoordinateCandidatesSchema = z.object({
  entityType: targetTypeSchema.optional(),
  entityId: targetIdSchema.optional(),
  status: coordinateCandidateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// --- Price reports (Milestone 6 residual) -------------------------------------

type PriceCategory = (typeof priceCategoryEnum)[keyof typeof priceCategoryEnum];
type Currency = (typeof currencyEnum)[keyof typeof currencyEnum];

export const submitPriceReportSchema = z.object({
  targetType: targetTypeSchema.default("attraction"),
  targetId: targetIdSchema,
  category: ENUM(Object.values(priceCategoryEnum) as [PriceCategory, ...PriceCategory[]]).default(
    priceCategoryEnum.OTHER,
  ),
  amount: z.coerce.number().finite().positive(),
  currency: ENUM(Object.values(currencyEnum) as [Currency, ...Currency[]]).default(
    currencyEnum.INR,
  ),
  description: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
});

export const decidePriceReportSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REOPEN", "UNAVAILABLE"]),
  note: z.string().trim().max(2000).optional().default(""),
});

// --- Crowd reports (Milestone 7) ---------------------------------------------

export const submitCrowdReportSchema = z.object({
  targetType: targetTypeSchema.default("attraction"),
  targetId: targetIdSchema,
  crowdLevel: z.coerce.number().int().min(0).max(100).optional().nullable(),
  count: z.coerce.number().int().min(0).optional().nullable(),
  capacity: z.coerce.number().int().min(0).optional().nullable(),
  description: z.string().trim().max(500).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
});

export const decideCrowdReportSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REOPEN", "UNAVAILABLE"]),
  note: z.string().trim().max(2000).optional().default(""),
});
