import "server-only";

import { getCenterApprovalRecipient } from "@/db/admin-queries";
import { EMAIL_FROM, getResend } from "./client";
import { CenterApprovedEmail } from "./templates/center-approved";

/**
 * Best-effort approval notification. Called AFTER approveCenter's transaction
 * commits — a send failure must never roll back or fail the approval, so this
 * swallows every error (logs only) and can't throw.
 *
 * Skips cleanly when:
 *  - RESEND_API_KEY is unset (local dev / CI) → getResend() is null.
 *  - the center_admin's app_user.email is null (legacy phone-only rows).
 */
export async function sendCenterApprovedEmail(centerId: string): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const recipient = await getCenterApprovalRecipient(centerId);
    if (!recipient?.email) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://venemedapp.org";
    const loginUrl = `${baseUrl}/centro/login`;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: recipient.email,
      subject: "Tu centro fue aprobado en VeneMed",
      react: CenterApprovedEmail({
        centerName: recipient.centerName,
        loginUrl,
      }),
    });
  } catch (err) {
    console.error("[email] center-approved send failed", err);
  }
}
