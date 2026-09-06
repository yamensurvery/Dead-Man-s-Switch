'use client';

import { useState, useMemo, type FormEvent } from 'react';
import {
  generateKey,
  exportKey,
  generateRecipientSecret,
  deriveKeyFromSecret,
  hashSecret,
  base64urlEncode,
  encrypt,
  pack,
} from '@/lib/crypto';
import { splitKey } from '@/lib/shamir';
import { createSwitch } from '@/app/actions/switch';
import { encryptAndUploadFile } from '@/lib/files';

type RecipientRow = { id: string; email: string };

function majorityThreshold(n: number): number {
  return Math.floor(n / 2) + 1;
}

function newRow(): RecipientRow {
  return { id: crypto.randomUUID(), email: '' };
}

export default function NewSwitchPage() {
  const [label, setLabel] = useState('');
  const [checkInIntervalDays, setCheckInIntervalDays] = useState(30);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recipients, setRecipients] = useState<RecipientRow[]>([newRow(), newRow()]);
  const [threshold, setThreshold] = useState(majorityThreshold(2));
  const [thresholdTouched, setThresholdTouched] = useState(false);
  const [prevRecipientCount, setPrevRecipientCount] = useState(recipients.length);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ switchId: string; failedInvites: string[]; filesUploaded: number } | null>(null);

  // Re-default the threshold to majority whenever the recipient count changes,
  // unless the user has manually overridden it — in which case we just clamp
  // it into range rather than silently discarding their choice.
  if (recipients.length !== prevRecipientCount) {
    setPrevRecipientCount(recipients.length);
    setThreshold(
      thresholdTouched
        ? Math.min(Math.max(threshold, 2), recipients.length)
        : majorityThreshold(recipients.length)
    );
  }

  const validEmails = useMemo(
    () => recipients.map((r) => r.email.trim()).filter((e) => e.length > 0),
    [recipients]
  );
  const hasDuplicateEmails = useMemo(() => {
    const seen = new Set<string>();
    for (const e of validEmails) {
      const lower = e.toLowerCase();
      if (seen.has(lower)) return true;
      seen.add(lower);
    }
    return false;
  }, [validEmails]);

  const canSubmit =
    label.trim().length > 0 &&
    recipients.length >= 2 &&
    validEmails.length === recipients.length &&
    !hasDuplicateEmails &&
    threshold >= 2 &&
    threshold <= recipients.length &&
    (message.trim().length > 0 || files.length > 0) &&
    !submitting;

  function updateRecipientEmail(id: string, email: string) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, email } : r)));
  }

  function addRecipient() {
    setRecipients((prev) => [...prev, newRow()]);
  }

  function removeRecipient(id: string) {
    setRecipients((prev) => (prev.length <= 2 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      // 1. Generate the master key.
      const key = await generateKey();
      const keyBytes = await exportKey(key);

      // 2. Split it — one share per recipient.
      const shares = await splitKey(keyBytes, threshold, recipients.length);

      // 2b. Generate a reconstruction key, shared by every recipient of this
      //     switch. It rides in every invite link's URL fragment (never
      //     persisted server-side) and is used to re-encrypt a recipient's
      //     share before it's submitted, so the server only ever stores
      //     shares it cannot itself decrypt — even once threshold-many are
      //     in the database.
      const reconstructionKey = await generateKey();
      const reconstructionSecret = base64urlEncode(await exportKey(reconstructionKey));

      // 3. Per recipient: fresh secret + salt, derive an HKDF key from it,
      //    encrypt that recipient's share, hash the secret for server-side
      //    verification only. The raw secret becomes the URL fragment.
      const preparedRecipients = await Promise.all(
        recipients.map(async (r, i) => {
          const secret = generateRecipientSecret();
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const derivedKey = await deriveKeyFromSecret(secret, salt);

          const { iv, ciphertext } = await encrypt(derivedKey, shares[i]);
          const encryptedPayload = pack(iv, ciphertext);
          const secretHash = await hashSecret(secret);

          return {
            email: r.email.trim(),
            encryptedPayload,
            secretHash,
            derivationSalt: base64urlEncode(salt),
            fragmentSecret: base64urlEncode(secret),
          };
        })
      );

      // 4. Encrypt the message (if any) with the master key directly.
      let encryptedMessage: string | undefined;
      if (message.trim().length > 0) {
        const { iv, ciphertext } = await encrypt(key, message);
        encryptedMessage = pack(iv, ciphertext);
      }

      // 5. Create the switch. The server never sees the master key, the raw
      //    shares, or the plaintext message. It does transiently see
      //    reconstructionSecret (to embed it in the invite emails it sends),
      //    the same way it already sees each fragmentSecret — neither is
      //    ever persisted to the database.
      const { switchId, failedInvites } = await createSwitch(
        { label: label.trim(), checkInIntervalDays, gracePeriodDays, encryptedMessage },
        preparedRecipients,
        threshold,
        reconstructionSecret
      );

      // 6. Files can only be attached once the switch exists (they're
      //    foreign-keyed to switchId), so this has to happen last.
      for (const file of files) {
        await encryptAndUploadFile(switchId, file, key);
      }

      setResult({ switchId, failedInvites, filesUploaded: files.length });
      setLabel('');
      setMessage('');
      setFiles([]);
      setRecipients([newRow(), newRow()]);
      setThresholdTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-500/80">
            New switch
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50">
            Set up a dead man&rsquo;s switch
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Everything below is encrypted in your browser before it leaves this
            device. The server only ever stores ciphertext.
          </p>
        </header>

        {result ? (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-5">
            <p className="text-sm font-medium text-emerald-300">Switch created</p>
            <p className="mt-1 font-mono text-xs text-emerald-400/80">{result.switchId}</p>
            <p className="mt-3 text-sm text-zinc-300">
              {result.filesUploaded > 0
                ? `${result.filesUploaded} file${result.filesUploaded === 1 ? '' : 's'} encrypted and uploaded.`
                : 'No files attached.'}
            </p>
            {result.failedInvites.length > 0 && (
              <p className="mt-2 text-sm text-amber-400">
                Invite email failed for: {result.failedInvites.join(', ')}
              </p>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-4 text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-200"
            >
              Create another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <section className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300">Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Family instructions"
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300">
                    Check-in every (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={checkInIntervalDays}
                    onChange={(e) => setCheckInIntervalDays(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300">
                    Grace period (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <label className="block text-sm font-medium text-zinc-300">
                Message <span className="text-zinc-600">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="A note for your recipients — released only if this switch triggers."
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </section>

            <section className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                Files <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-md file:border file:border-zinc-800 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:border-zinc-700"
              />
              {files.length > 0 && (
                <ul className="text-xs text-zinc-500">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-300">Recipients</label>
                <span className="font-mono text-xs text-zinc-500">
                  {threshold}-of-{recipients.length}
                </span>
              </div>

              <div className="space-y-2">
                {recipients.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      type="email"
                      value={r.email}
                      onChange={(e) => updateRecipientEmail(r.id, e.target.value)}
                      placeholder="recipient@example.com"
                      className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                    />
                    <button
                      type="button"
                      onClick={() => removeRecipient(r.id)}
                      disabled={recipients.length <= 2}
                      className="rounded-md border border-zinc-800 px-2.5 py-2 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Remove recipient"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {hasDuplicateEmails && (
                <p className="text-xs text-red-400">Recipient emails must be unique.</p>
              )}

              <button
                type="button"
                onClick={addRecipient}
                className="text-sm text-amber-500 hover:text-amber-400"
              >
                + Add recipient
              </button>

              <div className="pt-1">
                <label className="block text-sm font-medium text-zinc-300">
                  Shares required to unlock
                </label>
                <select
                  value={threshold}
                  onChange={(e) => {
                    setThresholdTouched(true);
                    setThreshold(Number(e.target.value));
                  }}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  {Array.from({ length: recipients.length - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n} of {recipients.length}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {error && (
              <div className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Encrypting and creating…' : 'Create switch'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}