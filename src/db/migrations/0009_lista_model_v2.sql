CREATE TYPE "public"."lista_item_bucket" AS ENUM('need', 'excess');--> statement-breakpoint
CREATE TYPE "public"."lista_status" AS ENUM('draft', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "lista" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"short_id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "lista_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"status" "lista_status" DEFAULT 'draft' NOT NULL,
	"delivery_instructions" varchar(120),
	"excess_reason" varchar(40),
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" "closed_reason",
	"city" text,
	"categories" text[],
	"share_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lista_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "lista_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lista_id" uuid NOT NULL,
	"supply_id" uuid,
	"custom_name" text,
	"category" text NOT NULL,
	"bucket" "lista_item_bucket" DEFAULT 'need' NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"is_fulfilled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_item" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "request" CASCADE;--> statement-breakpoint
DROP TABLE "request_item" CASCADE;--> statement-breakpoint
ALTER TABLE "share_event" DROP CONSTRAINT IF EXISTS "share_event_request_id_request_id_fk";
--> statement-breakpoint
ALTER TABLE "lista" ALTER COLUMN "closed_reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."closed_reason";--> statement-breakpoint
CREATE TYPE "public"."closed_reason" AS ENUM('fulfilled', 'cancelled');--> statement-breakpoint
ALTER TABLE "lista" ALTER COLUMN "closed_reason" SET DATA TYPE "public"."closed_reason" USING "closed_reason"::"public"."closed_reason";--> statement-breakpoint
ALTER TABLE "moderation_event" ALTER COLUMN "subject_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."moderation_subject_type";--> statement-breakpoint
CREATE TYPE "public"."moderation_subject_type" AS ENUM('center', 'lista');--> statement-breakpoint
ALTER TABLE "moderation_event" ALTER COLUMN "subject_type" SET DATA TYPE "public"."moderation_subject_type" USING "subject_type"::"public"."moderation_subject_type";--> statement-breakpoint
ALTER TABLE "share_event" ADD COLUMN "lista_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "lista" ADD CONSTRAINT "lista_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_item" ADD CONSTRAINT "lista_item_lista_id_lista_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_item" ADD CONSTRAINT "lista_item_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lista_one_active_per_center" ON "lista" USING btree ("center_id") WHERE status in ('active', 'paused');--> statement-breakpoint
ALTER TABLE "share_event" ADD CONSTRAINT "share_event_lista_id_lista_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."lista"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_event" DROP COLUMN "request_id";--> statement-breakpoint
DROP TYPE "public"."request_kind";--> statement-breakpoint
DROP TYPE "public"."request_status";