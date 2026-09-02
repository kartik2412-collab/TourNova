ALTER TABLE "crowd_observations" ADD COLUMN "verification_status" text DEFAULT 'UNAVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "crowd_observations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "crowd_obs_status_idx" ON "crowd_observations" USING btree ("verification_status");
