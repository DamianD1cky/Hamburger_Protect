import assert from "node:assert/strict";
import { normalizeStickerRotation, stickerPosition } from "../../src/features/campaign/domain/stickerGeometry.ts";
import { eventClockRects } from "../../src/features/campaign/domain/eventClockLayout.ts";
import { BOARD_HEIGHT, BOARD_WIDTH, STICKER_SIZE } from "../../src/features/campaign/domain/boardGeometry.ts";

let checks = 0;
for (const scale of [.5, .51, 1, 1.01, 1.25, 2.5]) {
  for (let angle = -360; angle <= 360; angle += 15) {
    const rotation = normalizeStickerRotation(angle);
    for (const [x, y] of [[-1, -1], [BOARD_WIDTH, BOARD_HEIGHT], [500, 400]]) {
      const position = stickerPosition(x, y, scale, rotation);
      const size = STICKER_SIZE * scale, rad = rotation * Math.PI / 180;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const px = position.x + size / 2 + size / 2 * (sx * Math.cos(rad) - sy * Math.sin(rad));
        const py = position.y + size / 2 + size / 2 * (sx * Math.sin(rad) + sy * Math.cos(rad));
        assert.ok(px >= -1e-6 && py >= -1e-6 && px <= BOARD_WIDTH + 1e-6 && py <= BOARD_HEIGHT + 1e-6,
          `rotated ${scale}x sticker at ${rotation}° keeps all corners inside the board`);
        checks++;
      }
    }
  }
}
assert.equal(normalizeStickerRotation(720), 0);
assert.equal(normalizeStickerRotation(-735), -15);
assert.throws(() => normalizeStickerRotation(Infinity));
const clocks = [{ id: "first" }, { id: "second" }, { id: "third" }];
const initial = eventClockRects(clocks, {});
assert.deepEqual(initial.get("first"), { x: 1081, y: 357, w: 340, h: 221 });
const saved = clocks.map((clock) => ({ ...clock, position: initial.get(clock.id) }));
const remaining = eventClockRects(saved.slice(1), { tasks: { x: 1500, y: 40 } });
assert.deepEqual(remaining.get("second"), initial.get("second"), "deletion and other module moves do not reposition saved cards");
const next = eventClockRects([...saved, { id: "new" }], {});
assert.deepEqual(next.get("first"), initial.get("first"), "creating a card preserves existing locations");
const newRect = next.get("new");
assert.ok(newRect.x >= 8 && newRect.y >= 8 && newRect.x + newRect.w <= BOARD_WIDTH - 8 &&
  newRect.y + newRect.h <= BOARD_HEIGHT - 8, "new cards remain on the fixed board");
console.log(`${checks} sticker corner checks and independent clock-card placement checks passed.`);
