/**
 * VeneMed database schema (Drizzle / Postgres).
 * Source of truth: docs/specs/data-model.md (v1).
 * Identifiers are English; user-facing copy is Spanish.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  smallint,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";

// ---- enums -----------------------------------------------------------------
export const centerType = pgEnum("center_type", [
  "hospital",
  "clinic",
  "elder_care_home",
  "childrens_shelter",
  "collection_center",
]);

export const centerStatus = pgEnum("center_status", [
  "pending_review",
  "approved",
  "rejected",
  "suspended",
]);

export const memberRole = pgEnum("member_role", ["center_admin", "center_member"]);

export const requestKind = pgEnum("request_kind", ["need", "surplus"]);

export const requestStatus = pgEnum("request_status", [
  "draft",
  "active",
  "paused",
  "closed",
  "expired",
]);

export const closedReason = pgEnum("closed_reason", [
  "fulfilled",
  "cancelled",
  "expired",
]);

export const supplyCategory = pgEnum("supply_category", [
  "pediatrics",
  "surgical",
  "general",
]);

export const shareChannel = pgEnum("share_channel", [
  "whatsapp",
  "instagram",
  "x",
  "copy_link",
  "unknown",
]);

export const moderationSubjectType = pgEnum("moderation_subject_type", [
  "center",
  "request",
]);

// ---- center ----------------------------------------------------------------
export const center = pgTable("center", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: centerType("type").notNull(),
  description: text("description"),
  city: text("city").notNull(),
  state: text("state"),
  addressLine: text("address_line"),
  addressReference: text("address_reference"),
  regularScheduleText: text("regular_schedule_text"),
  lat: numeric("lat"),
  lng: numeric("lng"),
  whatsappPhone: text("whatsapp_phone").notNull(),
  status: centerStatus("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- app_user --------------------------------------------------------------
export const appUser = pgTable("app_user", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- membership (one user per center in v1) --------------------------------
export const membership = pgTable("membership", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  centerId: uuid("center_id")
    .notNull()
    .references(() => center.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("center_admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- supply (catalog) ------------------------------------------------------
export const supply = pgTable("supply", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: supplyCategory("category").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ---- request (solicitud) ---------------------------------------------------
export const request = pgTable("request", {
  id: uuid("id").defaultRandom().primaryKey(),
  centerId: uuid("center_id")
    .notNull()
    .references(() => center.id, { onDelete: "cascade" }),
  kind: requestKind("kind").notNull().default("need"),
  status: requestStatus("status").notNull().default("draft"),
  // center-written descriptor for the donor card/detail (data-model §4.4; Figma 30:15714).
  // NULLABLE in DB so 0001 applies additively over live rows; required at the app
  // layer for any new request (enforced when center authoring ships).
  title: varchar("title", { length: 40 }),
  // per-request delivery instructions shown under "Dónde entregar" — augments the
  // center's static address with drop-off specifics for THIS request.
  deliveryInstructions: varchar("delivery_instructions", { length: 120 }),
  windowHours: smallint("window_hours").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedReason: closedReason("closed_reason"),
  // denormalized at publish for the cached donor list (see data-model.md §8)
  city: text("city"),
  categories: text("categories").array(),
  shareCount: integer("share_count").notNull().default(0),
  // offline-sync support (see data-model.md §7)
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- request_item ----------------------------------------------------------
export const requestItem = pgTable("request_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => request.id, { onDelete: "cascade" }),
  supplyId: uuid("supply_id").references(() => supply.id),
  customName: text("custom_name"),
  category: text("category").notNull(),
  isFulfilled: boolean("is_fulfilled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- moderation_event (append-only audit) ----------------------------------
export const moderationEvent = pgTable("moderation_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => appUser.id),
  subjectType: moderationSubjectType("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- share_event (write-only analytics) ------------------------------------
export const shareEvent = pgTable("share_event", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => request.id, { onDelete: "cascade" }),
  channel: shareChannel("channel").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
