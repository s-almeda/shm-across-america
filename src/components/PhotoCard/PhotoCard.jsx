import { TILT_RANGE, useHoverTilt } from "../../lib/useHoverTilt";
import "./PhotoCard.css";

export default function PhotoCard({ url, caption, rot, onClick }) {
  const tilt = useHoverTilt(TILT_RANGE.card);
  return (
    <div className="photo-card" style={{ "--rot": rot }} onMouseEnter={tilt} onClick={onClick}>
      <img className="photo-card__img" src={url} alt="" />
      <div className="photo-card__caption">{caption}</div>
    </div>
  );
}
