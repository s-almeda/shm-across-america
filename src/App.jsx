import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCanvas from "./map/MapCanvas";
import PinMarker from "./map/PinMarker";
import RouteLine from "./map/RouteLine";
import { pinVariantFor, ZOOM_OVERVIEW } from "./map/config";
import SiteHeader from "./components/SiteHeader/SiteHeader";
import MapFrame from "./components/MapFrame/MapFrame";
import PinStack from "./components/PinStack/PinStack";
import PinTooltip from "./components/PinTooltip/PinTooltip";
import PinView from "./components/PinView/PinView";
import IndexCardModal from "./components/IndexCardModal/IndexCardModal";
import PhotoLightbox from "./components/PhotoLightbox/PhotoLightbox";
import CommentForm from "./components/CommentForm/CommentForm";
import AboutText from "./components/AboutText/AboutText";
import { fetchTrip, flagComment, postComment } from "./lib/api";
import { usePinCamera } from "./lib/usePinCamera";
import { buildItems, fmtDateRange } from "./lib/format";

export default function App() {
  const [map, setMap] = useState(null);
  const [trip, setTrip] = useState(null);
  const [openPinId, setOpenPinId] = useState(null);
  const [flying, setFlying] = useState(false);
  const [photo, setPhoto] = useState(null); // { url, caption }
  const [modal, setModal] = useState(null); // "about" | "comment" | "comments-off"

  const reload = useCallback(async () => setTrip(await fetchTrip()), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const pinOpen = openPinId !== null;
  const openPin = trip?.pins.find((p) => p.id === openPinId) ?? null;
  const items = useMemo(() => (openPin ? buildItems(openPin) : []), [openPin]);

  /* `traveling` only covers stop-to-stop hops. Clicking a pin from the map is
     a zoom-in with no arc to speak of, so the ground stays put for that. */
  const [traveling, setTraveling] = useState(false);

  usePinCamera(
    map,
    openPin,
    () => {
      setFlying(false);
      setTraveling(false);
    },
    // The ground fades back in before touchdown, so it's already there when
    // the notes fan out rather than washing in afterwards.
    { onApproach: () => setTraveling(false) },
  );

  /* Park the camera on the current pin the first time data lands -- later
     reloads must not yank the view out from under whoever's browsing. */
  const didInit = useRef(false);
  useEffect(() => {
    if (!map || !trip || didInit.current) return;
    didInit.current = true;
    const current = trip.pins.find((p) => p.is_current);
    if (current) {
      map.setView([current.lat, current.lng], ZOOM_OVERVIEW, { animate: false });
    } else if (trip.pins.length) {
      map.fitBounds(trip.pins.map((p) => [p.lat, p.lng]), { padding: [40, 40], animate: false });
    }
  }, [map, trip]);

  function clickPin(pin) {
    if (openPinId === pin.id) {
      setOpenPinId(null);
      return;
    }
    setOpenPinId(pin.id);
    setFlying(true);
  }

  /* Step along the trip in order. `pins` comes back oldest-first, so -1 is
     the previous stop and +1 the next. */
  const pins = trip?.pins ?? [];
  const openIndex = pins.findIndex((p) => p.id === openPinId);
  const hasPrev = openIndex > 0;
  const hasNext = openIndex >= 0 && openIndex < pins.length - 1;

  function step(delta) {
    const next = pins[openIndex + delta];
    if (!next) return;
    setOpenPinId(next.id);
    setFlying(true);
    setTraveling(true);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (photo) setPhoto(null);
        else if (modal) setModal(null);
        else if (pinOpen) setOpenPinId(null);
        return;
      }
      // Arrows walk the trip, but only while the notes are the thing on screen.
      if (!pinOpen || modal || photo) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, modal, pinOpen, openIndex, pins.length]);

  async function submitComment({ author_name, author_color, body }) {
    await postComment({ pin_id: openPinId, author_name, author_color, body });
    setModal(null);
    await reload();
  }

  async function flag(id) {
    if (!confirm("Flag this comment? It will be hidden immediately.")) return;
    await flagComment(id);
    await reload();
  }

  return (
    <>
      <SiteHeader onAbout={() => setModal("about")} />

      <MapFrame pinOpen={pinOpen}>
        {/* `reading` waits for the fly-in to land; dimming mid-flight would
            blur the motion. */}
        <MapCanvas
          onReady={setMap}
          pinOpen={pinOpen}
          reading={pinOpen && !flying}
          traveling={traveling}
        />

        {map && trip && (
          <>
            <RouteLine map={map} points={trip.pins.map((p) => [p.lat, p.lng])} />

            {trip.pins.map((pin) => {
              const pinItems = buildItems(pin);
              return (
                <PinMarker
                  key={pin.id}
                  map={map}
                  lat={pin.lat}
                  lng={pin.lng}
                  icon={pin.is_current ? "car" : "tack"}
                  focused={openPinId === pin.id}
                  onClick={() => clickPin(pin)}
                  tooltip={
                    /* The post count lives on the stack itself now. */
                    <PinTooltip
                      place={pin.label || "Somewhere out there"}
                      meta={fmtDateRange(pinItems, pin.created_at)}
                    />
                  }
                >
                  <PinStack
                    icon={pin.is_current ? "car" : "tack"}
                    peeks={pinItems.slice(-4).map((i) => i.kind)}
                    count={pinItems.length}
                    seed={`pin${pin.id}`}
                    focused={openPinId === pin.id}
                    clickable
                  />
                </PinMarker>
              );
            })}

            {/* Planned stops are markers only -- no route line runs through
                them, because the trip line is where we've actually been. */}
            {trip.planned_stops.map((stop) => (
              <PinMarker
                key={`stop-${stop.id ?? `${stop.lat},${stop.lng}`}`}
                map={map}
                lat={stop.lat}
                lng={stop.lng}
                icon="pin"
                tooltip={<PinTooltip place={stop.name} meta={stop.note} />}
              >
                <PinStack icon="pin" art={pinVariantFor(`stop${stop.id}:${stop.name}`)} />
              </PinMarker>
            ))}
          </>
        )}

        {/* Stays mounted through a step: only the notes come and go, so the
            arrows, back button and paw sticker don't blink out and back. */}
        {openPin && (
          <PinView
            showNotes={!flying}
            pin={openPin}
            items={items}
            commentsEnabled={trip.comments_enabled}
            onBack={() => setOpenPinId(null)}
            onWriteNote={() => setModal(trip.comments_enabled ? "comment" : "comments-off")}
            onOpenPhoto={setPhoto}
            onFlag={flag}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />
        )}
      </MapFrame>

      {modal === "about" && (
        <IndexCardModal title="about" onClose={() => setModal(null)}>
          <AboutText />
        </IndexCardModal>
      )}

      {modal === "comment" && (
        <IndexCardModal title="LEAVE A NOTE FOR SHM!" onClose={() => setModal(null)}>
          <CommentForm onSubmit={submitComment} />
        </IndexCardModal>
      )}

      {modal === "comments-off" && (
        <IndexCardModal title="Comments off" onClose={() => setModal(null)}>
          <p>Comments are turned off right now.</p>
        </IndexCardModal>
      )}

      {photo && (
        <PhotoLightbox url={photo.url} caption={photo.caption} onClose={() => setPhoto(null)} />
      )}
    </>
  );
}
