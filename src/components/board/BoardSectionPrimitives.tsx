import { EyeOff, Pencil } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { titleColorStyle } from "../../features/campaign/domain/campaignSettings";

export interface SectionActions {
  onEdit: () => void;
  onHide?: () => void;
  editLabel?: string;
  hideLabel?: string;
}

/** Every module uses the same title, appearance editor and hide control. */
export function BoardSectionHeader({
  title,
  color,
  actions,
}: {
  title: string;
  color: string;
  actions?: SectionActions;
}) {
  return (
    <header
      className="sign board-section-heading"
      style={titleColorStyle(color)}
    >
      <span className="board-section-title">{title}</span>
      {actions && (
        <div className="board-section-actions">
          <button
            className="sign-action"
            type="button"
            onClick={actions.onEdit}
            aria-label={actions.editLabel ?? `编辑${title}模块`}
            title="编辑模块"
          >
            <Pencil aria-hidden="true" />
          </button>
          {actions.onHide && (
            <button
              className="sign-action"
              type="button"
              onClick={actions.onHide}
              aria-label={actions.hideLabel ?? `隐藏${title}`}
              title="隐藏板块"
            >
              <EyeOff aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </header>
  );
}

/** Shared physical paper surface for board modules and panels. */
export function BoardContentCard({
  children,
  className = "",
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  label?: string;
}) {
  const classes = `board-content-card ${className}`.trim();

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
      >
        {children}
      </button>
    );
  }
  return (
    <article className={classes} aria-label={label}>
      {children}
    </article>
  );
}
