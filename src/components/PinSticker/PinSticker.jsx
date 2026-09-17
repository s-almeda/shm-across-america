import { ICONS } from "../../map/config";
import "./PinSticker.css";

/*
 * The focused pin again, drawn as a sticker on the collage rather than as
 * something pinned to the map. The real marker is still down there, dimmed
 * with the rest of the map.
 *
 * Two reasons this is a copy instead of the marker itself: the marker lives
 * inside Leaflet's transformed pane, so nothing in the overlay can be layered
 * above it; and it tracks a map coordinate, so on a resize it slides away
 * from the chip and button that are positioned off the frame's corner.
 *
 * Geometry mirrors PinMarker exactly: a zero-size point at the anchor, with
 * the art offset by its own anchor fractions plus dx/dy, scaled about that
 * point so the sticker grows without leaving the spot it marks.
 */
export default function PinSticker({ icon, art: swap }) {
  // `art` swaps just the picture, the way PinStack does it -- the geometry
  // below still comes from the icon, so a variant can't shift the anchor.
  const art = { ...ICONS[icon], ...swap };
  const scale = art.focusScale ?? 1;

  return (
    /* The resting tilt goes out as a variable rather than an inline
       transform: the arrival animation owns `transform`, and it has to carry
       the rotation along or the sticker would snap upright for its duration. */
    <div
      className="pin-sticker"
      style={{ transform: `scale(${scale})`, "--sticker-rot": `${art.rot ?? 0}deg` }}
    >
      <img
        className="pin-sticker__art"
        src={art.src}
        style={{
          width: art.w,
          height: art.h,
          marginLeft: -(art.w * art.ax) + (art.dx ?? 0),
          marginTop: -(art.h * art.ay) + (art.dy ?? 0) + (art.focusDy ?? 0),
        }}
        alt=""
      />
    </div>
  );
}
