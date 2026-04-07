interface Props {
  value: number;   // 0–100
  size?: number;
  stroke?: number;
}

export function ArcGauge({ value, size = 80, stroke = 6 }: Props) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Arco de 220° centrado abajo
  const startAngle = 200;
  const endAngle = 340;
  const range = startAngle + endAngle; // 540° total — usamos 220° de arco
  const arcDeg = 220;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const polarToXY = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle - 90)),
    y: cy + r * Math.sin(toRad(angle - 90)),
  });

  const startRad = 160; // ángulo de inicio del arco en SVG
  const endRad = startRad + arcDeg;
  const fillRad = startRad + (arcDeg * value) / 100;

  const describeArc = (from: number, to: number) => {
    const s = polarToXY(from);
    const e = polarToXY(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const circumference = 2 * Math.PI * r;
  void range; void circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <path
        d={describeArc(startRad, endRad)}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Fill */}
      {value > 0 && (
        <path
          d={describeArc(startRad, fillRad)}
          fill="none"
          stroke="#ffffff"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      )}
      {/* Valor */}
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        fontSize={size * 0.2}
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}
