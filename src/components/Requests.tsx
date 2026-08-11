import { useState } from "react";
import {
  REQUEST_STATUS_LABEL,
  type User,
} from "../types";
import {
  approveRequest,
  getUsers,
  rejectRequest,
  requestsForUser,
} from "../store";
import MapLinks from "./MapLinks";

export default function Requests({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  void version;

  const requests = requestsForUser(me.id);
  const users = getUsers();

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="requests-view">
      <div className="section-head">
        <h2>受けた依頼</h2>
        <p className="muted">
          管理者からの依頼です。承認するとカレンダーに予定として登録されます。
        </p>
      </div>

      <h3 className="req-section-title">承認待ち（{pending.length}件）</h3>
      {pending.length === 0 ? (
        <p className="muted">承認待ちの依頼はありません。</p>
      ) : (
        <div className="req-cards">
          {pending.map((r) => (
            <div key={r.id} className="req-card">
              <div className="req-card-head">
                <span className="req-date">{r.date.replace(/-/g, "/")}</span>
              </div>
              <div className="req-card-title">{r.title}</div>
              <div className="req-card-meta">
                🕒 {r.start}–{r.end} ／ 📍 {r.location || "未設定"}
              </div>
              {r.location && (
                <div className="req-card-meta">
                  <MapLinks query={r.location} />
                </div>
              )}
              <div className="req-card-meta">
                依頼者: {users.find((u) => u.id === r.fromUserId)?.name ?? "管理者"}
              </div>
              {r.note && <div className="req-card-note">{r.note}</div>}
              <div className="req-card-actions">
                <button
                  className="ghost danger"
                  onClick={() => {
                    rejectRequest(r.id);
                    refresh();
                  }}
                >
                  却下
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    approveRequest(r.id);
                    refresh();
                  }}
                >
                  承認する
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h3 className="req-section-title">履歴</h3>
          <div className="req-history">
            {history.map((r) => (
              <div key={r.id} className="req-item">
                <span className={`req-status ${r.status}`}>
                  {REQUEST_STATUS_LABEL[r.status]}
                </span>
                <span className="req-text">
                  {r.date.replace(/-/g, "/")} ／ {r.title}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
