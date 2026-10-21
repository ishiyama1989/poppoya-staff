import { CAFE_PRODUCT_UNIT_LABEL, type CafeProduct } from "../types";

// 発注商品の単価まわりの共通部品（カフェの発注・日報の経費で使う）

// 単価の表示用（5.5 → "5.5"、1200 → "1,200"）
export function formatPrice(n: number): string {
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

// 単価の基準数量（未設定は1）
export const baseQty = (p: Pick<CafeProduct, "priceQty">): number =>
  p.priceQty && p.priceQty > 0 ? p.priceQty : 1;

// 単価の表示（例: "800円/100g"、"5.5円/g"、"200円/個"）
export function priceLabel(p: Pick<CafeProduct, "unit" | "unitPrice" | "priceQty">): string {
  const qty = baseQty(p);
  return `${formatPrice(p.unitPrice ?? 0)}円/${qty === 1 ? "" : formatPrice(qty)}${CAFE_PRODUCT_UNIT_LABEL[p.unit]}`;
}

// ＋／−で増減する量（gは1gずつだと使いにくいので100gずつ、個は1個ずつ）
export const stepOf = (p: Pick<CafeProduct, "unit">): number => (p.unit === "g" ? 100 : 1);

// 数量ぶんの金額（円）。単価が未設定なら null
export function costFor(
  p: Pick<CafeProduct, "unitPrice" | "priceQty">,
  qty: number
): number | null {
  if (p.unitPrice === undefined) return null;
  return Math.round((p.unitPrice / baseQty(p)) * qty);
}
