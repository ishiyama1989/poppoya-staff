// 会社（組織）ごとに選べる配色テーマ

export interface ThemeOption {
  id: string;
  label: string;
  swatch: string; // 選択UIのプレビュー色
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "coral", label: "コーラル", swatch: "#ff7a59" },
  { id: "ocean", label: "オーシャン", swatch: "#2f8fd0" },
  { id: "forest", label: "フォレスト", swatch: "#3f9142" },
  { id: "lavender", label: "ラベンダー", swatch: "#8a5cd6" },
  { id: "charcoal", label: "チャコール", swatch: "#34506e" },
];

const DEFAULT_THEME = "coral";

// <html data-theme="..."> にセットし、index.cssの上書きブロックを適用する。
// あわせて <meta name="theme-color"> も更新し、PWAとして開いたときの
// ウィンドウの帯（macOSのタイトルバー・スマホのアドレスバー等）も同じ色にする。
export function applyTheme(theme: string | undefined | null): void {
  const id = theme || DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", id);

  const color = THEME_OPTIONS.find((t) => t.id === id)?.swatch ?? THEME_OPTIONS[0].swatch;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
}
