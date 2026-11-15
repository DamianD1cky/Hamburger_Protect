export interface FanPoint { x: number; y: number }
export interface FanLayout {
  points: FanPoint[];
  hub: FanPoint;
  width: number;
  height: number;
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/**
 * Place the complete fan in the scene's CSS-pixel bounds. Rotate toward free
 * space first, then move its origin only as much as needed. A narrower arc
 * handles landscape phones without shrinking touch targets.
 */
export function layoutDiceFan(anchor: FanPoint, bounds: FanPoint, count: number): FanLayout {
  const width = bounds.x < 680 ? 72 : 80;
  const height = 80;
  const margin = 12;
  const spans = [count <= 4 ? 150 : 180, 120, 90, ...(count === 6 ? [300] : [])];
  const directions = [-90, 90, 0, 180, -60, -120, 60, 120, -30, -150, 30, 150];
  let best: { points: FanPoint[]; cost: number } | undefined;
  for (const span of spans) {
    const step = span / Math.max(1, count - 1);
    for (const direction of directions) {
      let radius = Math.max(count <= 4 ? 112 : count === 5 ? 130 : bounds.x < 680 ? 126 : 146,
        Math.min(width, height) / (2 * Math.sin(step * Math.PI / 360)));
      let offsets: FanPoint[] = [];
      for (let attempt = 0; attempt < 24; attempt++, radius += 8) {
        offsets = Array.from({ length: count }, (_, index) => {
          const angle = (direction - span / 2 + index * step) * Math.PI / 180;
          return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        });
        const overlapping = offsets.some((a, i) => offsets.slice(i + 1).some((b) =>
          Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < height));
        if (!overlapping) break;
      }
      if (offsets.some((a, i) => offsets.slice(i + 1).some((b) =>
        Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < height))) continue;
      const minX = Math.min(...offsets.map((p) => p.x)) - width / 2;
      const maxX = Math.max(...offsets.map((p) => p.x)) + width / 2;
      const minY = Math.min(...offsets.map((p) => p.y)) - height / 2;
      const maxY = Math.max(...offsets.map((p) => p.y)) + height / 2;
      if (maxX - minX > bounds.x - margin * 2 ||
          maxY - minY > bounds.y - margin * 2) continue;
      const origin = {
        x: clamp(anchor.x, margin - minX, bounds.x - margin - maxX),
        y: clamp(anchor.y, margin - minY, bounds.y - margin - maxY),
      };
      const points = offsets.map((p) => ({ x: origin.x + p.x, y: origin.y + p.y }));
      // Keep the selected 3D die visible. The hub stays beneath the real die
      // even when the fan needs a small translation near an edge.
      const obscuresDie = points.some((p) =>
        Math.abs(p.x - anchor.x) < width / 2 + 30 &&
        Math.abs(p.y - anchor.y) < height / 2 + 30);
      const cost = (origin.x - anchor.x) ** 2 + (origin.y - anchor.y) ** 2 +
        (span === spans[0] ? 0 : 400 + Math.abs(180 - span) * 5) + radius * 2 +
        (direction === -90 ? 0 : direction === 90 ? 30 : 70) +
        (obscuresDie ? 1e6 : 0);
      if (!best || cost < best.cost) best = { points, cost };
    }
  }
  // Actual supported phone/desktop stage sizes fit a fan. An exceptionally
  // short viewport uses a scrollable arc instead of reducing hit targets.
  const points = best?.points ?? Array.from({ length: count }, (_, i) => ({
    x: width / 2 + margin + i * (width + 8),
    y: Math.max(height / 2 + margin, Math.min(anchor.y - 100, bounds.y - height / 2 - margin)),
  }));
  return {
    points, width, height,
    hub: {
      x: clamp(anchor.x, 40, bounds.x - 40),
      y: clamp(anchor.y + 55, 20, bounds.y - 20),
    },
  };
}
