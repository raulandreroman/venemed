import "server-only";

import { EMAIL_FROM, getResend } from "./client";
import { CenterPendingEmail } from "./templates/center-pending";

type PendingArgs = {
  centerId: string;
  centerName: string;
  location: string | null; // e.g. "Caracas, Distrito Capital" — display only
};

/**
 * Best-effort moderator notification. Called AFTER createCenterForCurrentUser's
 * transaction commits — a send failure must never fail the registration, so this
 * swallows every error (logs only) and can't throw.
 *
 * Skips cleanly when:
 *  - RESEND_API_KEY is unset (local dev / CI) → getResend() is null.
 *  - MODERATOR_EMAILS is unset → no recipients configured.
 *
 * MODERATOR_EMAILS is a comma-separated recipient list (staff inboxes).
 */
export async function sendCenterPendingEmail({
  centerId,
  centerName,
  location,
}: PendingArgs): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const to = (process.env.MODERATOR_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (to.length === 0) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://venemedapp.org";
    const reviewUrl = `${baseUrl}/admin/centros/${centerId}`;

    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Nuevo centro en revisión: ${centerName}`,
      react: CenterPendingEmail({ centerName, location, reviewUrl }),
    });
  } catch (err) {
    console.error("[email] center-pending send failed", err);
  }
}
