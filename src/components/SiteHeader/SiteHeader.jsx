import AboutSticker from "../AboutSticker/AboutSticker";
import "./SiteHeader.css";

export default function SiteHeader({ onAbout }) {
  return (
    <header className="site-header">
      <div className="site-header__row">
        <h1 className="site-header__title">shm-across-america 2026!</h1>
        <AboutSticker onClick={onAbout} />
      </div>
      <p className="site-header__tagline">virtual shmtracker</p>
    </header>
  );
}
