export default function RoundResultBanner({ visible, text }) {
  if (!visible) return null;
  return (
    <div className="round-banner">
      <p>{text}</p>
    </div>
  );
}
