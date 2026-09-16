const TRIP_TIMEOUT_MS = 10000;

export async function fetchTrip() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIP_TIMEOUT_MS);

  try {
    const res = await fetch("/api/trip", { signal: controller.signal });
    if (!res.ok) throw new Error("Couldn't load the trip.");
    return await res.json();
  } catch (err) {
    /* An abort is our own timeout firing, and the browser's message for it
       ("The user aborted a request.") reads like the visitor did something. */
    if (err.name === "AbortError") {
      throw new Error("This is taking a while -- check your connection.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function postComment({ pin_id, author_name, author_color, body }) {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin_id, author_name, author_color, body }),
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
