'use client';
import { importKey, decryptBuffer, deriveKeyFromSecret, base64urlDecode, unpack, pack, decrypt, encrypt } from '@/lib/crypto';
import { combineShares } from '@/lib/shamir';
import { useEffect, useState, use } from 'react';
import {
  getRecipientPortalData,
  submitShare,
  getCombinedShares,
  getFilesForSwitch,
} from '@/app/actions/recipients';

function getFragmentSecret(): Uint8Array {
  const hash = window.location.hash; // e.g. "#s=abc123...&r=def456..."
  const params = new URLSearchParams(hash.slice(1));
  const secretParam = params.get('s');
  if (!secretParam) {
    throw new Error('Missing access secret in URL — this link may be incomplete.');
  }
  return base64urlDecode(secretParam);
}

/**
 * The reconstruction secret is shared by every recipient of a switch — it's
 * what lets any of them re-encrypt their share before submitting it (so the
 * server never stores plaintext shares) and decrypt everyone's submitted
 * share once threshold is met (so combination happens client-side).
 */
function getReconstructionKeyRaw(): Uint8Array {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.slice(1));
  const reconstructionParam = params.get('r');
  if (!reconstructionParam) {
    throw new Error('Missing reconstruction secret in URL — this link may be incomplete.');
  }
  return base64urlDecode(reconstructionParam);
}


type PortalData = Awaited<ReturnType<typeof getRecipientPortalData>>;
type FileMeta = Awaited<ReturnType<typeof getFilesForSwitch>>[number];

export default function RecipientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [data, setData] = useState<PortalData>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [recipientKey, setRecipientKey] = useState<CryptoKey | null>(null);

  async function loadData() {
    setLoading(true);
    const result = await getRecipientPortalData(token);
    if (!result) {
      setNotFound(true);
    } else {
      setData(result);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (!data) throw new Error('Portal data not loaded.');

      const secret = getFragmentSecret();
      const salt = base64urlDecode(data.ownSalt);
      const derivedKey = await deriveKeyFromSecret(secret, salt);

      const { iv, ciphertext } = unpack(data.ownShare);
      const decryptedShare = await decrypt(derivedKey, iv, ciphertext);

      // Re-encrypt under the reconstruction key (shared by every recipient,
      // never sent to the server) before submitting, so the server only
      // ever stores a share it can't itself decrypt.
      const reconstructionKey = await importKey(getReconstructionKeyRaw());
      const reEncrypted = await encrypt(reconstructionKey, decryptedShare);
      const encryptedShare = pack(reEncrypted.iv, reEncrypted.ciphertext);

      await submitShare(token, encryptedShare);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlock() {
    setDecrypting(true);
    setError(null);
    try {
      const reconstructionKey = await importKey(getReconstructionKeyRaw());
      const encryptedShares = await getCombinedShares(token);
      const shares = await Promise.all(
        encryptedShares.map(async (encryptedShare) => {
          const { iv, ciphertext } = unpack(encryptedShare);
          return decrypt(reconstructionKey, iv, ciphertext);
        })
      );
      const keyBytes = await combineShares(shares);
      const key = await importKey(keyBytes);

      const fileList = await getFilesForSwitch(token);
      setFiles(fileList);

      // Kept in component state only — never sent back to the server, and
      // not reachable as a global off `window` (see handleDownload).
      setRecipientKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock yet.');
    } finally {
      setDecrypting(false);
    }
  }

  async function handleDownload(file: FileMeta) {
    setError(null);
    try {
      if (!recipientKey) {
        throw new Error('Key not loaded — click "Unlock" first.');
      }

      const { downloadAndDecryptFile } = await import('@/lib/files');
      const decrypted = await downloadAndDecryptFile(file.storage_path, file.iv, recipientKey);

      const blob = new Blob([decrypted]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}>
        <h1>Link not valid</h1>
        <p>
          This link isn&apos;t recognized, or the switch it&apos;s tied to hasn&apos;t triggered
          yet. If you believe this is an error, contact the person who shared this link with you.
        </p>
      </main>
    );
  }

  const enoughShares = data.submittedCount >= data.threshold;

  return (
    <main style={{ padding: 32, maxWidth: 560, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Secure access: {data.switchLabel}</h1>
      <p>Hi {data.recipientName}, you&apos;ve been designated as a recipient for this switch.</p>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ fontSize: 18 }}>Share status</h2>
        <p>
          {data.submittedCount} of {data.threshold} required shares submitted.
        </p>

        {!data.hasSubmitted && (
          <button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit my share'}
          </button>
        )}
        {data.hasSubmitted && <p>✅ You&apos;ve submitted your share.</p>}
      </section>

      {enoughShares && (
        <section style={{ marginTop: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
          <h2 style={{ fontSize: 18 }}>Unlock</h2>
          <p>Enough recipients have submitted their shares. You can now unlock the contents.</p>
          <button onClick={handleUnlock} disabled={decrypting}>
            {decrypting ? 'Unlocking…' : 'Unlock'}
          </button>

          {files && (
            <ul style={{ marginTop: 16 }}>
              {files.map((file) => (
                <li key={file.id} style={{ marginBottom: 8 }}>
                  {file.file_name} ({Math.round(file.size_bytes / 1024)} KB){' '}
                  <button onClick={() => handleDownload(file)}>Download</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p>}
    </main>
  );
}