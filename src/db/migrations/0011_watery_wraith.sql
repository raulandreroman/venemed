ALTER TYPE "public"."supply_category" ADD VALUE 'food';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'water';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'hygiene';--> statement-breakpoint
ALTER TYPE "public"."supply_category" ADD VALUE 'bedding';--> statement-breakpoint
ALTER TABLE "lista" ADD COLUMN "reception_contact_name" varchar(80);--> statement-breakpoint
ALTER TABLE "lista" ADD COLUMN "reception_contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "lista" ADD COLUMN "reception_landmark" varchar(120);--> statement-breakpoint
ALTER TABLE "lista_item" ADD COLUMN "quantity" integer;