'use server';

import { createServiceClient } from '@/lib/supabase/service';

/**
 * Looks up a recipient by their access_token and returns everything
 * the portal page needs to render: switch status/threshold, this
 * recipient's own share, and how many shares have been submitted so far.
 *
 * Returns null if the token doesn't match a recipient, or if the
 * switch hasn't actually triggered yet (so a valid-but-early token
 * can't be used to peek at anything before it's supposed to be available).
 */
export async function getRecipientPortalData(token: string) {
  const supabase = createServiceClient();

  const { data: recipient, error: recError } = await supabase
    .from('recipients')
    .select('id, switch_id, name, encrypted_payload, derivation_salt') // added derivation_salt
    .eq('access_token', token)
    .single();

  if (recError || !recipient) {
    return null;
  }

  const { data: sw, error: swError } = await supabase
    .from('switches')
    .select('id, label, status, threshold')
    .eq('id', recipient.switch_id)
    .single();

  if (swError || !sw) {
    return null;
  }

  if (sw.status !== 'triggered') {
    return null;
  }

  const { count, error: countError } = await supabase
    .from('submitted_shares')
    .select('id', { count: 'exact', head: true })
    .eq('switch_id', sw.id);

  if (countError) {
    console.error(`Failed to count submitted shares for switch ${sw.id}: ${countError.message}`);
  }

  const { data: ownSubmission } = await supabase
    .from('submitted_shares')
    .select('id')
    .eq('switch_id', sw.id)
    .eq('recipient_id', recipient.id)
    .maybeSingle();

  return {
    switchLabel: sw.label,
    threshold: sw.threshold,
    recipientName: recipient.name,
    ownShare: recipient.encrypted_payload,
    ownSalt: recipient.derivation_salt,
    submittedCount: count ?? 0,
    hasSubmitted: !!ownSubmission,
  };
}

/**
 * Records that this recipient has contributed their share. `encryptedShare`
 * is the recipient's plaintext share, re-encrypted client-side under the
 * switch's shared reconstruction key (which lives only in every recipient's
 * URL fragment, never on the server). The server stores and later returns
 * this ciphertext verbatim — it never holds a key that can open it, so even
 * once `threshold` rows exist in this table, the server itself still can't
 * reconstruct the secret.
 */
export async function submitShare(token: string, encryptedShare: string) {
  const supabase = createServiceClient();

  const { data: recipient, error: recError } = await supabase
    .from('recipients')
    .select('id, switch_id')   // no longer need encrypted_payload here
    .eq('access_token', token)
    .single();

  if (recError || !recipient) {
    throw new Error('Invalid or expired access link.');
  }

  const { data: sw, error: swError } = await supabase
    .from('switches')
    .select('status')
    .eq('id', recipient.switch_id)
    .single();

  if (swError || !sw || sw.status !== 'triggered') {
    throw new Error('This switch has not triggered — nothing to submit yet.');
  }

  const { error: insertError } = await supabase
    .from('submitted_shares')
    .insert({
      switch_id: recipient.switch_id,
      recipient_id: recipient.id,
      share: encryptedShare,   // ciphertext under the reconstruction key
    });

  if (insertError && insertError.code !== '23505') {
    throw new Error(`Failed to submit share: ${insertError.message}`);
  }

  const { count, error: countError } = await supabase
    .from('submitted_shares')
    .select('id', { count: 'exact', head: true })
    .eq('switch_id', recipient.switch_id);

  if (countError) {
    console.error(`Failed to recount submitted shares for switch ${recipient.switch_id}: ${countError.message}`);
  }

  return { submittedCount: count ?? 0 };
}

/**
 * Once threshold is met, returns every submitted share (still encrypted
 * under the switch's reconstruction key) for this recipient's switch, so
 * the client can decrypt each one with that key — recovered from its own
 * URL fragment — before combining them to reconstruct the master key.
 * Re-verifies the token and threshold server-side rather than trusting the
 * caller's claim that "enough" shares exist.
 */
export async function getCombinedShares(token: string) {
  const supabase = createServiceClient();

  const { data: recipient, error: recError } = await supabase
    .from('recipients')
    .select('id, switch_id')
    .eq('access_token', token)
    .single();

  if (recError || !recipient) {
    throw new Error('Invalid or expired access link.');
  }

  const { data: sw, error: swError } = await supabase
    .from('switches')
    .select('threshold, status')
    .eq('id', recipient.switch_id)
    .single();

  if (swError || !sw || sw.status !== 'triggered') {
    throw new Error('This switch has not triggered — nothing to reconstruct yet.');
  }

  const { data: submitted, error: shareError } = await supabase
    .from('submitted_shares')
    .select('share')
    .eq('switch_id', recipient.switch_id);

  if (shareError) {
    throw new Error(`Failed to fetch submitted shares: ${shareError.message}`);
  }

  if (!submitted || submitted.length < sw.threshold) {
    throw new Error(
      `Not enough shares yet: ${submitted?.length ?? 0} of ${sw.threshold} required.`
    );
  }

  return submitted.map((s) => s.share);
}

/**
 * Returns metadata (not content — decryption happens client-side) for every
 * encrypted file attached to this recipient's switch. Gated the same way as
 * getCombinedShares: only available once threshold shares are in, since file
 * paths + IVs are only useful alongside a reconstructed key anyway, but we
 * still don't want to hand them out early.
 */
export async function getFilesForSwitch(token: string) {
  const supabase = createServiceClient();

  const { data: recipient, error: recError } = await supabase
    .from('recipients')
    .select('id, switch_id')
    .eq('access_token', token)
    .single();

  if (recError || !recipient) {
    throw new Error('Invalid or expired access link.');
  }

  const { data: sw, error: swError } = await supabase
    .from('switches')
    .select('threshold, status')
    .eq('id', recipient.switch_id)
    .single();

  if (swError || !sw || sw.status !== 'triggered') {
    throw new Error('This switch has not triggered — nothing to access yet.');
  }

  const { count, error: countError } = await supabase
    .from('submitted_shares')
    .select('id', { count: 'exact', head: true })
    .eq('switch_id', recipient.switch_id);

  if (countError || (count ?? 0) < sw.threshold) {
    throw new Error('Not enough shares yet — files remain locked until threshold is met.');
  }

  const { data: files, error: filesError } = await supabase
    .from('encrypted_files')
    .select('id, file_name, storage_path, iv, size_bytes')
    .eq('switch_id', recipient.switch_id);

  if (filesError) {
    throw new Error(`Failed to fetch files: ${filesError.message}`);
  }

  return files ?? [];
}