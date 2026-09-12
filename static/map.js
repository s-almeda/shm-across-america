/*
 * Pins render at one constant size at every zoom level -- pan and zoom
 * freely to browse the whole map. Clicking a pin flies in and opens its
 * posts; clicking it again (or "back to map") flies back to wherever you
 * were browsing before.
 */

// ---------- tuning knobs ----------
const ZOOM_MIN = 4; // floor: pull back far enough for the whole country
const ZOOM_OVERVIEW = 5; // initial view on page load
const ZOOM_DETAIL = 16; // street level; posts read at full size
const CARD_SMALL = 44; // stack sliver size on the map (px)
const PIN_ANCHOR = { x: 78, y: 92 }; // where a focused pin sits in the frame

/*
 * Marker art. Every size is a clean fraction of the source file, because
 * these render with image-rendering: pixelated (nearest neighbour) --
 * which is crisp on exact ratios but crunchy on arbitrary ones:
 *   car.png   461x288 -> 1/4
 *   tack_1    51x61   -> 1/2
 *   pin_1     44x48   -> 1/2
 * `blend` multiplies the art into the map, so art that isn't cut out
 * reads as a marker drawing instead of a white-boxed sticker.
 */
/*
 * `ax`/`ay` are the anchor point as a fraction of the art, i.e. which
 * part of the image lands on the coordinate. 0.5/0.5 centres it; a
 * smaller `ax` pushes the art to the right of the point, which is how the
 * car parks beside its pin rather than on top of it.
 */
const ICONS = {
  car: { src: "/assets/car.png", w: 176, h: 108, blend: false, ax: 0.2, ay: 0.9 },
  tack: { src: "/assets/tacks/tack_1.png", w: 26, h: 31, blend: true, ax: 0.5, ay: 0.5 },
  stop: { src: "/assets/pins/pin_1.png", w: 22, h: 24, blend: true, ax: 0.5, ay: 0.5 },
};

const ABOUT_HTML = `
  <p>in september 2026, shm garanganao almeda began their cross-country trip across america, from Berkeley, CA to New Milford, NJ! i made this tracker so that my loved ones could follow along on my jourrnneyyy!</p>
  <p>the orange pins mark planned destinations; green thumbtacks mark places that i have visited.</p>
    <p>leaving Berkeley, my home for the past 7 years, is already feeling so heartbreakingly bittersweet... 
    going on a big adventure is scary....
    hopper, anya, and i might get kinda lonely in the cornfields of america....
    <br> 
    <strong>so please consider leaving me lots and lots of notes/comments!! :D </strong></p>
`;

const map = L.map("map", {
  zoomControl: true,
  minZoom: ZOOM_MIN,
  maxZoom: ZOOM_DETAIL,
  // Markers are fixed-pixel already, but Leaflet transform-scales the
  // marker pane mid-zoom, which briefly stretches the art. Off means the
  // car and tacks hold exactly one size through any zoom.
  markerZoomAnimation: false,
}).setView([39.5, -98.35], ZOOM_OVERVIEW);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: ZOOM_DETAIL,
}).addTo(map);

/*
 * #map-frame is sized via CSS aspect-ratio, which can still be settling
 * when Leaflet first measures its container. Re-measure once layout has
 * settled, and again on resize (the mobile breakpoint changes the
 * frame's aspect ratio entirely).
 */
requestAnimationFrame(() => map.invalidateSize());
window.addEventListener("resize", () => map.invalidateSize());

/*
 * Leaflet animates a zoom by transform-scaling the whole overlay pane,
 * which stretches the route line's stroke into a thick blurry smear until
 * it redraws at the new zoom. Hiding the pane for the duration skips the
 * distortion entirely -- the line just reappears at its correct weight.
 */
map.on("zoomstart", () => frameEl.classList.add("zooming"));
map.on("zoomend", () => frameEl.classList.remove("zooming"));

let tripData = null;
let expandedPinId = null;
let preOpenView = null; // { center, zoom } captured right before a pin opens
const markersByPinId = new Map();

const frameEl = document.getElementById("map-frame");
const pinView = document.getElementById("pin-view");
const postGrid = document.getElementById("post-grid");
const placeEl = document.getElementById("pin-view-place");
const datesEl = document.getElementById("pin-view-dates");
const writeNoteBtn = document.getElementById("write-note");

// ---------- small helpers ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

