ALTER TYPE "public"."supply_category" ADD VALUE 'emergency';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'pharmacy';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'inpatient';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'geriatrics';--> statement-breakpoint
ALTER TABLE "center" ADD COLUMN "reception_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request" ADD COLUMN "short_id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "request_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);