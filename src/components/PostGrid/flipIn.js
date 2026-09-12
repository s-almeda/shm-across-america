import { CARD_SMALL, PIN_ANCHOR } from "../../map/config";

/*
 * Fan the cards out of the pin's paper stack: measure each card's real grid
 * slot, start it shrunk down onto the pin, then release it. The stagger is
 * what reads as a stack coming apart.
 *
 * The grid is inset:0 inside the frame, so its own rect origin is the frame's
 * origin -- which is what PIN_ANCHOR is measured from.
 */
export function flipIn(grid) {
  if (!grid) return;
  const origin = grid.getBoundingClientRect();

  [...grid.children].forEach((card, i) => {
    const r = card.getBoundingClientRect();
    const dx = PIN_ANCHOR.x - (r.left - origin.left + r.width / 2);
    const dy = PIN_ANCHOR.y - (r.top - origin.top + r.height / 2);
    const scale = CARD_SMALL / Math.max(r.width, 1);

    card.style.transition = "none";
    // square-on in the stack, then it settles into its own slight angle
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`;
    card.style.opacity = "0";

    requestAnimationFrame(() => {
      const delay = i * 35;
      card.style.transition =
        `transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms,` +
        `opacity 0.3s ease ${delay}ms`;
      card.style.transform = "";
      card.style.opacity = "1";
      // Otherwise this inline transition permanently overrides the CSS hover
      // transition, leaving every card stuck on the flip-in's timing.
      setTimeout(() => {
        card.style.transition = "";
      }, 450 + delay + 50);
    });
  });
}
