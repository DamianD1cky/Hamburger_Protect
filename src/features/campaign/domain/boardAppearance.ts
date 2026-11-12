export type RoomBackgroundKind = "default" | "color" | "image";
export type BackgroundFit = "cover" | "contain" | "tile";
export type BoardSurfaceKind = "felt" | "cork" | "paper" | "image";
export type BoardFrameKind = "burger" | "wood" | "metal" | "none";

export interface BoardAppearance {
  room: {
    kind: RoomBackgroundKind;
    color: string;
    imagePath: string | null;
    fit: BackgroundFit;
    positionX: number;
    positionY: number;
    dim: number;
  };
  surface: {
    kind: BoardSurfaceKind;
    imagePath: string | null;
  };
  frame: BoardFrameKind;
}

export type BoardAppearanceFiles = Partial<Record<"background" | "boardTexture", File>>;

/** 旧 background_path 只映射为房间图片，不改变板面、边框或物件坐标。 */
export function defaultBoardAppearance(backgroundPath: string | null = null): BoardAppearance {
  return {
    room: {
      kind: backgroundPath ? "image" : "default",
      color: "#202523",
      imagePath: backgroundPath,
      fit: "cover",
      positionX: 50,
      positionY: 50,
      dim: 0.18,
    },
    surface: { kind: "felt", imagePath: null },
    frame: "burger",
  };
}
