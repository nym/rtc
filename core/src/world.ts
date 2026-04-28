export interface WorldVec3 {
  x: number;
  y: number;
  z: number;
}

export const ISO_CAMERA_ANGLE = {
  azimuth: Math.PI / 4,
  elevation: Math.PI / 6,
} as const;

const FNV_OFFSET = 2166136261 >>> 0;
const FNV_PRIME = 16777619;

function hash32(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

/**
 * Deterministic placement on a ring/spiral around the origin.
 * Stable across runs — depends only on `id`, not on order or `count`.
 */
export function placeOnGround(id: string, _count = 1): WorldVec3 {
  const h = hash32(id);
  const ring = ((h >>> 8) % 4) + 1;
  const angle = ((h & 0xff) / 256) * Math.PI * 2;
  const r = ring * 1.6;
  return { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
}

export function projectColor(id: string): string {
  const h = hash32(id);
  const hue = (h >>> 16) % 360;
  return `hsl(${hue} 60% 55%)`;
}
