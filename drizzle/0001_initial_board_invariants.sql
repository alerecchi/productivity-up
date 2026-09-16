CREATE UNIQUE INDEX "buckets_user_id_inbox_unique" ON "buckets" USING btree ("user_id") WHERE "buckets"."type" = 'inbox';--> statement-breakpoint
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_inbox_period_check" CHECK ("buckets"."type" <> 'inbox' OR "buckets"."period" = 'inbox');
