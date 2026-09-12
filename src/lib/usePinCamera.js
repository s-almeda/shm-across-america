import { useEffect, useRef } from "react";
import { PIN_ANCHOR, ZOOM_DETAIL } from "../map/config";

const GESTURES = [
  "dragging", "scrollWheelZoom", "doubleClickZoom", "touchZoom", "boxZoom", "keyboard",
];

function setGestures(map, on) {
  GESTURES.forEach((g) => map[g] && map[g][on ? "enable" : "disable"]());
}

/* Center the map so `latlng` lands at PIN_ANCHOR instead of the middle. */
function anchoredCenter(map, latlng, zoom) {
  const size = map.getSize();
  const pt = map.project(latlng, zoom);
  const shifted = pt.subtract([PIN_ANCHOR.x - size.x / 2, PIN_ANCHOR.y - size.y / 2]);
  return map.unproject(shifted, zoom);
}

/*
 * Opening a pin flies in with the pin landing at PIN_ANCHOR and freezes the
 * map; closing flies back to wherever the visitor was browsing before, since
 * with free pan/zoom that position is theirs, not something we can predict.
 */
export function usePinCamera(map, openPin, onArrive) {
  const preOpen = useRef(null);
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  const pinId = openPin?.id ?? null;

  useEffect(() => {
    if (!map) return;

    if (!openPin) {
      setGestures(map, true);
      map.invalidateSize();
      if (preOpen.current) {
        map.flyTo(preOpen.current.center, preOpen.current.zoom, { duration: 0.7 });
        preOpen.current = null;
      }
      return;
    }

    preOpen.current ??= { center: map.getCenter(), zoom: map.getZoom() };
    setGestures(map, false);
    // The frame grows first on mobile, so re-measure before computing the
    // anchor -- otherwise it's against the old size.
    map.invalidateSize();

    const landed = () => arrive.current?.();
    map.flyTo(
      anchoredCenter(map, [openPin.lat, openPin.lng], ZOOM_DETAIL),
      ZOOM_DETAIL,
      { duration: 0.7 },
    );
    map.once("moveend", landed);
    return () => map.off("moveend", landed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinId]);
}
