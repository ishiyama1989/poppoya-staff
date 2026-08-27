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
  deleteCafeOrder,
  deleteCafeProduct,
  getCafeOrders,
  getCafeProducts,
  getUsers,
  toggleCafeOrderDone,
  updateCafeProduct,
} from "../store";
import { sendPushToUsers } from "../lib/push";

// LOCOMO CAFEの発注（カフェ管理人 → オーナー）
// カフェ管理人・オーナーで発注できる商品を登録しておき、
// カフェ管理人はその中から数量を選んで発注する。
export default function CafeOrders({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const users = getUsers();
  const orders = getCafeOrders();
  const products = getCafeProducts();
  const isOwner = me.role === "owner";

  // 入力中に桁がおかしくならないよう、数量は文字列のまま保持し
  // 送信時にだけ数値へ変換する（毎キー入力で丸めると手入力しづらくなるため）。
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  function refresh() {
    setVersion((v) => v + 1);
  }
  void version;

  function setCount(id: string, value: string) {
    setCounts((cur) => ({ ...cur, [id]: value }));
  }

  function countOf(id: string): number {
    const n = Number(counts[id]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function send() {
    const lines = products
      .filter((p) => countOf(p.id) > 0)
      .map((p) => `${p.name} ${countOf(p.id)}${CAFE_PRODUCT_UNIT_LABEL[p.unit]}`);
    if (lines.length === 0) return alert("発注する商品を選択してください");
    const items = lines.join("、");
    addCafeOrder(me.id, items, note);
    const owners = users.filter((u) => u.role === "owner").map((u) => u.id);
    sendPushToUsers(
      owners,
      "カフェの発注が届きました",
      `${me.name}さんから発注: ${items.slice(0, 40)}`,
      "/"
    );
    setCounts({});
    setNote("");
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
          <label>発注する商品と数量</label>
          {products.length === 0 ? (
            <p className="muted small">
              まだ商品が登録されていません。下の「商品登録」から追加してください。
            </p>
          ) : (
            <div className="slot-list">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="slot-row"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span>
                    {p.name}
                    {`（${p.supplier ? `発注先: ${p.supplier} ・` : ""}${p.leadDays}日前までに発注）`}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={counts[p.id] ?? ""}
                      onChange={(e) => setCount(p.id, e.target.value)}
                      style={{ width: 70 }}
                    />
                    {CAFE_PRODUCT_UNIT_LABEL[p.unit]}
                  </span>
                </div>
              ))}
            </div>
          )}
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

      <CafeProductSettings products={products} onChange={refresh} />

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
              {o.note && <div className="req-card-note">{o.note}</div>}
              {isOwner && (
                <div className="req-card-actions">
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
            </div>
          ))}
        </div>
      )}
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
        <div className="slot-list">
          {products.map((p) => (
            <div key={p.id} className="slot-row">
              <div className="reservation-head">
                <span className="avail-chip">{p.name}</span>
                <span className="tag">{CAFE_PRODUCT_UNIT_LABEL[p.unit]}単位</span>
              </div>
              <div className="reservation-meta">
                {p.supplier && `発注先: ${p.supplier} ／ `}
                {p.leadDays}日前までに発注
              </div>
              <div className="event-actions">
                <button className="ghost" onClick={() => setEditing(p)}>
                  編集
                </button>
                <button
                  className="ghost danger"
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
        <CafeProductEditor
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

  function save() {
    if (!name.trim()) return alert("商品名を入力してください");
    const d = Math.max(0, Number(leadDays) || 0);
    if (value) {
      updateCafeProduct(value.id, { name, supplier, unit, leadDays: d });
    } else {
      addCafeProduct({ name, supplier, unit, leadDays: d });
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
          <select value={unit} onChange={(e) => setUnit(e.target.value as CafeProductUnit)}>
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
