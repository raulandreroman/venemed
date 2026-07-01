-- Migrate center auth from phone-OTP (Twilio Verify) to email-OTP.
--
-- app_user identity moves from `phone` (NOT NULL UNIQUE) to `email` (UNIQUE,
-- nullable so this migration survives legacy phone-only rows; the app always
-- populates it post-verify). Dropping `phone` also removes the highest-risk
-- piece of operator PII (a real, carrier-traceable number) from the DB.
--
-- `center.whatsapp_phone` is demoted to an optional, unverified contact field
-- for delivery coordination — so it loses its NOT NULL constraint.
ALTER TABLE "app_user" DROP CONSTRAINT "app_user_phone_unique";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "phone_verified_at";--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "center" ALTER COLUMN "whatsapp_phone" DROP NOT NULL;
