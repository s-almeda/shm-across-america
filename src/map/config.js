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
 * focusScale: how much bigger the art gets while its pin is open, where it
 * doubles as the heading's pin. The car is already big, so it stays at 1.
 */
export const TOOLTIP_GAP = 8; // clearance between the art's top and the nib
const BACK_BTN_STACK = 52; // gap + back-to-map button + gap, above the art

export function pinIconFor(pin) {
  return pin.is_current ? "car" : "tack";
}

/* How far an icon's art reaches beyond its coordinate: h*ay / w*ax from the
   anchor, less however far dx/dy shifts it back. */
export function artReach(iconKey) {
  const art = ICONS[iconKey];
  return {
    up: art.h * art.ay - (art.dy ?? 0),
    left: art.w * art.ax - (art.dx ?? 0),
  };
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
  return {
    x: Math.max(PIN_ANCHOR.x, Math.round(reach.left + 12)),
    y: Math.max(PIN_ANCHOR.y, Math.round(reach.up + BACK_BTN_STACK)),
    up: Math.round(reach.up),
  };
}

export const ICONS = {
  car: { src: "/assets/car.png", w: 160, h: 98, blend: false, ax: 0.7, ay: 0.2, dx: 38, dy: -54, rot: 0.85, focusScale: 1 },
  tack: { src: "/assets/tacks/tack_1.png", w: 26, h: 31, blend: false, ax: 0.5, ay: 0.5, focusScale: 1.7 },
  pin: { src: "/assets/pins/pin_1.png", w: 22, h: 24, blend: false, ax: 0.5, ay: 0.5, focusScale: 1.7 },
};
