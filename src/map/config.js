export const ZOOM_MIN = 4; // pull back far enough for the whole country
export const ZOOM_OVERVIEW = 5; // initial view on load
export const ZOOM_DETAIL = 16; // street level; posts read at full size

export const CARD_SMALL = 44; // stack sliver size on the map (px)
export const PIN_ANCHOR = { x: 78, y: 92 }; // where a focused pin parks

/*
 * w/h: on-screen size. Keep these clean fractions of the source file --
 * image-rendering: pixelated is crisp at exact ratios, crunchy otherwise.
 *
 * dx/dy: nudge the art, in pixels. +dx right, +dy down. This is the knob for
 * "move it a bit left"; it doesn't move the coordinate the pin marks.
 * rot: resting tilt in degrees, +clockwise. Hover tilt adds on top.
 *
 * ax/ay: which pixel of the art is the true map coordinate, as a fraction of
 * w/h. 0.5/0.5 = centre. Leave these alone unless the pin is marking the
 * wrong spot -- they also anchor the paper stack and the hover pivot.
 *
 * blend: multiply art that isn't cut out into the paper.
 *
 * focusScale: how much bigger the sticker copy is than the map art while the
 * pin is open (see PinSticker). It also sets where the place chip and back
 * button sit, since those flank the sticker, not the map pin.
 */
export const TOOLTIP_GAP = 8; // clearance between the art and a bubble's nib
const BACK_BTN_STACK = 68; // gap + back-to-map button + gap, above the art
const FOCUS_EDGE_GAP = 28; // clearance between a focused pin's art and the frame edge

export function pinIconFor(pin) {
  return pin.is_current ? "car" : "tack";
}

/* How far an icon's art reaches beyond its coordinate: h*ay / w*ax from the
   anchor, less however far dx/dy shifts it back. */
export function artReach(iconKey) {
  const art = ICONS[iconKey];
  return {
    up: art.h * art.ay - (art.dy ?? 0),
    down: art.h * (1 - art.ay) + (art.dy ?? 0),
    left: art.w * art.ax - (art.dx ?? 0),
    right: art.w * (1 - art.ax) + (art.dx ?? 0),
  };
}

/*
 * How far right of the anchor the place chip starts, so it clears the art at
 * the size that art takes while focused. A tack is small but grows 1.7x; the
 * car doesn't grow but is far wider to the right of its point.
 */
export function headerOffsetX(iconKey) {
  const art = ICONS[iconKey];
  return Math.round(artReach(iconKey).right * (art.focusScale ?? 1) + TOOLTIP_GAP);
}

/* A tooltip opens above the pin, so it has to clear that pin's own art.
   The car reaches ~74px up, a tack ~15px. */
export function tooltipOffsetY(iconKey) {
  return -(artReach(iconKey).up + TOOLTIP_GAP);
}

/*
 * Where a focused pin parks in the frame. Tall or wide art needs the camera
 * placed higher and further left, so the art lands lower and further right --
 * otherwise the car runs off the frame's left edge and sits under the
 * back-to-map button. Small pins keep the default, so this only moves the
 * camera for art big enough to need it.
 */
export function focusAnchor(iconKey) {
  const reach = artReach(iconKey);
  const scale = ICONS[iconKey].focusScale ?? 1;
  return {
    x: Math.max(PIN_ANCHOR.x, Math.round(reach.left + FOCUS_EDGE_GAP)),
    y: Math.max(PIN_ANCHOR.y, Math.round(reach.up + BACK_BTN_STACK)),
    up: Math.round(reach.up),
    // How far left the art extends once focused -- the back button
    // left-aligns with this, not with the coordinate.
    left: Math.round(reach.left * scale),
    /*
     * Offset from the coordinate to the art's own vertical middle, so the
     * place chip sits beside the art rather than beside the point. Zero for a
     * centre-anchored tack; ~25px up for the car, whose point is near its
     * wheels.
     */
    centerY: Math.round(((reach.down - reach.up) * scale) / 2),
  };
}

export const ICONS = {
  /* focusDy lifts only the sticker copy in detail view, so the car overlaps
     the back-to-map button on purpose. The map pin and all the geometry
     derived from it stay where they are. */
  car: { src: "/assets/car.png", w: 160, h: 98, blend: false, ax: 0.7, ay: 0.2, dx: 38, dy: -15, rot: 0.85, focusScale: 1.2, focusDy: -14 },
  tack: { src: "/assets/tacks/tack_1.png", w: 26, h: 31, blend: false, ax: 0.5, ay: 0.5, focusScale: 1.7 },
  pin: { src: "/assets/pins/pin_1.png", w: 22, h: 24, blend: false, ax: 0.5, ay: 0.5, focusScale: 1.7 },
};

/*
 * The four orange pins are hand-drawn, so a planned stop picks one instead of
 * the whole route looking stamped. Sizes are each source file at half scale
 * (the files differ by a pixel or two); ICONS.pin still owns the geometry, so
 * a variant only swaps the picture.
 */
export const PIN_VARIANTS = [
  { src: "/assets/pins/pin_1.png", w: 22, h: 24 },
  { src: "/assets/pins/pin_2.png", w: 21, h: 24 },
  { src: "/assets/pins/pin_3.png", w: 22, h: 26 },
  { src: "/assets/pins/pin_4.png", w: 21, h: 25 },
];

/* Hashed from the stop so it keeps the same pin across reloads. */
export function pinVariantFor(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  return PIN_VARIANTS[(h >>> 0) % PIN_VARIANTS.length];
}
