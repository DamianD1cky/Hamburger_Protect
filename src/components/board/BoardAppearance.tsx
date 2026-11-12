import { useEffect, useRef, useState, type CSSProperties } from "react";
import roomImage from "../../../assets/room-kitchen-clean.jpg";
import type { BoardAppearance as Appearance, BoardFrameKind } from "../../features/campaign/domain/boardAppearance";
import { BOARD_FRAME_INSET, BOARD_HEIGHT, BOARD_WIDTH } from "../../features/campaign/domain/boardGeometry";

/** 在新图解码成功前保留上一张已加载的图，避免签名刷新或网络失败造成闪屏。 */
function useReadyImage(source: string | null, retainOnFailure = false) {
  const previous = useRef<string | null>(null);
  const [result, setResult] = useState<{ source: string | null; ready: string | null; failed: boolean }>({
    source: null, ready: null, failed: false,
  });
  useEffect(() => {
    if (!source) return;
    let active = true;
    const image = new Image();
    image.src = source;
    image.decode().then(() => {
      if (!active) return;
      previous.current = source;
      setResult({ source, ready: source, failed: false });
    }).catch(() => {
      if (active) setResult({ source, ready: previous.current, failed: true });
    });
    return () => { active = false; };
  }, [source]);
  return {
    ready: source ? result.ready : retainOnFailure ? previous.current : null,
    failed: (retainOnFailure && !source) || (result.source === source && result.failed),
  };
}

export function RoomBackground({ appearance, imageUrl, fullscreen = false }: {
  appearance: Appearance; imageUrl: string | null; fullscreen?: boolean;
}) {
  const room = appearance.room;
  const source = room.kind === "default" ? roomImage : room.kind === "image" ? imageUrl : null;
  const { ready, failed } = useReadyImage(source, room.kind === "image" && Boolean(room.imagePath));
  const style = {
    backgroundColor: room.color,
    backgroundImage: ready ? `url("${ready}")` : undefined,
    backgroundSize: room.fit === "tile" ? "512px auto" : room.fit,
    backgroundRepeat: room.fit === "tile" ? "repeat" : "no-repeat",
    backgroundPosition: `${room.positionX}% ${room.positionY}%`,
    "--room-dim": room.dim,
  } as CSSProperties;
  return <div className={fullscreen ? "room-background is-wallpaper" : "room-background"} data-background-kind={room.kind}
    data-background-error={failed || undefined} style={style} aria-hidden="true" />;
}

export function BoardSurface({ appearance, imageUrl }: {
  appearance: Appearance; imageUrl: string | null;
}) {
  const { ready, failed } = useReadyImage(
    appearance.surface.kind === "image" ? imageUrl : null,
    appearance.surface.kind === "image" && Boolean(appearance.surface.imagePath),
  );
  return <div className="board-surface" data-surface={appearance.surface.kind}
    data-background-error={failed || undefined}
    style={ready ? { backgroundImage: `url("${ready}")` } : undefined} aria-hidden="true" />;
}

export function BoardFrame({ frame }: { frame: BoardFrameKind }) {
  return (
    <div className="board-frame" data-frame={frame} aria-hidden="true">
      {frame === "burger" && <>
        <span className="frame-corner top-left">🍔</span>
        <span className="frame-corner top-right">🍟</span>
        <span className="frame-corner bottom-left">🍟</span>
        <span className="frame-corner bottom-right">🍔</span>
      </>}
    </div>
  );
}

/** 与实景共用相同的三层样式，不复制另一套预览逻辑。 */
export function AppearancePreview({ appearance, backgroundUrl, surfaceUrl }: {
  appearance: Appearance; backgroundUrl: string | null; surfaceUrl: string | null;
}) {
  return (
    <div className="appearance-preview" aria-label="公告板外观预览">
      <RoomBackground appearance={appearance} imageUrl={backgroundUrl} />
      <div className="appearance-preview-world" style={{
        aspectRatio: (BOARD_WIDTH + BOARD_FRAME_INSET * 2) / (BOARD_HEIGHT + BOARD_FRAME_INSET * 2),
        "--preview-inset-x": `${BOARD_FRAME_INSET / (BOARD_WIDTH + BOARD_FRAME_INSET * 2) * 100}%`,
        "--preview-inset-y": `${BOARD_FRAME_INSET / (BOARD_HEIGHT + BOARD_FRAME_INSET * 2) * 100}%`,
      } as CSSProperties}>
        <BoardFrame frame={appearance.frame} />
        <div className="appearance-preview-board">
          <BoardSurface appearance={appearance} imageUrl={surfaceUrl} />
          <div className="appearance-preview-note">调查线索<span>记下重要的发现</span></div>
        </div>
      </div>
    </div>
  );
}
