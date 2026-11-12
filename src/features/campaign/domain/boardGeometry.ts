/** 板内坐标不变；向右扩展，并增加 3 px 高度，得到精确的 16:9。 */
export const BOARD_WIDTH = 2144;
export const BOARD_HEIGHT = 1206;
export const BOARD_FRAME_INSET = 44;
export const STICKER_SIZE = 72;

export const boardGeometryStyle = {
  "--board-width": `${BOARD_WIDTH}px`,
  "--board-height": `${BOARD_HEIGHT}px`,
  "--board-inset": `${BOARD_FRAME_INSET}px`,
};
