import { useMemo } from "react";

/**
 * Absolute-positioned fireworks layer.
 * Renders multiple bursts at random positions; each burst spawns N particles
 * that fly outward and fade. Pure CSS keyframes — no JS animation loop.
 */
export function BirthdayFireworks({ bursts = 6 }: { bursts?: number }) {
  const burstsData = useMemo(() => {
    const colors = ["#E2725B", "#F4B860", "#7A8FA8", "#D4A574", "#C97B5E", "#F0D58C"];
    return Array.from({ length: bursts }).map((_, i) => ({
      id: i,
      left: 8 + Math.random() * 84, // %
      top: 10 + Math.random() * 70, // %
      delay: Math.random() * 4,
      color: colors[i % colors.length],
      particles: Array.from({ length: 14 }).map((_, p) => ({
        angle: (p / 14) * Math.PI * 2,
        distance: 40 + Math.random() * 30,
      })),
    }));
  }, [bursts]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <style>{`
        @keyframes psa-fw-particle {
          0% { transform: translate(0,0) scale(1); opacity: 1; }
          60% { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
        }
        @keyframes psa-fw-core {
          0%, 100% { opacity: 0; transform: scale(0.4); }
          10% { opacity: 1; transform: scale(1.2); }
          25% { opacity: 0; transform: scale(0.6); }
        }
        .psa-fw-burst {
          position: absolute;
          width: 6px;
          height: 6px;
        }
        .psa-fw-core {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          animation: psa-fw-core 6s ease-out infinite;
        }
        .psa-fw-particle {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 4px;
          margin-left: -2px;
          margin-top: -2px;
          border-radius: 9999px;
          animation: psa-fw-particle 1.6s ease-out infinite;
          opacity: 0;
        }
      `}</style>
      {burstsData.map((b) => (
        <div
          key={b.id}
          className="psa-fw-burst"
          style={{ left: `${b.left}%`, top: `${b.top}%` }}
        >
          <div
            className="psa-fw-core"
            style={{
              background: `radial-gradient(circle, ${b.color} 0%, transparent 70%)`,
              animationDelay: `${b.delay}s`,
              width: 60,
              height: 60,
              marginLeft: -27,
              marginTop: -27,
            }}
          />
          {b.particles.map((p, idx) => (
            <span
              key={idx}
              className="psa-fw-particle"
              style={{
                background: b.color,
                boxShadow: `0 0 6px ${b.color}`,
                animationDelay: `${b.delay + 0.05}s`,
                ["--dx" as any]: `${Math.cos(p.angle) * p.distance}px`,
                ["--dy" as any]: `${Math.sin(p.angle) * p.distance}px`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
