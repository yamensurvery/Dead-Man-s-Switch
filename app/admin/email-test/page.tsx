"use client";

import { useState } from "react";

export default function AdminEmailTestPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  async function handleSend() {
    setStatus("Sending...");
    try {
      const res = await fetch("/api/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("✅ Sent! Check your inbox.");
    } catch (err) {
      setStatus(`❌ Error: ${(err as Error).message}`);
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Send test email (admin)</h1>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your email"
      />
      <button onClick={handleSend} style={{ marginLeft: 8 }}>
        Send test email
      </button>
      <p>{status}</p>
    </div>
  );
}