/**
 * Transactional email sender. Pluggable: if RESEND_API_KEY is set we hit
 * Resend; otherwise we log to stdout so dev still exercises the code path.
 *
 * Interface stays stable so swapping providers (SES, Postmark) is a
 * single-file change.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body (required). */
  text: string;
  /** Optional HTML body. Recipients without HTML get text. */
  html?: string;
  /**
   * Reply-to override. Defaults to support@rokki.ai. When a notification is
   * about a specific space, set this to the space's auto-generated inbox
   * (reserved for a future inbound-email slice).
   */
  replyTo?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? "Rokki <no-reply@rokki.ai>";
const DEFAULT_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? "support@rokki.ai";

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!emailEnabled()) {
    console.log(
      `[email:dev] would send → ${msg.to}\n  subject: ${msg.subject}\n  body:\n    ${msg.text.split("\n").join("\n    ").slice(0, 400)}`,
    );
    return { ok: true, id: "dev-stub" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        reply_to: msg.replyTo ?? DEFAULT_REPLY_TO,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] resend failed (${res.status}): ${body.slice(0, 300)}`);
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch (e) {
    console.error("[email] errored:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
