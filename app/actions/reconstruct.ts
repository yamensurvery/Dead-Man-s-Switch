'use server';

import { createClient } from '@/lib/supabase/server';

export async function fetchEncryptedShares(switchId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recipients')
    .select('email, encrypted_payload, derivation_salt')
    .eq('switch_id', switchId);

  if (error) throw error;

  return data as { email: string; encrypted_payload: string; derivation_salt: string }[];
}