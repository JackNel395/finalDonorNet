/**
 * Deterministic decorative QR matrix rendered with SVG. Not a scannable code —
 * it encodes the donor id into a stable pattern for the digital donor card.
 * See design.md §6 QRCode.
 */

import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

type QRCodeProps = {
  value: string;
  size?: number;
  color?: string;
  background?: string;
};

const GRID = 21; // classic QR v1 module count

/** Stable string hash → 32-bit int. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) so a given value always yields the same matrix. */
function makeRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isFinder(r: number, c: number): boolean {
  const inBox = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
  return inBox(0, 0) || inBox(0, GRID - 7) || inBox(GRID - 7, 0);
}

function finderFilled(r: number, c: number): boolean {
  // map to local finder coordinates
  const lr = r < 7 ? r : r - (GRID - 7);
  const lc = c < 7 ? c : c - (GRID - 7);
  const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
  const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
  return ring || core;
}

export function QRCode({ value, size = 160, color, background }: QRCodeProps) {
  // Always dark ink, never `theme.text`: a code reads as dark modules on a
  // light tile in both themes (the donor card's tile is white in dark mode
  // too), and the theme's near-white dark-mode text made it vanish.
  const fg = color ?? Colors.light.text;
  const bg = background ?? 'transparent';

  const cells = useMemo(() => {
    const rand = makeRandom(hash(value));
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (isFinder(r, c)) {
          if (finderFilled(r, c)) out.push({ x: c, y: r });
        } else if (rand() > 0.5) {
          out.push({ x: c, y: r });
        }
      }
    }
    return out;
  }, [value]);

  const module = size / GRID;

  return (
    <View accessibilityRole="image" accessibilityLabel="Donor verification code">
      <Svg width={size} height={size}>
        {bg !== 'transparent' && <Rect x={0} y={0} width={size} height={size} fill={bg} />}
        {cells.map((cell, i) => (
          <Rect
            key={i}
            x={cell.x * module}
            y={cell.y * module}
            width={module}
            height={module}
            rx={module * 0.2}
            fill={fg}
          />
        ))}
      </Svg>
    </View>
  );
}
