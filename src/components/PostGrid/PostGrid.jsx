import { useLayoutEffect, useMemo, useRef } from "react";
import PhotoCard from "../PhotoCard/PhotoCard";
import PostitCard from "../PostitCard/PostitCard";
import { fmtDate, fmtStampTail, itemKey, pastel, rotationsFor } from "../../lib/format";
import { flipIn } from "./flipIn";
import "./PostGrid.css";

export default function PostGrid({ items, flipKey, anchor, onOpenPhoto, onFlag }) {
  const ref = useRef(null);

  // Tilts are decided for the run of cards together, not per card -- the rule
  // caps how many in a row may lean the same way.
  const rots = useMemo(() => rotationsFor(items.map(itemKey)), [items]);

  // Fans out when a pin opens, not on every later re-render.
  useLayoutEffect(() => {
    flipIn(ref.current, anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipKey]);

  return (
    <div className="post-grid" ref={ref}>
      {items.map((item, i) => {
        const key = itemKey(item);
        const rot = rots[i];

        if (item.kind === "photo") {
          // Same text on the card and in the lightbox.
          const caption = item.caption || fmtDate(item.created_at);
          return (
            <PhotoCard
              key={key}
              url={item.url}
              caption={caption}
              rot={rot}
              onClick={() => onOpenPhoto({ url: item.url, caption })}
            />
          );
        }

        const isNote = item.kind === "note";
        return (
          <PostitCard
            key={key}
            tone={isNote ? "note" : "comment"}
            author={isNote ? "shm" : item.author_name}
            authorColor={isNote ? null : item.author_color}
            paper={isNote ? null : pastel(item.author_color)}
            stamp={fmtStampTail(item.created_at)}
            body={isNote ? item.text : item.body}
            rot={rot}
            onFlag={isNote ? null : () => onFlag(item.id)}
          />
        );
      })}
    </div>
  );
}
