export default function MadeByBadge() {
  return (
    <a
      className="made-by-badge"
      href="https://dibbayajyoti.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Made by Dibbayajyoti Roy — opens portfolio in a new tab"
    >
      <span className="made-by-badge-dot" aria-hidden />
      <span className="made-by-badge-text">
        <span className="made-by-badge-prefix">Made by</span>
        <span className="made-by-badge-name">Dibbayajyoti Roy</span>
      </span>
      <span className="made-by-badge-arrow" aria-hidden>↗</span>
    </a>
  );
}
