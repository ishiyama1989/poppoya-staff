import { useState } from "react";
import type { CafeMenuItem, CafeReport, User } from "../types";
import {
  addCafeMenuItem,
  cafeReportOn,
  deleteCafeMenuItem,
  cafeHoursOn,
  deleteCafeReport,
  getCafeExpenseItems,
  getCafeHours,
  getCafeMenuItems,
  getCafeOrders,
  getCafeProducts,
  getCafeReports,
  getUsers,
  saveCafeReport,
  updateCafeMenuItem,
} from "../store";
import { WEEKDAYS, todayStr } from "../lib/date";
import { sendPushToUsers } from "../lib/push";
import EditModal from "./EditModal";
import QtyTile, { applyQty, type QtyUpdate } from "./QtyTile";
import {
  CafeExpenseSettings,
  DayBalance,
  ExpenseEditor,
  MonthSummary,
  SixMonthChart,
  expenseOf,
  expenseLabel,
  expensesFromRows,
  productExpenses,
  productLines,
  productsTotal,
  profitColor,
  profitOf,
  rowsFromExpenses,
  rowsTotal,
  shiftMonth,
  totalsFor,
  yen,
  type ExpenseRow,
} from "./CafeFinance";

// 営業時間・メモの表示用（日報の入力画面と一覧で、目立つ枠に大きく出す）
function HoursInfo({
  openTime,
  closeTime,
  note,
  compact,
}: {
  openTime?: string;
  closeTime?: string;
  note?: string;
  compact?: boolean;
}) {
  if (!openTime && !closeTime && !note) return null;
  return (
    <div className={`hours-box ${compact ? "compact" : ""}`}>
      {(openTime || closeTime) && (
        <div className="hours-time">
          🕘 営業時間 {openTime}〜{closeTime}
        </div>
      )}
      {note && <div className="hours-memo">📝 営業メモ: {note}</div>}
    </div>
  );
}

