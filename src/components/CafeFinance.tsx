import { useState } from "react";
import type { CafeExpenseItem, CafeOrder, CafeReport, CafeReportExpense } from "../types";
import { addCafeExpenseItem, deleteCafeExpenseItem, updateCafeExpenseItem, uid } from "../store";

export const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

const PROFIT_COLOR = "#1a9f6b";
const LOSS_COLOR = "#d94f5c";
const EXPENSE_COLOR = "#f59e0b";

// ---- 集計（日報1件・月ごと） ----
export const expenseOf = (r: CafeReport): number =>
  (r.expenses ?? []).reduce((s, e) => s + e.amount, 0);
export const profitOf = (r: CafeReport): number => r.sales - expenseOf(r);

export interface MonthTotals {
  month: string; // "YYYY-MM"
  days: number; // 日報の件数
  sales: number;
  expense: number;
  profit: number;
}

export function totalsFor(reports: CafeReport[], month: string): MonthTotals {
  const rs = reports.filter((r) => r.date.startsWith(month));
  const sales = rs.reduce((s, r) => s + r.sales, 0);
  const expense = rs.reduce((s, r) => s + expenseOf(r), 0);
  return { month, days: rs.length, sales, expense, profit: sales - expense };
}

// "2026-10" を前後の月へ動かす
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const signed = (n: number) => (n < 0 ? `−${yen(Math.abs(n))}` : yen(n));
export const profitColor = (n: number) => (n < 0 ? LOSS_COLOR : PROFIT_COLOR);

// ---- 日報の入力：経費の行 ----
// 金額は入力途中の文字列のまま持ち、保存時にだけ数値へ直す。
export interface ExpenseRow {
  key: string;
  categoryId: string; // "" = 自由入力（項目名を打つ）
  name: string;
  amount: string;
  orderId?: string;
}

export function rowsFromExpenses(
  list: CafeReportExpense[] | undefined,
  categories: CafeExpenseItem[]
): ExpenseRow[] {
  return (list ?? []).map((e) => ({
    key: e.id,
    // 登録項目が削除されている場合は、保存されている項目名の自由入力として扱う
    categoryId: e.categoryId && categories.some((c) => c.id === e.categoryId) ? e.categoryId : "",
    name: e.name,
    amount: String(e.amount),
    orderId: e.orderId,
  }));
}

// 入力行を保存用に変換する。入力に問題があれば error を返す。
export function expensesFromRows(
  rows: ExpenseRow[],
  categories: CafeExpenseItem[]
): { ok: true; expenses: CafeReportExpense[] } | { ok: false; error: string } {
  const expenses: CafeReportExpense[] = [];
  for (const r of rows) {
    if (r.amount.trim() === "" && !r.name.trim() && !r.categoryId) continue; // 空の行は無視
    const amount = Number(r.amount);
    if (r.amount.trim() === "" || !Number.isFinite(amount) || amount < 0)
      return { ok: false, error: "経費の金額は0以上の数字で入力してください" };
    const cat = categories.find((c) => c.id === r.categoryId);
    const name = cat ? cat.name : r.name.trim();
    if (!name) return { ok: false, error: "経費の項目を選ぶか、項目名を入力してください" };
    expenses.push({
      id: r.key,
      categoryId: cat?.id,
      name,
      amount: Math.round(amount),
      orderId: r.orderId,
    });
  }
  return { ok: true, expenses };
}

export function rowsTotal(rows: ExpenseRow[]): number {
  return rows.reduce((s, r) => s + Math.max(0, Math.round(Number(r.amount) || 0)), 0);
}

export const newRow = (categoryId = ""): ExpenseRow => ({
  key: `exp:${uid()}`,
  categoryId,
  name: "",
  amount: "",
});

