import type { CampaignMember } from "../../features/campaign/domain/types";
import { PaperDialog } from "../composer/PaperDialog";
export function RosterDialog({
  members,
  onClose,
}: {
  members: CampaignMember[];
  onClose: () => void;
}) {
  const active = members.filter((member) => member.active);
  return (
    <PaperDialog title={`危机排班 · ${active.length} 人在岗`} onClose={onClose}>
      <table className="roster-table">
        <thead>
          <tr>
            <th>岗位</th>
            <th>角色名</th>
            <th>身份</th>
          </tr>
        </thead>
        <tbody>
          {active.map((member) => (
            <tr key={member.userId}>
              <td>{member.jobTitle}</td>
              <td>{member.characterName}</td>
              <td>
                {member.role === "gm"
                  ? "值班店长"
                  : member.role === "observer"
                    ? "观察者"
                    : "临时员工"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!active.length && <p>暂无在岗成员。</p>}
    </PaperDialog>
  );
}
