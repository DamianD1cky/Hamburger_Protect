import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseGuide, guideTopics, searchGuide, guideExcerpt } from "../../src/features/help/guide.ts";

const markdown = await readFile(new URL("../../assets/help/user-guide.md", import.meta.url), "utf8");
const chapters = parseGuide(markdown);
const topics = guideTopics(chapters);

test("the maintained guide keeps every chapter and a searchable topic for every subsection", () => {
  const ids = [...markdown.matchAll(/<a id="([^"]+)"><\/a>/g)].map(match => match[1]);
  assert.deepEqual(chapters.map(chapter => chapter.id), ids);
  assert.equal(new Set(topics.map(topic => topic.id)).size, topics.length);
  for (const chapter of chapters) {
    for (const heading of chapter.blocks.filter(block => block.type === "heading")) {
      assert.ok(topics.some(topic => topic.id === heading.id));
    }
  }
  for (const chapter of chapters) {
    for (const table of chapter.blocks.filter(block => block.type === "table")) {
      assert.ok(table.rows.every(row => row.length === table.headers.length));
    }
  }
});
test("common new-user questions locate the exact instructions", () => {
  const cases = [
    ["密码", "account"],
    ["暗骰", "dice"],
    ["纪年", "clocks"],
    ["班次码", "quick-start"],
    ["物资", "resources"],
    ["隐藏", "gm"],
  ];
  for (const [query, chapterId] of cases) {
    assert.ok(searchGuide(topics, query).some(topic => topic.chapterId === chapterId), query);
  }
  assert.ok(searchGuide(topics, "暗骰").some(topic => topic.title.includes("暗骰")));
  assert.ok(searchGuide(topics, "GM 审批").some(topic => topic.chapterId === "account"));
  assert.deepEqual(searchGuide(topics, " \t"), []);
  assert.deepEqual(searchGuide(topics, "不存在的功能xyz"), []);
});
test("search excerpts include the requested term and never emit markup", () => {
  const topic = searchGuide(topics, "闰日").find(topic => topic.chapterId === "clocks");
  assert.ok(topic);
  const excerpt = guideExcerpt(topic.text, "闰日");
  assert.ok(excerpt.includes("闰日"));
  assert.ok(excerpt.length <= 127);
  assert.ok(!excerpt.includes("**"));
});
