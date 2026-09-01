CREATE TABLE "ingestion_changes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" text NOT NULL,
	"field" text NOT NULL,
	"kind" text DEFAULT 'ADDED' NOT NULL,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"source_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"name" text,
	"category" text,
	"district_name" text,
	"locality" text,
	"latitude" text,
	"longitude" text,
	"reference_url" text,
	"raw_data" text,
	"normalized_data" text,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"decision" text DEFAULT 'NONE' NOT NULL,
	"reviewer_id" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	"source_record_id" text,
	"submission_id" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"fetched_url" text,
	"urls" text,
	"http_status" integer,
	"content_type" text,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"review_required_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"unavailable_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_changes" ADD CONSTRAINT "ingestion_changes_item_id_ingestion_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ingestion_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_run_id_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_items" ADD CONSTRAINT "ingestion_items_submission_id_data_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."data_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_changes_item_idx" ON "ingestion_changes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "ingestion_items_source_idx" ON "ingestion_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "ingestion_items_entity_idx" ON "ingestion_items" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ingestion_items_status_idx" ON "ingestion_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_idx" ON "ingestion_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs" USING btree ("status");