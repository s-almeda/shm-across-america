import { useEffect, useRef, useState } from "react";
import { TILT_RANGE, useHoverTilt } from "../../lib/useHoverTilt";
import "./PhotoCard.css";

/* `place` is the card's tilt plus a small nudge off its grid cell -- both
   hashed from the item, so they hold still across re-renders. */
export default function PhotoCard({ url, caption, place, onClick }) {
  const tilt = useHoverTilt(TILT_RANGE.card);

  /*
   * Whether the caption is actually cut off, which only the laid-out element
   * knows -- it depends on the wrapped line count, not on the string length.
   * The arrow is drawn only when there's really more to read, so it stays a
   * promise rather than decoration. Re-measured on resize, since the card
   * narrows at the mobile breakpoints.
   */
  const capRef = useRef(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [caption]);

  return (
    <div
      className="photo-card"
      style={{ "--rot": place.rot, "--dx": place.dx, "--dy": place.dy }}
      onMouseEnter={tilt}
      onClick={onClick}
    >
      <img className="photo-card__img" src={url} alt="" />
      <div className="photo-card__cap">
        <div className="photo-card__caption" ref={capRef}>
          {caption}
        </div>
        {clipped && (
          <span className="photo-card__more" aria-hidden="true">
            →
          </span>
        )}
      </div>
    </div>
  );
}
