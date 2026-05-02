// A small, stylised pink crocodile mark.
// Restrained line work — looks like a friendly print, not a cartoon.

export function CrocMark({ size = 28, color = '#c93f5d' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <path
        d="M4 38 Q8 30 18 30 L42 30 Q52 30 58 36 Q60 38 58 40 Q54 42 50 42 L46 42 L46 46 Q46 48 44 48 Q42 48 42 46 L42 42 L26 42 L26 46 Q26 48 24 48 Q22 48 22 46 L22 42 L18 42 Q12 42 8 44 Q5 45 4 42 Z"
        fill={color}
        opacity="0.92"
      />
      {/* Tail */}
      <path
        d="M4 38 Q1 36 1 32 Q1 30 3 30 Q5 30 6 33 Q7 35 8 36 Z"
        fill={color}
        opacity="0.85"
      />
      {/* Snout / eye area highlight */}
      <circle cx="51" cy="34" r="1.4" fill="#fff" />
      {/* Back ridge — three little triangles */}
      <path
        d="M22 30 L24 26 L26 30 Z M30 30 L32 26 L34 30 Z M38 30 L40 26 L42 30 Z"
        fill={color}
        opacity="0.78"
      />
    </svg>
  );
}
