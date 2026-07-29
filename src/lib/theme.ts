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

// <html data-theme="..."> にセットし、index.cssの上書きブロックを適用する
export function applyTheme(theme: string | undefined | null): void {
  document.documentElement.setAttribute("data-theme", theme || DEFAULT_THEME);
}
