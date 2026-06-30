import postgres from "postgres";

/**
 * Direct DB access for the GATED admin e2e (admin.spec.ts).
 *
 * The admin spec must assert real mutations — `center.status` AND the
 * `moderation_event` audit row — because `build` + `curl GET` never exercises a
 * server action (AGENTS.md gotcha #2). We talk to the SAME shared Supabase DB
 * the app uses, via raw SQL (no `@/db` import, to avoid pulling `server-only`
 * modules into the Playwright runner).
 *
 * Writes are kept BOUNDED + IDEMPOTENT: at most two marker centers (reset to
 * `pending_review` and stripped of prior audit rows at the start of each run).
 * NEVER add db:seed / db:migrate to CI — this only touches its own marker rows.
 */

// Prefer the direct (non-pooling) URL when present; fall back to the pooler.
const DB_URL =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || "";

export const hasDbUrl = (): boolean => DB_URL.length > 0;

export type Sql = ReturnType<typeof postgres>;

/** Open a short-lived client. `prepare: false` is required for the Supabase pooler. */
export function makeSql(): Sql {
  if (!DB_URL) throw new Error("POSTGRES_URL(_NON_POOLING) not set");
  return postgres(DB_URL, { prepare: false });
}

/**
 * Idempotently ensure a `pending_review` center identified by a stable name.
 * Resets an existing marker row back to `pending_review` (clearing any prior
 * decision) and deletes its prior `moderation_event` rows, so repeated runs do
 * not accumulate state. Returns the center id.
 */
export async function ensurePendingCenter(
  sql: Sql,
  name: string,
): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    select id from "center" where name = ${name} limit 1
  `;

  let id: string;
  if (existing.length > 0) {
    id = existing[0].id;
    await sql`
      update "center"
      set status = 'pending_review',
          verified_at = null,
          rejection_reason = null,
          updated_at = now()
      where id = ${id}
    `;
  } else {
    const inserted = await sql<{ id: string }[]>`
      insert into "center" (name, type, city, state, address_line, whatsapp_phone, status)
      values (${name}, 'hospital', 'Caracas', 'Distrito Capital', 'Av. E2E', '+580000000000', 'pending_review')
      returning id
    `;
    id = inserted[0].id;
  }

  // Keep audit writes bounded across runs.
  await sql`
    delete from "moderation_event"
    where subject_type = 'center' and subject_id = ${id}
  `;
  return id;
}

/**
 * Flip a test phone's app_user to `is_platform_admin = true` and return its id
 * (= the moderation actor id). The app_user row only exists AFTER the phone has
 * logged in once (resolveLoginDestination upserts it), so call this post-login.
 */
export async function makeAdmin(sql: Sql, phoneE164: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    update "app_user"
    set is_platform_admin = true, updated_at = now()
    where phone = ${phoneE164}
    returning id
  `;
  if (rows.length === 0) {
    throw new Error(
      `no app_user row for ${phoneE164} — the admin OTP login must run first`,
    );
  }
  return rows[0].id;
}

/**
 * Make the seed center re-runnable for the slice-4 reception kill-switch test.
 * The test drives the toggle OFF (pause), which stamps `reception_paused_at` and
 * CLOSES the center's active requests — so a second run would find the center
 * already paused (the switch starts OFF) and never reach the confirm dialog.
 *
 * This idempotently restores the Activa precondition for a named seed center:
 * clear `reception_paused_at`, and reactivate its "Insumos pediátricos" request
 * (fresh window) so the close-all assertion stays meaningful on re-runs. Bounded
 * to the one named center + its one named request — never a blanket reset. No-op
 * if the center isn't present (e.g. DB not seeded → the spec skips anyway).
 */
export async function resetSeedCenterReception(
  sql: Sql,
  centerName: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    select id from "center" where name = ${centerName} limit 1
  `;
  if (rows.length === 0) return;
  const id = rows[0].id;

  await sql`
    update "center"
    set reception_paused_at = null, updated_at = now()
    where id = ${id}
  `;
  await sql`
    update "request"
    set status = 'active',
        closed_reason = null,
        closed_at = null,
        published_at = coalesce(published_at, now()),
        expires_at = now() + (window_hours * interval '1 hour'),
        updated_at = now()
    where center_id = ${id} and title = 'Insumos pediátricos'
  `;
}

export type CenterRow = {
  status: string;
  verified_at: Date | null;
  rejection_reason: string | null;
};

export async function getCenter(sql: Sql, id: string): Promise<CenterRow> {
  const [row] = await sql<CenterRow[]>`
    select status, verified_at, rejection_reason from "center" where id = ${id}
  `;
  return row;
}

export type ModerationEventRow = {
  actor_user_id: string | null;
  action: string;
  reason: string | null;
};

/** Newest moderation_event for a center subject (the one the action just wrote). */
export async function latestCenterEvent(
  sql: Sql,
  centerId: string,
): Promise<ModerationEventRow | undefined> {
  const [row] = await sql<ModerationEventRow[]>`
    select actor_user_id, action, reason
    from "moderation_event"
    where subject_type = 'center' and subject_id = ${centerId}
    order by created_at desc
    limit 1
  `;
  return row;
}
