import { CARD_SMALL, ICONS } from "../../map/config";
import { TILT_RANGE, useHoverTilt } from "../../lib/useHoverTilt";
import "./PinStack.css";

const PEEK_CLASS = { photo: "is-white", note: "is-green", comment: "is-yellow" };

/* Undefined rather than "none" when there's nothing to apply: a transform
   would make a stacking context, and the blended tacks don't need one. */
function artOffset({ dx = 0, dy = 0, rot = 0 }) {
  if (!dx && !dy && !rot) return undefined;
  return `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
}

/* Up to four slivers under the pin hint at what's posted there without
   opening anything: white = photo, green = shm's notes, yellow = comments.
   The count is written on the top sliver, as if on the note itself. */
export default function PinStack({ icon, peeks = [], count = 0, focused, clickable }) {
  const art = ICONS[icon];
  const tilt = useHoverTilt(TILT_RANGE.pin);
  const anchor = `${art.ax * 100}% ${art.ay * 100}%`;

  const cls = ["pin-stack", focused && "is-focused", clickable && "is-clickable"]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ transformOrigin: anchor, "--pin-focus-scale": art.focusScale ?? 1 }}
      onMouseEnter={tilt}
    >
      {/* Pinned to the icon's anchor, not the middle of the art, so an
          offset icon like the car still marks its true coordinate. */}
      <div className="pin-stack__layer" style={{ left: `${art.ax * 100}%`, top: `${art.ay * 100}%` }}>
        {peeks.map((kind, i) => (
          <div
            key={i}
            className={`pin-stack__peek ${PEEK_CLASS[kind]}`}
            style={{
              width: kind === "photo" ? CARD_SMALL * 0.88 : CARD_SMALL,
              height: CARD_SMALL,
              transform: `translate(-50%, -50%) translate(0, ${16 + i * 3}px) rotate(${
                (i - (peeks.length - 1) / 2) * 7
              }deg)`,
            }}
          >
            {i === peeks.length - 1 && count > 0 && (
              <span className="pin-stack__count">
                {count} note{count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        ))}
      </div>
      <img
        className={`pin-stack__art${art.blend ? " is-blended" : ""}`}
        src={art.src}
        style={{ width: art.w, height: art.h, transform: artOffset(art) }}
        alt=""
      />
    </div>
  );
}
