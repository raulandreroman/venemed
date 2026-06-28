CREATE TYPE "public"."center_status" AS ENUM('pending_review', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."center_type" AS ENUM('hospital', 'clinic', 'elder_care_home', 'childrens_shelter', 'collection_center');--> statement-breakpoint
CREATE TYPE "public"."closed_reason" AS ENUM('fulfilled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('center_admin', 'center_member');--> statement-breakpoint
CREATE TYPE "public"."moderation_subject_type" AS ENUM('center', 'request');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('need', 'surplus');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'active', 'paused', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."share_channel" AS ENUM('whatsapp', 'instagram', 'x', 'copy_link', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."supply_category" AS ENUM('pediatrics', 'surgical', 'general');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "center" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "center_type" NOT NULL,
	"description" text,
	"city" text NOT NULL,
	"state" text,
	"address_line" text,
	"address_reference" text,
	"regular_schedule_text" text,
	"lat" numeric,
	"lng" numeric,
	"whatsapp_phone" text NOT NULL,
	"status" "center_status" DEFAULT 'pending_review' NOT NULL,
	"rejection_reason" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'center_admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"subject_type" "moderation_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"kind" "request_kind" DEFAULT 'need' NOT NULL,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"window_hours" smallint NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" "closed_reason",
	"city" text,
	"categories" text[],
	"share_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "request_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"supply_id" uuid,
	"custom_name" text,
	"category" text NOT NULL,
	"is_fulfilled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"channel" "share_channel" DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "supply_category" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_event" ADD CONSTRAINT "moderation_event_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_item" ADD CONSTRAINT "request_item_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_event" ADD CONSTRAINT "share_event_request_id_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."request"("id") ON DELETE cascade ON UPDATE no action;