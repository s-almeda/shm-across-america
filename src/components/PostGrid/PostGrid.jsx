import { useLayoutEffect, useRef } from "react";
import PhotoCard from "../PhotoCard/PhotoCard";
import PostitCard from "../PostitCard/PostitCard";
import { fmtDate, fmtPostStamp, itemKey, stableRotation } from "../../lib/format";
import { flipIn } from "./flipIn";
import "./PostGrid.css";

export default function PostGrid({ items, flipKey, onOpenPhoto, onFlag }) {
  const ref = useRef(null);

  // Fans out when a pin opens, not on every later re-render.
  useLayoutEffect(() => {
    flipIn(ref.current);
  }, [flipKey]);

  return (
    <div className="post-grid" ref={ref}>
      {items.map((item) => {
        const key = itemKey(item);
        const rot = stableRotation(key);

        if (item.kind === "photo") {
          return (
            <PhotoCard
              key={key}
              url={item.url}
              caption={item.caption || fmtDate(item.created_at)}
              rot={rot}
              onClick={() => onOpenPhoto(item.url)}
            />
          );
        }

        const isNote = item.kind === "note";
        return (
          <PostitCard
            key={key}
            tone={isNote ? "note" : "comment"}
            stamp={fmtPostStamp(item.created_at, isNote ? "shm" : item.author_name)}
            body={isNote ? item.text : item.body}
            rot={rot}
            onFlag={isNote ? null : () => onFlag(item.id)}
          />
        );
      })}
    </div>
  );
}
