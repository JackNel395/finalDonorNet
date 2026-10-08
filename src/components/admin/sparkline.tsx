/**
 * A trend line, not a chart: no axes, no labels, no tooltip.
 *
 * It sits beside a metric to say "roughly this shape recently", and the number
 * beside it carries the actual fact. Deliberately unlabelled and marked
 * `accessibilityElementsHidden`, because a screen reader announcing a sequence
 * of unitless points would be noise — the tile's value and its change text
 * already carry everything the line decorates.
 *
 * Web-only, like every module in this directory.
 */
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export type SparklineProps = {
  points: number[];
  color: string;
  width?: number;
  height?: number;
};

/** Catmull-Rom to cubic Bézier — a smooth curve, not a jagged polyline. */
function smoothPath(xy: { x: number; y: number }[]): string {
  if (xy.length < 2) return '';
  let d = `M${xy[0].x},${xy[0].y}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function Sparkline({ points, color, width = 96, height = 32 }: SparklineProps) {
  if (points.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const pad = 3;
  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * width,
    y: pad + (1 - (p - min) / span) * (height - pad * 2),
  }));

  const line = smoothPath(xy);
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <View
      style={{ width, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.22} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
        <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
