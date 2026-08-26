"use client";

import { useState } from "react";
import { evaluateAllSwitches } from "@/app/actions/evaluateAllSwitches";

export default function AdminEvaluatePage() {
  const [results, setResults] = useState<
    { id: string; changed: boolean; status: string }[] | null
  >(null);
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    setLoading(true);
    try {
      const res = await evaluateAllSwitches();
      setResults(res);
    } catch (err) {
      setResults([{ id: "error", changed: false, status: (err as Error).message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Evaluate all switches (admin)</h1>
      <p style={{ color: "#888", fontSize: 14 }}>
        Manually triggers the same evaluation logic the scheduled cron jobs run.
      </p>
      <button onClick={handleRun} disabled={loading}>
        {loading ? "Running..." : "Run evaluation"}
      </button>
      {results && (
        <pre style={{ marginTop: 16 }}>{JSON.stringify(results, null, 2)}</pre>
      )}
    </div>
  );
}