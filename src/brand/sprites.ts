/**
 * Pixel Face & Sprite Matrix Definitions (D1b, D1c)
 * Authentic voxel / 8-bit character faces designed specifically for Datify AI Agent.
 *
 * Color Keys:
 * - Analyst: n (navy hair), s (skin), k (dark navy/eyes), b (light blue glasses), t (teal collar), w (white)
 * - Bot: L (light green), G (green), g (dark green), k (dark navy), o (orange antenna)
 */

export const PALETTE_ANALYST: Record<string, string> = {
  n: '#14214D',
  s: '#E3AE84',
  k: '#14214D',
  b: '#8CC3F2',
  t: '#2BB3A3',
  w: '#FFFFFF',
};

export const FACE_ANALYST = [
  'nnnnnnnn',
  'nnnnnnnn',
  'nssssssn',
  'kbbkkbbk',
  'kbbkkbbk',
  'ssssssss',
  'ssskksss',
  'tttttttt',
];

export const PALETTE_BOT: Record<string, string> = {
  L: '#7BD46B',
  G: '#3FA34D',
  g: '#2F7D3A',
  k: '#14214D',
  o: '#F26B21',
};

export const FACE_BOT = [
  'LLLLLLLL',
  'LGGGGGGL',
  'GkkGGkkG',
  'GkkGGkkG',
  'GGGggGGG',
  'GkGGGGkG',
  'GGkkkkGG',
  'ggGGGGgg',
];

export const FACE_BOT_BLINK = [
  'LLLLLLLL',
  'LGGGGGGL',
  'GGGGGGGG',
  'GkkGGkkG',
  'GGGggGGG',
  'GkGGGGkG',
  'GGkkkkGG',
  'ggGGGGgg',
];
