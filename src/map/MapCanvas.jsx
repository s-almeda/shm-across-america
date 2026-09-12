import { useEffect, useRef } from "react";
import L from "leaflet";
import { ZOOM_DETAIL, ZOOM_MIN, ZOOM_OVERVIEW } from "./config";
import "./MapCanvas.css";

export default function MapCanvas({ onReady, pinOpen, reading, children }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const map = L.map(hostRef.current, {
      zoomControl: true,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_DETAIL,
      /*
       * Leaflet's zoom animation works by CSS-transform-scaling whole panes,
       * which stretches the route line's stroke into a blur and the pixel art
       * with it. Off means every zoom step redraws at its true size instead:
       * nothing ever scales, so nothing ever smears. flyTo still animates --
       * it redraws frame by frame rather than scaling a layer.
       */
      zoomAnimation: false,
      // Continuous zoom rather than whole-level jumps. Lower
      // wheelPxPerZoomLevel = less scrolling per zoom level (Leaflet's
      // default is 60).
      zoomSnap: 0,
      wheelPxPerZoomLevel: 5,
      wheelDebounceTime: 20,
      // Without the zoom animation, tiles reset often; fading each new one in
      // from transparent is what reads as the map blinking.
      fadeAnimation: false,
    }).setView([39.5, -98.35], ZOOM_OVERVIEW);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: ZOOM_DETAIL,
      // Hold on to more off-screen tiles so crossing a zoom level has
      // something to show while the new level loads.
      keepBuffer: 6,
      updateWhenZooming: false,
    }).addTo(map);

    /*
     * A trackpad pinch reaches the browser as a wheel event with ctrlKey set.
     * Leaflet has no idea it's a pinch and treats it as one ordinary scroll
     * tick, so it crawls. Handling it first (capture, and stop Leaflet seeing
     * it) makes the gesture zoom by the distance the fingers actually moved.
     */
    const host = hostRef.current;
    const onPinch = (e) => {
      if (!e.ctrlKey || !map.scrollWheelZoom.enabled()) return;
      e.preventDefault();
      e.stopPropagation();
      map.setZoomAround(
        map.mouseEventToContainerPoint(e),
        map.getZoom() - e.deltaY * 0.02,
        { animate: false },
      );
    };
    host.addEventListener("wheel", onPinch, { passive: false, capture: true });

    // The frame is sized by aspect-ratio, which can still be settling when
    // Leaflet first measures its container.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    onReady(map);

    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("wheel", onPinch, { capture: true });
      window.removeEventListener("resize", onResize);
      map.remove();
      onReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls = ["map-canvas", pinOpen && "is-pin-open", reading && "is-reading"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} ref={hostRef}>
      {children}
    </div>
  );
}
