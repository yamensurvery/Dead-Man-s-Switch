'use server';

import { createClient } from '@/lib/supabase/server';
import { sendCheckInConfirmation, sendRecipientInviteNotification } from '@/lib/notifications/email';

export async function checkIn(switchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: sw, error: fetchError } = await supabase
    .from('switches')
    .select('id, status, check_in_interval_days, user_id')
    .eq('id', switchId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !sw) throw new Error('Switch not found');

  if (sw.status === 'triggered' || sw.status === 'cancelled') {
    throw new Error(`Cannot check in on a switch with status "${sw.status}"`);
  }

  const now = new Date();
  const nextDeadline = new Date(now);
  nextDeadline.setDate(nextDeadline.getDate() + sw.check_in_interval_days);

  const { error: updateError } = await supabase
    .from('switches')
    .update({
      status: 'active',
      last_checked_in_at: now.toISOString(),
      next_deadline_at: nextDeadline.toISOString(),
      grace_period_notified_at: null,
    })
    .eq('id', switchId);

  if (updateError) throw updateError;

  return { success: true, nextDeadlineAt: nextDeadline.toISOString() };
}

export async function createSwitch(
  params: {
    label: string;
    checkInIntervalDays: number;
    gracePeriodDays: number;
    encryptedMessage?: string; // pack(iv, ciphertext) from lib/crypto's pack()
  },
  recipients: {
    email: string;
    encryptedPayload: string;
    secretHash: string;
    derivationSalt: string;
    fragmentSecret: string;
  }[],
  threshold: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const now = new Date();
  const nextDeadline = new Date(now);
  nextDeadline.setDate(nextDeadline.getDate() + params.checkInIntervalDays);

  const { data: sw, error: swError } = await supabase
    .from('switches')
    .insert({
      user_id: user.id,
      status: 'active',
      label: params.label,
      threshold,
      check_in_interval_days: params.checkInIntervalDays,
      grace_period_days: params.gracePeriodDays,
      encrypted_message: params.encryptedMessage ?? null,
      last_checked_in_at: now.toISOString(),
      next_deadline_at: nextDeadline.toISOString(),
    })
    .select()
    .single();
  if (swError) throw swError;

  const rows = recipients.map((r) => ({
    switch_id: sw.id,
    name: r.email,
    email: r.email,
    delivery_method: 'email' as const,
    encrypted_payload: r.encryptedPayload,
    secret_hash: r.secretHash,
    derivation_salt: r.derivationSalt,
  }));

  const { data: inserted, error: recError } = await supabase
    .from('recipients')
    .insert(rows)
    .select('id, email, access_token');
  if (recError) throw recError;

  const failedInvites: string[] = [];

  for (const row of inserted) {
    const match = recipients.find(r => r.email === row.email);
    if (!match) continue;

    const accessUrl = `${process.env.NEXT_PUBLIC_APP_URL}/recipient/${row.access_token}#s=${match.fragmentSecret}`;

    const result = await sendRecipientInviteNotification({
      to: row.email,
      ownerDisplayName: user.email ?? 'Someone',
      accessUrl,
    });

    if (!result.success) {
      console.error(`Invite email failed for ${row.email}:`, result.error);
      failedInvites.push(row.email);
    }
  }

  return { switchId: sw.id, failedInvites };
}
