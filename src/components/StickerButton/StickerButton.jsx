import { TILT_RANGE, useHoverTilt } from "../../lib/useHoverTilt";
import "./StickerButton.css";

/*
 * Shared base for the collage stickers. It owns transform and box-shadow
 * outright; variants only set --rot and --sticker-shadow, so no variant can
 * ever out-specify the hover rule and silently kill the lift.
 */
export default function StickerButton({ className = "", tiltRange = TILT_RANGE.sticker, ...rest }) {
  const tilt = useHoverTilt(tiltRange);
  return (
    <button
      type="button"
      className={`sticker-button ${className}`.trim()}
      onMouseEnter={tilt}
      {...rest}
    />
  );
}
