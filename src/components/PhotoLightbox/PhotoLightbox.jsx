import "./PhotoLightbox.css";

export default function PhotoLightbox({ url, caption, onClose }) {
  return (
    <div className="photo-lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="photo-lightbox__close" onClick={onClose}>
        close ✕
      </button>
      <figure className="photo-lightbox__figure">
        <img className="photo-lightbox__img" src={url} alt="" />
        {caption && <figcaption className="photo-lightbox__caption">{caption}</figcaption>}
      </figure>
    </div>
  );
}
