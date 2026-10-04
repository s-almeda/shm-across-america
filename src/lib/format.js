import tzlookup from "@photostructure/tz-lookup";

/* Newspaper-style month abbreviations -- no Intl format matches these. */
const MONTHS_ABBR = [
  "jan.", "feb.", "mar.", "apr.", "may", "june",
  "july", "aug.", "sept.", "oct.", "nov.", "dec.",
];

/* The IANA zone at the pin, so times read as they were on the clock where
   the post was made rather than on the viewer's. Undefined falls back to the
   viewer's zone, which Intl does on its own. */
export function pinTimeZone(pin) {
  try {
    return tzlookup(pin.lat, pin.lng);
  } catch {
    return undefined;
  }
}

/* Calendar and clock fields of a moment as seen in `timeZone`. */
function partsIn(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]),
  );
  return {
    weekday: p.weekday.toLowerCase(),
    year: +p.year,
    month: +p.month - 1,
    day: +p.day,
    hour: +p.hour,
    minute: p.minute,
    ampm: p.dayPeriod.toLowerCase(),
    zone: p.timeZoneName,
  };
}

export function fmtDate(iso, timeZone) {
  return new Date(iso).toLocaleString(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/* The half of the stamp after the name: "on saturday, sept. 12 @ 2:22am
   MDT:", in the pin's timezone. The name is rendered separately so it can
   carry the commenter's chosen colour. */
export function fmtStampTail(iso, timeZone) {
  const d = partsIn(iso, timeZone);
  return `on ${d.weekday}, ${MONTHS_ABBR[d.month]} ${d.day} @ ${d.hour}:${d.minute}${d.ampm} ${d.zone}:`;
}

/* The span of shm's own posts at a pin, in the pin's timezone. Visitors'
   comments are left out -- they can arrive long after shm has moved on. */
export function fmtDateRange(items, fallbackIso, timeZone) {
  const own = items.filter((i) => i.kind !== "comment");
  const isos = own.length ? own.map((i) => i.created_at) : [fallbackIso];
  const days = isos
    .map((iso) => partsIn(iso, timeZone))
    .map((p) => ({ ...p, key: p.year * 10000 + p.month * 100 + p.day }))
    .sort((a, b) => a.key - b.key);
  const lo = days[0];
  const hi = days[days.length - 1];

  const md = (p) => `${SHORT_MONTHS[p.month]} ${p.day}`;
  if (lo.key === hi.key) return md(lo);
  if (lo.year === hi.year && lo.month === hi.month) return `${md(lo)}–${hi.day}`;
  return `${md(lo)} – ${md(hi)}`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

/*
 * Everything at a pin in one chronological run, oldest first -- photos, shm's
 * notes and visitors' comments interleaved by when they were posted, so the
 * grid reads top to bottom as the story of that stop rather than as three
 * separate piles.
 */
export function buildItems(pin) {
  return [
    ...pin.photos.map((p) => ({
      kind: "photo",
      url: p.url,
      caption: p.caption,
      created_at: p.created_at,
    })),
    ...pin.messages.map((m) => ({ kind: "note", text: m.text, created_at: m.created_at })),
    ...pin.comments.map((c) => ({
      kind: "comment",
      id: c.id,
      author_name: c.author_name,
      author_color: c.author_color,
      body: c.body,
      created_at: c.created_at,
    })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
