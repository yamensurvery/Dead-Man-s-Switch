'use client';
import { importKey, decryptBuffer, deriveKeyFromSecret, base64urlDecode, unpack, decrypt } from '@/lib/crypto';
import { combineShares } from '@/lib/shamir';
import { useEffect, useState, use } from 'react';
import {
  getRecipientPortalData,
  submitShare,
  getCombinedShares,
  getFilesForSwitch,
} from '@/app/actions/recipients';

function getFragmentSecret(): Uint8Array {
  const hash = window.location.hash; // e.g. "#s=abc123..."
  const params = new URLSearchParams(hash.slice(1));
  const secretParam = params.get('s');
  if (!secretParam) {
    throw new Error('Missing access secret in URL — this link may be incomplete.');
  }
  return base64urlDecode(secretParam);
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
      console.log('DEBUG ownSalt specifically:', data.ownSalt, typeof data.ownSalt);
      console.log('DEBUG ownShare specifically:', data.ownShare, typeof data.ownShare);
      console.log('DEBUG hash:', window.location.hash);

      const secret = getFragmentSecret();
      console.log('DEBUG secret:', secret);

      const salt = base64urlDecode(data.ownSalt);
      console.log('DEBUG salt:', salt);

      const derivedKey = await deriveKeyFromSecret(secret, salt);
      console.log('DEBUG derivedKey:', derivedKey);

      const { iv, ciphertext } = unpack(data.ownShare);
      console.log('DEBUG unpacked:', iv, ciphertext);

      const decryptedShare = await decrypt(derivedKey, iv, ciphertext);
      console.log('DEBUG decrypted:', decryptedShare);

      await submitShare(token, decryptedShare);
      await loadData();
    } catch (err) {
      console.error('DEBUG caught error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlock() {
    setDecrypting(true);
    setError(null);
    try {
      const shares = await getCombinedShares(token);
      const keyBytes = await combineShares(shares);
      const key = await importKey(keyBytes);

      const fileList = await getFilesForSwitch(token);
      setFiles(fileList);

      // Stash the reconstructed key on window for the download handler below.
      // Kept in memory only — never sent back to the server.
      (window as unknown as { __recipientKey: CryptoKey }).__recipientKey = key;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock yet.');
    } finally {
      setDecrypting(false);
    }
  }

  async function handleDownload(file: FileMeta) {
    setError(null);
    try {
      const key = (window as unknown as { __recipientKey?: CryptoKey }).__recipientKey;
      if (!key) {
        throw new Error('Key not loaded — click "Unlock" first.');
      }

      const { downloadAndDecryptFile } = await import('@/lib/files');
      const decrypted = await downloadAndDecryptFile(file.storage_path, file.iv, key);

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