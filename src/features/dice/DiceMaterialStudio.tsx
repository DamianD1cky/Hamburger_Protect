import { useState } from "react";
import { RotateCcw, Sparkles, SlidersHorizontal, Code2, Volume2, CheckCircle2, AlertTriangle, BookmarkPlus } from "lucide-react";
import { ColorField } from "../../components/board/ColorField";
import {
  saveAccountAsset,
  useAccountAssets,
} from "../assets/accountAssetLibrary";
import {
  CUSTOM_DICE_GLSL_TEMPLATES,
  DICE_ACOUSTIC_LABELS,
  DICE_MATERIAL_PRESETS,
  DICE_SHADER_LABELS,
  DICE_TEXTURE_LABELS,
  configForPreset,
  type DiceAcousticProfile,
  type DiceMaterialConfig,
  type DiceShaderPreset,
  type DiceTexturePattern,
} from "./diceMaterialConfig";
import { playDiceImpactSound } from "./diceAudio";

interface Props {
  config: DiceMaterialConfig;
  ownerId?: string;
  soundEnabled: boolean;
  shaderStatus: { ok: boolean; error?: string };
  onChange: (next: DiceMaterialConfig) => void;
  onToggleSound: (enabled: boolean) => void;
}

type StudioTab = "presets" | "pbr" | "shader";

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  note,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  note?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dice-studio-slider">
      <div className="dice-studio-slider-head">
        <span>{label}</span>
        <code>{value.toFixed(step >= 0.1 ? 1 : 2)}{suffix}</code>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {note && <small>{note}</small>}
    </label>
  );
}

