interface TerrainProps {
  height?: number;
}

export default function Terrain({ height = 180 }: TerrainProps) {
  const layers = [
    { d: 'M0 68 Q70 50 150 60 Q240 74 320 55 Q390 40 460 52 Q540 65 620 48 Q660 42 680 50 L680 200 L0 200Z', fill: '#5A3860', op: 0.75 },
    { d: 'M0 85 Q110 74 220 84 Q340 96 450 78 Q550 64 640 76 Q670 80 680 74 L680 200 L0 200Z', fill: '#4A2D52', op: 0.85 },
    { d: 'M0 105 Q160 96 320 106 Q480 116 640 102 Q670 98 680 102 L680 200 L0 200Z', fill: '#3C2245', op: 1.0 },
    { d: 'M0 128 Q190 120 380 130 Q570 138 680 124 L680 200 L0 200Z', fill: '#30193A', op: 1.0 },
    { d: 'M0 150 Q230 144 460 152 Q620 158 680 148 L680 200 L0 200Z', fill: '#261432', op: 1.0 },
  ];

  return (
    <svg
      viewBox="0 0 680 200"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        width: '100%',
        height,
        pointerEvents: 'none',
        display: 'block',
      }}
    >
      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} opacity={l.op} />
      ))}
    </svg>
  );
}
