import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCanvas from "./map/MapCanvas";
import PinMarker from "./map/PinMarker";
import RouteLine from "./map/RouteLine";
import { pinVariantFor, ZOOM_OVERVIEW, ZOOM_STOP } from "./map/config";
import SiteHeader from "./components/SiteHeader/SiteHeader";
import MapFrame from "./components/MapFrame/MapFrame";
import PinStack from "./components/PinStack/PinStack";
import PinTooltip from "./components/PinTooltip/PinTooltip";
import PinView from "./components/PinView/PinView";
import IndexCardModal from "./components/IndexCardModal/IndexCardModal";
import PhotoLightbox from "./components/PhotoLightbox/PhotoLightbox";
import CommentForm from "./components/CommentForm/CommentForm";
import AboutText from "./components/AboutText/AboutText";
import TripStatus from "./components/TripStatus/TripStatus";
import { fetchTrip, flagComment, postComment } from "./lib/api";
import { usePinCamera } from "./lib/usePinCamera";
import { buildItems, fmtDateRange, pastel } from "./lib/format";

/* Planned stops sit under the trip pins: where a stop and a visited pin
   overlap, the place we've actually been wins. */
const STOP_Z = -1000;
/* The car is where shm is right now -- it's never behind another pin's paper,
   whatever order the pins were added in. Well clear of (i + 1) * 10. */
const CAR_Z = 100000;

export default function App() {
  const [map, setMap] = useState(null);
  const [trip, setTrip] = useState(null);
  const [tripError, setTripError] = useState(null);
  const [openPinId, setOpenPinId] = useState(null);
  const [flying, setFlying] = useState(false);
  const [photo, setPhoto] = useState(null); // { url, caption }
  const [modal, setModal] = useState(null); // "about" | "comment" | "comments-off"
  // The pastel the comment form is previewing, so the card can wear it too.
  const [commentPaper, setCommentPaper] = useState(null);

  /* A reload runs after posting and flagging too, not just on first paint, so
     a failure here must leave `trip` alone -- dropping it would tear the map
     out from under someone whose comment actually saved fine. */
  const reload = useCallback(async () => {
    try {
      const fresh = await fetchTrip();
      setTrip(fresh);
      setTripError(null);
    } catch (err) {
      setTripError(err.message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const onCommentColor = useCallback((hex) => setCommentPaper(pastel(hex)), []);

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

  /* A planned stop doesn't open anything -- clicking one just brings it to
     the middle of the map so you can see where it is. Never zooms back out,
     so clicking one while already up close stays close. */
  function clickStop(stop) {
    if (!map || pinOpen) return;
    // Fixed and short. Leaflet's default duration scales with distance, which
    // makes a cross-country stop take several seconds for a move that isn't
    // arriving anywhere.
    map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), ZOOM_STOP), {
      duration: 0.6,
    });
  }

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

      <MapFrame>
        {/* `reading` waits for the fly-in to land; dimming mid-flight would
            blur the motion. */}
        <MapCanvas
          onReady={setMap}
          pinOpen={pinOpen}
          reading={pinOpen && !flying}
          traveling={traveling}
        />

        <TripStatus
          loading={!trip}
          error={tripError}
          hasTrip={!!trip}
          onRetry={reload}
        />

        {map && trip && (
          <>
            <RouteLine map={map} points={trip.pins.map((p) => [p.lat, p.lng])} />

            {trip.pins.map((pin, i) => {
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
                  // pins arrive oldest-first, so a later stop stacks over an
                  // earlier one where their paper overlaps -- except the car,
                  // which is always on top (the current pin isn't necessarily
                  // the newest one, since any pin can be made current).
                  zOffset={pin.is_current ? CAR_Z : (i + 1) * 10}
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

            {/*
              Planned stops stay scenery: no detail view, no comments, no
              focus. Clicking one only centres the map on it. They mark where
              the trip is headed and say their name on hover, and that's the
              whole of it. No route line runs through them either -- the line
              is where we've actually been.
            */}
            {trip.planned_stops.map((stop) => (
              <PinMarker
                key={`stop-${stop.id}`}
                map={map}
                lat={stop.lat}
                lng={stop.lng}
                icon="pin"
                zOffset={STOP_Z}
                onClick={() => clickStop(stop)}
                tooltip={<PinTooltip place={stop.name} meta={stop.note} />}
              >
                <PinStack
                  icon="pin"
                  art={pinVariantFor(`stop${stop.id}:${stop.name}`)}
                  clickable
                />
              </PinMarker>
            ))}
          </>
        )}

        {/* Stays mounted through a step: only the notes and the place header
            come and go, so the arrows, back button and paw sticker don't
            blink out and back. */}
        {openPin && (
          <PinView
            arrived={!flying}
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
        <IndexCardModal
          title="leave a note for shm! :3"
          paper={commentPaper}
          onClose={() => setModal(null)}
        >
          <CommentForm onSubmit={submitComment} onColor={onCommentColor} />
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
