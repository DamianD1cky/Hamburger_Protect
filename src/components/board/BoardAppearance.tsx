import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import roomImage from "../../../assets/room-kitchen-clean.jpg";
import type {
  BoardAppearance as Appearance,
  BoardFrameKind,
} from "../../features/campaign/domain/boardAppearance";
import {
  hasActiveAmbientShader,
  type BoardAmbientShader,
} from "../../features/campaign/domain/cardEffects";
import {
  BOARD_FRAME_INSET,
  BOARD_HEIGHT,
  BOARD_WIDTH,
} from "../../features/campaign/domain/boardGeometry";
import {
  blitAmbientShaderToCanvas,
  subscribeCardShaderClock,
} from "../../features/shaders/cardShaderEngine";

function useReadyImage(source: string | null, retainOnFailure = false) {
  const previous = useRef<string | null>(null);
  const [result, setResult] = useState<{
    source: string | null;
    ready: string | null;
    failed: boolean;
  }>({
    source: null,
    ready: null,
    failed: false,
  });
  useEffect(() => {
    if (!source) return;
    let active = true;
    const image = new Image();
    image.src = source;
    image
      .decode()
      .then(() => {
        if (!active) return;
        previous.current = source;
        setResult({ source, ready: source, failed: false });
      })
      .catch(() => {
        if (active) {
          setResult({ source, ready: previous.current, failed: true });
        }
      });
    return () => {
      active = false;
    };
  }, [source]);
  return {
    ready: source ? result.ready : retainOnFailure ? previous.current : null,
    failed:
      (retainOnFailure && !source) ||
      (result.source === source && result.failed),
  };
}

function AmbientShaderLayer({
  role,
  shader,
  width,
  height,
}: {
  role: "surface" | "frame";
  shader: BoardAmbientShader;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const params = { width, height, role, ambient: shader };
    blitAmbientShaderToCanvas(canvas, params, 0);

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

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || shader.speed <= 0.01) {
      return () => observer?.disconnect();
    }
    const unsub = subscribeCardShaderClock((t) => {
      if (canvasRef.current && visibleRef.current) {
        blitAmbientShaderToCanvas(canvasRef.current, params, t);
      }
    });
    return () => {
      unsub();
      observer?.disconnect();
    };
  }, [width, height, role, shader]);

  return (
    <canvas
      ref={canvasRef}
      className={`board-ambient-shader-canvas is-${role}`}
      aria-hidden="true"
    />
  );
}

export function RoomBackground({
  appearance,
  imageUrl,
  fullscreen = false,
}: {
  appearance: Appearance;
  imageUrl: string | null;
  fullscreen?: boolean;
}) {
  const room = appearance.room;
  const source =
    room.kind === "default"
      ? roomImage
      : room.kind === "image"
        ? imageUrl
        : null;
  const { ready, failed } = useReadyImage(
    source,
    room.kind === "image" && Boolean(room.imagePath),
  );
  const style = {
    backgroundColor: room.color,
    backgroundImage: ready ? `url("${ready}")` : undefined,
    backgroundSize: room.fit === "tile" ? "512px auto" : room.fit,
    backgroundRepeat: room.fit === "tile" ? "repeat" : "no-repeat",
    backgroundPosition: `${room.positionX}% ${room.positionY}%`,
    "--room-dim": room.dim,
  } as CSSProperties;
  return (
    <div
      className={
        fullscreen ? "room-background is-wallpaper" : "room-background"
      }
      data-background-kind={room.kind === "perspective" ? "color" : room.kind}
      data-background-error={failed || undefined}
      style={style}
      aria-hidden="true"
    />
  );
}

export function BoardSurface({
  appearance,
  imageUrl,
  shader,
}: {
  appearance: Appearance;
  imageUrl: string | null;
  shader?: BoardAmbientShader | null;
}) {
  const { ready, failed } = useReadyImage(
    appearance.surface.kind === "image" ? imageUrl : null,
    appearance.surface.kind === "image" && Boolean(appearance.surface.imagePath),
  );
  const shaderActive = hasActiveAmbientShader(shader);
  return (
    <div
      className="board-surface"
      data-surface={appearance.surface.kind}
      data-surface-shader={shaderActive ? shader!.shader : undefined}
      data-background-error={failed || undefined}
      style={ready ? { backgroundImage: `url("${ready}")` } : undefined}
      aria-hidden="true"
    >
      {shaderActive && shader && (
        <AmbientShaderLayer
          role="surface"
          shader={shader}
          width={960}
          height={540}
        />
      )}
    </div>
  );
}

export function BoardFrame({
  frame,
  shader,
}: {
  frame: BoardFrameKind;
  shader?: BoardAmbientShader | null;
}) {
  const shaderActive = hasActiveAmbientShader(shader);
  return (
    <div
      className="board-frame"
      data-frame={frame}
      data-frame-shader={shaderActive ? shader!.shader : undefined}
      aria-hidden="true"
    >
      {shaderActive && shader && frame !== "none" && (
        <AmbientShaderLayer
          role="frame"
          shader={shader}
          width={980}
          height={560}
        />
      )}
      {frame === "burger" && (
        <>
          <span className="frame-corner top-left">🍔</span>
          <span className="frame-corner top-right">🍟</span>
          <span className="frame-corner bottom-left">🍟</span>
          <span className="frame-corner bottom-right">🍔</span>
        </>
      )}
    </div>
  );
}

export function AppearancePreview({
  appearance,
  backgroundUrl,
  surfaceUrl,
  surfaceShader,
  frameShader,
}: {
  appearance: Appearance;
  backgroundUrl: string | null;
  surfaceUrl: string | null;
  surfaceShader?: BoardAmbientShader | null;
  frameShader?: BoardAmbientShader | null;
}) {
  return (
    <div className="appearance-preview" aria-label="公告板外观预览">
      <RoomBackground appearance={appearance} imageUrl={backgroundUrl} />
      <div
        className="appearance-preview-world"
        style={
          {
            aspectRatio:
              (BOARD_WIDTH + BOARD_FRAME_INSET * 2) /
              (BOARD_HEIGHT + BOARD_FRAME_INSET * 2),
            "--preview-inset-x": `${
              (BOARD_FRAME_INSET / (BOARD_WIDTH + BOARD_FRAME_INSET * 2)) * 100
            }%`,
            "--preview-inset-y": `${
              (BOARD_FRAME_INSET / (BOARD_HEIGHT + BOARD_FRAME_INSET * 2)) * 100
            }%`,
          } as CSSProperties
        }
      >
        <BoardFrame frame={appearance.frame} shader={frameShader} />
        <div className="appearance-preview-board">
          <BoardSurface
            appearance={appearance}
            imageUrl={surfaceUrl}
            shader={surfaceShader}
          />
          <div className="appearance-preview-note">
            调查线索<span>记下重要的发现</span>
          </div>
        </div>
      </div>
    </div>
  );
}
