import { useEffect, useRef } from "react";
import { focusAnchor, pinIconFor, ZOOM_DETAIL } from "../map/config";

/* A hop across town shouldn't take as long as a day's drive. Square-rooted so
   medium distances don't all pile up against the cap. */
const FLY_MIN_SECONDS = 0.25;
const FLY_MAX_SECONDS = 1.75;
const FLY_FULL_KM = 400; // distance at which a flight takes the full time

const GESTURES = [
  "dragging", "scrollWheelZoom", "doubleClickZoom", "touchZoom", "boxZoom", "keyboard",
];

function setGestures(map, on) {
  GESTURES.forEach((g) => map[g] && map[g][on ? "enable" : "disable"]());
}

function flightSeconds(map, to) {
  const km = map.distance(map.getCenter(), to) / 1000;
  const reach = Math.min(1, Math.sqrt(km / FLY_FULL_KM));
  return FLY_MIN_SECONDS + (FLY_MAX_SECONDS - FLY_MIN_SECONDS) * reach;
}

/* Center the map so `latlng` lands at `anchor` instead of the middle. */
function anchoredCenter(map, latlng, zoom, anchor) {
  const size = map.getSize();
  const pt = map.project(latlng, zoom);
  const shifted = pt.subtract([anchor.x - size.x / 2, anchor.y - size.y / 2]);
  return map.unproject(shifted, zoom);
}

/*
 * Opening a pin flies the camera to its focus anchor and freezes the map.
 * Closing just unfreezes and leaves the camera where it is, so you can carry
 * on panning around the neighbourhood you were reading about.
 *
 * `onApproach` fires shortly before touchdown, so the ground can fade back in
 * and already be there when the notes arrive.
 */
export function usePinCamera(map, openPin, onArrive, { onApproach } = {}) {
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

    const to = { lat: openPin.lat, lng: openPin.lng };
    const seconds = flightSeconds(map, to);
    const landed = () => arrive.current?.();

    map.flyTo(anchoredCenter(map, to, ZOOM_DETAIL, focusAnchor(pinIconFor(openPin))), ZOOM_DETAIL, {
      duration: seconds,
    });
    map.once("moveend", landed);

    const nearly = setTimeout(() => onApproach?.(), seconds * 1000 * 0.72);

    return () => {
      clearTimeout(nearly);
      map.off("moveend", landed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinId]);
}
