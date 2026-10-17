export function SpriteIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 12 5 9.5l1.6 7A9.5 9.5 0 0 0 9.5 24L9 27l4-2a11 11 0 0 0 6 0l4 2-.5-3a9.5 9.5 0 0 0 2.9-7.5l1.6-7-4 2.5a10.5 10.5 0 0 0-14 0Z"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <path d="M16 9c-.5-3.8 1.4-5.8 4.5-6-.1 3-1.8 4.6-4.5 4.5" />
      <g fill="currentColor" stroke="none">
        <ellipse cx="12" cy="17.5" rx="1.1" ry="1.5" />
        <ellipse cx="20" cy="17.5" rx="1.1" ry="1.5" />
      </g>
      <path d="M14 21c1.2 1.2 2.8 1.2 4 0" />
    </svg>
  );
}
