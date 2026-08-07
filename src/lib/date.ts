// 日付まわりの小さなヘルパー

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return ymd(new Date());
}

// 指定した年月のカレンダーグリッド（日曜始まり・6週=42マス）を返す
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // その週の日曜まで戻す
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// "HH:MM" 2つから稼働時間（時間・小数）を計算。終了が未定（空）なら0。
export function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 0;
}

// 日付がどの月に属するか。"2026-08" のような文字列を返す
// (関数名は quarterOf のままだが、集計単位は1ヶ月単位)
export function quarterOf(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function quarterLabel(q: string): string {
  const [y, m] = q.split("-");
  return `${y}年${Number(m)}月`;
}

export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}
