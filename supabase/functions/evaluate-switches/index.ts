import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateAllSwitches } from "../_shared/evaluationCore.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const APP_URL = Deno.env.get("APP_URL") ?? "";

type EmailResult = { success: true; id: string } | { success: false; error: string };

async function sendViaResend(payload: { to: string; subject: string; html: string }): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[email] Resend returned an error:", data);
      return { success: false, error: data?.message ?? `HTTP ${res.status}` };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error("[email] Send threw:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Mirrors lib/notifications/email.ts's sendGracePeriodWarning — same subject/html shape.
function sendGracePeriodWarning(params: {
  to: string;
  switchName: string;
  gracePeriodEndsAt: Date;
  checkInUrl: string;
}): Promise<EmailResult> {
  const { to, switchName, gracePeriodEndsAt, checkInUrl } = params;
  const formattedDate = gracePeriodEndsAt.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return sendViaResend({
    to,
    subject: `Action needed: "${switchName}" check-in overdue`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Your check-in is overdue</h2>
        <p>Your dead man's switch <strong>"${switchName}"</strong> did not receive a check-in on schedule.</p>
        <p>You are now in the grace period. If you don't check in by:</p>
        <p style="font-size: 18px; font-weight: bold;">${formattedDate}</p>
        <p>your designated recipients will be notified and given access to what you've stored.</p>
        <a href="${checkInUrl}" style="display:inline-block; padding:12px 24px; background:#111; color:#fff; text-decoration:none; border-radius:6px;">
          Check in now
        </a>
      </div>
    `,
  });
}

// Mirrors lib/notifications/email.ts's sendRecipientTriggerNotification.
function sendRecipientTriggerNotification(params: {
  to: string;
  ownerDisplayName: string;
}): Promise<EmailResult> {
  const { to, ownerDisplayName } = params;

  return sendViaResend({
    to,
    subject: `You've been designated as a recipient by ${ownerDisplayName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>It's time</h2>
        <p>${ownerDisplayName}'s check-in period has lapsed.</p>
        <p>You can now use the access link you were sent when you were originally designated as a recipient.</p>
        <p style="color:#888; font-size:12px; margin-top:24px;">
          This is an automated message. If you believe you received this in error, no action is needed.
        </p>
      </div>
    `,
  });
}

Deno.serve(async (req) => {
  // Guard against unauthenticated invocation from the public internet.
  // Supabase's scheduled Edge Function trigger sends the service role key
  // as a bearer token automatically; this rejects anything else.
  const authHeader = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  if (authHeader !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const results = await evaluateAllSwitches({
      supabase,
      appUrl: APP_URL,
      sendGracePeriodWarning,
      sendRecipientTriggerNotification,
    });

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[evaluate-switches] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500 }
    );
  }
});