export function DiceMaterialStudio({
  config,
  ownerId,
  soundEnabled,
  shaderStatus,
  onChange,
  onToggleSound,
}: Props) {
  const [tab, setTab] = useState<StudioTab>("presets");
  const [savedTip, setSavedTip] = useState("");
  const savedDiceAssets = useAccountAssets(ownerId ?? "local-guest", "dice_material");

  const patch = (partial: Partial<DiceMaterialConfig>) => {
    onChange({ ...config, ...partial });
  };

  const saveToAccountLibrary = () => {
    if (!ownerId) return;
    const presetName =
      DICE_MATERIAL_PRESETS.find((p) => p.id === config.presetId)?.name ?? "自定义骰子";
    const shaderLabel = DICE_SHADER_LABELS[config.shaderPreset];
    saveAccountAsset(ownerId, {
      name:
        config.shaderPreset === "custom"
          ? `${presetName} · 自定义 GLSL`
          : `${presetName} · ${shaderLabel}`,
      description: `纹理 ${DICE_TEXTURE_LABELS[config.texturePattern]} · 粗糙 ${config.roughness.toFixed(2)} · 金属 ${config.metalness.toFixed(2)}`,
      source: "custom",
      previewColors: [config.bodyColor, config.accentColor, config.marksColor],
      payload: {
        kind: "dice_material",
        config,
      },
    });
    setSavedTip("已存入我的资产库");
    window.setTimeout(() => setSavedTip(""), 2000);
  };

  const applyPreset = (presetId: string) => {
    const next = configForPreset(presetId);
    onChange(next);
    if (soundEnabled) {
      playDiceImpactSound("die", 0.55, next.acousticProfile);
    }
  };

  return (
    <div className="dice-studio">
      <div className="dice-studio-segmented" role="tablist" aria-label="材质工坊分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "presets"}
          className={tab === "presets" ? "is-active" : ""}
          onClick={() => setTab("presets")}
        >
          <Sparkles size={14} />
          <span>预设</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pbr"}
          className={tab === "pbr" ? "is-active" : ""}
          onClick={() => setTab("pbr")}
        >
          <SlidersHorizontal size={14} />
          <span>材质</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shader"}
          className={tab === "shader" ? "is-active" : ""}
          onClick={() => setTab("shader")}
        >
          <Code2 size={14} />
          <span>Shader</span>
        </button>
      </div>

      {tab === "presets" && (
        <div className="dice-studio-section dice-studio-stack">
          {savedDiceAssets.length > 0 && (
            <div className="dice-studio-group">
              <h4>我的账号骰子资产</h4>
              <div className="dice-glsl-templates">
                {savedDiceAssets.slice(0, 8).map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => {
                      if (asset.payload.kind === "dice_material") {
                        onChange(structuredClone(asset.payload.config));
                        if (soundEnabled) {
                          playDiceImpactSound("die", 0.55, asset.payload.config.acousticProfile);
                        }
                      }
                    }}
                  >
                    {asset.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="dice-preset-grid" role="radiogroup" aria-label="骰子材质预设">
            {DICE_MATERIAL_PRESETS.map((preset) => {
              const selected = config.presetId === preset.id && config.shaderPreset === preset.config.shaderPreset;
              return (
                <button
                  type="button"
                  key={preset.id}
                  role="radio"
                  aria-checked={selected}
                  className={`dice-preset-card${selected ? " is-selected" : ""}`}
                  onClick={() => applyPreset(preset.id)}
                >
                  <span className="dice-preset-swatch" style={{ background: preset.swatch }} aria-hidden="true" />
                  <span className="dice-preset-meta">
                    <strong>{preset.name}</strong>
                    <em>{preset.badge}</em>
                  </span>
                  <small>{preset.description}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "pbr" && (
        <div className="dice-studio-section dice-studio-stack">
          <div className="dice-studio-group">
            <h4>色彩配方</h4>
            <div className="dice-studio-colors">
              <ColorField
                label="骰身底色"
                value={config.bodyColor}
                onChange={(bodyColor) => patch({ bodyColor })}
              />
              <ColorField
                label="点数 / 数字色"
                value={config.marksColor}
                onChange={(marksColor) => patch({ marksColor })}
              />
              <ColorField
                label="流光 / 折射强调色"
                value={config.accentColor}
                onChange={(accentColor) => patch({ accentColor })}
              />
              <ColorField
                label="骰盘内衬色"
                value={config.liningColor}
                onChange={(liningColor) => patch({ liningColor })}
              />
            </div>
          </div>

          <div className="dice-studio-group">
            <h4>物理 PBR 参数</h4>
            <div className="dice-studio-sliders">
              <SliderRow
                label="粗糙度 Roughness"
                value={config.roughness}
                min={0.04}
                max={1}
                step={0.02}
                onChange={(roughness) => patch({ roughness })}
              />
              <SliderRow
                label="金属度 Metalness"
                value={config.metalness}
                min={0}
                max={1}
                step={0.02}
                onChange={(metalness) => patch({ metalness })}
              />
              <SliderRow
                label="清漆光泽 Clearcoat"
                value={config.clearcoat}
                min={0}
                max={1}
                step={0.02}
                onChange={(clearcoat) => patch({ clearcoat })}
              />
              <SliderRow
                label="虹彩薄膜 Iridescence"
                value={config.iridescence}
                min={0}
                max={1}
                step={0.02}
                onChange={(iridescence) => patch({ iridescence })}
              />
              <SliderRow
                label="晶透折射 Transmission"
                value={config.transmission}
                min={0}
                max={0.92}
                step={0.02}
                note="暗骰时自动切换不透明，避免透视点数"
                onChange={(transmission) => patch({ transmission })}
              />
              {config.transmission > 0.02 && (
                <SliderRow
                  label="折射率 IOR"
                  value={config.ior}
                  min={1.1}
                  max={2.33}
                  step={0.02}
                  onChange={(ior) => patch({ ior })}
                />
              )}
              <SliderRow
                label="数字自发光 Emissive"
                value={config.emissiveIntensity}
                min={0}
                max={1.8}
                step={0.05}
                onChange={(emissiveIntensity) => patch({ emissiveIntensity })}
              />
            </div>
          </div>

          <div className="dice-studio-group">
            <h4>表面肌理与碰撞声学</h4>
            <div className="dice-studio-select-row">
              <label className="dice-field">
                表面纹理
                <select
                  aria-label="骰子表面纹理"
                  value={config.texturePattern}
                  onChange={(e) => patch({ texturePattern: e.target.value as DiceTexturePattern })}
                >
                  {Object.entries(DICE_TEXTURE_LABELS).map(([key, text]) => (
                    <option key={key} value={key}>{text}</option>
                  ))}
                </select>
              </label>
              <label className="dice-field">
                碰撞音色
                <select
                  aria-label="骰子碰撞音色"
                  value={config.acousticProfile}
                  onChange={(e) => {
                    const acousticProfile = e.target.value as DiceAcousticProfile;
                    patch({ acousticProfile });
                    if (soundEnabled) playDiceImpactSound("die", 0.65, acousticProfile);
                  }}
                >
                  {Object.entries(DICE_ACOUSTIC_LABELS).map(([key, text]) => (
                    <option key={key} value={key}>{text}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}

      {tab === "shader" && (
        <div className="dice-studio-section dice-studio-stack">
          <div className="dice-studio-group">
            <h4>着色器模式</h4>
            <div className="dice-shader-chips" role="radiogroup" aria-label="骰子 Shader 模式">
              {(Object.entries(DICE_SHADER_LABELS) as [DiceShaderPreset, string][]).map(([key, text]) => (
                <button
                  type="button"
                  key={key}
                  role="radio"
                  aria-checked={config.shaderPreset === key}
                  className={`dice-shader-chip${config.shaderPreset === key ? " is-active" : ""}`}
                  onClick={() => patch({ shaderPreset: key })}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {config.shaderPreset !== "none" && (
            <div className="dice-studio-group">
              <h4>动态参数</h4>
              <div className="dice-studio-sliders">
                <SliderRow
                  label="流动速度 Speed"
                  value={config.shaderSpeed}
                  min={0}
                  max={2.6}
                  step={0.05}
                  suffix="×"
                  onChange={(shaderSpeed) => patch({ shaderSpeed })}
                />
                <SliderRow
                  label="特效强度 Intensity"
                  value={config.shaderIntensity}
                  min={0.1}
                  max={2}
                  step={0.05}
                  onChange={(shaderIntensity) => patch({ shaderIntensity })}
                />
              </div>
            </div>
          )}

          {config.shaderPreset === "custom" && (
            <div className="dice-studio-group">
              <div className="dice-studio-code-head">
                <h4>GLSL 片段代码</h4>
                <span className={`dice-shader-status ${shaderStatus.ok ? "is-ok" : "is-error"}`}>
                  {shaderStatus.ok ? <><CheckCircle2 size={13} />编译通过</> : <><AlertTriangle size={13} />编译错误</>}
                </span>
              </div>
              <div className="dice-glsl-templates">
                {CUSTOM_DICE_GLSL_TEMPLATES.map((tpl) => (
                  <button
                    type="button"
                    key={tpl.id}
                    title={tpl.description}
                    onClick={() => patch({ customGlsl: tpl.code })}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
              <textarea
                className="dice-glsl-editor"
                aria-label="自定义骰子 GLSL Shader 代码"
                spellCheck={false}
                autoCapitalize="off"
                rows={8}
                value={config.customGlsl}
                onChange={(e) => patch({ customGlsl: e.target.value })}
              />
              {!shaderStatus.ok && shaderStatus.error && (
                <p className="dice-glsl-error" role="alert">{shaderStatus.error}</p>
              )}
              <p className="dice-glsl-hint">
                注入点：Three.js <code>MeshPhysicalMaterial</code> 片元着色阶段。可直接读写{" "}
                <code>diffuseColor.rgb</code> 与 <code>totalEmissiveRadiance</code>，可用{" "}
                <code>uTime</code>、<code>uAccentColor</code>、<code>uIntensity</code>、<code>vDicePos</code>、
                <code>hpFbm3()</code>、<code>hpVoronoi3()</code>。
              </p>
            </div>
          )}
        </div>
      )}

      <footer className="dice-studio-footer">
        <label className="dice-studio-sound-toggle">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => {
              onToggleSound(e.target.checked);
              if (e.target.checked) playDiceImpactSound("die", 0.6, config.acousticProfile);
            }}
          />
          <Volume2 size={14} />
          <span>物理碰撞音效</span>
        </label>
        <div className="dice-studio-footer-actions">
          {ownerId && (
            <button
              type="button"
              className="dice-studio-reset"
              onClick={saveToAccountLibrary}
            >
              <BookmarkPlus size={13} />
              <span>{savedTip || "存入资产库"}</span>
            </button>
          )}
          <button
            type="button"
            className="dice-studio-reset"
            onClick={() => applyPreset(config.presetId)}
          >
            <RotateCcw size={13} />
            <span>重置</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
