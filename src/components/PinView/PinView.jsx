import PostGrid from "../PostGrid/PostGrid";
import PinSticker from "../PinSticker/PinSticker";
import WriteNoteSticker from "../WriteNoteSticker/WriteNoteSticker";
import { focusAnchor, headerOffsetX } from "../../map/config";
import "./PinView.css";

export default function PinView({
  pin,
  icon,
  stickerArt,
  meta,
  items,
  commentsEnabled,
  onBack,
  onWriteNote,
  onOpenPhoto,
  onFlag,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  arrived,
}) {
  /* The map is frozen underneath, so the header pin can be placed once at
     the anchor -- where the camera parked the real pin -- and stay aligned
     with no sync loop. --pin-reach is how far this pin's art rises above the
     anchor, so the back button can clear the art rather than the point. */
  const spot = focusAnchor(icon);
  const anchor = {
    "--anchor-x": `${spot.x}px`,
    "--anchor-y": `${spot.y}px`,
    "--pin-reach": `${spot.up}px`,
    "--pin-reach-left": `${spot.left}px`,
    "--pin-center-y": `${spot.centerY}px`,
    "--header-offset": `${headerOffsetX(icon)}px`,
  };

  return (
    <div className="pin-view" style={anchor}>
      {commentsEnabled && <WriteNoteSticker onClick={onWriteNote} />}

      <button type="button" className="pin-view__back" onClick={onBack}>
        ← back to map
      </button>

      {/* The sticker copy is the arrival, so it isn't drawn mid-flight -- the
          only pin on screen while moving is the real one down on the map. */}
      {arrived && <PinSticker icon={icon} art={stickerArt} />}

      {/* Gone while the camera is moving -- it names the place we're headed
          for, so it shouldn't be readable until we're there. Keyed so the
          slide-in replays on each arrival. */}
      {arrived && (
        <div className="pin-view__header" key={pin.id}>
          <div className="pin-view__place">{pin.label || "Somewhere out there"}</div>
          {/* Omitted entirely rather than left empty, so the chip closes up
              around the place name instead of keeping a blank line. */}
          {meta && <div className="pin-view__dates">{meta}</div>}
        </div>
      )}

      <button
        type="button"
        className="pin-view__step is-prev"
        onClick={onPrev}
        disabled={!hasPrev}
        title="previous stop"
        aria-label="previous stop"
      >
        <img className="pin-view__point" src="/assets/point.png" alt="" />
      </button>

      {/* Leaves during a step so it can fan out of the new pin on arrival. */}
      {arrived && (
        <PostGrid
          items={items}
          flipKey={pin.id}
          anchor={spot}
          onOpenPhoto={onOpenPhoto}
          onFlag={onFlag}
        />
      )}

      <button
        type="button"
        className="pin-view__step is-next"
        onClick={onNext}
        disabled={!hasNext}
        title="next stop"
        aria-label="next stop"
      >
        <img className="pin-view__point" src="/assets/point.png" alt="" />
      </button>
    </div>
  );
}
