"use client";

export default function PullToRefreshIndicator({
  distance,
  refreshing,
}: {
  distance: number;
  refreshing: boolean;
}) {
  const visible = distance > 0 || refreshing;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={refreshing ? "Refreshing" : "Pull to refresh"}
      style={{
        position: "fixed",
        zIndex: 200,
        top: "calc(env(safe-area-inset-top, 0px) + 8px)",
        left: "50%",
        width: 40,
        height: 40,
        display: "grid",
        placeItems: "center",
        borderRadius: 999,
        background: "var(--chakra-colors-bg, white)",
        boxShadow: "2px 2px 0 0 var(--gn-shadow)",
        color: "var(--gn-accent-solid)",
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        transform: `translate(-50%, ${visible ? Math.min(distance, 72) : -56}px)`,
        transition:
          refreshing || reducedMotion ? "none" : "transform 120ms ease, opacity 120ms ease",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{
          transform: `rotate(${refreshing ? 0 : Math.min(distance, 72) * 4}deg)`,
          animation:
            refreshing && !reducedMotion ? "pull-to-refresh-spin 0.8s linear infinite" : "none",
        }}
      >
        <path
          d="M20 7v5h-5M4 17v-5h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <style>{`@keyframes pull-to-refresh-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
