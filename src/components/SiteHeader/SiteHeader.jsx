import AboutSticker from "../AboutSticker/AboutSticker";
import "./SiteHeader.css";

export default function SiteHeader({ onAbout }) {
  return (
    <header className="site-header">
      <div className="site-header__row">
        <h1 className="site-header__title">shm-across-america!</h1>
      </div>
      {/* Out of the row and off to the right: sitting right after the title
          made the title read as the question. */}
      <AboutSticker onClick={onAbout} />
      {/* <p className="site-header__tagline">:3</p> */}
    </header>
  );
}
