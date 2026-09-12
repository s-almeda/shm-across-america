import { useEffect } from "react";
import L from "leaflet";

export default function RouteLine({ map, points }) {
  const key = JSON.stringify(points);

  useEffect(() => {
    if (points.length < 2) return;
    const line = L.polyline(points, {
      color: getComputedStyle(document.documentElement).getPropertyValue("--route-red").trim(),
      weight: 3,
      opacity: 0.7,
      dashArray: "6 6",
    }).addTo(map);

    /*
     * Leaflet only draws a vector layer at its true size at the start and end
     * of a zoom. In between, the renderer CSS-scales the whole <svg>, which
     * stretches the 3px stroke and the dashes into a fat blur. Re-projecting
     * on every zoom frame redraws the path at the current zoom instead, so
     * the stroke stays 3px the whole way through.
     *
     * This reaches into Leaflet internals, so it is guarded: if a future
     * version renames them, the line just goes back to scaling rather than
     * throwing.
     */
    const keepCrisp = () => {
      const renderer = line._renderer;
      if (!renderer || !renderer._update || !line._project) return;
      renderer._update(); // clears the container's scale transform
      line._project(); // re-projects the points at the current zoom
      line.redraw();
    };
    map.on("zoom", keepCrisp);

    return () => {
      map.off("zoom", keepCrisp);
      map.removeLayer(line);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return null;
}
