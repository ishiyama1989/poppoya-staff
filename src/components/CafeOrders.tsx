import { useState } from "react";
import {
  CAFE_ORDER_STATUS_LABEL,
  CAFE_PRODUCT_UNITS,
  CAFE_PRODUCT_UNIT_LABEL,
  type CafeProduct,
  type CafeProductUnit,
  type User,
} from "../types";
import {
  addCafeOrder,
  addCafeProduct,
  approveCancelCafeOrder,
  deleteCafeOrder,
  deleteCafeProduct,
  getCafeHours,
  getCafeOrders,
  getCafeProducts,
  getUsers,
  rejectCancelCafeOrder,
  requestCancelCafeOrder,
  toggleCafeOrderDone,
  updateCafeOrderDeadline,
  updateCafeProduct,
} from "../store";
import { addDays, todayStr } from "../lib/date";
import { sendPushToUsers } from "../lib/push";
import { baseQty, formatPrice, priceLabel, stepOf } from "../lib/cafeProduct";
import EditModal from "./EditModal";
import QtyTile, { applyQty, type QtyUpdate } from "./QtyTile";

// タイルに出す補足（発注先・単価・締切）。1項目1行にして、途中で折り返さないようにする
function tileLines(p: CafeProduct, deadline?: string | null): string[] {
  return [
    p.supplier ? `発注先: ${p.supplier}` : "",
    p.unitPrice !== undefined ? `単価 ${priceLabel(p)}` : "",
    deadline ? `締切 ${deadline.slice(5).replace("-", "/")}` : `${p.leadDays}日前までに発注`,
  ].filter(Boolean);
}

// 選んだ商品の概算合計。単価が未設定の商品は含めず、その件数も返す。
function estimateTotal(
  selected: CafeProduct[],
  countOf: (id: string) => number
): { total: number; unpriced: number } {
  let total = 0;
  let unpriced = 0;
  for (const p of selected) {
    if (p.unitPrice === undefined) unpriced++;
    else total += (p.unitPrice / baseQty(p)) * countOf(p.id);
  }
  return { total: Math.round(total), unpriced };
}

// 概算合計の表示（フォーム用）。何も選んでいなければ出さない。
function EstimateLine({ total, unpriced }: { total: number; unpriced: number }) {
  return (
    <p className="muted small" style={{ margin: "8px 0 0" }}>
      概算合計: <strong>{total.toLocaleString("ja-JP")}円</strong>
      {unpriced > 0 && `（単価が未設定の${unpriced}商品は含みません）`}
    </p>
  );
}

