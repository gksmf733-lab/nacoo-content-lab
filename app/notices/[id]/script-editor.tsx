"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Initial = {
  title: string;
  tone: "urgent" | "opportunity";
  body_markdown: string;
  hashtags: string;
};

export function ScriptEditor({ id, initial }: { id: number; initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/scripts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        tone: form.tone,
        body_markdown: form.body_markdown,
        hashtags: form.hashtags.split(/\s+/).filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("저장되었습니다.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(`저장 실패: ${data.error ?? res.statusText}`);
    }
  }

  async function remove() {
    if (!confirm("이 릴스 대본을 정말 삭제할까요?")) return;
    const res = await fetch(`/api/scripts/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <Field label="제목">
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </Field>

      <Field label="톤">
        <select
          value={form.tone}
          onChange={(e) => setForm({ ...form, tone: e.target.value as Initial["tone"] })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          <option value="urgent">긴박·경고형</option>
          <option value="opportunity">정보·기회형</option>
        </select>
      </Field>

      <Field label="대본 (Markdown)">
        <textarea
          value={form.body_markdown}
          onChange={(e) => setForm({ ...form, body_markdown: e.target.value })}
          rows={24}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900"
        />
      </Field>

      <Field label="해시태그 (공백으로 구분)">
        <input
          type="text"
          value={form.hashtags}
          onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </Field>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={remove}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
