"use server";

import { createClient } from "@/lib/supabase/server";
import { computeStatus } from "@/lib/checkInStateMachine";



export async function evaluateSwitch(switchId: string) {
  const supabase = await createClient();

  const { data: sw, error: fetchError } = await supabase
    .from("switches")
    .select("status, last_checked_in_at, next_deadline_at, grace_period_days")
    .eq("id", switchId)
    .single();

  if (fetchError || !sw) {
    throw new Error(`Failed to fetch switch: ${fetchError?.message ?? "not found"}`);
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

  // No-op if nothing changed
  if (result.status === sw.status) {
    return { changed: false, status: result.status };
  }

  const { error: updateError } = await supabase
    .from("switches")
    .update({
      status: result.status,
      ...(result.triggeredAt ? { triggered_at: result.triggeredAt.toISOString() } : {}),
    })
    .eq("id", switchId);

  if (updateError) {
    throw new Error(`Failed to update switch: ${updateError.message}`);
  }

  return { changed: true, status: result.status };
}