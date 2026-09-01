CREATE TABLE "data_submissions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_record_id" text NOT NULL,
	"user_report_id" text,
	"submitted_by_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" text,
	"note" text,
	"reason" text,
	"workflow_status" text DEFAULT 'SUBMITTED' NOT NULL,
	"conflict_with_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "data_sources" ALTER COLUMN "source_type" SET DEFAULT 'OTHER';--> statement-breakpoint
ALTER TABLE "source_records" ALTER COLUMN "verification_status" SET DEFAULT 'UNAVAILABLE';--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "reliability" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "update_frequency" text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "classification_verified_by_id" text;--> statement-breakpoint
ALTER TABLE "data_sources" ADD COLUMN "classification_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_records" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "submission_id" text;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_user_report_id_user_reports_id_fk" FOREIGN KEY ("user_report_id") REFERENCES "public"."user_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_conflict_with_id_data_submissions_id_fk" FOREIGN KEY ("conflict_with_id") REFERENCES "public"."data_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_submissions_status_idx" ON "data_submissions" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX "data_submissions_target_idx" ON "data_submissions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "data_submissions_user_idx" ON "data_submissions" USING btree ("submitted_by_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_classification_verified_by_id_users_id_fk" FOREIGN KEY ("classification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_submission_id_data_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."data_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verifications_submission_idx" ON "verifications" USING btree ("submission_id");