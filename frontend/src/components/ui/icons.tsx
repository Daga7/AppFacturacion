// Íconos SVG inline compartidos (sin dependencias externas).

export function StoreIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M4 9.5h16v0a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0" />
      <path d="M5 12v8h14v-8" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}
