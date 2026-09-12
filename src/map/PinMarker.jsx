import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { ICONS, tooltipOffsetY } from "./config";
import "./PinMarker.css";

/*
 * Leaflet owns the wrapper element it positions (it rewrites an inline
 * transform on every pan), so React never renders it -- the divIcon holds one
 * empty mount div and React portals the pin's contents into that. Two owners,
 * two elements, no conflict.
 */
export default function PinMarker({ map, lat, lng, icon, focused, onClick, tooltip, tooltipOffset, children }) {
  // Derived from the art's height and lift unless a caller overrides it.
  const offsetY = tooltipOffset ?? tooltipOffsetY(icon);
  const [mount, setMount] = useState(null);
  const [tipMount, setTipMount] = useState(null);
  const markerRef = useRef(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const art = ICONS[icon];
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<div class="pin-marker__mount"></div>',
        className: "pin-marker",
        iconSize: [art.w, art.h],
        iconAnchor: [art.w * art.ax, art.h * art.ay],
      }),
    }).addTo(map);

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      clickRef.current?.();
    });

    markerRef.current = marker;
    setMount(marker.getElement().querySelector(".pin-marker__mount"));

    return () => {
      map.removeLayer(marker);
      markerRef.current = null;
      setMount(null);
    };
  }, [map, icon, lat, lng]);

  /* Leaflet takes a DOM node as tooltip content and re-appends it on every
     open, so one stable node is all React needs to portal into. */
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !tooltip) return;
    const host = document.createElement("div");
    marker.bindTooltip(host, {
      direction: "top",
      offset: [0, offsetY],
      className: "pin-tooltip",
    });
    setTipMount(host);
    return () => {
      marker.unbindTooltip();
      setTipMount(null);
    };
  }, [mount, !tooltip, offsetY]);

  useEffect(() => {
    const el = markerRef.current?.getElement();
    if (!el) return;
    el.classList.toggle("is-focused", !!focused);
    if (focused) markerRef.current.closeTooltip();
  }, [focused, mount]);

  return (
    <>
      {mount && createPortal(children, mount)}
      {tipMount && createPortal(tooltip, tipMount)}
    </>
  );
}
