import { useCallback } from "react";

/* CSS can't randomise, so hover writes a fresh --rot-hover that the
   component's :hover rule prefers over the resting --rot. Leaving falls
   back automatically -- nothing to clean up. */
export const TILT_RANGE = { card: 6, sticker: 4, pin: 3 };

export function useHoverTilt(range = TILT_RANGE.card) {
  return useCallback(
    (e) => {
      const deg = (Math.random() * 2 - 1) * range;
      e.currentTarget.style.setProperty("--rot-hover", `${deg.toFixed(2)}deg`);
    },
    [range],
  );
}
