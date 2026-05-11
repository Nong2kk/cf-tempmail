"use client";

export function HoneycombBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.07]">
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="honeycomb"
            x="0"
            y="0"
            width="56"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            {/* Row 1 */}
            <polygon
              points="28,2 54,16 54,44 28,58 2,44 2,16"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1"
            />
            {/* Row 2 offset */}
            <polygon
              points="56,52 82,66 82,94 56,108 30,94 30,66"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1"
            />
            <polygon
              points="0,52 26,66 26,94 0,108 -26,94 -26,66"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#honeycomb)" />
      </svg>
    </div>
  );
}
