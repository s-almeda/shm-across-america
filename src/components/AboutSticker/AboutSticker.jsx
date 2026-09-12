import StickerButton from "../StickerButton/StickerButton";
import "./AboutSticker.css";

export default function AboutSticker({ onClick }) {
  return (
    <StickerButton className="about-sticker" title="about" onClick={onClick}>
      <img src="/assets/question-mark.png" alt="About" />
      about
    </StickerButton>
  );
}
