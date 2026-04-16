const TAG_STYLES: Record<string, string> = {
  중요: "bg-red-50 text-red-700 ring-red-200",
  공통: "bg-violet-50 text-violet-700 ring-violet-200",
  플레이스: "bg-blue-50 text-blue-700 ring-blue-200",
  식당: "bg-orange-50 text-orange-700 ring-orange-200",
  예약: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  교육: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  외식업종: "bg-amber-50 text-amber-700 ring-amber-200",
};

const DEFAULT_STYLE = "bg-neutral-100 text-neutral-600 ring-neutral-200";

export function TagBadge({ label }: { label: string }) {
  const style = TAG_STYLES[label] ?? DEFAULT_STYLE;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}

export function TagBadges({
  importance,
  tags,
}: {
  importance: string | null | undefined;
  tags: string[] | null | undefined;
}) {
  const list: string[] = [];
  if (importance === "중요") list.push("중요");
  if (tags && tags.length > 0) {
    for (const t of tags) if (t && t !== "중요") list.push(t);
  }
  if (list.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {list.map((t, i) => (
        <TagBadge key={`${t}-${i}`} label={t} />
      ))}
    </span>
  );
}