/*
 * Every note sits at a slight angle, but the angle has to be *stable* --
 * derived from the item itself rather than Math.random(), or cards would
 * jump to new angles every time the grid re-renders (after posting a
 * comment, flagging one). Returns roughly -4deg..+4deg.
 */
function stableRotation(key, range = 2.5) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const n = (((h % 1000) + 1000) % 1000) / 999;
  return (n * 2 * range - range).toFixed(2);
}

/*
 * Hover re-rolls the tilt. CSS can't randomise, so each mouseenter writes
 * a fresh --rot-hover, which the :hover rule prefers over the resting
 * --rot; leaving falls back automatically, no cleanup needed.
 */
function wireHoverTilt(el, range = 7) {
  el.addEventListener("mouseenter", () => {
    const deg = (Math.random() * 2 - 1) * range;
    el.style.setProperty("--rot-hover", `${deg.toFixed(2)}deg`);
  });
}

function itemKey(item) {
  return `${item.kind}:${item.id ?? ""}:${item.created_at ?? ""}:${
    item.url ?? item.text ?? item.body ?? ""
  }`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/*
 * "shm on saturday, sept. 12 @ 2:22am local time:" -- newspaper-style
 * month abbreviations, which don't match any Intl format, hence the table.
 * The time is the *viewer's* local time (what the browser reports), not
 * the timezone the pin sits in.
 */
const MONTHS_ABBR = [
  "jan.", "feb.", "mar.", "apr.", "may", "june",
  "july", "aug.", "sept.", "oct.", "nov.", "dec.",
];

function fmtPostStamp(iso, who) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" }).toLowerCase();
  const hours24 = d.getHours();
  const hour = hours24 % 12 || 12;
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "pm" : "am";
  return `${who} on ${weekday}, ${MONTHS_ABBR[d.getMonth()]} ${d.getDate()} @ ${hour}:${mins}${ampm} local time:`;
}

function fmtDateRange(items, fallbackIso) {
  const times = items.map((i) => new Date(i.created_at).getTime());
  if (!times.length) times.push(new Date(fallbackIso).getTime());
  const lo = new Date(Math.min(...times));
  const hi = new Date(Math.max(...times));

  const mo = { month: "short", day: "numeric" };
  if (lo.toDateString() === hi.toDateString()) {
    return lo.toLocaleDateString(undefined, mo);
  }
  if (lo.getMonth() === hi.getMonth()) {
    return `${lo.toLocaleDateString(undefined, mo)}–${hi.getDate()}`;
  }
  return `${lo.toLocaleDateString(undefined, mo)} – ${hi.toLocaleDateString(undefined, mo)}`;
}

