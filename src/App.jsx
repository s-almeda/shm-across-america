import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCanvas from "./map/MapCanvas";
import PinMarker from "./map/PinMarker";
import RouteLine from "./map/RouteLine";
import { pinIconFor, pinVariantFor, ZOOM_OVERVIEW } from "./map/config";
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
import { buildItems, fmtDateRange, pastel } from "./lib/format";

/* Planned stops sit under the trip pins: where a stop and a visited pin
   overlap, the place we've actually been wins. */
const STOP_Z = -1000;

export default function App() {
  const [map, setMap] = useState(null);
  const [trip, setTrip] = useState(null);
  /* One opened thing, either kind: { kind: "pin" | "stop", id }. Stops open
     the same detail view so people can leave ideas for a place before the
     trip reaches it. */
  const [open, setOpen] = useState(null);
  const [flying, setFlying] = useState(false);
  const [photo, setPhoto] = useState(null); // { url, caption }
  const [modal, setModal] = useState(null); // "about" | "comment" | "comments-off"
  // The pastel the comment form is previewing, so the card can wear it too.
  const [commentPaper, setCommentPaper] = useState(null);

  const reload = useCallback(async () => setTrip(await fetchTrip()), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const onCommentColor = useCallback((hex) => setCommentPaper(pastel(hex)), []);

  const pins = trip?.pins ?? [];
  const stops = trip?.planned_stops ?? [];

  /* Prev/next walk whichever list the open thing belongs to -- visited pins
     step along the trip, planned stops step along the plan. */
  const onStop = open?.kind === "stop";
  const siblings = onStop ? stops : pins;
  const openIndex = open ? siblings.findIndex((o) => o.id === open.id) : -1;
  const openRaw = openIndex >= 0 ? siblings[openIndex] : null;
  const pinOpen = openRaw !== null;

  /*
   * A stop is reshaped into the same fields the detail view reads, so one
   * PinView serves both. A stop has no photos or notes of its own -- only
   * whatever people have left on it.
   */
  const target = useMemo(() => {
    if (!openRaw) return null;
    if (!onStop) return openRaw;
    return {
      id: `stop-${openRaw.id}`,
      lat: openRaw.lat,
      lng: openRaw.lng,
      label: openRaw.name,
      is_current: false,
      messages: [],
      photos: [],
      comments: openRaw.comments ?? [],
    };
  }, [openRaw, onStop]);

  const items = useMemo(() => (target ? buildItems(target) : []), [target]);
  const icon = onStop ? "pin" : target ? pinIconFor(target) : "tack";
  const stickerArt = onStop && openRaw ? pinVariantFor(`stop${openRaw.id}:${openRaw.name}`) : null;

  /* `traveling` only covers stop-to-stop hops. Clicking a pin from the map is
     a zoom-in with no arc to speak of, so the ground stays put for that. */
  const [traveling, setTraveling] = useState(false);

  usePinCamera(
    map,
    target,
    () => {
      setFlying(false);
      setTraveling(false);
    },
    // The ground fades back in before touchdown, so it's already there when
    // the notes fan out rather than washing in afterwards.
    { onApproach: () => setTraveling(false), icon },
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

  function openTarget(kind, id) {
    if (open?.kind === kind && open.id === id) {
      setOpen(null);
      return;
    }
    // Switching between two open things is a journey; opening from the map
    // isn't, so only the former fades the ground away.
    if (pinOpen) setTraveling(true);
    setOpen({ kind, id });
    setFlying(true);
  }

  const hasPrev = openIndex > 0;
  const hasNext = openIndex >= 0 && openIndex < siblings.length - 1;

  function step(delta) {
    const next = siblings[openIndex + delta];
    if (!next) return;
    setOpen({ kind: open.kind, id: next.id });
    setFlying(true);
    setTraveling(true);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (photo) setPhoto(null);
        else if (modal) setModal(null);
        else if (pinOpen) setOpen(null);
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
  }, [photo, modal, pinOpen, openIndex, siblings.length]);

  async function submitComment({ author_name, author_color, body }) {
    await postComment({
      pin_id: onStop ? undefined : open.id,
      stop_id: onStop ? open.id : undefined,
      author_name,
      author_color,
      body,
    });
    setModal(null);
    await reload();
  }

  async function flag(id) {
    if (!confirm("Flag this comment? It will be hidden immediately.")) return;
    await flagComment(id, onStop);
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

            {trip.pins.map((pin, i) => {
              const pinItems = buildItems(pin);
              return (
                <PinMarker
                  key={pin.id}
                  map={map}
                  lat={pin.lat}
                  lng={pin.lng}
                  icon={pin.is_current ? "car" : "tack"}
                  focused={!onStop && open?.id === pin.id}
                  onClick={() => openTarget("pin", pin.id)}
                  // pins arrive oldest-first, so a later stop stacks over an
                  // earlier one where their paper overlaps.
                  zOffset={(i + 1) * 10}
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
                    focused={!onStop && open?.id === pin.id}
                    clickable
                  />
                </PinMarker>
              );
            })}

            {/* Planned stops are markers only -- no route line runs through
                them, because the trip line is where we've actually been. */}
            {stops.map((stop) => {
              const count = (stop.comments ?? []).length;
              return (
                <PinMarker
                  key={`stop-${stop.id}`}
                  map={map}
                  lat={stop.lat}
                  lng={stop.lng}
                  icon="pin"
                  focused={onStop && open?.id === stop.id}
                  onClick={() => openTarget("stop", stop.id)}
                  zOffset={STOP_Z}
                  tooltip={
                    <PinTooltip
                      place={stop.name}
                      // No filler subtitle: the orange pin already says it's
                      // a planned stop.
                      meta={stop.note || (count ? `${count} idea${count === 1 ? "" : "s"}` : null)}
                    />
                  }
                >
                  <PinStack
                    icon="pin"
                    art={pinVariantFor(`stop${stop.id}:${stop.name}`)}
                    peeks={(stop.comments ?? []).slice(-4).map(() => "comment")}
                    count={count}
                    seed={`stop${stop.id}`}
                    focused={onStop && open?.id === stop.id}
                    clickable
                  />
                </PinMarker>
              );
            })}
          </>
        )}

        {/* Stays mounted through a step: only the notes and the place header
            come and go, so the arrows, back button and paw sticker don't
            blink out and back. */}
        {target && (
          <PinView
            arrived={!flying}
            pin={target}
            icon={icon}
            stickerArt={stickerArt}
            items={items}
            meta={onStop ? null : fmtDateRange(items, target.created_at)}
            commentsEnabled={trip.comments_enabled}
            onBack={() => setOpen(null)}
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
          title={onStop ? "leave an idea for this stop!" : "leave a note for shm! :3"}
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
