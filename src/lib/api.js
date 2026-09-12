export async function fetchTrip() {
  const res = await fetch("/api/trip");
  if (!res.ok) throw new Error("Couldn't load the trip.");
  return res.json();
}

/* Exactly one of pin_id / stop_id: a visited pin, or a planned stop someone
   is leaving an idea on before the trip gets there. */
export async function postComment({ pin_id, stop_id, author_name, author_color, body }) {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin_id, stop_id, author_name, author_color, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Couldn't post comment.");
  }
  return res.json().catch(() => ({}));
}

/* Stop comments are a separate table, so they flag through their own route. */
export async function flagComment(id, onStop = false) {
  const path = onStop ? "stop-comments" : "comments";
  await fetch(`/api/${path}/${id}/flag`, { method: "POST" });
}
