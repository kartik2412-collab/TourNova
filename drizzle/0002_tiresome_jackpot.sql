CREATE TABLE "source_conflicts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"record_a_id" text NOT NULL,
	"record_b_id" text NOT NULL,
	"value_a" text,
	"value_b" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"resolution" text DEFAULT 'NONE' NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_by_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_sources" ALTER COLUMN "source_type" SET DEFAULT 'UNKNOWN';--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "usage_terms" text;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "access_method" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "freshness_class" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "geographic_coverage" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "last_successful_fetch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "ingestion_status" text DEFAULT 'DISCOVERED' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_conflicts" ADD CONSTRAINT "source_conflicts_record_a_id_source_records_id_fk" FOREIGN KEY ("record_a_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_conflicts" ADD CONSTRAINT "source_conflicts_record_b_id_source_records_id_fk" FOREIGN KEY ("record_b_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_conflicts" ADD CONSTRAINT "source_conflicts_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_conflicts" ADD CONSTRAINT "source_conflicts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_conflicts_entity_idx" ON "source_conflicts" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "source_conflicts_status_idx" ON "source_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_conflicts_records_idx" ON "source_conflicts" USING btree ("record_a_id","record_b_id");--> statement-breakpoint
CREATE INDEX "data_sources_ingestion_idx" ON "data_sources" USING btree ("ingestion_status");