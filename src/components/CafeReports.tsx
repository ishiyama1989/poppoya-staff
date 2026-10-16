import { useState } from "react";
import type { CafeMenuItem, CafeReport, User } from "../types";
import {
  addCafeMenuItem,
  cafeReportOn,
  deleteCafeMenuItem,
  deleteCafeReport,
  getCafeMenuItems,
  getCafeReports,
  getUsers,
  saveCafeReport,
  updateCafeMenuItem,
} from "../store";
import { WEEKDAYS, todayStr } from "../lib/date";
import { sendPushToUsers } from "../lib/push";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${date.replace(/-/g, "/")}（${WEEKDAYS[d.getDay()]}）`;
}

// "2026-10" を前後の月へ動かす
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  const [date, setDate] = useState(todayStr());
  // 数量は入力途中の文字列のまま持ち、保存・集計のときだけ数値にする
  const [qtys, setQtys] = useState<Record<string, string>>(
    () => qtysOf(cafeReportOn(todayStr()))
  );
  const [note, setNote] = useState(() => cafeReportOn(todayStr())?.note ?? "");
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(todayStr().slice(0, 7));

  function refresh() {
    setVersion((v) => v + 1);
  }

  function qtysOf(r: CafeReport | null): Record<string, string> {
    return Object.fromEntries((r?.items ?? []).map((i) => [i.menuId, String(i.qty)]));
  }

  // 日付を切り替えたら、その日の日報があれば入力欄に読み込む
  function loadDate(d: string) {
    const r = cafeReportOn(d);
    setDate(d);
    setQtys(qtysOf(r));
    setNote(r?.note ?? "");
    setMessage("");
  }

  const qtyOf = (id: string) => Math.max(0, Math.floor(Number(qtys[id]) || 0));

  // 入力欄の行：登録中の販売商品 ＋ すでに日報にあるが商品が削除された行。
  // 日報にある商品の価格は、保存時点の価格を使う（あとから価格を変えても過去の売上が動かない）。
  const saved = cafeReportOn(date);
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

  function save() {
    if (!date) return alert("日付を選んでください");
    const items = rows
      .filter((r) => qtyOf(r.id) > 0)
      .map((r) => ({ menuId: r.id, name: r.name, price: r.price, qty: qtyOf(r.id) }));
    if (items.length === 0 && !note.trim())
      return alert("売れた商品か、1日の様子を入力してください");
    const { isNew } = saveCafeReport({ userId: me.id, date, items, note });
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
  const monthReports = getCafeReports().filter((r) => r.date.startsWith(month));
  const monthSales = monthReports.reduce((s, r) => s + r.sales, 0);
  const byItem = new Map<string, { name: string; qty: number; sales: number }>();
  for (const r of monthReports)
    for (const i of r.items) {
      const cur = byItem.get(i.menuId) ?? { name: i.name, qty: 0, sales: 0 };
      cur.qty += i.qty;
      cur.sales += i.price * i.qty;
      byItem.set(i.menuId, cur);
    }
  const itemRanking = [...byItem.values()].sort((a, b) => b.qty - a.qty);
  const [my, mm] = month.split("-");
  const isCurrentMonth = month >= todayStr().slice(0, 7);

  return (
    <div className="requests-view">
      <div className="section-head">
        <h2>カフェ日報</h2>
        <p className="muted">
          {canEdit
            ? "売れた商品の数と、1日の様子を記録します。売上は自動で計算されます。"
            : "カフェ管理人が記入した日報を確認できます（閲覧のみ）。"}
        </p>
      </div>

      {/* 月間売上 */}
      <div className="settings-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="ghost mini" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <h3 style={{ margin: 0 }}>
            {my}年{Number(mm)}月の売上合計
          </h3>
          <button
            className="ghost mini"
            disabled={isCurrentMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: "var(--primary)",
            textAlign: "center",
            margin: "10px 0 2px",
          }}
        >
          {yen(monthSales)}
        </div>
        <p className="muted small" style={{ textAlign: "center", margin: 0 }}>
          日報 {monthReports.length}日分
        </p>
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

      {/* 日報の入力（カフェ管理人のみ） */}
      {canEdit && (
      <div className="event-form" style={{ marginBottom: 20 }}>
        <label>
          日付
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => e.target.value && loadDate(e.target.value)}
          />
        </label>
        {saved && (
          <p className="muted small" style={{ margin: "0 0 6px" }}>
            この日の日報はすでにあります。保存すると上書きされます。
          </p>
        )}

        <label style={{ marginTop: 6 }}>売れた商品（数を入力）</label>
        {rows.length === 0 ? (
          <p className="muted small">
            まだ販売商品が登録されていません。下の「販売商品の登録」から追加してください。
          </p>
        ) : (
          <div className="slot-list">
            {rows.map((r) => (
              <div
                key={r.id}
                className="slot-row"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>
                  {r.name}
                  <span className="muted small"> （{yen(r.price)}）</span>
                  {r.removed && <span className="tag muted"> 登録解除済み</span>}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={qtys[r.id] ?? ""}
                    onChange={(e) => setQtys((cur) => ({ ...cur, [r.id]: e.target.value }))}
                    style={{ width: 70 }}
                  />
                  個
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: "10px 0 0", fontWeight: 700 }}>この日の売上: {yen(total)}</p>

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
              {r.items.length > 0 && (
                <div className="req-card-meta">
                  {r.items.map((i) => `${i.name} × ${i.qty}`).join("、")}
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
        <div className="slot-list">
          {menu.map((m) => (
            <div key={m.id} className="slot-row">
              <div className="reservation-head">
                <span className="avail-chip">{m.name}</span>
                <span className="tag">{yen(m.price)}</span>
              </div>
              <div className="event-actions">
                <button className="ghost" onClick={() => setEditing(m)}>
                  編集
                </button>
                <button
                  className="ghost danger"
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
        <CafeMenuEditor
          value={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            onChange();
          }}
        />
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
