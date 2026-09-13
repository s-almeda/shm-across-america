import { TILT_RANGE, useHoverTilt } from "../../lib/useHoverTilt";
import "./PhotoCard.css";

/* `place` is the card's tilt plus a small nudge off its grid cell -- both
   hashed from the item, so they hold still across re-renders. */
export default function PhotoCard({ url, caption, place, onClick }) {
  const tilt = useHoverTilt(TILT_RANGE.card);
  return (
    <div
      className="photo-card"
      style={{ "--rot": place.rot, "--dx": place.dx, "--dy": place.dy }}
      onMouseEnter={tilt}
      onClick={onClick}
    >
      <img className="photo-card__img" src={url} alt="" />
      <div className="photo-card__caption">{caption}</div>
    </div>
  );
}
