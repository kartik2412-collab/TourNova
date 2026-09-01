CREATE TABLE "countries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"phone_code" text,
	"currency_code" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text NOT NULL,
	"region_id" text,
	"name" text NOT NULL,
	"name_local" text,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_id" text NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attractions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"destination_id" text NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"category" text DEFAULT 'OTHER' NOT NULL,
	"description" text,
	"latitude" double precision,
	"longitude" double precision,
	"entry_fee_status" text DEFAULT 'UNAVAILABLE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attractions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"description" text,
	"district_id" text,
	"latitude" double precision,
	"longitude" double precision,
	"primary_language" text DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'OTHER' NOT NULL,
	"destination_id" text,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"contact_phone" text,
	"contact_email" text,
	"website_url" text,
	"opening_hours" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"destination_id" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"organizing_body" text,
	"reference_url" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_type" text DEFAULT 'OFFICIAL' NOT NULL,
	"organization_name" text,
	"reference_url" text,
	"description" text,
	"contact" text,
	"is_internal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"raw_value" text,
	"value" text,
	"reference_url" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_status" text DEFAULT 'LIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_record_id" text NOT NULL,
	"verified_by_id" text,
	"verification_status" text NOT NULL,
	"confidence" text DEFAULT 'UNKNOWN' NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"freshness_hours" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_forecasts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_record_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"predicted_amount" numeric NOT NULL,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" text DEFAULT 'UNKNOWN' NOT NULL,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"attraction_id" text,
	"business_id" text,
	"category" text DEFAULT 'OTHER' NOT NULL,
	"price_type" text DEFAULT 'RECENT_OBSERVATION' NOT NULL,
	"amount" numeric NOT NULL,
	"amount_max" numeric,
	"currency" text DEFAULT 'INR' NOT NULL,
	"description" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"verification_status" text DEFAULT 'UNAVAILABLE' NOT NULL,
	"source_record_id" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_forecasts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attraction_id" text NOT NULL,
	"forecast_for" timestamp with time zone NOT NULL,
	"predicted_level" integer,
	"predicted_count" integer,
	"confidence" text DEFAULT 'UNKNOWN' NOT NULL,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowd_observations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attraction_id" text NOT NULL,
	"source_type" text DEFAULT 'ESTIMATED' NOT NULL,
	"count" integer,
	"capacity" integer,
	"crowd_level" integer,
	"locale" text DEFAULT 'en' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_record_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"phone" text,
	"role" text DEFAULT 'TOURIST' NOT NULL,
	"auth_provider" text DEFAULT 'CREDENTIALS' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"country_code" text DEFAULT 'IN' NOT NULL,
	"default_location" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"report_type" text NOT NULL,
	"payload" text,
	"inherited_from_id" text,
	"verification_status" text DEFAULT 'USER_REPORTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itineraries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"destination_id" text,
	"title" text NOT NULL,
	"starts_on" timestamp with time zone,
	"ends_on" timestamp with time zone,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_stops" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" text NOT NULL,
	"attraction_id" text,
	"stop_order" integer DEFAULT 0 NOT NULL,
	"day" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attractions" ADD CONSTRAINT "attractions_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_forecasts" ADD CONSTRAINT "price_forecasts_price_record_id_price_records_id_fk" FOREIGN KEY ("price_record_id") REFERENCES "public"."price_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_attraction_id_attractions_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attractions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_forecasts" ADD CONSTRAINT "crowd_forecasts_attraction_id_attractions_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowd_observations" ADD CONSTRAINT "crowd_observations_attraction_id_attractions_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_stops" ADD CONSTRAINT "itinerary_stops_attraction_id_attractions_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attractions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "districts_state_idx" ON "districts" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "regions_state_idx" ON "regions" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "states_country_idx" ON "states" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "attractions_destination_idx" ON "attractions" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "attractions_category_idx" ON "attractions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "destinations_district_idx" ON "destinations" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "businesses_destination_idx" ON "businesses" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "businesses_category_idx" ON "businesses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "events_destination_idx" ON "events" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "data_sources_type_idx" ON "data_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "source_records_entity_idx" ON "source_records" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "source_records_source_idx" ON "source_records" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "verifications_record_idx" ON "verifications" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "price_records_target_idx" ON "price_records" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "price_records_category_idx" ON "price_records" USING btree ("category");--> statement-breakpoint
CREATE INDEX "crowd_forecast_attraction_idx" ON "crowd_forecasts" USING btree ("attraction_id","forecast_for");--> statement-breakpoint
CREATE INDEX "crowd_obs_attraction_idx" ON "crowd_observations" USING btree ("attraction_id","captured_at");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_reports_target_idx" ON "user_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "user_reports_user_idx" ON "user_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "itineraries_user_idx" ON "itineraries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "itinerary_stops_itinerary_idx" ON "itinerary_stops" USING btree ("itinerary_id");