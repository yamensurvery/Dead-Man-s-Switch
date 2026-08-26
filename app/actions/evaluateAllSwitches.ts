"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendGracePeriodWarning, sendRecipientTriggerNotification } from "@/lib/notifications/email";
import { evaluateAllSwitches as evaluateAllSwitchesCore } from "../../supabase/functions/_shared/evaluationCore.ts";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const CRON_SECRET = process.env.CRON_SECRET;

async function isAuthorized(): Promise<boolean> {
  // Path 1: called (directly or via a nested call from the cron route
  // handler) with the same CRON_SECRET bearer token GitHub Actions sends.
  const headerList = await headers();
  const authHeader = headerList.get("authorization");
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  // Path 2: called via the real Next.js Server Action RPC (e.g. from the
  // admin page), which carries the browser's Supabase session cookie
  // instead of a bearer token.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL;
}

export async function evaluateAllSwitches() {
  if (!(await isAuthorized())) {
    throw new Error("Not authorized");
  }

  const supabase = createServiceClient();

  return evaluateAllSwitchesCore({
    supabase,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    sendGracePeriodWarning,
    sendRecipientTriggerNotification,
  });
}