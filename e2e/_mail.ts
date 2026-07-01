/**
 * Read email OTP codes from the local Supabase email sink (Mailpit) for the
 * gated center/admin e2e. Local Supabase captures all outbound mail in Mailpit
 * (web/API on :54324); a LOCAL-ONLY custom template (supabase/templates/
 * otp_code.html) surfaces the 6-digit token in the body so we can parse it.
 *
 * Email OTP has no fixed-code test map (unlike the old [auth.sms.test_otp]), so
 * we read the real code Supabase generated — still fully offline.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Delete all messages in the sink (call before a send to avoid stale codes). */
export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" }).catch(
    () => {},
  );
}

/**
 * Poll Mailpit for the newest message addressed to `email` and extract its
 * 6-digit OTP. Throws if none arrives within the timeout.
 */
export async function readEmailOtp(
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const target = email.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:${target}`);
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${query}&limit=5`,
    ).catch(() => null);
    if (res?.ok) {
      const { messages } = (await res.json()) as {
        messages?: { ID: string }[];
      };
      // Mailpit returns newest-first, so the first parseable code is the latest.
      for (const m of messages ?? []) {
        const full = (await fetch(
          `${MAILPIT_URL}/api/v1/message/${m.ID}`,
        ).then((r) => r.json())) as { Text?: string; HTML?: string };
        const body = `${full.Text ?? ""} ${full.HTML ?? ""}`;
        const match = body.match(/\b(\d{6})\b/);
        if (match) return match[1];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no OTP email for ${email} within ${timeoutMs}ms`);
}