// LOCOMO CAFEの発注（カフェ管理人 → オーナー）
// カフェ管理人・オーナーで発注できる商品を登録しておき、
// カフェ管理人はその中から数量を選んで発注する。
export default function CafeOrders({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const users = getUsers();
  const orders = getCafeOrders();
  const products = getCafeProducts();
  const isOwner = me.role === "owner";

  // カレンダーに登録済みのLOCOMO CAFE営業日（今日以降）から選ぶ
  const today = todayStr();
  const upcomingCafeDates = getCafeHours()
    .filter((c) => c.date >= today)
    .map((c) => c.date)
    .sort();

  // 発注済みの内容に、あとから対象日・締切日を設定/修正する（オーナーのみ）
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [deadlineCafeDate, setDeadlineCafeDate] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");

  function startEditDeadline(o: (typeof orders)[number]) {
    setEditingDeadlineId(o.id);
    setDeadlineCafeDate(o.cafeDate ?? "");
    setDeadlineDate(o.deadline ?? "");
  }

  function saveDeadline() {
    if (!deadlineDate) return alert("発注締切日を入力してください");
    updateCafeOrderDeadline(editingDeadlineId!, deadlineCafeDate, deadlineDate);
    setEditingDeadlineId(null);
    refresh();
  }

  // 入力中に桁がおかしくならないよう、数量は文字列のまま保持し
  // 送信時にだけ数値へ変換する（毎キー入力で丸めると手入力しづらくなるため）。
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [cafeDate, setCafeDate] = useState("");

  function refresh() {
    setVersion((v) => v + 1);
  }
  void version;

  function setCount(id: string, next: QtyUpdate) {
    setCounts((cur) => applyQty(cur, id, next));
  }

  function countOf(id: string): number {
    const n = Number(counts[id]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // その商品を、選んだカフェ営業日までに発注する場合の締切日
  function deadlineFor(p: CafeProduct): string | null {
    if (!cafeDate) return null;
    return addDays(cafeDate, -p.leadDays);
  }

  function send() {
    if (!cafeDate) return alert("対象のカフェ営業日を選択してください");
    const selected = products.filter((p) => countOf(p.id) > 0);
    if (selected.length === 0) return alert("発注する商品を選択してください");
    const items = selected
      .map((p) => `${p.name} ${countOf(p.id)}${CAFE_PRODUCT_UNIT_LABEL[p.unit]}`)
      .join("、");
    // 複数商品をまとめて発注する場合、一番厳しい（早い）締切に合わせる
    const deadline = selected
      .map((p) => deadlineFor(p)!)
      .sort()[0];
    const est = estimateTotal(selected, countOf);
    const hasPrice = selected.some((p) => p.unitPrice !== undefined);
    addCafeOrder(me.id, items, note, cafeDate, deadline, hasPrice ? est.total : undefined);
    const owners = users.filter((u) => u.role === "owner").map((u) => u.id);
    sendPushToUsers(
      owners,
      "カフェの発注が届きました",
      `${me.name}さんから発注: ${items.slice(0, 40)}（${cafeDate.slice(5).replace("-", "/")}分・締切${deadline.slice(5).replace("-", "/")}）`,
      "/"
    );
    setCounts({});
    setNote("");
    setCafeDate("");
    refresh();
  }

  const myOrders = orders.filter((o) => o.userId === me.id);
  const visibleOrders = isOwner ? orders : myOrders;

  return (
    <div className="requests-view">
      <div className="section-head">
        <h2>カフェの発注</h2>
        <p className="muted">
          {isOwner
            ? "カフェ管理人から届いた発注を確認し、対応したら「対応済みにする」を押してください。"
            : "登録されている商品から、発注する数量を選んで送ります。"}
        </p>
      </div>

      {!isOwner && (
        <div className="event-form" style={{ marginBottom: 20 }}>
          <label>
            対象のカフェ営業日
            {upcomingCafeDates.length === 0 ? (
              <p className="muted small">
                今後のLOCOMO CAFE営業予定がありません。まずカレンダーで営業日を登録してください。
              </p>
            ) : (
              <select value={cafeDate} onChange={(e) => setCafeDate(e.target.value)}>
                <option value="">選択してください</option>
                {upcomingCafeDates.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/-/g, "/")}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label style={{ marginTop: 10 }}>発注する商品と数量</label>
          {products.length === 0 ? (
            <p className="muted small">
              まだ商品が登録されていません。下の「商品登録」から追加してください。
            </p>
          ) : (
            <div className="sold-grid">
              {products.map((p) => (
                <QtyTile
                  key={p.id}
                  name={p.name}
                  lines={tileLines(p, deadlineFor(p))}
                  value={counts[p.id] ?? ""}
                  unit={CAFE_PRODUCT_UNIT_LABEL[p.unit]}
                  step={stepOf(p)}
                  onChange={(next) => setCount(p.id, next)}
                />
              ))}
            </div>
          )}
          {(() => {
            const selected = products.filter((p) => countOf(p.id) > 0);
            if (selected.length === 0 || !selected.some((p) => p.unitPrice !== undefined)) return null;
            return <EstimateLine {...estimateTotal(selected, countOf)} />;
          })()}
          <label style={{ marginTop: 10 }}>
            メモ（任意）
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="例: 来週末までにお願いします"
            />
          </label>
          <div className="form-actions">
            <button className="primary" onClick={send} disabled={products.length === 0}>
              発注を送る
            </button>
          </div>
        </div>
      )}

      <h3 className="req-section-title">
        {isOwner ? "届いた発注" : "これまでの発注"}
      </h3>
      {visibleOrders.length === 0 ? (
        <p className="muted">発注はまだありません。</p>
      ) : (
        <div className="req-cards">
          {visibleOrders.map((o) => (
            <div key={o.id} className="req-card">
              <div className="req-card-head">
                <span className={`req-status ${o.status === "done" ? "approved" : "pending"}`}>
                  {CAFE_ORDER_STATUS_LABEL[o.status]}
                </span>
                <span className="req-date">
                  {new Date(o.createdAt).toLocaleString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {isOwner && (
                <div className="req-card-meta">
                  発注者: {users.find((u) => u.id === o.userId)?.name ?? "不明"}
                </div>
              )}
              <div className="req-card-title">{o.items}</div>
              {o.totalAmount !== undefined && (
                <div className="req-card-meta">
                  概算合計: {o.totalAmount.toLocaleString("ja-JP")}円
                </div>
              )}
              {o.cafeDate || o.deadline ? (
                <div className="req-card-meta">
                  {o.cafeDate && `対象日: ${o.cafeDate.replace(/-/g, "/")}`}
                  {o.cafeDate && o.deadline && " ／ "}
                  {o.deadline && `発注締切: ${o.deadline.replace(/-/g, "/")}`}
                </div>
              ) : (
                isOwner && (
                  <p className="muted small" style={{ margin: "4px 0" }}>
                    締切が未設定です（この発注はカレンダー営業日選択の機能追加前に作られました）
                  </p>
                )
              )}
              {o.note && <div className="req-card-note">{o.note}</div>}

              {o.cancelRequested && (
                <p className="muted small" style={{ margin: "4px 0", color: "var(--danger)" }}>
                  ⚠️ 取り消し依頼中です
                  {isOwner ? "（承認すると発注が削除されます）" : ""}
                </p>
              )}

              {isOwner && editingDeadlineId === o.id && (
                <div className="event-form" style={{ marginTop: 8 }}>
                  <label>
                    対象のカフェ営業日（任意）
                    <select
                      value={deadlineCafeDate}
                      onChange={(e) => setDeadlineCafeDate(e.target.value)}
                    >
                      <option value="">選択してください</option>
                      {upcomingCafeDates.map((d) => (
                        <option key={d} value={d}>
                          {d.replace(/-/g, "/")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    発注締切日
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                    />
                  </label>
                  <div className="form-actions">
                    <button className="ghost" onClick={() => setEditingDeadlineId(null)}>
                      キャンセル
                    </button>
                    <button className="primary" onClick={saveDeadline}>
                      保存
                    </button>
                  </div>
                </div>
              )}

              {isOwner && o.cancelRequested && (
                <div className="req-card-actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      rejectCancelCafeOrder(o.id);
                      refresh();
                    }}
                  >
                    依頼を却下する
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => {
                      if (confirm("取り消しを承認して、この発注を削除しますか？")) {
                        approveCancelCafeOrder(o.id);
                        refresh();
                      }
                    }}
                  >
                    承認して取り消す
                  </button>
                </div>
              )}

              {isOwner && (
                <div className="req-card-actions">
                  <button className="ghost" onClick={() => startEditDeadline(o)}>
                    {o.deadline ? "締切を編集" : "締切を設定"}
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => {
                      if (confirm("この発注を削除しますか？")) {
                        deleteCafeOrder(o.id);
                        refresh();
                      }
                    }}
                  >
                    削除
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      toggleCafeOrderDone(o.id);
                      refresh();
                    }}
                  >
                    {o.status === "done" ? "未対応に戻す" : "対応済みにする"}
                  </button>
                </div>
              )}

              {!isOwner && o.status === "pending" && (
                <div className="req-card-actions">
                  {o.cancelRequested ? (
                    <span className="muted small">オーナーの承認待ちです</span>
                  ) : (
                    <button
                      className="ghost danger"
                      onClick={() => {
                        if (!confirm("この発注の取り消しを依頼しますか？")) return;
                        requestCancelCafeOrder(o.id);
                        const owners = users
                          .filter((u) => u.role === "owner")
                          .map((u) => u.id);
                        sendPushToUsers(
                          owners,
                          "発注の取り消し依頼が届きました",
                          `${me.name}さんが発注の取り消しを依頼: ${o.items.slice(0, 40)}`,
                          "/"
                        );
                        refresh();
                      }}
                    >
                      取り消しを依頼する
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CafeProductSettings products={products} onChange={refresh} />
    </div>
  );
}

// 発注できる商品の登録・編集・削除（オーナー・カフェ管理人どちらも操作可）
function CafeProductSettings({
  products,
  onChange,
}: {
  products: CafeProduct[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<CafeProduct | "new" | null>(null);

  return (
    <div className="settings-card" style={{ marginBottom: 20 }}>
      <h3>商品登録</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        発注できる商品をあらかじめ登録しておきます。
      </p>

      {products.length === 0 ? (
        <p className="muted small">まだ商品が登録されていません。</p>
      ) : (
        <div className="manage-grid">
          {products.map((p) => (
            <div key={p.id} className="manage-tile">
              <div className="manage-name">
                {p.name}
                <span className="tag"> {CAFE_PRODUCT_UNIT_LABEL[p.unit]}単位</span>
              </div>
              {p.supplier && <div className="manage-sub">発注先: {p.supplier}</div>}
              <div className="manage-sub">
                {p.unitPrice !== undefined ? `単価 ${priceLabel(p)}` : "単価未設定"}
              </div>
              <div className="manage-sub">{p.leadDays}日前までに発注</div>
              <div className="manage-actions">
                <button className="ghost mini" onClick={() => setEditing(p)}>
                  編集
                </button>
                <button
                  className="ghost danger mini"
                  onClick={() => {
                    if (confirm(`商品「${p.name}」を削除しますか？`)) {
                      deleteCafeProduct(p.id);
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
          title={editing === "new" ? "発注商品を追加" : "発注商品を編集"}
          onClose={() => setEditing(null)}
        >
          <CafeProductEditor
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

function CafeProductEditor({
  value,
  onCancel,
  onSave,
}: {
  value: CafeProduct | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [supplier, setSupplier] = useState(value?.supplier ?? "");
  const [unit, setUnit] = useState<CafeProductUnit>(value?.unit ?? "g");
  // 手入力しやすいよう文字列のまま保持し、保存時にだけ数値へ変換する
  const [leadDays, setLeadDays] = useState(String(value?.leadDays ?? 1));
  const [unitPrice, setUnitPrice] = useState(
    value?.unitPrice !== undefined ? String(value.unitPrice) : ""
  );
  // 単価の基準数量（例: 100g 800円 の「100」）。新規のgは100から始める（1gあたりは入れづらいため）
  const [priceQty, setPriceQty] = useState(
    value?.priceQty !== undefined ? String(value.priceQty) : value ? "1" : "100"
  );
  const [priceQtyTouched, setPriceQtyTouched] = useState(false);

  function save() {
    if (!name.trim()) return alert("商品名を入力してください");
    const d = Math.max(0, Number(leadDays) || 0);
    // 空欄=単価未設定。入力があるときは0以上の数字だけ受け付ける
    let price: number | undefined;
    let qty: number | undefined;
    if (unitPrice.trim() !== "") {
      price = Number(unitPrice);
      if (!Number.isFinite(price) || price < 0)
        return alert("単価の金額は0以上の数字で入力してください（空欄なら未設定）");
      qty = Number(priceQty);
      if (!Number.isFinite(qty) || qty <= 0)
        return alert("単価の基準数量は0より大きい数字で入力してください（例: 100g なら 100）");
    }
    const input = { name, supplier, unit, leadDays: d, unitPrice: price, priceQty: qty };
    if (value) {
      updateCafeProduct(value.id, input);
    } else {
      addCafeProduct(input);
    }
    onSave();
  }

  return (
    <div className="event-form">
      <label>
        商品名
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: コーヒー豆"
          autoFocus
        />
      </label>
      <label>
        発注先
        <input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="例: ○○商会"
        />
      </label>
      <div className="row">
        <label>
          単位
          <select
            value={unit}
            onChange={(e) => {
              const u = e.target.value as CafeProductUnit;
              setUnit(u);
              if (!value && !priceQtyTouched) setPriceQty(u === "g" ? "100" : "1");
            }}
          >
            {CAFE_PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {CAFE_PRODUCT_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          何日前までに発注
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={leadDays}
            onChange={(e) => setLeadDays(e.target.value)}
          />
        </label>
      </div>
      <label>単価（任意）</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={priceQty}
          onChange={(e) => {
            setPriceQty(e.target.value);
            setPriceQtyTouched(true);
          }}
          style={{ width: 90, flex: "none" }}
          aria-label="単価の基準数量"
        />
        <span>{CAFE_PRODUCT_UNIT_LABEL[unit]}あたり</span>
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="金額（空欄＝未設定）"
          style={{ width: 150, flex: "none" }}
          aria-label="単価の金額（円）"
        />
        <span>円</span>
      </div>
      {unitPrice.trim() !== "" && Number(priceQty) > 0 && Number(unitPrice) >= 0 && (
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          例: {formatPrice(Number(priceQty))}
          {CAFE_PRODUCT_UNIT_LABEL[unit]}で{formatPrice(Number(unitPrice))}円
          （1{CAFE_PRODUCT_UNIT_LABEL[unit]}あたり
          {formatPrice(Number(unitPrice) / Number(priceQty))}円）
        </p>
      )}
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

// 特定のカフェ営業日に対して、その場で発注するための簡易フォーム。
// カレンダーの日付パネル（LOCOMO CAFEの営業時間が登録された日）から使う。
export function CafeQuickOrderForm({
  me,
  cafeDate,
  onSent,
}: {
  me: User;
  cafeDate: string;
  onSent: () => void;
}) {
  const products = getCafeProducts();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  function setCount(id: string, next: QtyUpdate) {
    setCounts((cur) => applyQty(cur, id, next));
  }
  function countOf(id: string): number {
    const n = Number(counts[id]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function deadlineFor(p: CafeProduct): string {
    return addDays(cafeDate, -p.leadDays);
  }

  function send() {
    const selected = products.filter((p) => countOf(p.id) > 0);
    if (selected.length === 0) return alert("発注する商品を選択してください");
    const items = selected
      .map((p) => `${p.name} ${countOf(p.id)}${CAFE_PRODUCT_UNIT_LABEL[p.unit]}`)
      .join("、");
    const deadline = selected.map((p) => deadlineFor(p)).sort()[0];
    const est = estimateTotal(selected, countOf);
    const hasPrice = selected.some((p) => p.unitPrice !== undefined);
    addCafeOrder(me.id, items, note, cafeDate, deadline, hasPrice ? est.total : undefined);
    const owners = getUsers().filter((u) => u.role === "owner").map((u) => u.id);
    sendPushToUsers(
      owners,
      "カフェの発注が届きました",
      `${me.name}さんから発注: ${items.slice(0, 40)}（${cafeDate.slice(5).replace("-", "/")}分・締切${deadline.slice(5).replace("-", "/")}）`,
      "/"
    );
    setCounts({});
    setNote("");
    onSent();
  }

  if (products.length === 0) {
    return (
      <p className="muted small">
        まだ商品が登録されていません。「カフェの発注」タブから登録してください。
      </p>
    );
  }

  return (
    <div className="event-form">
      <div className="sold-grid">
        {products.map((p) => (
          <QtyTile
            key={p.id}
            name={p.name}
            lines={tileLines(p, deadlineFor(p))}
            value={counts[p.id] ?? ""}
            unit={CAFE_PRODUCT_UNIT_LABEL[p.unit]}
            step={stepOf(p)}
            onChange={(next) => setCount(p.id, next)}
          />
        ))}
      </div>
      {(() => {
        const selected = products.filter((p) => countOf(p.id) > 0);
        if (selected.length === 0 || !selected.some((p) => p.unitPrice !== undefined)) return null;
        return <EstimateLine {...estimateTotal(selected, countOf)} />;
      })()}
      <label style={{ marginTop: 10 }}>
        メモ（任意）
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="例: 来週末までにお願いします"
        />
      </label>
      <div className="form-actions">
        <button className="primary" onClick={send}>
          発注を送る
        </button>
      </div>
    </div>
  );
}
