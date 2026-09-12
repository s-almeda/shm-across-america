/* Newspaper-style month abbreviations -- no Intl format matches these. */
const MONTHS_ABBR = [
  "jan.", "feb.", "mar.", "apr.", "may", "june",
  "july", "aug.", "sept.", "oct.", "nov.", "dec.",
];

export function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* "shm on saturday, sept. 12 @ 2:22am local time:" -- local to the viewer. */
export function fmtPostStamp(iso, who) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" }).toLowerCase();
  const hours24 = d.getHours();
  const hour = hours24 % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "pm" : "am";
  return `${who} on ${weekday}, ${MONTHS_ABBR[d.getMonth()]} ${d.getDate()} @ ${hour}:${mins}${ampm} local time:`;
}

export function fmtDateRange(items, fallbackIso) {
  const times = items.map((i) => new Date(i.created_at).getTime());
  if (!times.length) times.push(new Date(fallbackIso).getTime());
  const lo = new Date(Math.min(...times));
  const hi = new Date(Math.max(...times));

  const mo = { month: "short", day: "numeric" };
  if (lo.toDateString() === hi.toDateString()) return lo.toLocaleDateString(undefined, mo);
  if (lo.getMonth() === hi.getMonth()) {
    return `${lo.toLocaleDateString(undefined, mo)}–${hi.getDate()}`;
  }
  return `${lo.toLocaleDateString(undefined, mo)} – ${hi.toLocaleDateString(undefined, mo)}`;
}

export function itemKey(item) {
  return `${item.kind}:${item.id ?? ""}:${item.created_at ?? ""}:${
    item.url ?? item.text ?? item.body ?? ""
  }`;
}

/* Tilt has to be derived from the item, not Math.random(), or every card
   jumps to a new angle on re-render. Roughly -range..+range. */
export function stableRotation(key, range = 2.5) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const n = (((h % 1000) + 1000) % 1000) / 999;
  return `${(n * 2 * range - range).toFixed(2)}deg`;
}

/* Owner posts first (oldest to newest), then comments. */
export function buildItems(pin) {
  const owner = [
    ...pin.photos.map((p) => ({
      kind: "photo",
      url: p.url,
      caption: p.caption,
      created_at: p.created_at,
    })),
    ...pin.messages.map((m) => ({ kind: "note", text: m.text, created_at: m.created_at })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const comments = pin.comments
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((c) => ({
      kind: "comment",
      id: c.id,
      author_name: c.author_name,
      body: c.body,
      created_at: c.created_at,
    }));

  return [...owner, ...comments];
}