function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${date.replace(/-/g, "/")}（${WEEKDAYS[d.getDay()]}）`;
}

// LOCOMO CAFEの日報（オーナー・カフェ管理人）。
// 売れた商品の数を入力すると売上が自動で計算され、月ごとの売上合計も確認できる。
export default function CafeReports({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  void version;
  // 記入・編集・削除ができるのはカフェ管理人だけ。オーナーは閲覧のみ。
  const canEdit = me.role === "cafe_manager";
  const users = getUsers();
  const menu = getCafeMenuItems();
  const categories = getCafeExpenseItems();
  const products = getCafeProducts();

  // 日報を書けるのは、カフェの営業が登録されている日（今日まで）。
  // すでに日報がある日は、営業登録がなくても編集できるよう選択肢に含める。
  const today = todayStr();
  const reportDates = new Set(getCafeReports().map((r) => r.date));
  const selectableDates = [
    ...new Set([
      ...getCafeHours().map((c) => c.date).filter((d) => d <= today),
      ...reportDates,
    ]),
  ].sort((a, b) => (a < b ? 1 : -1));

  const [date, setDate] = useState(() =>
    selectableDates.includes(today) ? today : (selectableDates[0] ?? "")
  );
  // 数量は入力途中の文字列のまま持ち、保存・集計のときだけ数値にする
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const d = selectableDates.includes(today) ? today : (selectableDates[0] ?? "");
    return qtysOf(d ? cafeReportOn(d) : null);
  });
  const [note, setNote] = useState(() => {
    const d = selectableDates.includes(today) ? today : (selectableDates[0] ?? "");
    return d ? (cafeReportOn(d)?.note ?? "") : "";
  });
  // 仕入れ・経費の入力行（金額は入力途中の文字列のまま持つ）
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(() => {
    const d = selectableDates.includes(today) ? today : (selectableDates[0] ?? "");
    return rowsFromExpenses(d ? cafeReportOn(d)?.expenses : undefined, getCafeExpenseItems());
  });
  // 発注商品の仕入れ数量（入力途中の文字列）と、単価未設定の商品の金額
  const [productQtys, setProductQtys] = useState<Record<string, string>>(() => {
    const d = selectableDates.includes(today) ? today : (selectableDates[0] ?? "");
    return qtysOfExpenses(d ? cafeReportOn(d)?.expenses : undefined);
  });
  const [productAmts, setProductAmts] = useState<Record<string, string>>(() => {
    const d = selectableDates.includes(today) ? today : (selectableDates[0] ?? "");
    return amtsOfExpenses(d ? cafeReportOn(d)?.expenses : undefined);
  });
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(todayStr().slice(0, 7));

  function refresh() {
    setVersion((v) => v + 1);
  }

  function qtysOf(r: CafeReport | null): Record<string, string> {
    return Object.fromEntries((r?.items ?? []).map((i) => [i.menuId, String(i.qty)]));
  }

  function qtysOfExpenses(list: CafeReport["expenses"]): Record<string, string> {
    return Object.fromEntries(
      (list ?? []).filter((e) => e.productId).map((e) => [e.productId!, String(e.qty ?? 0)])
    );
  }
  // 単価がなかった商品の金額は、保存した金額を入れ直す
  function amtsOfExpenses(list: CafeReport["expenses"]): Record<string, string> {
    return Object.fromEntries(
      (list ?? [])
        .filter((e) => e.productId && e.unitPrice === undefined)
        .map((e) => [e.productId!, String(e.amount)])
    );
  }

  // 日付を切り替えたら、その日の日報があれば入力欄に読み込む
  function loadDate(d: string) {
    const r = cafeReportOn(d);
    setDate(d);
    setQtys(qtysOf(r));
    setNote(r?.note ?? "");
    setExpenseRows(rowsFromExpenses(r?.expenses, categories));
    setProductQtys(qtysOfExpenses(r?.expenses));
    setProductAmts(amtsOfExpenses(r?.expenses));
    setMessage("");
  }

  const qtyOf = (id: string) => Math.max(0, Math.floor(Number(qtys[id]) || 0));

  // 入力欄の行：登録中の販売商品 ＋ すでに日報にあるが商品が削除された行。
  // 日報にある商品の価格は、保存時点の価格を使う（あとから価格を変えても過去の売上が動かない）。
  const saved = date ? cafeReportOn(date) : null;
  const savedById = new Map((saved?.items ?? []).map((i) => [i.menuId, i]));
  const rows = [
    ...menu.map((m) => ({
      id: m.id,
      name: m.name,
      price: savedById.get(m.id)?.price ?? m.price,
      removed: false,
    })),
    ...(saved?.items ?? [])
      .filter((i) => !menu.some((m) => m.id === i.menuId))
      .map((i) => ({ id: i.menuId, name: i.name, price: i.price, removed: true })),
  ];
  const total = rows.reduce((sum, r) => sum + r.price * qtyOf(r.id), 0);

  // 仕入れの行（発注商品）。保存済みの日報にある商品は、保存時点の単価で表示する
  const pLines = productLines(products, saved?.expenses);
  const expenseTotal = productsTotal(pLines, productQtys, productAmts) + rowsTotal(expenseRows);

  const setQty = (id: string, next: QtyUpdate) => setQtys((cur) => applyQty(cur, id, next));

  function save() {
    if (!date) return alert("日付を選んでください");
    const items = rows
      .filter((r) => qtyOf(r.id) > 0)
      .map((r) => ({ menuId: r.id, name: r.name, price: r.price, qty: qtyOf(r.id) }));
    const exp = expensesFromRows(expenseRows, categories);
    if (!exp.ok) return alert(exp.error);
    // 単価がない商品は、金額が入っていないと経費が0円になってしまうので確認する
    const missing = pLines.find(
      (l) => l.unitPrice === undefined && Number(productQtys[l.id]) > 0 && !(Number(productAmts[l.id]) > 0)
    );
    if (missing) return alert(`「${missing.name}」は単価が未設定です。金額を入力してください`);
    const expenses = [...productExpenses(pLines, productQtys, productAmts), ...exp.expenses];
    if (items.length === 0 && expenses.length === 0 && !note.trim())
      return alert("売れた商品・経費・1日の様子のどれかを入力してください");
    const res = saveCafeReport({ userId: me.id, date, items, expenses, note });
    if (!res.ok) return alert(res.error);
    const { isNew } = res;
    if (isNew) {
      const owners = users.filter((u) => u.role === "owner").map((u) => u.id);
      const sales = items.reduce((s, i) => s + i.price * i.qty, 0);
      sendPushToUsers(
        owners,
        "カフェの日報が届きました",
        `${me.name}さん: ${date.slice(5).replace("-", "/")}の売上 ${yen(sales)}`,
        "/"
      );
    }
    setMessage(isNew ? "日報を保存しました" : "日報を更新しました");
    refresh();
  }

  // ---- 月ごとの集計 ----
  const allReports = getCafeReports();
  const monthReports = allReports.filter((r) => r.date.startsWith(month));
  const monthTotals = totalsFor(allReports, month);
  const byItem = new Map<string, { name: string; qty: number; sales: number }>();
  for (const r of monthReports)
    for (const i of r.items) {
      const cur = byItem.get(i.menuId) ?? { name: i.name, qty: 0, sales: 0 };
      cur.qty += i.qty;
      cur.sales += i.price * i.qty;
      byItem.set(i.menuId, cur);
    }
  // 経費の内訳（項目名ごと）
  const byExpense = new Map<string, { name: string; amount: number; qty?: number; unit?: string }>();
  for (const r of monthReports)
    for (const e of r.expenses ?? []) {
      const key = e.productId ?? e.name;
      const cur = byExpense.get(key) ?? { name: e.name, amount: 0, qty: e.productId ? 0 : undefined, unit: e.unit };
      cur.amount += e.amount;
      if (e.productId) cur.qty = (cur.qty ?? 0) + (e.qty ?? 0);
      byExpense.set(key, cur);
    }
  const expenseBreakdown = [...byExpense.values()].sort((a, b) => b.amount - a.amount);
  // 直近6か月（選んでいる月まで）
  const sixMonths = [-5, -4, -3, -2, -1, 0].map((d) => totalsFor(allReports, shiftMonth(month, d)));
  const itemRanking = [...byItem.values()].sort((a, b) => b.qty - a.qty);
  const [my, mm] = month.split("-");
  const isCurrentMonth = month >= todayStr().slice(0, 7);

  return (
    <div className="requests-view">
      <div className="section-head">
        <h2>カフェ日報</h2>
        <p className="muted">
          {canEdit
            ? "売れた商品の数・仕入れや経費・1日の様子を記録します。売上と利益は自動で計算されます。"
            : "カフェ管理人が記入した日報を確認できます（閲覧のみ）。"}
        </p>
      </div>

      {/* 月ごとの収支 */}
      <div className="settings-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="ghost mini" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <h3 style={{ margin: 0 }}>
            {my}年{Number(mm)}月の収支
          </h3>
          <button
            className="ghost mini"
            disabled={isCurrentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        <MonthSummary totals={monthTotals} breakdown={expenseBreakdown} />
        {itemRanking.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong className="small">商品別（売れた順）</strong>
            <div className="slot-list">
              {itemRanking.map((i) => (
                <div
                  key={i.name}
                  className="slot-row"
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>
                    {i.name} × {i.qty}
                  </span>
                  <span>{yen(i.sales)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 直近6か月の推移 */}
      <div className="settings-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>直近6か月の売上・経費・利益</h3>
        <SixMonthChart months={sixMonths} selected={month} onSelect={setMonth} />
      </div>

      {/* 日報の入力（カフェ管理人のみ） */}
      {canEdit && selectableDates.length === 0 && (
        <p className="muted" style={{ marginBottom: 20 }}>
          日報を書けるのは、LOCOMO CAFEの営業が登録されている日だけです。
          カレンダーで営業時間を登録すると、その日から日報を書けます。
        </p>
      )}
      {canEdit && selectableDates.length > 0 && (
      <div className="event-form" style={{ marginBottom: 20 }}>
        <label>
          日付（カフェの営業日）
          <select value={date} onChange={(e) => loadDate(e.target.value)}>
            {selectableDates.map((d) => (
              <option key={d} value={d}>
                {dateLabel(d)}
                {reportDates.has(d) ? "　記入済み" : ""}
              </option>
            ))}
          </select>
        </label>
        {/* その日のカレンダー登録（営業時間・メモ）。日報に一緒に保存される */}
        {(() => {
          const live = cafeHoursOn(date);
          return live ? (
            <HoursInfo openTime={live.openTime} closeTime={live.closeTime} note={live.note} />
          ) : (
            <HoursInfo openTime={saved?.openTime} closeTime={saved?.closeTime} note={saved?.hoursNote} />
          );
        })()}
        {saved && (
          <p className="muted small" style={{ margin: "0 0 6px" }}>
            この日の日報はすでにあります。保存すると上書きされます。
          </p>
        )}

        <label style={{ marginTop: 6 }}>売れた商品（＋／−で数を入力）</label>
        {rows.length === 0 ? (
          <p className="muted small">
            まだ販売商品が登録されていません。下の「販売商品の登録」から追加してください。
          </p>
        ) : (
          <div className="sold-grid">
            {rows.map((r) => (
              <QtyTile
                key={r.id}
                name={
                  <>
                    {r.name}
                    {r.removed && <span className="tag muted"> 登録解除済み</span>}
                  </>
                }
                lines={[yen(r.price)]}
                value={qtys[r.id] ?? ""}
                unit="個"
                onChange={(next) => setQty(r.id, next)}
              />
            ))}
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontWeight: 700 }}>この日の売上: {yen(total)}</p>

        <ExpenseEditor
          rows={expenseRows}
          onChange={setExpenseRows}
          categories={categories}
          lines={pLines}
          qtys={productQtys}
          amounts={productAmts}
          onQtyChange={(id, next) => setProductQtys((cur) => applyQty(cur, id, next))}
          onAmountChange={(id, v) => setProductAmts((cur) => ({ ...cur, [id]: v }))}
          onCategoriesChanged={refresh}
          orders={getCafeOrders().filter((o) => o.cafeDate === date && o.totalAmount !== undefined)}
        />
        <DayBalance sales={total} expense={expenseTotal} />

        <label style={{ marginTop: 10 }}>
          1日の様子
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="例: 午前は落ち着いていて、昼から団体のお客様が来店。ラテがよく出ました。"
          />
        </label>
        {message && (
          <p className="muted small" style={{ color: "var(--success, #0f6b42)", margin: "6px 0 0" }}>
            ✓ {message}
          </p>
        )}
        <div className="form-actions">
          <button className="primary" onClick={save}>
            日報を保存
          </button>
        </div>
      </div>
      )}

      {/* 日報の一覧 */}
      <h3 className="req-section-title">
        {my}年{Number(mm)}月の日報
      </h3>
      {monthReports.length === 0 ? (
        <p className="muted">この月の日報はまだありません。</p>
      ) : (
        <div className="req-cards">
          {monthReports.map((r) => (
            <div key={r.id} className="req-card">
              <div className="req-card-head">
                <span className="req-date">{dateLabel(r.date)}</span>
                <span className="req-status approved">売上 {yen(r.sales)}</span>
              </div>
              <div className="req-card-meta" style={{ fontWeight: 700 }}>
                経費 {yen(expenseOf(r))} ／{" "}
                <span style={{ color: profitColor(profitOf(r)) }}>
                  利益 {profitOf(r) < 0 ? "−" : ""}
                  {yen(Math.abs(profitOf(r)))}
                </span>
              </div>
              {(() => {
                // この機能の追加前に保存した日報は、カレンダーの登録を代わりに表示する
                const h = r.openTime || r.closeTime || r.hoursNote ? null : cafeHoursOn(r.date);
                return (
                  <HoursInfo
                    openTime={h ? h.openTime : r.openTime}
                    closeTime={h ? h.closeTime : r.closeTime}
                    note={h ? h.note : r.hoursNote}
                    compact
                  />
                );
              })()}
              {r.items.length > 0 && (
                <div className="req-card-meta">
                  {r.items.map((i) => `${i.name} × ${i.qty}`).join("、")}
                </div>
              )}
              {(r.expenses ?? []).length > 0 && (
                <div className="req-card-meta">
                  仕入れ・経費: {(r.expenses ?? []).map((e) => `${expenseLabel(e)} ${yen(e.amount)}`).join("、")}
                </div>
              )}
              {r.note && <div className="req-card-note">{r.note}</div>}
              <div className="req-card-meta">
                記入: {users.find((u) => u.id === r.userId)?.name ?? "不明"}（
                {new Date(r.updatedAt).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                ）
              </div>
              {canEdit && (
                <div className="req-card-actions">
                  <button
                    className="ghost danger"
                    onClick={() => {
                      if (confirm(`${dateLabel(r.date)}の日報を削除しますか？`)) {
                        deleteCafeReport(r.id);
                        refresh();
                      }
                    }}
                  >
                    削除
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      loadDate(r.date);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    編集
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && <CafeMenuSettings menu={menu} onChange={refresh} />}
      {canEdit && <CafeExpenseSettings items={categories} onChange={refresh} />}
    </div>
  );
}

// 販売商品（メニュー）の登録・編集・削除
function CafeMenuSettings({ menu, onChange }: { menu: CafeMenuItem[]; onChange: () => void }) {
  const [editing, setEditing] = useState<CafeMenuItem | "new" | null>(null);

  return (
    <div className="settings-card" style={{ margin: "20px 0" }}>
      <h3>販売商品の登録</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        カフェで売っている商品を登録しておくと、日報で売れた数を入力できます。
        商品を削除したり価格を変えても、保存済みの日報の売上は変わりません。
      </p>

      {menu.length === 0 ? (
        <p className="muted small">まだ商品が登録されていません。</p>
      ) : (
        <div className="manage-grid">
          {menu.map((m) => (
            <div key={m.id} className="manage-tile">
              <div className="manage-name">{m.name}</div>
              <div className="manage-sub">{yen(m.price)}</div>
              <div className="manage-actions">
                <button className="ghost mini" onClick={() => setEditing(m)}>
                  編集
                </button>
                <button
                  className="ghost danger mini"
                  onClick={() => {
                    if (confirm(`販売商品「${m.name}」を削除しますか？`)) {
                      deleteCafeMenuItem(m.id);
                      onChange();
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!editing && (
        <button className="ghost mini" onClick={() => setEditing("new")}>
          ＋ 商品を追加
        </button>
      )}
      {editing && (
        <EditModal
          title={editing === "new" ? "販売商品を追加" : "販売商品を編集"}
          onClose={() => setEditing(null)}
        >
          <CafeMenuEditor
            key={editing === "new" ? "new" : editing.id}
            value={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={() => {
              setEditing(null);
              onChange();
            }}
          />
        </EditModal>
      )}
    </div>
  );
}

function CafeMenuEditor({
  value,
  onCancel,
  onSave,
}: {
  value: CafeMenuItem | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  // 手入力しやすいよう文字列のまま保持し、保存時にだけ数値へ変換する
  const [price, setPrice] = useState(value ? String(value.price) : "");

  function save() {
    if (!name.trim()) return alert("商品名を入力してください");
    const p = Number(price);
    if (price.trim() === "" || !Number.isFinite(p) || p < 0)
      return alert("価格は0以上の数字で入力してください");
    const input = { name, price: Math.round(p) };
    if (value) updateCafeMenuItem(value.id, input);
    else addCafeMenuItem(input);
    onSave();
  }

  return (
    <div className="event-form">
      <label>
        商品名
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: カフェラテ"
          autoFocus
        />
      </label>
      <label>
        販売価格（円）
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="例: 550"
        />
      </label>
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button className="primary" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