// 仕入れ・経費の入力欄。項目を選んで金額を入れる。その日を営業日にした発注は、ボタンで取り込める。
export function ExpenseEditor({
  rows,
  onChange,
  categories,
  orders,
}: {
  rows: ExpenseRow[];
  onChange: (rows: ExpenseRow[]) => void;
  categories: CafeExpenseItem[];
  orders: CafeOrder[]; // この日を営業日にした発注（概算合計あり）
}) {
  const update = (key: string, patch: Partial<ExpenseRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const importedIds = new Set(rows.map((r) => r.orderId).filter(Boolean));

  return (
    <div className="expense-editor">
      <label style={{ marginTop: 10 }}>仕入れ・経費</label>

      {rows.map((r) => {
        // 選んでいた項目が削除された行は、自由入力の行として扱う（名前は残す）
        const catId = categories.some((c) => c.id === r.categoryId) ? r.categoryId : "";
        return (
        <div key={r.key} className="expense-row">
          <div className="expense-row-top">
            <select
              value={catId}
              onChange={(e) => update(r.key, { categoryId: e.target.value })}
              aria-label="経費の項目"
            >
              <option value="">その他（項目名を入力）</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost danger mini"
              onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              aria-label="この経費を削除"
            >
              ✕
            </button>
          </div>
          {catId === "" && (
            <input
              value={r.name}
              onChange={(e) => update(r.key, { name: e.target.value })}
              placeholder="項目名（例: 洗剤）"
              aria-label="経費の項目名"
            />
          )}
          <div className="expense-amount">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={r.amount}
              onChange={(e) => update(r.key, { amount: e.target.value })}
              placeholder="金額"
              aria-label="経費の金額"
            />
            <span>円</span>
          </div>
          {r.orderId && <span className="tag muted">発注から取り込み（金額は実際の額に直せます）</span>}
        </div>
        );
      })}

      <div className="expense-add">
        {categories.map((c) => (
          <button key={c.id} type="button" className="ghost mini" onClick={() => onChange([...rows, newRow(c.id)])}>
            ＋ {c.name}
          </button>
        ))}
        <button type="button" className="ghost mini" onClick={() => onChange([...rows, newRow()])}>
          ＋ その他の経費
        </button>
      </div>

      {orders.length > 0 && (
        <div className="expense-orders">
          <div className="small muted">この営業日への発注（金額は単価からの概算です）</div>
          {orders.map((o) => {
            const done = importedIds.has(o.id);
            return (
              <div key={o.id} className="expense-order">
                <span className="expense-order-text">
                  {o.items}
                  <strong> {yen(o.totalAmount ?? 0)}</strong>
                </span>
                <button
                  type="button"
                  className="ghost mini"
                  disabled={done}
                  onClick={() =>
                    onChange([
                      ...rows,
                      {
                        ...newRow(),
                        name: o.items.length > 40 ? `${o.items.slice(0, 40)}…` : o.items,
                        amount: String(o.totalAmount ?? 0),
                        orderId: o.id,
                      },
                    ])
                  }
                >
                  {done ? "取り込み済み" : "経費に取り込む"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// その日の収支（売上 − 経費 ＝ 利益）
export function DayBalance({ sales, expense }: { sales: number; expense: number }) {
  const profit = sales - expense;
  return (
    <div className="balance-line">
      <span>
        売上 <strong>{yen(sales)}</strong>
      </span>
      <span>−</span>
      <span>
        経費 <strong>{yen(expense)}</strong>
      </span>
      <span>＝</span>
      <span style={{ color: profitColor(profit) }}>
        利益 <strong>{signed(profit)}</strong>
      </span>
    </div>
  );
}

// ---- 月ごとの収支 ----
export function MonthSummary({
  totals,
  breakdown,
}: {
  totals: MonthTotals;
  breakdown: { name: string; amount: number }[]; // 経費の内訳（金額の大きい順）
}) {
  const margin = totals.sales > 0 ? Math.round((totals.profit / totals.sales) * 1000) / 10 : null;
  return (
    <div>
      <div className="month-profit" style={{ color: profitColor(totals.profit) }}>
        {totals.profit < 0 && <span className="month-profit-label">赤字　</span>}
        利益 {signed(totals.profit)}
      </div>
      {margin !== null && (
        <p className="muted small" style={{ textAlign: "center", margin: "0 0 8px" }}>
          利益率 {margin}%
        </p>
      )}
      <div className="month-cols">
        <div>
          <div className="muted small">売上</div>
          <strong>{yen(totals.sales)}</strong>
        </div>
        <div>
          <div className="muted small">経費</div>
          <strong>{yen(totals.expense)}</strong>
        </div>
      </div>
      <p className="muted small" style={{ textAlign: "center", margin: "8px 0 0" }}>
        日報 {totals.days}日分
      </p>
      {breakdown.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong className="small">経費の内訳</strong>
          <div className="slot-list">
            {breakdown.map((b) => (
              <div key={b.name} className="slot-row" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{b.name}</span>
                <span>{yen(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 直近6か月の売上・経費・利益（棒グラフ＋数字の一覧） ----
export function SixMonthChart({
  months,
  selected,
  onSelect,
}: {
  months: MonthTotals[]; // 古い月から順に
  selected: string;
  onSelect: (month: string) => void;
}) {
  const W = 600;
  const H = 260;
  const padT = 14;
  const padB = 34;
  const maxV = Math.max(1, ...months.flatMap((m) => [m.sales, m.expense, m.profit]));
  const minV = Math.min(0, ...months.map((m) => m.profit));
  const span = maxV - minV || 1;
  const y = (v: number) => padT + ((maxV - v) / span) * (H - padT - padB);
  const y0 = y(0);
  const groupW = W / months.length;
  const barW = Math.min(30, groupW / 4);
  const gap = 4;

  const bar = (cx: number, v: number, color: string, label: string) => {
    const top = Math.min(y(v), y0);
    const h = Math.max(Math.abs(y(v) - y0), v === 0 ? 0 : 1);
    return (
      <rect x={cx} y={top} width={barW} height={h} fill={color} rx={3}>
        <title>{label}</title>
      </rect>
    );
  };

  return (
    <div>
      <div className="chart-legend">
        <span>
          <i style={{ background: "var(--primary)" }} />
          売上
        </span>
        <span>
          <i style={{ background: EXPENSE_COLOR }} />
          経費
        </span>
        <span>
          <i style={{ background: PROFIT_COLOR }} />
          利益
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="直近6か月の売上・経費・利益">
        <line x1={0} x2={W} y1={y0} y2={y0} stroke="var(--line)" strokeWidth={2} />
        {months.map((m, i) => {
          const gx = i * groupW + (groupW - (barW * 3 + gap * 2)) / 2;
          const isSel = m.month === selected;
          return (
            <g key={m.month}>
              {isSel && <rect x={i * groupW + 4} y={0} width={groupW - 8} height={H - padB + 6} fill="var(--primary-light)" rx={8} />}
              {bar(gx, m.sales, "var(--primary)", `${m.month} 売上 ${yen(m.sales)}`)}
              {bar(gx + barW + gap, m.expense, EXPENSE_COLOR, `${m.month} 経費 ${yen(m.expense)}`)}
              {bar(gx + (barW + gap) * 2, m.profit, m.profit < 0 ? LOSS_COLOR : PROFIT_COLOR, `${m.month} 利益 ${signed(m.profit)}`)}
              <text x={i * groupW + groupW / 2} y={H - 10} textAnchor="middle" fontSize={20} fontWeight={isSel ? 800 : 500} fill="var(--text)">
                {Number(m.month.slice(5))}月
              </text>
            </g>
          );
        })}
      </svg>

      <table className="six-table">
        <thead>
          <tr>
            <th>月</th>
            <th>売上</th>
            <th>経費</th>
            <th>利益</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => (
            <tr key={m.month} className={m.month === selected ? "sel" : ""} onClick={() => onSelect(m.month)}>
              <td>{m.month.replace("-", "/")}</td>
              <td>{yen(m.sales)}</td>
              <td>{yen(m.expense)}</td>
              <td style={{ color: profitColor(m.profit), fontWeight: 700 }}>{signed(m.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- 経費の項目の登録（カフェ管理人のみ） ----
export function CafeExpenseSettings({
  items,
  onChange,
}: {
  items: CafeExpenseItem[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function add() {
    if (!name.trim()) return;
    addCafeExpenseItem(name);
    setName("");
    onChange();
  }

  function saveEdit() {
    if (!editName.trim()) return alert("項目名を入力してください");
    updateCafeExpenseItem(editingId!, editName);
    setEditingId(null);
    onChange();
  }

  return (
    <div className="settings-card" style={{ margin: "20px 0" }}>
      <h3>経費の項目の登録</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        仕入れやガス代など、日報の経費で選ぶ項目を登録しておきます。
        項目を削除したり名前を変えても、保存済みの日報の表示は変わりません。
      </p>

      {items.length === 0 ? (
        <p className="muted small">まだ項目が登録されていません（例: コーヒー豆・牛乳・ガス代）。</p>
      ) : (
        <div className="slot-list">
          {items.map((i) => (
            <div key={i.id} className="slot-row">
              {editingId === i.id ? (
                <div className="expense-edit">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="項目名" />
                  <button className="ghost mini" onClick={() => setEditingId(null)}>
                    キャンセル
                  </button>
                  <button className="primary mini" onClick={saveEdit}>
                    保存
                  </button>
                </div>
              ) : (
                <>
                  <div className="reservation-head">
                    <span className="avail-chip">{i.name}</span>
                  </div>
                  <div className="event-actions">
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditingId(i.id);
                        setEditName(i.name);
                      }}
                    >
                      編集
                    </button>
                    <button
                      className="ghost danger"
                      onClick={() => {
                        if (confirm(`経費の項目「${i.name}」を削除しますか？`)) {
                          deleteCafeExpenseItem(i.id);
                          onChange();
                        }
                      }}
                    >
                      削除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="expense-edit" style={{ marginTop: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="例: コーヒー豆"
          aria-label="新しい項目名"
        />
        <button className="primary mini" onClick={add}>
          ＋ 追加
        </button>
      </div>
    </div>
  );
}
