import { useState } from "react";
import type { CampaignBoard } from "../campaign/domain/types";
import { DicePopover, dicePopoverAnchor, type DicePopoverAnchor } from "./DicePopover";
import { diceEmotions, type DiceSocial } from "./useDiceSocial";

export function DiceMembers({ board, social, rolling, onReact }: {
  board: CampaignBoard; social?: DiceSocial; rolling: boolean; onReact: (emoji: string) => Promise<void>;
}) {
  const [anchor, setAnchor] = useState<DicePopoverAnchor | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const members = board.members.filter((member) => member.active && member.role !== "observer");
  return <>
    <div className="dice-members" aria-label="骰盘成员">
      {members.map((member) => {
        const own = member.userId === board.viewer.id;
        const active = (own && rolling) || social?.rolling.includes(member.userId);
        const reaction = social?.reactions.find((item) => item.actor_id === member.userId);
        return <div className="dice-member" key={member.userId} data-rolling={!!active} data-member-id={member.userId}>
          <button type="button" className="dice-member-avatar" disabled={!own || active || board.campaign.status !== "active"}
            aria-label={`${member.characterName}${active ? "，正在投掷" : own ? "，发送表情" : ""}`}
            title={`${member.characterName}${member.role === "gm" ? " · GM" : ""}`}
            onClick={(event) => { setAnchor(dicePopoverAnchor(event.currentTarget)); setError(""); }}>
            <span>{Array.from(member.characterName.trim())[0] ?? "?"}</span>
            {member.role === "gm" && <small>GM</small>}
          </button>
          <span className="dice-member-name">{member.characterName}</span>
          {reaction && <span key={reaction.sent_at} className="dice-member-reaction" role="status"
            aria-label={`${member.characterName}：${reaction.emoji}`}>{reaction.emoji}</span>}
        </div>;
      })}
    </div>
    {anchor && !rolling && <DicePopover anchor={anchor} title="表情" label="发送骰盘表情" compact onClose={() => setAnchor(null)}>
      <div className="dice-emotions">
        {diceEmotions.map((emoji) => <button key={emoji} type="button" disabled={sending} aria-label={`发送 ${emoji}`}
          onClick={async () => {
            setSending(true);
            try { await onReact(emoji); setAnchor(null); }
            catch { setError("表情未发送，请稍后重试。"); }
            finally { setSending(false); }
          }}>{emoji}</button>)}
      </div>
      {error && <p className="dice-add-error dice-error" role="alert">{error}</p>}
    </DicePopover>}
  </>;
}
