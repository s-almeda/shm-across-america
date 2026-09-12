import StickerButton from "../StickerButton/StickerButton";
import "./WriteNoteSticker.css";

export default function WriteNoteSticker({ onClick }) {
  return (
    <StickerButton className="write-note-sticker" title="write shm a note" onClick={onClick}>
      <span className="write-note-sticker__plus">+</span>
      <span className="write-note-sticker__label">
        write shm
        <br />
        a note?
      </span>
      <img className="write-note-sticker__paw" src="/assets/writing_hand.png" alt="" />
    </StickerButton>
  );
}
