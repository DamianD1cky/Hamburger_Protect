export type GuideBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; id: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "rule" };

export interface GuideChapter {
  id: string;
  title: string;
  blocks: GuideBlock[];
}
export interface GuideTopic {
  chapterId: string;
  chapterTitle: string;
  id: string;
  title: string;
  text: string;
}

/** Render only the small Markdown subset used by the maintained guide.
 * Raw HTML never becomes document markup. */
export function parseGuide(markdown: string): GuideChapter[] {
  const chapters: GuideChapter[] = [];
  const parts = markdown.split(/<a id="([^"]+)"><\/a>/);
  for (let part = 1; part < parts.length; part += 2) {
    const lines = parts[part + 1].split("\n");
    const titleLine = lines.findIndex(line => /^## \d+\./.test(line));
    if (titleLine < 0) continue;
    const id = parts[part];
    const blocks: GuideBlock[] = [];
    let heading = 0;
    for (let index = titleLine + 1; index < lines.length;) {
      const line = lines[index].trim();
      if (!line) { index++; continue; }
      if (/^### /.test(line)) {
        blocks.push({ type: "heading", text: line.slice(4), id: `${id}-${++heading}` });
        index++;
      } else if (line === "---") {
        blocks.push({ type: "rule" });
        index++;
      } else if (line.startsWith("|")) {
        const table: string[][] = [];
        while (index < lines.length && lines[index].trim().startsWith("|")) {
          table.push(lines[index++].trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim()));
        }
        blocks.push({ type: "table", headers: table[0], rows: table.slice(2) });
      } else if (/^(?:\d+\. |- )/.test(line)) {
        const ordered = /^\d+\. /.test(line);
        const pattern = ordered ? /^\d+\. / : /^- /;
        const items: string[] = [];
        while (index < lines.length && pattern.test(lines[index].trim())) {
          items.push(lines[index++].trim().replace(pattern, ""));
        }
        blocks.push({ type: "list", ordered, items });
      } else {
        const paragraph: string[] = [];
        while (index < lines.length && lines[index].trim() &&
          !/^(?:### |---$|\||\d+\. |- )/.test(lines[index].trim())) {
          paragraph.push(lines[index++].trim());
        }
        blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      }
    }
    chapters.push({ id, title: lines[titleLine].replace(/^## \d+\.\s*/, ""), blocks });
  }
  return chapters;
}

export function plainGuideText(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
}

export function guideTopics(chapters: GuideChapter[]): GuideTopic[] {
  return chapters.flatMap(chapter => {
    const topics: GuideTopic[] = [];
    let current: GuideTopic = {
      chapterId: chapter.id, chapterTitle: chapter.title, id: chapter.id, title: chapter.title, text: "",
    };
    for (const block of chapter.blocks) {
      if (block.type === "heading") {
        if (current.text) topics.push(current);
        current = { chapterId: chapter.id, chapterTitle: chapter.title, id: block.id, title: block.text, text: "" };
      } else {
        const text = block.type === "paragraph" ? block.text : block.type === "list" ? block.items.join(" ") :
          block.type === "table" ? [block.headers, ...block.rows].flat().join(" ") : "";
        current.text += ` ${plainGuideText(text)}`;
      }
    }
    if (current.text) topics.push(current);
    return topics;
  });
}

export function searchGuide(topics: GuideTopic[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return topics
    .map(topic => ({ ...topic, score: terms.reduce((score, term) =>
      score + (topic.title.toLocaleLowerCase().includes(term) ? 3 : 0), 0) }))
    .filter(topic => terms.every(term =>
      `${topic.chapterTitle} ${topic.title} ${topic.text}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => b.score - a.score);
}

export function guideExcerpt(text: string, query: string) {
  const term = query.trim().toLocaleLowerCase().split(/\s+/)[0] ?? "";
  const position = Math.max(0, text.toLocaleLowerCase().indexOf(term));
  const start = Math.max(0, position - 25);
  return `${start ? "…" : ""}${text.slice(start, position + 100)}${text.length > position + 100 ? "…" : ""}`;
}
