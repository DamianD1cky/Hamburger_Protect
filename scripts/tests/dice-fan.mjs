import assert from "node:assert/strict";
import { layoutDiceFan } from "../../src/features/dice/fanLayout.ts";

let checks = 0;
for (const [width, height] of [[1416, 718], [390, 644], [320, 368], [820, 208], [768, 800]]) {
  for (const count of [3, 4, 5, 6]) {
    for (const anchor of [
      { x: width / 2, y: height / 2 },
      { x: 30, y: 30 }, { x: width - 30, y: 30 },
      { x: 30, y: height - 30 }, { x: width - 30, y: height - 30 },
    ]) {
      const layout = layoutDiceFan(anchor, { x: width, y: height }, count);
      assert.equal(layout.points.length, count);
      for (const point of layout.points) {
        assert.ok(point.x - layout.width / 2 >= 11 && point.x + layout.width / 2 <= width - 11, "fan stays inside scene width");
        assert.ok(point.y - layout.height / 2 >= 11 && point.y + layout.height / 2 <= height - 11, "fan stays inside scene height");
      }
      for (const [i, a] of layout.points.entries()) {
        for (const b of layout.points.slice(i + 1)) {
          assert.ok(Math.abs(a.x - b.x) >= layout.width || Math.abs(a.y - b.y) >= layout.height, "fan labels and touch targets never overlap");
        }
      }
      checks++;
    }
  }
}
console.log(`${checks} radial-menu viewport, edge and touch-spacing cases passed`);
