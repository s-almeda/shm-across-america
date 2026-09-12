import { CARD_SMALL } from "../../map/config";

/*
 * Fan the cards out of the pin's paper stack: measure each card's real grid
 * slot, start it shrunk down onto the pin, then release it. The stagger is
 * what reads as a stack coming apart.
 *
 * `anchor` is in frame coordinates, so distances are measured from .pin-view
 * (which is inset:0 on the frame) -- not from the grid, which now starts
 * below the place chip.
 */
export function flipIn(grid, anchor) {
  if (!grid) return;
  const frame = (grid.closest(".pin-view") ?? grid).getBoundingClientRect();

  [...grid.children].forEach((card, i) => {
    const r = card.getBoundingClientRect();
    const dx = anchor.x - (r.left - frame.left + r.width / 2);
    const dy = anchor.y - (r.top - frame.top + r.height / 2);
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
