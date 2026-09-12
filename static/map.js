/*
 * Semantic zoom: pins have two representations, swapped at a zoom
 * threshold rather than scaled continuously (card size wants ~8x across
 * the range, the map wants ~256x, so one continuous scale can't serve
 * both).
 *
 *   z <  ZOOM_THRESHOLD  ->  pin + small stack slivers ("high level")
 *   z >= ZOOM_THRESHOLD  ->  that pin's posts at readable size ("low level")
 *
 * Clicking a pin is just a camera shortcut across the threshold, landing
 * the pin at PIN_ANCHOR. Zooming back out below the threshold collapses.
 */

// ---------- tuning knobs ----------
const ZOOM_OVERVIEW = 4; // whole cross-country trip
const ZOOM_THRESHOLD = 9; // where the representation switches
const ZOOM_DETAIL = 12; // neighbourhood; posts read at full size
const CARD_SMALL = 28; // stack sliver width at high-level view (px)
const PIN_ANCHOR = { x: 78, y: 92 }; // where a focused pin sits in the frame

// Placeholder marker art -- swap these files for handwriting/photo cutouts later.
const ICONS = {
  car: "/assets/car.svg",
  pin: "/assets/pin.svg",
  stop: "/assets/stop.svg",
};

const ABOUT_HTML = `
  <p>This is a live map of a cross-country road trip. Every pin marks a
  place along the way, texted in from the road, with notes and photos
  attaching to wherever the car currently is.</p>
  <p>Zoom in on a pin (or just click it) to read everything posted there.
  Anyone can leave a comment, and anything that shouldn't be there can be
  flagged to hide it right away.</p>
  <p><em>(Placeholder copy; swap this for the real about text.)</em></p>
`;

