import "./MapFrame.css";

/* The shaped paper the map lives inside. The shadow sits on the shell, not
   the frame: a mask applies to the element's own shadow too, so a shadow on
   the frame would be cut away with everything else. On the parent it traces
   the already-masked child, following the torn edge. */
export default function MapFrame({ pinOpen, children }) {
  return (
    <main className="map-frame__stage">
      <div className="map-frame__shell">
        <div className={`map-frame${pinOpen ? " is-pin-open" : ""}`}>{children}</div>
      </div>
    </main>
  );
}
