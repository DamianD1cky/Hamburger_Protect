import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Dices, Sparkles } from "lucide-react";
import {
  cardEffectPresets,
  hasActiveCardEffect,
  normalizeCardVisualEffect,
  noteEffectPresets,
  type CardShaderTopology,
  type CardVisualEffect,
} from "../../features/campaign/domain/cardEffects";
import {
  bakeCardContentSurvivalMaskUrl,
  blitCardShaderToCanvas,
  subscribeCardShaderClock,
} from "../../features/shaders/cardShaderEngine";

const CardEffectContext = createContext<{
  effect: CardVisualEffect | null;
}>({ effect: null });

export function CardEffectProvider({
  effect,
  children,
}: {
  effect: CardVisualEffect | null | undefined;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      effect: effect && hasActiveCardEffect(effect) ? effect : null,
    }),
    [effect],
  );
  return (
    <CardEffectContext.Provider value={value}>
      {children}
    </CardEffectContext.Provider>
  );
}

export function useCardEffect(): CardVisualEffect | null {
  return useContext(CardEffectContext).effect;
}

/**
 * 挂载在 .board-card-shader-stage 底层（z-index: 0）的真实 WebGL2 燃烧着色器画布：
 * 共享全站唯一 WebGL2 上下文渲染纸张纤维、焦黄烟熏、炭黑龟裂、动态余烬火星与 discard 穿孔镂空，
 * 同时向内容容器回传「前景文本生存遮罩 URL」，使所有烧焦/炭化/镂空区域不再显示文字或分割线。
 */
export function CardShaderCanvas({
  hostElement,
  effect,
  baseColorOverride,
  seedOffset = 0,
  onContentMaskChange,
}: {
  hostElement: HTMLElement | null;
  effect: CardVisualEffect;
  baseColorOverride?: string;
  seedOffset?: number;
  onContentMaskChange: (maskUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 360, h: 260 });
  const [baseHex, setBaseHex] = useState(baseColorOverride ?? "#f3e9d2");

  useEffect(() => {
    if (!hostElement) return;
    const measure = () => {
      const w = Math.max(64, hostElement.offsetWidth || 360);
      const h = Math.max(64, hostElement.offsetHeight || 240);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      if (baseColorOverride) {
        setBaseHex(baseColorOverride);
      } else {
        const computed = getComputedStyle(hostElement)
          .getPropertyValue("--vb-card-bg")
          .trim();
        if (computed) setBaseHex(computed);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hostElement);
    return () => ro.disconnect();
  }, [hostElement, baseColorOverride]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const params = {
      width: size.w,
      height: size.h,
      baseColorHex: baseHex,
      effect,
      seedOffset,
    };

    blitCardShaderToCanvas(canvas, params, 0);
    const contentMask = bakeCardContentSurvivalMaskUrl(params);
    onContentMaskChange(contentMask);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          visibleRef.current = entries.some((entry) => entry.isIntersecting);
        },
        { threshold: 0.01 },
      );
      observer.observe(canvas);
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const needsRealtimeClock =
      !reducedMotion &&
      (effect.glowIntensity > 0.05 ||
        effect.shader === "ai_glsl" ||
        effect.shader === "hologram");

    if (!needsRealtimeClock) return () => observer?.disconnect();
    const unsub = subscribeCardShaderClock((elapsed) => {
      if (canvasRef.current && visibleRef.current) {
        blitCardShaderToCanvas(canvasRef.current, params, elapsed);
      }
    });
    return () => {
      unsub();
      observer?.disconnect();
    };
  }, [size.w, size.h, baseHex, effect, seedOffset, onContentMaskChange]);

  return (
    <canvas
      ref={canvasRef}
      className="card-shader-canvas"
      aria-hidden="true"
    />
  );
}

/**
 * 交互式火焰燃烧 Shader 实验室（仅保留火焰燃烧 Shader + 展示 AI 编排官生成的专属 GLSL Shader）：
 * 小卡预览内自带模拟文字排版，拖动烧毁进度或点击起火点时可直观看到「火烧过的地方字迹真实消失」。
 */
