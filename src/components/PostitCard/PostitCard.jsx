import "./PostitCard.css";

const FLAG_LABEL = "Flag this comment";

export default function PostitCard({ tone, author, authorColor, paper, stamp, body, place, onFlag }) {
  // `paper` is the commenter's colour as pastel stationery; without one the
  // CSS fallback keeps the default yellow. `place` is the tilt plus a small
  // nudge off the grid cell.
  const style = { "--rot": place.rot, "--dx": place.dx, "--dy": place.dy };
  if (paper) style["--postit-paper"] = paper;

  return (
    <div className={`postit-card is-${tone}`} style={style}>
      {onFlag && (
        <button
          type="button"
          className="postit-card__flag"
          title={FLAG_LABEL}
          aria-label={FLAG_LABEL}
          onClick={onFlag}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <line x1="5" y1="3" x2="5" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M5 4 L19 4 L15 8 L19 12 L5 12 Z" fill="currentColor" />
          </svg>
        </button>
      )}
      <div className="postit-card__stamp">
        <span className="postit-card__author" style={authorColor ? { color: authorColor } : undefined}>
          {author}
        </span>{" "}
        {stamp}
      </div>
      <p className="postit-card__body">{body}</p>
    </div>
  );
}
