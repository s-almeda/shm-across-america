import PostGrid from "../PostGrid/PostGrid";
import WriteNoteSticker from "../WriteNoteSticker/WriteNoteSticker";
import { fmtDateRange } from "../../lib/format";
import { PIN_ANCHOR } from "../../map/config";
import "./PinView.css";

export default function PinView({
  pin,
  items,
  commentsEnabled,
  onBack,
  onWriteNote,
  onOpenPhoto,
  onFlag,
}) {
  /* The map is frozen underneath, so the header pin can be placed once at
     the anchor -- where the camera parked the real pin -- and stay aligned
     with no sync loop. */
  const anchor = { "--anchor-x": `${PIN_ANCHOR.x}px`, "--anchor-y": `${PIN_ANCHOR.y}px` };

  return (
    <div className="pin-view" style={anchor}>
      {commentsEnabled && <WriteNoteSticker onClick={onWriteNote} />}

      <button type="button" className="pin-view__back" onClick={onBack}>
        ← back to map
      </button>

      {/* No pin image here -- the real Leaflet marker is sitting at the
          anchor and grows to serve as the heading's pin. */}
      <div className="pin-view__header">
        <div className="pin-view__place">{pin.label || "Somewhere out there"}</div>
        <div className="pin-view__dates">{fmtDateRange(items, pin.created_at)}</div>
      </div>

      <PostGrid
        items={items}
        flipKey={pin.id}
        onOpenPhoto={onOpenPhoto}
        onFlag={onFlag}
      />
    </div>
  );
}
