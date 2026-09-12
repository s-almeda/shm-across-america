import StickerButton from "../StickerButton/StickerButton";
import "./AboutSticker.css";

export default function AboutSticker({ onClick }) {
  return (
    <StickerButton className="about-sticker" title="about" onClick={onClick}>
      <img style={{ width: "24px", height: "auto" }} src="/assets/questionmark.png" alt="About" />
    </StickerButton>
  );
}
