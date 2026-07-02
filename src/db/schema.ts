/**
 * VeneMed database schema (Drizzle / Postgres).
 * Source of truth: docs/specs/lista-model-v2.md.
 * Identifiers are English; user-facing copy is Spanish.
 */
import {
  pgTable,
  pgEnum,
  uniqueIndex,
  index,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

export const listaStatus = pgEnum("lista_status", [
  "draft",
  "active",
  "paused",
  "closed",
]);

export const closedReason = pgEnum("closed_reason", ["fulfilled", "cancelled"]);

// need|excess bucket for a lista_item (lista-model-v2 §3c). Excess replaces the
// old `kind='surplus'` aviso-de-exceso — it's now an item bucket, not a list kind.
export const listaItemBucket = pgEnum("lista_item_bucket", ["need", "excess"]);

// Area = category, 1:1 (center-workspace §5.6). The 4 area values added in 0004
// are APPENDED to keep existing enum positions stable (so drizzle emits clean
// `ALTER TYPE … ADD VALUE` statements, not a destructive type recreation).
// `general` is retired as a DORMANT value (kept, never dropped — dropping would
// force a full USING-cast type recreation). Spanish UI labels live in a labels
// map, not the enum.
export const supplyCategory = pgEnum("supply_category", [
  "pediatrics",
  "surgical",
  "general",
  "emergency",
  "pharmacy",
  "inpatient",
  "geriatrics",
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
  "lista",
]);

// ---- center ----------------------------------------------------------------
export const center = pgTable("center", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // Nullable: stored null when the center-type feature is off (no placeholder).
  type: centerType("type"),
  description: text("description"),
  city: text("city").notNull(),
  state: text("state"),
  addressLine: text("address_line"),
  addressReference: text("address_reference"),
  regularScheduleText: text("regular_schedule_text"),
  lat: numeric("lat"),
  lng: numeric("lng"),
  // Optional, UNVERIFIED contact number for delivery coordination. Since auth
  // moved to email (migration 0008) this is no longer sourced from a verified
  // OTP session — it's a plain form field the center can edit.
  whatsappPhone: text("whatsapp_phone"),
  status: centerStatus("status").notNull().default("pending_review"),
  // center-level "Recepción de donaciones" switch (center-workspace §2b).
  // null = receiving; a timestamp = paused since (so "Pausada · desde hace 12 min"
  // renders for free). Donor-list exclusion + toggle write land in slice 3.4.
  receptionPausedAt: timestamp("reception_paused_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- app_user --------------------------------------------------------------
export const appUser = pgTable("app_user", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Login identity = the Supabase-verified email (migration 0008 replaced phone).
  // Nullable at the DB level so the prod migration survives legacy phone-only
  // rows; always populated in practice (the email is present post-verify — see
  // resolveLoginDestination).
  email: text("email").unique(),
  name: text("name"),
  // Responsable's role/title (e.g. "Coordinadora de logística"), shown in the
  // admin review. Optional; collected during registration.
  cargo: varchar("cargo", { length: 60 }),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- membership (one user per center in v1) --------------------------------
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("center_admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Enforces "one user per center in v1" at the DB layer: closes the TOCTOU race
  // where two concurrent verified submissions both pass the app-level pre-check
  // and create duplicate centers + memberships for the same user.
  (t) => [uniqueIndex("membership_user_id_key").on(t.userId)],
);

// ---- invitation (team invites — single-use, tokenized, shareable link) -----
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id, { onDelete: "cascade" }),
    // SHA-256 hex of the raw 32-byte token. The raw token lives ONLY in the URL
    // — it is never persisted or logged (see src/lib/team/token.ts).
    tokenHash: text("token_hash").notNull(),
    role: memberRole("role").notNull().default("center_member"),
    label: varchar("label", { length: 60 }), // optional "Nombre" the Responsable gives the invite
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => appUser.id),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: uuid("accepted_by").references(() => appUser.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // SECURITY: unique hash lookup — the raw token never touches a WHERE clause.
    uniqueIndex("invitation_token_hash_key").on(t.tokenHash),
    index("invitation_center_status_idx").on(t.centerId, t.status),
  ],
);

// ---- supply (catalog) ------------------------------------------------------
export const supply = pgTable("supply", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: supplyCategory("category").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ---- lista -------------------------------------------------------------
export const lista = pgTable(
  "lista",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id, { onDelete: "cascade" }),
    // human-friendly global monotonic display id ("#1044"), matching the Figma
    // descending numbers. ADD COLUMN … GENERATED ALWAYS AS IDENTITY backfills
    // existing seeded rows automatically (center-workspace §2c).
    shortId: bigint("short_id", { mode: "number" }).generatedAlwaysAsIdentity(),
    status: listaStatus("status").notNull().default("draft"),
    // per-lista delivery instructions shown under "Dónde entregar" — augments the
    // center's static address with drop-off specifics for THIS lista.
    deliveryInstructions: varchar("delivery_instructions", { length: 120 }),
    // list-level "Razón (opcional)" for the excess bucket (aviso-exceso, folded in).
    excessReason: varchar("excess_reason", { length: 40 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: closedReason("closed_reason"),
    // denormalized at publish for the cached donor list (see lista-model-v2.md §3d)
    city: text("city"),
    categories: text("categories").array(),
    shareCount: integer("share_count").notNull().default(0),
    // offline-sync support (see lista-model-v2.md)
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // One live lista per center: at most one active|paused row.
  (t) => [
    uniqueIndex("lista_one_active_per_center")
      .on(t.centerId)
      .where(sql`status in ('active', 'paused')`),
  ],
);

// ---- lista_item -------------------------------------------------------------
export const listaItem = pgTable("lista_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  listaId: uuid("lista_id")
    .notNull()
    .references(() => lista.id, { onDelete: "cascade" }),
  supplyId: uuid("supply_id").references(() => supply.id),
  customName: text("custom_name"),
  category: text("category").notNull(),
  bucket: listaItemBucket("bucket").notNull().default("need"),
  isUrgent: boolean("is_urgent").notNull().default(false),
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
  listaId: uuid("lista_id")
    .notNull()
    .references(() => lista.id, { onDelete: "cascade" }),
  channel: shareChannel("channel").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
