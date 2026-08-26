import { computeStatus } from "./checkInStateMachine.ts";

type EmailResult = { success: true; id: string } | { success: false; error: string };

// Deliberately loose typing here: importing the real SupabaseClient type would
// pull in @supabase/supabase-js's type surface, which differs slightly between
// the Node SDK and the npm: specifier used in Deno. Both expose the same
// runtime shape for the calls this module makes (.from(), .auth.admin.getUserById()),
// so a minimal structural type is safer than aliasing to either runtime's import.
interface SupabaseLike {
  from: (table: string) => any;
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{ data: any; error: any }>;
    };
  };
}

export interface EvaluationDeps {
  supabase: SupabaseLike;
  appUrl: string;
  sendGracePeriodWarning: (params: {
    to: string;
    switchName: string;
    gracePeriodEndsAt: Date;
    checkInUrl: string;
  }) => Promise<EmailResult>;
  sendRecipientTriggerNotification: (params: {
    to: string;
    ownerDisplayName: string;
  }) => Promise<EmailResult>;
}

async function notifyRecipients(deps: EvaluationDeps, sw: { id: string; label: string }) {
  const { supabase, sendRecipientTriggerNotification } = deps;

  const { data: recipients, error: recError } = await supabase
    .from("recipients")
    .select("id, name, email, phone, delivery_method, notified_at, access_token")
    .eq("switch_id", sw.id)
    .is("notified_at", null); // only pull recipients still owed a notification

  if (recError) {
    console.error(`Failed to fetch recipients for switch ${sw.id}: ${recError.message}`);
    return;
  }

  for (const recipient of recipients ?? []) {
    if (recipient.delivery_method === "sms") {
      console.log(`Skipping SMS recipient ${recipient.id} (switch ${sw.id}) — Twilio on hold`);
      continue;
    }

    if (!recipient.email) {
      console.error(`Recipient ${recipient.id} has no email, cannot notify`);
      continue;
    }

    const emailResult = await sendRecipientTriggerNotification({
      to: recipient.email,
      ownerDisplayName: sw.label,
    });

    if (emailResult.success) {
      const { error: recUpdateError } = await supabase
        .from("recipients")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", recipient.id);

      if (recUpdateError) {
        console.error(`Failed to mark recipient ${recipient.id} as notified: ${recUpdateError.message}`);
      }
    } else {
      console.error(`Trigger email failed for recipient ${recipient.id}:`, emailResult.error);
    }
  }
}

export async function evaluateAllSwitches(deps: EvaluationDeps) {
  const { supabase, appUrl, sendGracePeriodWarning } = deps;

  const { data: switches, error: fetchError } = await supabase
    .from("switches")
    .select("id, status, last_checked_in_at, next_deadline_at, grace_period_days, label, user_id, grace_period_notified_at")
    .in("status", ["active", "grace_period", "triggered"]); // triggered included now, to catch retry-needed recipients

  if (fetchError) {
    throw new Error(`Failed to fetch switches: ${fetchError.message}`);
  }

  const results: { id: string; changed: boolean; status: string }[] = [];

  for (const sw of switches ?? []) {
    // Already-triggered switches: skip status computation entirely, just retry any
    // recipients still owed a notification, then move on.
    if (sw.status === "triggered") {
      await notifyRecipients(deps, sw);
      results.push({ id: sw.id, changed: false, status: sw.status });
      continue;
    }

    const result = computeStatus(
      {
        status: sw.status,
        lastCheckedInAt: sw.last_checked_in_at ? new Date(sw.last_checked_in_at) : null,
        nextDeadlineAt: sw.next_deadline_at ? new Date(sw.next_deadline_at) : null,
        gracePeriodDays: sw.grace_period_days,
      },
      new Date()
    );

    if (result.status === sw.status) {
      results.push({ id: sw.id, changed: false, status: result.status });
      continue;
    }

    const updates: Record<string, unknown> = {
      status: result.status,
      ...(result.triggeredAt ? { triggered_at: result.triggeredAt.toISOString() } : {}),
    };

    if (result.status === "grace_period" && !sw.grace_period_notified_at) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(sw.user_id);

      if (userError || !userData?.user?.email) {
        console.error(`Could not resolve email for user ${sw.user_id}:`, userError);
      } else {
        const gracePeriodEndsAt = new Date(sw.next_deadline_at!);
        gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + sw.grace_period_days);

        const emailResult = await sendGracePeriodWarning({
          to: userData.user.email,
          switchName: sw.label,
          gracePeriodEndsAt,
          checkInUrl: `${appUrl}/dashboard/switches/${sw.id}`,
        });

        if (emailResult.success) {
          updates.grace_period_notified_at = new Date().toISOString();
        } else {
          console.error(`Grace period email failed for switch ${sw.id}:`, emailResult.error);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("switches")
      .update(updates)
      .eq("id", sw.id);

    if (updateError) {
      console.error(`Failed to update switch ${sw.id}: ${updateError.message}`);
      results.push({ id: sw.id, changed: false, status: sw.status });
      continue;
    }

    if (result.status === "triggered") {
      await notifyRecipients(deps, sw);
    }

    results.push({ id: sw.id, changed: true, status: result.status });
  }

  return results;
}