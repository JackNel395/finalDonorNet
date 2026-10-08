/**
 * Console-only vector marks.
 *
 * The sidebar brand and the welcome banner both want a *drop*, not the generic
 * rounded square the console shipped with — the product's whole subject is
 * blood, and a square with a water glyph inside it says nothing. These are
 * drawn rather than imported as assets so they take theme colors at render
 * time and stay crisp at any size, which a PNG in two themes would not.
 *
 * Web-only, like every module in this directory.
 */
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Filled blood drop with a heart cut into it. Used at 16–120px. */
export function DropMark({ size = 32, from, to }: { size?: number; from: string; to: string }) {
  const id = `drop-${from.replace(/[^a-z0-9]/gi, '')}-${to.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityRole="image">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      {/* Drop: a point at the top opening into a circle at the bottom. */}
      <Path
        d="M32 3C32 3 9 29.6 9 41.6 9 54.0 19.3 61 32 61s23-7.0 23-19.4C55 29.6 32 3 32 3Z"
        fill={`url(#${id})`}
      />
    </Svg>
  );
}

/** The heart that sits inside the banner's drop. Separate so it can be tinted. */
export function HeartMark({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image">
      <Path
        d="M12 21s-7.5-4.7-9.4-9.1C1.1 8.2 3.3 4.5 7 4.5c2.1 0 3.9 1.2 5 3 1.1-1.8 2.9-3 5-3 3.7 0 5.9 3.7 4.4 7.4C19.5 16.3 12 21 12 21Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * A stylised street plan with a pin at its centre, for the header of a card
 * that names one address.
 *
 * Deliberately *not* a map: the console has no coordinates for a center (the
 * admin API returns a street address, not a lat/lng) and no map key on web, so
 * a real tile would be either wrong or blank. This is a locator motif — it says
 * "this is a place" and hands the actual answer to the address printed under
 * it, which is the line staff read back to a donor over the phone. Marked
 * decorative so a screen reader skips it rather than announcing an image that
 * carries no information.
 *
 * Drawn rather than shipped as an asset for the same reason as `DropMark`: it
 * takes theme colors at render time and stays crisp at any size.
 */
export function MapSketch({
  width,
  height,
  land,
  water,
  road,
  block,
  pin,
}: {
  width: number | string;
  height: number;
  land: string;
  water: string;
  road: string;
  block: string;
  pin: string;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      {...({ 'aria-hidden': true } as object)}>
      <Rect x="0" y="0" width="320" height="180" fill={land} />

      {/* A river running off the lower-left corner. */}
      <Path
        d="M0 142 C 54 130, 96 166, 150 158 C 206 150, 250 178, 320 170 L320 180 L0 180 Z"
        fill={water}
        opacity={0.12}
      />

      {/* Blocks, set back from the roads that frame them. */}
      <Rect x="26" y="96" width="42" height="26" rx="5" fill={block} />
      <Rect x="142" y="100" width="38" height="22" rx="5" fill={block} />
      <Rect x="238" y="94" width="46" height="28" rx="5" fill={block} />
      <Rect x="198" y="16" width="36" height="22" rx="5" fill={block} />

      {/* Streets: one arterial across, one down, and a slip road on the bend. */}
      <Path d="M-10 74 L330 56" stroke={road} strokeWidth="13" strokeLinecap="round" fill="none" />
      <Path d="M112 -10 L96 190" stroke={road} strokeWidth="10" strokeLinecap="round" fill="none" />
      <Path d="M212 -10 L224 190" stroke={road} strokeWidth="7" strokeLinecap="round" fill="none" />
      <Path
        d="M-10 16 C 60 26, 110 8, 190 22 C 250 32, 290 24, 330 30"
        stroke={road}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />

      {/* The pin, over its own halo so it reads against road and block alike. */}
      <Circle cx="160" cy="76" r="27" fill={pin} opacity={0.13} />
      <Path
        d="M160 48c-9.4 0-17 7.6-17 17 0 12.8 17 29 17 29s17-16.2 17-29c0-9.4-7.6-17-17-17Z"
        fill={pin}
      />
      <Circle cx="160" cy="65" r="6.4" fill="#FFFFFF" />
    </Svg>
  );
}
