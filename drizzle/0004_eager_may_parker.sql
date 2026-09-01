CREATE TABLE "coordinate_candidates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"provider" text,
	"query" text,
	"place_name" text,
	"confidence" text DEFAULT 'UNKNOWN' NOT NULL,
	"attribution" text,
	"reference_url" text,
	"notes" text,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"submitted_by_id" text,
	"decision" text,
	"decision_note" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coordinate_candidates" ADD CONSTRAINT "coordinate_candidates_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinate_candidates" ADD CONSTRAINT "coordinate_candidates_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coord_candidates_entity_idx" ON "coordinate_candidates" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "coord_candidates_status_idx" ON "coordinate_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coord_candidates_provider_idx" ON "coordinate_candidates" USING btree ("provider");