import type { ReactNode } from "react";

// 数量入力の更新。文字列をそのまま入れるほか、直前の値から計算する関数も渡せる
// （＋／−を素早く連打しても取りこぼさないため）。
export type QtyUpdate = string | ((cur: string) => string);

export function applyQty(
  cur: Record<string, string>,
  id: string,
  next: QtyUpdate
): Record<string, string> {
  return { ...cur, [id]: typeof next === "function" ? next(cur[id] ?? "") : next };
}

// 商品1つぶんの数量入力タイル（＋／−ボタンと数字入力）。日報の販売数・カフェ発注で共通に使う。
export default function QtyTile({
  name,
  lines = [],
  value,
  unit,
  step = 1,
  onChange,
}: {
  name: ReactNode;
  lines?: string[]; // 商品名の下に小さく出す補足（価格・発注先など）
  value: string;
  unit?: string; // 数字の右に出す単位（g・個など）
  step?: number; // ＋／−で増減する量
  onChange: (next: QtyUpdate) => void;
}) {
  const bump = (delta: number) =>
    onChange((cur) => String(Math.max(0, Math.floor(Number(cur) || 0) + delta)));
  const on = (Number(value) || 0) > 0;

  return (
    <div className={`sold-tile ${on ? "on" : ""}`}>
      <div className="sold-name">{name}</div>
      {lines.map((l, i) => (
        <div key={i} className="sold-price">
          {l}
        </div>
      ))}
      <div className="qty-stepper">
        <button type="button" onClick={() => bump(-step)} aria-label="減らす">
          −
        </button>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="qty-unit">{unit}</span>}
        <button type="button" onClick={() => bump(step)} aria-label="増やす">
          ＋
        </button>
      </div>
    </div>
  );
}
