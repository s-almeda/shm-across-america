import "./TripStatus.css";

/*
 * Three states, and the distinction that matters is whether we have a trip in
 * hand. A failed *refresh* (after posting or flagging) must not take the map
 * down with it -- the visitor keeps reading, and gets a strip they can retry
 * from or ignore. Only a failed first load is worth covering the page.
 */
export default function TripStatus({ loading, error, hasTrip, onRetry }) {
  if (hasTrip) {
    if (!error) return null;
    return (
      <div className="trip-status__strip" role="status">
        <span>Couldn't refresh. sowwy</span>
        <button type="button" onClick={onRetry}>
          try again
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trip-status" role="alert">
        <div className="trip-status__card">
          <p className="trip-status__title">oopsie poopsie something went wrong! tell shm they can fix it maybe lol</p>
          <p className="trip-status__detail">{error}</p>
          <button type="button" onClick={onRetry}>
            try again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="trip-status" role="status">
        <div className="trip-status__card">
          <p className="trip-status__title">tracking down shm...</p>
        </div>
      </div>
    );
  }

  return null;
}
