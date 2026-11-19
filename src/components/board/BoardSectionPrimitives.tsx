import { EyeOff, Pencil } from "lucide-react";
import {
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { titleColorStyle } from "../../features/campaign/domain/campaignSettings";
import { CardShaderCanvas, useCardEffect } from "./CardEffectLayer";

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
  const effect = useCardEffect();
  return (
    <header
      className="sign board-section-heading"
      data-header-shader={
        effect?.shader && effect.shader !== "none" ? "burnt" : undefined
      }
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

/**
 * Shared paper surface:
 * 当启用火焰燃烧着色器（burnt / ai_glsl）时，采用双层真实纸张焚毁架构：
 * 1. 底层兄弟节点 CardShaderCanvas 渲染纸张纤维、焦黄烟熏、闪烁橙红余烬、炭黑龟裂与 discard 穿孔透底；
 * 2. 上层内容节点 .board-content-card 挂载「文本生存遮罩（contentSurvivalMask）」——
 *    凡是已被火焰烧过的位置（余烬火线 + 黑炭裂纹区 + 灰化镂空区）全部裁掉前景文字与线条，
 *    真实还原纸张烧焦碳化后字迹彻底消失的物理效果，同时未烧区域保持 100% 原生清晰 DOM 与点击交互。
 */
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
  const effect = useCardEffect();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [contentMaskUrl, setContentMaskUrl] = useState<string | null>(null);

  const shaderActive = Boolean(
    effect && effect.shader !== "none" && effect.progress > 0,
  );
  const classes = `board-content-card ${className}`.trim();
  const contentSurvivalStyle: CSSProperties | undefined =
    shaderActive && contentMaskUrl
      ? ({
          WebkitMaskImage: `url("${contentMaskUrl}")`,
          maskImage: `url("${contentMaskUrl}")`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        } as CSSProperties)
      : undefined;

  if (!shaderActive) {
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

  return (
    <div className="board-card-shader-stage">
      {effect && (
        <CardShaderCanvas
          hostElement={host}
          effect={effect}
          onContentMaskChange={setContentMaskUrl}
        />
      )}
      {onClick ? (
        <button
          ref={setHost}
          type="button"
          className={classes}
          data-shader={effect!.shader}
          style={contentSurvivalStyle}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-haspopup="dialog"
        >
          {children}
        </button>
      ) : (
        <article
          ref={setHost}
          className={classes}
          data-shader={effect!.shader}
          style={contentSurvivalStyle}
          aria-label={label}
        >
          {children}
        </article>
      )}
    </div>
  );
}
