'use client';

import { useState } from 'react';
import {
  generateKey,
  exportKey,
  generateRecipientSecret,
  deriveKeyFromSecret,
  hashSecret,
  base64urlEncode,
  base64urlDecode,
  encrypt,
  decrypt,
  pack,
  unpack,
} from '@/lib/crypto';
import { splitKey, combineShares } from '@/lib/shamir';
import { createSwitch } from '@/app/actions/switch';
import { fetchEncryptedShares } from '@/app/actions/reconstruct';

const TEST_EMAILS = ['alice@example.com', 'bob@example.com', 'carol@example.com'];
const THRESHOLD = 2;

export default function SwitchTestPage() {
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function run() {
    setLog([]);
    try {
      // 1. Generate master key
      const key = await generateKey();
      const keyBytes = await exportKey(key);
      const originalHex = toHex(keyBytes);
      addLog(`✅ Generated AES key (${keyBytes.length} bytes)`);
      addLog(`   Original: ${originalHex}`);

      // 2. Split into shares — now client-side
      const shares = splitKey(keyBytes, THRESHOLD, TEST_EMAILS.length);
      addLog(`✅ Split into ${shares.length} shares (threshold ${THRESHOLD})`);

      // 3. Per recipient: generate secret + salt, derive key, encrypt share
      //    Keep secrets in memory here only to simulate what a recipient
      //    would have from their own URL fragment/email later.
      const recipientSecrets: Record<string, Uint8Array> = {};

      const preparedRecipients = await Promise.all(
        TEST_EMAILS.map(async (email, i) => {
          const secret = generateRecipientSecret();
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const derivedKey = await deriveKeyFromSecret(secret, salt);

          const { iv, ciphertext } = await encrypt(derivedKey, shares[i]);
          const encryptedPayload = pack(iv, ciphertext);
          const secretHash = await hashSecret(secret);

          recipientSecrets[email] = secret;

          return {
            email,
            encryptedPayload,
            secretHash,
            derivationSalt: base64urlEncode(salt),
            fragmentSecret: base64urlEncode(secret),
          };
        })
      );

      addLog(`✅ Encrypted ${preparedRecipients.length} shares client-side`);

      // TEMPORARY — log fragment secrets so we can manually build recipient URLs for testing
      preparedRecipients.forEach((r) => {
        addLog(`   ${r.email} → fragmentSecret: ${r.fragmentSecret}`);
      });

      // 4. Create switch — server never sees the master key or raw shares
      const { switchId, failedInvites } = await createSwitch(preparedRecipients, THRESHOLD);
      addLog(`\n✅ Switch created: ${switchId}`);
      if (failedInvites.length > 0) {
        addLog(`⚠️ Invite failed for: ${failedInvites.join(', ')}`);
      }

      // 5. Simulate recipient-side reconstruction: fetch ciphertext + salts,
      //    decrypt using secrets we (as "recipients") still hold, combine.
      const rows = await fetchEncryptedShares(switchId);
      addLog(`\n✅ Fetched ${rows.length} encrypted shares from DB`);

      const decryptedShares: string[] = [];
      for (const row of rows.slice(0, THRESHOLD)) {
        const secret = recipientSecrets[row.email];
        const salt = base64urlDecode(row.derivation_salt);
        const derivedKey = await deriveKeyFromSecret(secret, salt);
        const { iv, ciphertext } = unpack(row.encrypted_payload);
        const shareStr = await decrypt(derivedKey, iv, ciphertext);
        decryptedShares.push(shareStr);
      }

      addLog(`✅ Decrypted ${decryptedShares.length} shares (threshold met)`);

      const reconstructedBytes = combineShares(decryptedShares);
      const reconstructedHex = toHex(reconstructedBytes);
      addLog(`\n✅ Reconstructed from decrypted shares`);
      addLog(`   Reconstructed: ${reconstructedHex}`);

      // 6. Verify
      const match = originalHex === reconstructedHex;
      addLog(`\n${match ? '✅ MATCH — end-to-end round-trip works!' : '❌ MISMATCH'}`);
    } catch (err) {
      addLog(`❌ Error: ${err}`);
    }
  }

  return (
    <main className="p-8 max-w-2xl mx-auto font-mono">
      <h1 className="text-2xl font-bold mb-4">Switch Creation Test</h1>
      <button
        onClick={run}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-6 hover:bg-blue-700"
      >
        Run End-to-End Test
      </button>
      <div className="bg-gray-900 text-green-400 p-4 rounded text-sm whitespace-pre-wrap">
        {log.length === 0 ? 'Press Run End-to-End Test to start…' : log.join('\n')}
      </div>
    </main>
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}