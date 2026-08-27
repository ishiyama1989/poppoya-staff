import { useState } from "react";
import { CAFE_ORDER_STATUS_LABEL, type User } from "../types";
import {
  addCafeOrder,
  deleteCafeOrder,
  getCafeOrders,
  getUsers,
  toggleCafeOrderDone,
} from "../store";
import { sendPushToUsers } from "../lib/push";

// LOCOMO CAFEの発注（カフェ管理人 → オーナー）
// カフェ管理人は発注を送るだけ、オーナーは届いた発注を確認して対応済みにする。
export default function CafeOrders({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const users = getUsers();
  const orders = getCafeOrders();
  const isOwner = me.role === "owner";

  const [items, setItems] = useState("");
  const [note, setNote] = useState("");

  function refresh() {
    setVersion((v) => v + 1);
  }
  void version;

  function send() {
    if (!items.trim()) return alert("発注内容を入力してください");
    addCafeOrder(me.id, items, note);
    const owners = users.filter((u) => u.role === "owner").map((u) => u.id);
    sendPushToUsers(
      owners,
      "カフェの発注が届きました",
      `${me.name}さんから発注: ${items.trim().slice(0, 40)}`,
      "/"
    );
    setItems("");
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
            : "商品の仕入れなど、オーナーへ発注をお願いしたい内容を送ります。"}
        </p>
      </div>

      {!isOwner && (
        <div className="event-form" style={{ marginBottom: 20 }}>
          <label>
            発注内容
            <textarea
              value={items}
              onChange={(e) => setItems(e.target.value)}
              rows={3}
              placeholder="例: コーヒー豆 2kg、紙コップ 1箱"
            />
          </label>
          <label>
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
