import { useEffect, useRef } from "react";
import { focusAnchor, pinIconFor, ZOOM_DETAIL } from "../map/config";

const GESTURES = [
  "dragging", "scrollWheelZoom", "doubleClickZoom", "touchZoom", "boxZoom", "keyboard",
];

function setGestures(map, on) {
  GESTURES.forEach((g) => map[g] && map[g][on ? "enable" : "disable"]());
}

/* Center the map so `latlng` lands at `anchor` instead of the middle. */
function anchoredCenter(map, latlng, zoom, anchor) {
  const size = map.getSize();
  const pt = map.project(latlng, zoom);
  const shifted = pt.subtract([anchor.x - size.x / 2, anchor.y - size.y / 2]);
  return map.unproject(shifted, zoom);
}

/*
 * Opening a pin flies in to the pin's focus anchor and freezes the map.
 * Closing just unfreezes and leaves the camera where it is, so you can carry
 * on panning around the neighbourhood you were just reading about.
 */
export function usePinCamera(map, openPin, onArrive) {
  const arrive = useRef(onArrive);
  arrive.current = onArrive;

  const pinId = openPin?.id ?? null;

  useEffect(() => {
    if (!map) return;

    if (!openPin) {
      setGestures(map, true);
      map.invalidateSize();
      return;
    }

    setGestures(map, false);
    // The frame grows first on mobile, so re-measure before computing the
    // anchor -- otherwise it's against the old size.
    map.invalidateSize();

    const landed = () => arrive.current?.();
    map.flyTo(
      anchoredCenter(
        map,
        [openPin.lat, openPin.lng],
        ZOOM_DETAIL,
        focusAnchor(pinIconFor(openPin)),
      ),
      ZOOM_DETAIL,
      { duration: 0.7 },
    );
    map.once("moveend", landed);
    return () => map.off("moveend", landed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinId]);
}
