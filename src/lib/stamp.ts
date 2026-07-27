// デジタル印影（はんこ）をSVGで生成する。領収書やプレビューで使う。
import type { StampFont, StampOrientation, StampShape } from "../types";

const INK = "#c0392b"; // 朱色

// 選べるフォント（OS標準フォント。無い場合はフォールバック）
export const STAMP_FONTS: Record<StampFont, { label: string; family: string }> = {
  mincho: { label: "明朝", family: "'Hiragino Mincho ProN','Yu Mincho',serif" },
  gothic: {
    label: "ゴシック",
    family: "'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif",
  },
  maru: {
    label: "丸ゴシック",
    family: "'Hiragino Maru Gothic ProN','Yu Gothic',sans-serif",
  },
  kaisho: {
    label: "楷書体",
    family:
      "'Toppan Bunkyu Midashi Mincho','UD デジタル 教科書体 NK-R','Hiragino Mincho ProN',serif",
  },
};

// 文字列から印影のSVGマークアップを返す
export function stampSvg(
  textRaw: string,
  shape: StampShape = "circle",
  orientation: StampOrientation = "vertical",
  font: StampFont = "mincho",
  size = 76
): string {
  const text = (textRaw || "印").trim().slice(0, 9);
  const chars = Array.from(text);
  const n = chars.length;

  // 縦書き＝行優先（右→左の列）、横書き＝列優先（左→右・上→下）
  let cols: number;
  let rows: number;
  if (orientation === "vertical") {
    rows = Math.ceil(Math.sqrt(n));
    cols = Math.ceil(n / rows);
  } else {
    cols = Math.ceil(Math.sqrt(n));
    rows = Math.ceil(n / cols);
  }

  const inner = (shape === "circle" ? 0.66 : 0.78) * size; // 文字を置ける範囲
  const grid = Math.max(cols, rows);
  const cell = inner / grid;
  const fs = cell * (n === 1 ? 0.9 : 0.82);

  const startX = size / 2 - (cols * cell) / 2 + cell / 2;
  const startY = size / 2 - (rows * cell) / 2 + cell / 2;
  const family = (STAMP_FONTS[font] ?? STAMP_FONTS.mincho).family;

  const glyphs = chars
    .map((c, i) => {
      let colIndex: number;
      let row: number;
      if (orientation === "vertical") {
        // 上→下で1列を埋め、列は右→左へ
        const col = Math.floor(i / rows);
        row = i % rows;
        colIndex = cols - 1 - col;
      } else {
        // 左→右・上→下
        colIndex = i % cols;
        row = Math.floor(i / cols);
      }
      const x = startX + colIndex * cell;
      const y = startY + row * cell;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs.toFixed(
        1
      )}" fill="${INK}" text-anchor="middle" dominant-baseline="central" font-family="${family}" font-weight="700">${escapeXml(
        c
      )}</text>`;
    })
    .join("");

  const border =
    shape === "circle"
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${
          size / 2 - 3
        }" fill="none" stroke="${INK}" stroke-width="3"/>`
      : `<rect x="3" y="3" width="${size - 6}" height="${
          size - 6
        }" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${border}${glyphs}</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