/* Owner posts first (newest last), then comments. */
function buildItems(pin) {
  const owner = [
    ...pin.photos.map((p) => ({ kind: "photo", url: p.url, created_at: p.created_at })),
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

// ---------- high-level view: pin + stack ----------

/*
 * The stack under a pin hints at what's posted there without opening
 * anything: up to four slivers, coloured by type (white = photo,
 * green = the owner's notes, yellow = comments).
 */
function pinIcon(pin, iconKey) {
  const icon = ICONS[iconKey];
  let peeks = "";

  if (pin) {
    const types = buildItems(pin)
      .slice(-4)
      .map((i) => (i.kind === "photo" ? "peek-white" : i.kind === "note" ? "peek-green" : "peek-yellow"));

    peeks = types
      .map((cls, i) => {
        const rot = (i - (types.length - 1) / 2) * 7;
        // pushed below the marker centre so the pin overlaps the stack's top
        const dy = 16 + i * 3;
        return `<div class="stack-peek ${cls}" style="width:${CARD_SMALL}px;height:${CARD_SMALL}px;transform:translate(-50%,-50%) translate(0,${dy}px) rotate(${rot}deg)"></div>`;
      })
      .join("");
  }

  // The stack is pinned to the anchor, not the middle of the art, so it
  // stays on the actual coordinate even when the art is offset (the car).
  const stackPos = `left:${icon.ax * 100}%;top:${icon.ay * 100}%`;

  // Hover scales .pin-stack up slightly; pivoting on the icon's own
  // anchor fraction (rather than the default 50% 50%) keeps an
  // off-centre icon like the car pinned to its real map coordinate
  // instead of visibly drifting as it grows.
  const pivot = `transform-origin:${icon.ax * 100}% ${icon.ay * 100}%`;

  return L.divIcon({
    html:
      `<div class="pin-stack" style="${pivot}">` +
      `<div class="stack-layer" style="${stackPos}">${peeks}</div>` +
      `<img class="marker-art${icon.blend ? " marker-art--blend" : ""}" src="${icon.src}" ` +
      `style="width:${icon.w}px;height:${icon.h}px" alt="">` +
      `</div>`,
    className: "pin-stack-wrap",
    iconSize: [icon.w, icon.h],
    iconAnchor: [icon.w * icon.ax, icon.h * icon.ay],
  });
}

function pinTooltipHtml(pin) {
  const items = buildItems(pin);
  const place = pin.label || "Somewhere out there";
  const range = fmtDateRange(items, pin.created_at);
  const count = items.length;
  return (
    `<div class="tip-place">${escapeHtml(place)}</div>` +
    `<div class="tip-meta">${range}${count ? ` · ${count} post${count === 1 ? "" : "s"}` : ""}</div>`
  );
}

// ---------- camera ----------

/* Center the map so `latlng` lands at PIN_ANCHOR instead of the middle. */
function anchoredCenter(latlng, zoom) {
  const size = map.getSize();
  const pt = map.project(latlng, zoom);
  const shifted = pt.subtract([PIN_ANCHOR.x - size.x / 2, PIN_ANCHOR.y - size.y / 2]);
  return map.unproject(shifted, zoom);
}

function freezeMap() {
  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.doubleClickZoom.disable();
  map.touchZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
}

function unfreezeMap() {
  map.dragging.enable();
  map.scrollWheelZoom.enable();
  map.doubleClickZoom.enable();
  map.touchZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
}

// ---------- low-level view: the post grid ----------

function buildPostCard(item) {
  const el = document.createElement("div");
  el.className = "post-card";
  el.style.setProperty("--rot", `${stableRotation(itemKey(item))}deg`);

  if (item.kind === "photo") {
    el.classList.add("post-photo");
    el.innerHTML =
      `<img src="${item.url}" alt="">` +
      `<div class="polaroid-caption">${fmtDate(item.created_at)}</div>`;
    el.addEventListener("click", () => openPhoto(item.url));
    wireHoverTilt(el);
  } else if (item.kind === "note") {
    el.classList.add("postit", "postit-green");
    el.innerHTML =
      `<div class="post-stamp">${escapeHtml(fmtPostStamp(item.created_at, "shm"))}</div>` +
      `<p>${escapeHtml(item.text)}</p>`;
  } else if (item.kind === "comment") {
    el.classList.add("postit", "postit-yellow");
    el.innerHTML =
      `<button type="button" class="flag-icon-btn" title="Flag this comment" aria-label="Flag this comment">` +
      `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">` +
      `<line x1="5" y1="3" x2="5" y2="21" stroke="#c0392b" stroke-width="2" stroke-linecap="round" />` +
      `<path d="M5 4 L19 4 L15 8 L19 12 L5 12 Z" fill="#c0392b" />` +
      `</svg></button>` +
      `<div class="post-stamp">${escapeHtml(fmtPostStamp(item.created_at, item.author_name))}</div>` +
      `<p>${escapeHtml(item.body)}</p>`;
    el.querySelector(".flag-icon-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      flagComment(item.id);
    });
  }

  return el;
}

/*
 * FLIP the cards out of the stack: measure each card's final grid slot,
 * start it shrunk down onto the pin, then release it. Staggering the
 * releases is what reads as the stack fanning out.
 */
function flipCardsIn(cards) {
  const frame = frameEl.getBoundingClientRect();

  cards.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    const cx = r.left - frame.left + r.width / 2;
    const cy = r.top - frame.top + r.height / 2;
    const dx = PIN_ANCHOR.x - cx;
    const dy = PIN_ANCHOR.y - cy;
    const scale = CARD_SMALL / Math.max(r.width, 1);

    card.style.transition = "none";
    // starts square-on in the stack, then settles into its own slight angle
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`;
    card.style.opacity = "0";

    requestAnimationFrame(() => {
      const delay = i * 35;
      card.style.transition =
        `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms,` +
        `opacity 0.3s ease ${delay}ms`;
      // cleared so the CSS resting transform -- rotate(var(--rot)) -- applies
      card.style.transform = "";
      card.style.opacity = "1";
      // Otherwise this inline transition permanently overrides the CSS
      // hover transition (0.16s ease-out), leaving every card stuck using
      // the flip-in's 0.45s timing + per-card stagger delay for hover too.
      setTimeout(() => {
        card.style.transition = "";
      }, 450 + delay + 50);
    });
  });
}

function renderPinView(pin) {
  const items = buildItems(pin);

  placeEl.textContent = pin.label || "Somewhere out there";
  datesEl.textContent = fmtDateRange(items, pin.created_at);

  // the paw button writes to whichever pin is open
  writeNoteBtn.classList.toggle("hidden", !tripData.comments_enabled);

  pinView.style.setProperty("--anchor-x", `${PIN_ANCHOR.x}px`);
  pinView.style.setProperty("--anchor-y", `${PIN_ANCHOR.y}px`);

  postGrid.innerHTML = "";
  const cards = items.map((item) => {
    const card = buildPostCard(item);
    postGrid.appendChild(card);
    return card;
  });

  pinView.classList.add("is-open");
  pinView.setAttribute("aria-hidden", "false");
  flipCardsIn(cards);
}

function expandPin(pin) {
  expandedPinId = pin.id;
  freezeMap();

  const marker = markersByPinId.get(pin.id);
  if (marker) {
    marker.closeTooltip();
    const el = marker.getElement();
    if (el) el.classList.add("is-expanded");
  }

  renderPinView(pin);
}

function collapsePinView() {
  if (expandedPinId === null) return;

  const marker = markersByPinId.get(expandedPinId);
  if (marker) {
    const el = marker.getElement();
    if (el) el.classList.remove("is-expanded");
  }

  pinView.classList.remove("is-open");
  pinView.setAttribute("aria-hidden", "true");
  postGrid.innerHTML = "";
  frameEl.classList.remove("pin-expanded");
  map.invalidateSize();
  expandedPinId = null;
  unfreezeMap();
}

/*
 * Click a pin: save where you were browsing, then fly in with the pin
 * landing at PIN_ANCHOR. The frame grows first (mobile gives the feed
 * more height when a pin is open), then we re-measure, so the anchor is
 * computed against the size the map will actually have when it lands.
 */
function focusPin(pin) {
  if (expandedPinId === pin.id) {
    backToMap();
    return;
  }
  const wasOpen = expandedPinId !== null;
  collapsePinView();

  if (!wasOpen) {
    preOpenView = { center: map.getCenter(), zoom: map.getZoom() };
  }

  frameEl.classList.add("pin-expanded");
  map.invalidateSize();

  map.flyTo(anchoredCenter([pin.lat, pin.lng], ZOOM_DETAIL), ZOOM_DETAIL, { duration: 0.7 });
  map.once("moveend", () => {
    expandPin(pin);
  });
}

/* Closing always returns to wherever you were browsing before you opened
   a pin, not a fixed overview -- free pan/zoom means that position is
   whatever the person chose, not something we can predict. */
function backToMap() {
  collapsePinView();
  const target = preOpenView ?? { center: map.getCenter(), zoom: ZOOM_OVERVIEW };
  preOpenView = null;

  map.flyTo(target.center, target.zoom, { duration: 0.7 });
  map.once("moveend", () => {
  });
}

// ---------- photo lightbox ----------

const photoLightbox = document.getElementById("photo-lightbox");
const photoImg = document.getElementById("photo-lightbox-img");

function openPhoto(url) {
  photoImg.src = url;
  photoLightbox.classList.add("is-open");
}

function closePhoto() {
  photoLightbox.classList.remove("is-open");
  photoImg.src = "";
}

document.getElementById("photo-return").addEventListener("click", closePhoto);
photoLightbox.addEventListener("click", (e) => {
  if (e.target === photoLightbox) closePhoto();
});

// ---------- XP.css window: about + add-comment ----------

const modal = document.getElementById("asset-modal");
const modalTitleEl = document.getElementById("asset-title");
const modalBodyEl = document.getElementById("asset-body");
const modalStatusEl = document.getElementById("asset-status");

function openModal(title, bodyHtml, statusText) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = bodyHtml;
  modalStatusEl.textContent = statusText || " ";
  modal.classList.add("is-open");
}

function closeModal() {
  modal.classList.remove("is-open");
  modalBodyEl.innerHTML = "";
}

document.querySelector("#asset-window .popup-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById("about-trigger").addEventListener("click", () => {
  openModal("about", ABOUT_HTML, "");
});

wireHoverTilt(document.getElementById("about-trigger"), 5);
wireHoverTilt(writeNoteBtn, 5);

/* Lives inside the pin view, so it always targets the pin being read. */
writeNoteBtn.addEventListener("click", () => {
  if (expandedPinId !== null) openAddComment(expandedPinId);
});

document.getElementById("back-to-map").addEventListener("click", backToMap);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (photoLightbox.classList.contains("is-open")) closePhoto();
  else if (modal.classList.contains("is-open")) closeModal();
  else if (expandedPinId !== null) backToMap();
});

function openAddComment(pinId) {
  if (!tripData.comments_enabled) {
    openModal("Comments off", `<p>Comments are turned off right now.</p>`, "");
    return;
  }

  openModal(
    "New comment",
    `<form id="modal-comment-form">
       <input id="modal-comment-name" type="text" placeholder="Your name" required>
       <textarea id="modal-comment-body" placeholder="Say something..." required></textarea>
       <button type="submit">Post</button>
     </form>`,
    ""
  );

  document.getElementById("modal-comment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const author_name = document.getElementById("modal-comment-name").value.trim();
    const body = document.getElementById("modal-comment-body").value.trim();
    if (!author_name || !body) return;

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin_id: pinId, author_name, body }),
    });

    if (res.ok) {
      closeModal();
      await refreshExpanded(pinId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Couldn't post comment.");
    }
  });
}

async function flagComment(id) {
  if (!confirm("Flag this comment? It will be hidden immediately.")) return;
  await fetch(`/api/comments/${id}/flag`, { method: "POST" });
  await refreshExpanded(expandedPinId);
}

/* Reload trip data and re-render the open pin view in place. */
async function refreshExpanded(pinId) {
  await loadTrip();
  const pin = tripData.pins.find((p) => p.id === pinId);
  if (pin && expandedPinId === pinId) renderPinView(pin);
}

// ---------- data ----------

let routeLine = null;
const stopMarkers = [];

async function loadTrip() {
  const res = await fetch("/api/trip");
  tripData = await res.json();

  markersByPinId.forEach((marker) => map.removeLayer(marker));
  markersByPinId.clear();
  if (routeLine) map.removeLayer(routeLine);
  stopMarkers.forEach((m) => map.removeLayer(m));
  stopMarkers.length = 0;

  const latlngs = [];
  let currentPin = null;

  tripData.pins.forEach((pin) => {
    latlngs.push([pin.lat, pin.lng]);
    if (pin.is_current) currentPin = pin;

    const isCurrent = pin.is_current;
    const marker = L.marker([pin.lat, pin.lng], {
      icon: pinIcon(pin, isCurrent ? "car" : "tack"),
    }).addTo(map);

    marker.bindTooltip(pinTooltipHtml(pin), {
      direction: "top",
      offset: [0, -22],
      className: "pin-tooltip",
    });

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      focusPin(pin);
    });

    markersByPinId.set(pin.id, marker);
    const el = marker.getElement();
    if (el) {
      if (expandedPinId === pin.id) el.classList.add("is-expanded");
      const stack = el.querySelector(".pin-stack");
      if (stack) wireHoverTilt(stack, 4);
    }
  });

  if (latlngs.length > 1) {
    routeLine = L.polyline(latlngs, {
      color: "#c0392b",
      weight: 3,
      opacity: 0.7,
      dashArray: "6 6",
    }).addTo(map);
  }

  tripData.planned_stops.forEach((stop) => {
    const marker = L.marker([stop.lat, stop.lng], {
      icon: pinIcon(null, "stop"),
    }).addTo(map);
    marker.bindTooltip(
      `<div class="tip-place">${escapeHtml(stop.name)}</div>` +
        (stop.note ? `<div class="tip-meta">${escapeHtml(stop.note)}</div>` : ""),
      { direction: "top", offset: [0, -18], className: "pin-tooltip" }
    );
    stopMarkers.push(marker);
  });

  if (expandedPinId === null) {
    if (currentPin) {
      map.setView([currentPin.lat, currentPin.lng], ZOOM_OVERVIEW, { animate: false });
    } else if (latlngs.length) {
      map.fitBounds(latlngs, { padding: [40, 40], animate: false });
    }
  }

  return tripData;
}

loadTrip();
