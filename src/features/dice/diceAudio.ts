import type { DiceAcousticProfile } from "./diceMaterialConfig";

export type DiceImpactKind = "floor" | "wall" | "die";

let sharedCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastImpactAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new Ctor();
    noiseBuffer = null;
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.16);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = Math.exp(-i / (ctx.sampleRate * 0.032));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  noiseBuffer = buffer;
  return buffer;
}

interface ProfileVoice {
  baseFreq: number;
  overtoneRatio: number;
  decay: number;
  filterFreq: number;
  q: number;
  ringGain: number;
  clickGain: number;
}

const PROFILES: Record<DiceAcousticProfile, ProfileVoice> = {
  stone: {
    baseFreq: 520,
    overtoneRatio: 2.31,
    decay: 0.068,
    filterFreq: 1850,
    q: 2.2,
    ringGain: 0.38,
    clickGain: 0.72,
  },
  resin: {
    baseFreq: 760,
    overtoneRatio: 1.94,
    decay: 0.052,
    filterFreq: 2600,
    q: 2.8,
    ringGain: 0.34,
    clickGain: 0.8,
  },
  metal: {
    baseFreq: 1180,
    overtoneRatio: 2.74,
    decay: 0.155,
    filterFreq: 3800,
    q: 7.5,
    ringGain: 0.68,
    clickGain: 0.55,
  },
  crystal: {
    baseFreq: 1680,
    overtoneRatio: 2.41,
    decay: 0.145,
    filterFreq: 4900,
    q: 9.2,
    ringGain: 0.62,
    clickGain: 0.48,
  },
  wood: {
    baseFreq: 360,
    overtoneRatio: 1.62,
    decay: 0.075,
    filterFreq: 1150,
    q: 1.9,
    ringGain: 0.42,
    clickGain: 0.62,
  },
};

/**
 * Physically inspired procedural WebAudio impact foley synced to cannon-es bounces.
 * Reuses a single AudioContext and caps polyphony so 20-dice rolls stay crisp.
 */
export function playDiceImpactSound(
  kind: DiceImpactKind,
  intensity: number,
  profile: DiceAcousticProfile = "stone",
) {
  try {
    const nowMs = performance.now();
    if (nowMs - lastImpactAt < 18) return;
    lastImpactAt = nowMs;

    const ctx = getAudioContext();
    if (!ctx) return;

    const clamped = Math.max(0.08, Math.min(1, intensity));
    const voice = PROFILES[profile] ?? PROFILES.stone;
    const now = ctx.currentTime;
    const jitter = 0.92 + Math.random() * 0.16;

    // Surface modifies brightness & decay: felt floor damps high frequencies,
    // die-on-die impacts are brightest, wooden rim adds warm mid-resonance.
    const kindPitch = kind === "die" ? 1.28 : kind === "wall" ? 0.86 : 0.72;
    const kindFilter = kind === "die" ? 1.35 : kind === "wall" ? 0.92 : 0.62;
    const kindDecay = kind === "floor" ? 0.72 : 1.0;

    const master = ctx.createGain();
    const volume = (kind === "floor" ? 0.14 : 0.18) * Math.pow(clamped, 0.85);
    master.gain.setValueAtTime(volume, now);
    master.gain.exponentialRampToValueAtTime(0.0008, now + Math.max(0.045, voice.decay * kindDecay * 1.4));
    master.connect(ctx.destination);

    // 1. Short band-passed transient burst (contact click)
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(voice.filterFreq * kindFilter * jitter, now);
    filter.Q.setValueAtTime(voice.q * (kind === "floor" ? 0.65 : 1), now);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(voice.clickGain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.024, voice.decay * 0.45));
    noise.connect(filter);
    filter.connect(clickGain);
    clickGain.connect(master);
    noise.start(now);
    noise.stop(now + 0.14);

    // 2. Dual-partial body resonance (gives stone/metal/crystal/wood identity)
    const freq1 = voice.baseFreq * kindPitch * jitter;
    const freq2 = freq1 * voice.overtoneRatio;
    const decay = Math.max(0.035, voice.decay * kindDecay);

    for (const [idx, freq] of [freq1, freq2].entries()) {
      const osc = ctx.createOscillator();
      osc.type = profile === "metal" || profile === "crystal" ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * (kind === "floor" ? 0.76 : 0.92), now + decay);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(voice.ringGain * (idx === 0 ? 1 : 0.42), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + decay * (idx === 0 ? 1 : 0.72));
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.02);
    }
  } catch {
    // Audio is optional; never disrupt rolling or UI.
  }
}

export function playDiceReleaseCue(profile: DiceAcousticProfile = "stone") {
  playDiceImpactSound("die", 0.35, profile);
}
