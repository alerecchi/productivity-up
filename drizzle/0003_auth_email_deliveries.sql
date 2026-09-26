CREATE TYPE "public"."auth_email_kind" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."auth_email_status" AS ENUM('pending', 'sent', 'dead_lettered', 'expired');--> statement-breakpoint
CREATE TABLE "auth_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "auth_email_kind" NOT NULL,
	"status" "auth_email_status" DEFAULT 'pending' NOT NULL,
	"recipient" text,
	"recipient_name" text,
	"action_url" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_email_deliveries" ADD CONSTRAINT "auth_email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;