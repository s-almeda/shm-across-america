import "./IndexCardModal.css";

export default function IndexCardModal({ title, status, paper, onClose, children }) {
  return (
    <div
      className="index-card-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="index-card-modal__card"
        style={paper ? { "--card-paper": paper } : undefined}
      >
        <div className="index-card-modal__head">
          <span className="index-card-modal__title">{title}</span>
          <button
            type="button"
            className="index-card-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="index-card-modal__body">{children}</div>
        <div className="index-card-modal__foot">{status || " "}</div>
      </div>
    </div>
  );
}
