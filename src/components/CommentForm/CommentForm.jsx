import { useState } from "react";

/* Unstyled on purpose -- the index card styles its own form controls. */
export default function CommentForm({ onSubmit }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ author_name: name.trim(), body: body.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <textarea
        placeholder="Say something..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <button type="submit" disabled={busy}>
        {busy ? "Posting…" : "Post"}
      </button>
    </form>
  );
}
