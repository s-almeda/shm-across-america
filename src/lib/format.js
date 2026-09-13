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

/* The half of the stamp after the name: "on saturday, sept. 12 @ 2:22am
   local time:", in the viewer's own timezone. The name is rendered
   separately so it can carry the commenter's chosen colour. */
export function fmtStampTail(iso) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" }).toLowerCase();
  const hours24 = d.getHours();
  const hour = hours24 % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "pm" : "am";
  return `on ${weekday}, ${MONTHS_ABBR[d.getMonth()]} ${d.getDate()} @ ${hour}:${mins}${ampm} local time:`;
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

/* Tilt has to be derived from the thing itself, not Math.random(), or it
   jumps to a new angle on every re-render. Returns -range..+range. */
export function stableJitter(key, range) {
  // FNV-1a, then a finalising mix. The mix is the point: without it, keys
  // differing by one character ("pin3:0" / "pin3:1") hash to adjacent values
  // and every angle comes out nearly identical.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 * range - range;
}

/*
 * Tilts for a whole grid at once, because the rule is about neighbours.
 *
 * A per-card hash is a fair coin, and fair coins clump -- five cards leaning
 * the same way reads as a mistake rather than as randomness. Strictly
 * alternating fixes that but is worse: with an even number of columns, every
 * card in a column gets the same parity and each column ends up uniform.
 *
 * So the direction stays hashed, and is only overridden once it has run the
 * same way three times. Still stable per item, since the flips depend on the
 * hashes rather than on anything random.
 */
const MAX_RUN = 3;

/* How far a card may wander from its grid cell, in px. Small on purpose: the
   grid's gaps are tight enough that neighbours already almost touch, so a big
   nudge would overlap rather than read as hand-placed. */
const NUDGE_X = 5;
const NUDGE_Y = 4;

export function placementsFor(keys, range = 2.5) {
  let last = 0;
  let run = 0;
  return keys.map((key) => {
    const jitter = stableJitter(key, range);
    let sign = jitter < 0 ? -1 : 1;
    if (sign === last && run >= MAX_RUN) sign = -sign;
    run = sign === last ? run + 1 : 1;
    last = sign;
    return {
      // A dead-flat card among tilted ones looks like a bug, so keep a floor.
      rot: `${(sign * (0.55 + Math.abs(jitter) * 0.85)).toFixed(2)}deg`,
      /*
       * Separately hashed from the tilt, so the nudge doesn't correlate with
       * which way the card leans -- two independent wobbles read as
       * hand-placed, one doubled-up wobble reads as a formula.
       */
      dx: `${stableJitter(`${key}#x`, NUDGE_X).toFixed(1)}px`,
      dy: `${stableJitter(`${key}#y`, NUDGE_Y).toFixed(1)}px`,
    };
  });
}

/*
 * A commenter's chosen colour is picked for their name, at full strength on
 * white. The same colour behind a whole postit would be unreadable, so the
 * paper is that hue mixed most of the way to white -- their colour, but as
 * pastel stationery.
 */
export function pastel(hex, mix = 0.78) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return null;
  const channel = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(v + (255 - v) * mix);
  };
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/* Owner posts first (oldest to newest), then comments. A planned stop has
   neither photos nor notes -- only what visitors have left on it. */
export function buildItems(pin) {
  const owner = [
    ...(pin.photos ?? []).map((p) => ({
      kind: "photo",
      url: p.url,
      caption: p.caption,
      created_at: p.created_at,
    })),
    ...(pin.messages ?? []).map((m) => ({ kind: "note", text: m.text, created_at: m.created_at })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const comments = (pin.comments ?? [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((c) => ({
      kind: "comment",
      id: c.id,
      author_name: c.author_name,
      author_color: c.author_color,
      body: c.body,
      created_at: c.created_at,
    }));

  return [...owner, ...comments];
}
