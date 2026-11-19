import type { DiceMacroBlock } from "../campaign/domain/customPanels";

export interface BoardDiceMacroRequest {
  campaignId: string;
  macro: DiceMacroBlock["macros"][number];
}
export const BOARD_DICE_MACRO_EVENT = "veilboard:dice-macro";
export function requestBoardDiceMacro(request: BoardDiceMacroRequest) {
  window.dispatchEvent(new CustomEvent<BoardDiceMacroRequest>(BOARD_DICE_MACRO_EVENT, { detail: request }));
}
