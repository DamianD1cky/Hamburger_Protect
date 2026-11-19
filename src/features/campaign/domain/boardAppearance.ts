export type RoomBackgroundKind = "default" | "color" | "image" | "perspective";
export type PerspectiveScene = "crossing" | "station";
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
    scene?: PerspectiveScene;
    animated?: boolean;
  };
  surface: {
    kind: BoardSurfaceKind;
    imagePath: string | null;
  };
  frame: BoardFrameKind;
}

export type BoardAppearanceFiles = Partial<Record<"background" | "boardTexture", File>>;

/** 新战役与帷幕告示板默认外观：中性暗色桌面、软木板面与木框。 */
export function veilBoardAppearance(): BoardAppearance {
  return {
    room: {
      kind: "color",
      color: "#1f2524",
      imagePath: null,
      fit: "cover",
      positionX: 50,
      positionY: 50,
      dim: 0.18,
    },
    surface: { kind: "cork", imagePath: null },
    frame: "wood",
  };
}

/** 经典「危机营业」主题外观，也用作未迁移旧存档（appearance 为空）的兼容回退。 */
export function crisisDinerAppearance(backgroundPath: string | null = null): BoardAppearance {
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

/** 旧 background_path 只映射为房间图片，不改变历史板面、边框或物件坐标。 */
export function defaultBoardAppearance(backgroundPath: string | null = null): BoardAppearance {
  return crisisDinerAppearance(backgroundPath);
}

export interface BoardAppearancePreset {
  id: "veil_cork" | "shadow_slate" | "parchment_study" | "crisis_diner";
  label: string;
  appearance: BoardAppearance;
}

export const boardAppearancePresets: readonly BoardAppearancePreset[] = [
  {
    id: "veil_cork",
    label: "帷幕软木",
    appearance: veilBoardAppearance(),
  },
  {
    id: "shadow_slate",
    label: "暗影黑板",
    appearance: {
      room: {
        kind: "color",
        color: "#151b21",
        imagePath: null,
        fit: "cover",
        positionX: 50,
        positionY: 50,
        dim: 0.24,
      },
      surface: { kind: "felt", imagePath: null },
      frame: "metal",
    },
  },
  {
    id: "parchment_study",
    label: "羊皮卷宗",
    appearance: {
      room: {
        kind: "color",
        color: "#2a231d",
        imagePath: null,
        fit: "cover",
        positionX: 50,
        positionY: 50,
        dim: 0.16,
      },
      surface: { kind: "paper", imagePath: null },
      frame: "wood",
    },
  },
  {
    id: "crisis_diner",
    label: "危机营业",
    appearance: crisisDinerAppearance(),
  },
];
