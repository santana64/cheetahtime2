/**
 * CheetahCoatBg — Decorative SVG of cheetah rosette clusters.
 * Renders as a fixed, full-screen background layer at ~3% opacity.
 * Pure CSS animation (coat-drift), no JS needed.
 */

interface RosetteProps {
  cx: number;
  cy: number;
  r?: number;
  rotate?: number;
}

/** A single cheetah rosette: central spot + 5 satellite marks. */
function Rosette({ cx, cy, r = 16, rotate = 0 }: RosetteProps) {
  const satellites = Array.from({ length: 5 }, (_, i) => {
    const deg = (i / 5) * 360 + rotate;
    const rad = (deg * Math.PI) / 180;
    const dx = Math.cos(rad) * r;
    const dy = Math.sin(rad) * r;
    return { dx, dy, angle: deg + 90 };
  });

  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Central spot */}
      <ellipse rx="4.5" ry="3.5" />
      {/* Satellite marks */}
      {satellites.map((s, i) => (
        <ellipse
          key={i}
          cx={s.dx}
          cy={s.dy}
          rx="3.2"
          ry="1.9"
          transform={`rotate(${s.angle}, ${s.dx}, ${s.dy})`}
        />
      ))}
    </g>
  );
}

export function CheetahCoatBg() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 h-full w-full animate-coat-drift"
      style={{ zIndex: 0, opacity: 0.030 }}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="oklch(0.28 0.09 145)">
        {/* ── Upper region ── */}
        <Rosette cx={90}   cy={75}  r={18} rotate={0}   />
        <Rosette cx={315}  cy={55}  r={15} rotate={30}  />
        <Rosette cx={540}  cy={38}  r={12} rotate={60}  />
        <Rosette cx={810}  cy={100} r={20} rotate={55}  />
        <Rosette cx={1110} cy={78}  r={16} rotate={20}  />
        <Rosette cx={1395} cy={185} r={18} rotate={75}  />
        {/* ── Mid-left region ── */}
        <Rosette cx={42}   cy={295} r={14} rotate={40}  />
        <Rosette cx={190}  cy={420} r={17} rotate={110} />
        <Rosette cx={370}  cy={175} r={13} rotate={95}  />
        {/* ── Center region ── */}
        <Rosette cx={490}  cy={280} r={22} rotate={15}  />
        <Rosette cx={670}  cy={440} r={15} rotate={45}  />
        <Rosette cx={850}  cy={320} r={19} rotate={130} />
        <Rosette cx={990}  cy={195} r={14} rotate={80}  />
        {/* ── Right region ── */}
        <Rosette cx={1200} cy={250} r={17} rotate={110} />
        <Rosette cx={1265} cy={390} r={19} rotate={35}  />
        <Rosette cx={1425} cy={640} r={15} rotate={25}  />
        {/* ── Lower region ── */}
        <Rosette cx={148}  cy={600} r={16} rotate={80}  />
        <Rosette cx={445}  cy={580} r={21} rotate={10}  />
        <Rosette cx={650}  cy={800} r={16} rotate={65}  />
        <Rosette cx={760}  cy={685} r={17} rotate={140} />
        <Rosette cx={980}  cy={780} r={22} rotate={30}  />
        <Rosette cx={1155} cy={545} r={20} rotate={70}  />
        <Rosette cx={1340} cy={830} r={14} rotate={85}  />
        <Rosette cx={275}  cy={740} r={18} rotate={50}  />
        {/* ── Small accent spots ── */}
        <circle cx={460}  cy={132} r={5}  />
        <circle cx={1300} cy={140} r={4}  />
        <circle cx={700}  cy={560} r={6}  />
        <circle cx={90}   cy={800} r={4}  />
        <circle cx={1350} cy={500} r={5}  />
        <circle cx={580}  cy={650} r={3}  />
      </g>
    </svg>
  );
}
