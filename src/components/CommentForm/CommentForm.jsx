import { useState } from "react";
import { loadIdentity, randomInk, saveIdentity } from "../../lib/identity";
import "./CommentForm.css";

export default function CommentForm({ onSubmit }) {
  // Read once on mount: whatever they used last time, else a random ink.
  const [saved] = useState(loadIdentity);
  const [name, setName] = useState(saved?.name ?? "");
  const [color, setColor] = useState(saved?.color ?? randomInk);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ author_name: name.trim(), author_color: color, body: body.trim() });
      saveIdentity({ name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <div className="comment-form__identity">
        <label className="comment-form__field comment-form__field--color">
          <span className="comment-form__label">pick color</span>
          <input
            type="color"
            className="comment-form__swatch"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="pick color"
          />
        </label>

        <label className="comment-form__field">
          <span className="comment-form__label">your name</span>
          {/* Typed in the colour they picked, so the name previews live. */}
          <input
            type="text"
            className="comment-form__name"
            style={{ "--card-input-ink": color }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
      </div>

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
