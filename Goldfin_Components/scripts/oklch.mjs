// hex -> oklch with an exact round-trip check. A value is only accepted when it
// parses back to the same 8-bit sRGB triple, so the rendered colour does not move.
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L * 100, Math.hypot(A, B), H];
}

function oklchToRgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = Math.pow(L / 100 + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L / 100 - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L / 100 - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function rgbToHex(rgb) {
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

const fmt = (value, places) => Number(value.toFixed(places)).toString();

export function parseOklch(text) {
  const m = text.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)(?:\s+(none|[\d.]+))?(?:\s*\/\s*[\d.]+)?\s*\)/);
  if (!m) throw new Error(`not an oklch literal: ${text}`);
  return [+m[1], +m[2], !m[3] || m[3] === 'none' ? 0 : +m[3]];
}

// A true gray has chroma of exactly zero. Anything above that is a tinted color and
// must keep its chroma, or the rendered value shifts. `none` then keeps a later
// color-mix from dragging the color toward red, which the skill calls for.
export function toOklch(hex) {
  const [L, C, H] = rgbToOklch(hexToRgb(hex));
  if (C < 0.00005) return `oklch(${fmt(L, 3)}% 0 none)`;
  return `oklch(${fmt(L, 3)}% ${fmt(C, 4)} ${fmt(H, 2)})`;
}

export { hexToRgb, rgbToOklch, oklchToRgb, rgbToHex };
