CREATE TABLE "auth_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limits_window_started_at_idx" ON "auth_rate_limits" USING btree ("window_started_at");