export function CardEffectPicker({
  value,
  disabled = false,
  mode = "card",
  basePreviewHex = "#f3e9d2",
  showPreview = true,
  onChange,
  onRecommendColors,
}: {
  value: CardVisualEffect;
  disabled?: boolean;
  mode?: "card" | "note";
  basePreviewHex?: string;
  showPreview?: boolean;
  onChange: (next: CardVisualEffect) => void;
  onRecommendColors?: (noteColorHex: string, pinColorHex: string) => void;
}) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewContentMask, setPreviewContentMask] = useState<string | null>(
    null,
  );
  const normalized = normalizeCardVisualEffect(value);
  const active = normalized.shader !== "none" && normalized.progress > 0;
  const presets = mode === "note" ? noteEffectPresets : cardEffectPresets;

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !active || !showPreview) return;
    const params = {
      width: 280,
      height: 168,
      baseColorHex: basePreviewHex,
      effect: normalized,
    };
    blitCardShaderToCanvas(canvas, params, 0);
    setPreviewContentMask(bakeCardContentSurvivalMaskUrl(params));

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (
      reduced ||
      (normalized.glowIntensity <= 0.05 &&
        normalized.shader !== "ai_glsl" &&
        normalized.shader !== "hologram")
    ) {
      return;
    }
    return subscribeCardShaderClock((t) => {
      if (previewCanvasRef.current) {
        blitCardShaderToCanvas(previewCanvasRef.current, params, t);
      }
    });
  }, [active, basePreviewHex, normalized, showPreview]);

  const pickOriginOnPreview = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ux = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const uyTop = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    onChange(
      normalizeCardVisualEffect({
        ...normalized,
        topology: "point",
        origin: [Number(ux.toFixed(2)), Number((1 - uyTop).toFixed(2))],
      }),
    );
  };

  return (
    <div className="card-effect-picker">
      <div className="shader-picker-head">
        <span className="hig-section-label">
          {mode === "note"
            ? "便签材质与着色器预设（羊皮纸 / 全息投影 / 烈焰烧焦 / AI 着色器）"
            : "卡片火焰燃烧着色器（WebGL2 Shader · 烧焦处自动隐去字迹）"}
        </span>
        {normalized.shader === "ai_glsl" && (
          <span className="shader-ai-badge">
            <Sparkles aria-hidden="true" />
            {normalized.shaderName || "AI 编排官生成 Shader"}
          </span>
        )}
      </div>

      <div
        className="card-effect-preset-grid"
        role="group"
        aria-label={mode === "note" ? "便签材质预设" : "卡片火焰燃烧预设"}
      >
        {presets.map((preset) => {
          const isMatch =
            normalized.shader === preset.effect.shader &&
            (preset.effect.shader === "none" ||
              preset.effect.shader === "parchment" ||
              preset.effect.shader === "hologram" ||
              (Math.abs(normalized.progress - preset.effect.progress) < 0.04 &&
                normalized.topology === preset.effect.topology &&
                Math.abs(
                  normalized.glowIntensity - preset.effect.glowIntensity,
                ) < 0.4));
          return (
            <button
              type="button"
              key={preset.id}
              disabled={disabled}
              aria-pressed={isMatch}
              className={isMatch ? "effect-chip is-active" : "effect-chip"}
              onClick={() => {
                onChange(structuredClone(preset.effect));
                const maybeRec = preset as {
                  recommendedNoteColor?: string;
                  recommendedPinColor?: string;
                };
                if (
                  onRecommendColors &&
                  maybeRec.recommendedNoteColor &&
                  maybeRec.recommendedPinColor
                ) {
                  onRecommendColors(
                    maybeRec.recommendedNoteColor,
                    maybeRec.recommendedPinColor,
                  );
                }
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="shader-lab-panel" data-preview={showPreview ? "true" : "false"}>
          {showPreview && <div className="shader-lab-preview-stage">
            <div className="shader-lab-card-wrap">
              <canvas
                ref={previewCanvasRef}
                width={280}
                height={168}
                aria-label="火焰燃烧实时预览，点击可指定起火点"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  pickOriginOnPreview(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons) pickOriginOnPreview(e);
                }}
              />
              <div
                className={
                  normalized.shader === "hologram"
                    ? "shader-lab-sample-ink is-hologram"
                    : "shader-lab-sample-ink"
                }
                aria-hidden="true"
                style={
                  previewContentMask
                    ? ({
                        WebkitMaskImage: `url("${previewContentMask}")`,
                        maskImage: `url("${previewContentMask}")`,
                        WebkitMaskSize: "100% 100%",
                        maskSize: "100% 100%",
                      } as CSSProperties)
                    : undefined
                }
              >
                <strong>灰雾港现场手记 · 07</strong>
                <span>北栈桥暗门留有灼痕，封蜡已碎裂。</span>
                <span>守夜人排班记录缺损最后两页。</span>
                <small>状态：部分纸页已被烈火焚毁</small>
              </div>
              {(normalized.topology === "corner" ||
                normalized.topology === "point") && (
                <span
                  className="shader-origin-dot"
                  style={
                    {
                      left: `${normalized.origin[0] * 100}%`,
                      top: `${(1 - normalized.origin[1]) * 100}%`,
                    } as CSSProperties
                  }
                />
              )}
              <span className="shader-preview-hint">点击卡面定起火点</span>
            </div>
          </div>}

          <div className="shader-lab-controls">
            {(normalized.shader === "burnt" ||
              normalized.shader === "ai_glsl") && (
              <>
                <div className="card-effect-subcontrols">
                  <label>
                    <span>燃烧蔓延拓扑</span>
                    <select
                      aria-label="燃烧蔓延拓扑"
                      disabled={disabled}
                      value={normalized.topology}
                      onChange={(e) =>
                        onChange(
                          normalizeCardVisualEffect({
                            ...normalized,
                            topology: e.target.value as CardShaderTopology,
                          }),
                        )
                      }
                    >
                      <option value="corner">边角烧入 / 指定起火点</option>
                      <option value="bottom">底部整体向上焚烧</option>
                      <option value="perimeter">四边整圈烟熏烘烤</option>
                    </select>
                  </label>

                  <label>
                    <span>火焰余烬色调</span>
                    <select
                      aria-label="火焰余烬色调"
                      disabled={disabled}
                      value={normalized.accentColor ?? ""}
                      onChange={(e) =>
                        onChange(
                          normalizeCardVisualEffect({
                            ...normalized,
                            accentColor: e.target.value || null,
                          }),
                        )
                      }
                    >
                      <option value="">经典炽热橙红</option>
                      <option value="#34d399">幽冥鬼火碧绿</option>
                      <option value="#a855f7">奥术秘焰深紫</option>
                      <option value="#38bdf8">炼金冷焰冰蓝</option>
                    </select>
                  </label>
                </div>

                <label className="shader-slider-row">
                  <span>
                    烧毁推进程度{" "}
                    <strong>{Math.round(normalized.progress * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    min={0.06}
                    max={0.82}
                    step={0.01}
                    disabled={disabled}
                    value={normalized.progress}
                    onChange={(e) =>
                      onChange(
                        normalizeCardVisualEffect({
                          ...normalized,
                          progress: Number(e.target.value),
                        }),
                      )
                    }
                  />
                </label>
              </>
            )}

            {normalized.shader === "hologram" && (
              <label>
                <span>全息光束色调</span>
                <select
                  aria-label="全息光束色调"
                  disabled={disabled}
                  value={normalized.accentColor ?? "#2be4dc"}
                  onChange={(e) =>
                    onChange(
                      normalizeCardVisualEffect({
                        ...normalized,
                        accentColor: e.target.value || "#2be4dc",
                      }),
                    )
                  }
                >
                  <option value="#2be4dc">战术荧光青 (#2be4dc)</option>
                  <option value="#38bdf8">深空电离蓝 (#38bdf8)</option>
                  <option value="#34d399">矩阵终端绿 (#34d399)</option>
                  <option value="#c084fc">量子相位紫 (#c084fc)</option>
                </select>
              </label>
            )}

            <div className="shader-seed-row">
              <label className="shader-slider-row" style={{ flex: 1 }}>
                <span>
                  {normalized.shader === "hologram"
                    ? "全息边缘辉光强度"
                    : normalized.shader === "parchment"
                      ? "陈年羊皮纹理对比"
                      : "余烬火光亮度"}{" "}
                  <strong>{normalized.glowIntensity.toFixed(1)}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={4.5}
                  step={0.1}
                  disabled={disabled}
                  value={normalized.glowIntensity}
                  onChange={(e) =>
                    onChange(
                      normalizeCardVisualEffect({
                        ...normalized,
                        glowIntensity: Number(e.target.value),
                      }),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="shader-seed-btn"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    normalizeCardVisualEffect({
                      ...normalized,
                      seed: Math.floor(Math.random() * 980) + 1,
                    }),
                  )
                }
              >
                <Dices aria-hidden="true" />
                {normalized.shader === "parchment" ? "换一张羊皮" : "换一种纹理"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
