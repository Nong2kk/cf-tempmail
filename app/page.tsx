"use client";

import { useState, useEffect } from "react";
import { Copy, Plus } from "lucide-react";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [emails, setEmails] = useState<string[]>([]);

  async function generateEmail() {
  const res = await fetch("/api/create", {
    method: "POST",
  });

  const data = await res.json();

  setEmail(data.email);

  const updated = [data.email, ...emails];

  setEmails(updated);

  localStorage.setItem(
    "temp-emails",
    JSON.stringify(updated)
  );
}

  async function copyEmail() {
    if (!email) return;

    await navigator.clipboard.writeText(email);

    alert("Copied!");
  }
useEffect(() => {
  const saved = localStorage.getItem("temp-emails");

  if (saved) {
    setEmails(JSON.parse(saved));
  }
}, []);
});
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">
          Private Temp Mail
        </h1>

        <p className="mt-2 text-slate-500">
          Generate unlimited aliases
        </p>

        <div className="mt-6 flex gap-3">
          <input
            value={email}
            readOnly
            placeholder="Click generate..."
            className="flex-1 rounded-xl border px-4 py-3"
          />

          <button
            onClick={copyEmail}
            className="rounded-xl bg-slate-900 px-4 text-white"
          >
            <Copy size={18} />
          </button>
        </div>

        <button
          onClick={generateEmail}
          className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-white"
        >
          <Plus size={18} />
          Generate Email
        </button>
<div className="mt-6 space-y-2">
  {emails.map((item) => (
    <div
      key={item}
      className="flex items-center justify-between rounded-xl border px-4 py-3"
    >
      <span className="text-sm">
        {item}
      </span>

      <button
        onClick={() => navigator.clipboard.writeText(item)}
        className="text-sm text-blue-600"
      >
        Copy
      </button>
    </div>
  ))}
</div>
      </div>
    </main>
  );
}