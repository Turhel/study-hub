import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const SHOW_DISTANCE_FROM_BOTTOM = 132;

const dockItems = [
  { label: "Hoje", shortLabel: "Hoje", to: "/" },
  { label: "Timer", shortLabel: "Timer", to: "/timer" },
];

export default function AdaptiveDock() {
  const location = useLocation();
  const [nearBottom, setNearBottom] = useState(false);
  const [isDockFocused, setIsDockFocused] = useState(false);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const distanceFromBottom = window.innerHeight - event.clientY;
      setNearBottom(distanceFromBottom <= SHOW_DISTANCE_FROM_BOTTOM);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const isVisible = nearBottom || isDockFocused;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
      <nav
        aria-label="Navegacao principal"
        className={`adaptive-dock pointer-events-auto ${isVisible ? "adaptive-dock-visible" : ""}`}
        onPointerEnter={() => setIsDockFocused(true)}
        onPointerLeave={() => setIsDockFocused(false)}
        onFocus={() => setIsDockFocused(true)}
        onBlur={() => setIsDockFocused(false)}
      >
        <div className="adaptive-dock-handle" aria-hidden="true" />
        {dockItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`adaptive-dock-item ${isActive ? "adaptive-dock-item-active" : ""}`}
              title={item.label}
            >
              <span className="adaptive-dock-dot" aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
