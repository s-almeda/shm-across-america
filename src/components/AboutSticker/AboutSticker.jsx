import StickerButton from "../StickerButton/StickerButton";
import "./AboutSticker.css";

export default function AboutSticker({ onClick }) {
  return (
    <StickerButton className="about-sticker" title="about" onClick={onClick}>
      what's all this about
      <img style={{ width: "auto", height: "15px" }} src="/assets/questionmark.png" alt="About" />
    </StickerButton>
  );
}
