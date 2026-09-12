export async function fetchTrip() {
  const res = await fetch("/api/trip");
  if (!res.ok) throw new Error("Couldn't load the trip.");
  return res.json();
}

export async function postComment({ pin_id, author_name, body }) {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin_id, author_name, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Couldn't post comment.");
  }
  return res.json().catch(() => ({}));
}

export async function flagComment(id) {
  await fetch(`/api/comments/${id}/flag`, { method: "POST" });
}
