'use client';

import { useState } from 'react';
import { splitKey, combineShares } from '@/lib/shamir';

export default function WasmTestPage() {
  const [result, setResult] = useState<string>('');

  async function runTest() {
    try {
      const key = crypto.getRandomValues(new Uint8Array(32));
      const shares = await splitKey(key, 3, 5);
      const recovered = await combineShares(shares.slice(0, 3));
      const matches = recovered.every((b, i) => b === key[i]);

      setResult(
        `shares.length = ${shares.length} (expect 5)\n` +
        `recovered matches original = ${matches} (expect true)`
      );
    } catch (err) {
      setResult(`ERROR: ${String(err)}`);
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <button onClick={runTest}>Run WASM Shamir smoke test</button>
      <pre>{result}</pre>
    </div>
  );
}