const map = L.map("map", {
  zoomControl: true,
  minZoom: ZOOM_OVERVIEW,
  maxZoom: ZOOM_DETAIL,
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

let tripData = null;
let expandedPinId = null;
let isAnimatingCamera = false;
const markersByPinId = new Map();

const frameEl = document.getElementById("map-frame");
const pinView = document.getElementById("pin-view");
const postGrid = document.getElementById("post-grid");
const placeEl = document.getElementById("pin-view-place");
const datesEl = document.getElementById("pin-view-dates");

// ---------- small helpers ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
function stickerIcon(pin, iconKey, size) {
  let peeks = "";
  if (pin) {
    const types = buildItems(pin)
      .slice(-4)
      .map((i) => (i.kind === "photo" ? "peek-white" : i.kind === "note" ? "peek-green" : "peek-yellow"));

    peeks = types
      .map((cls, i) => {
        const rot = (i - (types.length - 1) / 2) * 7;
        const dy = i * 2;
        return `<div class="stack-peek ${cls}" style="width:${CARD_SMALL}px;height:${CARD_SMALL}px;transform:translate(-50%,-50%) translate(0,${dy}px) rotate(${rot}deg)"></div>`;
      })
      .join("");
  }

  return L.divIcon({
    html:
      `<div class="pin-stack">` +
      `<div class="stack-layer">${peeks}</div>` +
      `<div class="marker-sticker sticker" style="width:${size}px;height:${size}px"><img src="${ICONS[iconKey]}" alt=""></div>` +
      `</div>`,
    className: "pin-stack-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

  if (item.kind === "photo") {
    el.classList.add("polaroid");
    el.innerHTML =
      `<img src="${item.url}" alt="">` +
      `<div class="polaroid-caption">${fmtDate(item.created_at)}</div>`;
    el.addEventListener("click", () => openPhoto(item.url));
  } else if (item.kind === "note") {
    el.classList.add("postit", "postit-green");
    el.innerHTML =
      `<p>${escapeHtml(item.text)}</p>` +
      `<span class="postit-date">${fmtDate(item.created_at)}</span>`;
  } else if (item.kind === "comment") {
    el.classList.add("postit", "postit-yellow");
    el.innerHTML =
      `<button type="button" class="flag-icon-btn" title="Flag this comment" aria-label="Flag this comment">` +
      `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">` +
      `<line x1="5" y1="3" x2="5" y2="21" stroke="#c0392b" stroke-width="2" stroke-linecap="round" />` +
      `<path d="M5 4 L19 4 L15 8 L19 12 L5 12 Z" fill="#c0392b" />` +
      `</svg></button>` +
      `<p>${escapeHtml(item.body)}</p>` +
      `<span class="postit-author">— ${escapeHtml(item.author_name)}</span>`;
    el.querySelector(".flag-icon-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      flagComment(item.id);
    });
  } else if (item.kind === "add") {
    el.classList.add("postit", "postit-add");
    el.innerHTML = `<span class="add-plus">+</span><span class="add-label">add a comment</span>`;
    el.addEventListener("click", () => openAddComment(item.pinId));
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
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    card.style.opacity = "0";

    requestAnimationFrame(() => {
      const delay = i * 35;
      card.style.transition =
        `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms,` +
        `opacity 0.3s ease ${delay}ms`;
      card.style.transform = "";
      card.style.opacity = "1";
    });
  });
}

function renderPinView(pin) {
  const items = buildItems(pin);
  if (tripData.comments_enabled) items.push({ kind: "add", pinId: pin.id });

  placeEl.textContent = pin.label || "Somewhere out there";
  datesEl.textContent = fmtDateRange(buildItems(pin), pin.created_at);

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
 * Click a pin: fly across the threshold with it landing at PIN_ANCHOR.
 * The frame grows first (mobile gives the feed more height when a pin is
 * open), then we re-measure, so the anchor is computed against the size
 * the map will actually have when it lands.
 */
function focusPin(pin) {
  if (expandedPinId === pin.id) return;
  collapsePinView();

  frameEl.classList.add("pin-expanded");
  map.invalidateSize();

  isAnimatingCamera = true;
  map.flyTo(anchoredCenter([pin.lat, pin.lng], ZOOM_DETAIL), ZOOM_DETAIL, { duration: 0.7 });
  map.once("moveend", () => {
    isAnimatingCamera = false;
    expandPin(pin);
  });
}

function backToMap() {
  const pin = tripData?.pins.find((p) => p.id === expandedPinId);
  collapsePinView();
  isAnimatingCamera = true;
  const target = pin ? [pin.lat, pin.lng] : map.getCenter();
  map.flyTo(target, ZOOM_OVERVIEW, { duration: 0.7 });
  map.once("moveend", () => {
    isAnimatingCamera = false;
  });
}

/*
 * Semantic-zoom trigger: crossing the threshold by hand should behave the
 * same as clicking. Above it, expand whichever pin is nearest the middle
 * of the frame; below it, collapse.
 */
function syncToZoom() {
  if (isAnimatingCamera || !tripData) return;

  if (map.getZoom() < ZOOM_THRESHOLD) {
    collapsePinView();
    return;
  }
  if (expandedPinId !== null) return;

  const size = map.getSize();
  const center = size.divideBy(2);
  let best = null;
  let bestDist = Infinity;

  tripData.pins.forEach((pin) => {
    const pt = map.latLngToContainerPoint([pin.lat, pin.lng]);
    if (pt.x < 0 || pt.y < 0 || pt.x > size.x || pt.y > size.y) return;
    const d = pt.distanceTo(center);
    if (d < bestDist) {
      bestDist = d;
      best = pin;
    }
  });

  if (best) focusPin(best);
}

map.on("zoomend", syncToZoom);

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
  openModal("About this trip", ABOUT_HTML, "");
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
      icon: stickerIcon(pin, isCurrent ? "car" : "pin", isCurrent ? 40 : 30),
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
    if (expandedPinId === pin.id) {
      const el = marker.getElement();
      if (el) el.classList.add("is-expanded");
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
      icon: stickerIcon(null, "stop", 26),
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
