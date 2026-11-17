import { ArrowRight, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import markdown from "../../../assets/help/user-guide.md?raw";
import { PaperDialog } from "../../components/composer/PaperDialog";
import { guideExcerpt, guideTopics, parseGuide, searchGuide, type GuideBlock } from "./guide";

const chapters = parseGuide(markdown);
const topics = guideTopics(chapters);

function Inline({ text, onChapter }: { text: string; onChapter: (id: string) => void }) {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(cursor, match.index));
    const key = match.index;
    if (match[1]) nodes.push(<code key={key}>{match[1]}</code>);
    else if (match[2]) nodes.push(<strong key={key}>{match[2]}</strong>);
    else if (/^https:\/\//.test(match[4])) {
      nodes.push(<a key={key} href={match[4]} target="_blank" rel="noopener noreferrer">{match[3]}</a>);
    } else if (match[4].startsWith("#") && chapters.some(chapter => chapter.id === match[4].slice(1))) {
      nodes.push(<button type="button" className="help-inline-link" key={key}
        onClick={() => onChapter(match[4].slice(1))}>{match[3]}</button>);
    } else nodes.push(match[3]);
    cursor = match.index + match[0].length;
  }
  nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function Block({ block, onChapter }: { block: GuideBlock; onChapter: (id: string) => void }) {
  const inline = (text: string) => <Inline text={text} onChapter={onChapter} />;
  if (block.type === "heading") return <h3 id={`help-topic-${block.id}`} tabIndex={-1}>{block.text}</h3>;
  if (block.type === "rule") return <hr />;
  if (block.type === "paragraph") return <p>{inline(block.text)}</p>;
  if (block.type === "list") {
    const items = block.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return <div className="help-table-wrap"><table>
    <thead><tr>{block.headers.map((header, index) => <th scope="col" key={index}>{inline(header)}</th>)}</tr></thead>
    <tbody>{block.rows.map((row, index) => <tr key={index}>
      {row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

/** One maintained document backs both the signed-out guide and in-room help.
 * Opening it never navigates away from the user's current form or campaign. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState({ chapterId: chapters[0].id, topicId: chapters[0].id });
  const content = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const chapter = chapters.find(item => item.id === location.chapterId) ?? chapters[0];
  const searching = Boolean(query.trim());
  const results = searching ? searchGuide(topics, query) : [];
  const navigate = (chapterId: string, topicId = chapterId) => {
    setQuery("");
    setLocation({ chapterId, topicId });
  };
  useLayoutEffect(() => {
    if (searching || !content.current) return;
    const target = document.getElementById(`help-topic-${location.topicId}`);
    content.current.scrollTop = target
      ? target.getBoundingClientRect().top - content.current.getBoundingClientRect().top + content.current.scrollTop - 18
      : 0;
  }, [location, searching]);
  return createPortal(<PaperDialog title="使用指南" className="help-dialog" onClose={onClose}>
    <div className="help-search">
      <Search aria-hidden="true" />
      <input ref={input} type="search" value={query} aria-label="搜索使用方法"
        placeholder="搜索使用方法，如加入战役、暗骰、纪年" autoComplete="off"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            navigate(results[0].chapterId, results[0].id);
          }
        }} />
      {query && <button type="button" aria-label="清除搜索" onClick={() => {
        setQuery(""); input.current?.focus();
      }}><X aria-hidden="true" /></button>}
    </div>
    <div className="help-layout">
      <nav className="help-chapters" aria-label="指南章节">
        {chapters.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)}
          aria-current={!searching && item.id === chapter.id ? "page" : undefined}>{item.title}</button>)}
      </nav>
      <label className="help-mobile-chapters">
        <span className="sr-only">指南章节</span>
        <select aria-label="指南章节" value={chapter.id} onChange={event => navigate(event.target.value)}>
          {chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <div className="help-content" ref={content} aria-label={searching ? "帮助搜索结果" : chapter.title}>
        {searching ? <>
          <p className="help-result-count" role="status">{results.length ? `找到 ${results.length} 个相关方法` : "没有找到相关方法"}</p>
          {!results.length && <p>试试“任务”“便签”“骰盘”等关键词，也可以按章节查阅。</p>}
          <div className="help-results">{results.map(result => <button type="button" className="help-result"
            key={result.id} onClick={() => navigate(result.chapterId, result.id)}>
            <span><small>{result.chapterTitle}</small><strong>{result.title}</strong>
              <span>{guideExcerpt(result.text, query)}</span></span>
            <ArrowRight aria-hidden="true" />
          </button>)}</div>
        </> : <article className="help-article">
          <h2 id={`help-topic-${chapter.id}`} tabIndex={-1}>{chapter.title}</h2>
          {chapter.blocks.map((block, index) => <Fragment key={`${chapter.id}-${index}`}>
            <Block block={block} onChapter={navigate} />
          </Fragment>)}
        </article>}
      </div>
    </div>
  </PaperDialog>, document.body);
}
