import "./PhotoLightbox.css";

export default function PhotoLightbox({ url, onClose }) {
  return (
    <div className="photo-lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="photo-lightbox__close" onClick={onClose}>
        close ✕
      </button>
      <img className="photo-lightbox__img" src={url} alt="" />
    </div>
  );
}
