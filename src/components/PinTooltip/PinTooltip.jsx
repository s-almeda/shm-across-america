import "./PinTooltip.css";

export default function PinTooltip({ place, meta }) {
  return (
    <>
      <div className="pin-tooltip__place">{place}</div>
      {meta && <div className="pin-tooltip__meta">{meta}</div>}
    </>
  );
}
