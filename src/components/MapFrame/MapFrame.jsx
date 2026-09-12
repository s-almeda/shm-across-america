import "./MapFrame.css";

/* The shaped paper the map lives inside. The shadow sits on the shell, not
   the frame: clip-path is applied after an element's own shadow, so a shadow
   on the frame gets clipped away with everything else. */
export default function MapFrame({ pinOpen, children }) {
  return (
    <main className="map-frame__stage">
      <div className="map-frame__shell">
        <div className={`map-frame${pinOpen ? " is-pin-open" : ""}`}>{children}</div>
      </div>
    </main>
  );
}
