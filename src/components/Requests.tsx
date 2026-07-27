import { useMemo, useState } from "react";
import {
  EVENT_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  VIDEO_TASK_STATUS_LABEL,
  type User,
  type VideoTaskStatus,
} from "../types";
import {
  approveRequest,
  getUsers,
  getVideoTasks,
  rejectRequest,
  requestsForUser,
  updateVideoTask,
} from "../store";
import { yen } from "../lib/date";
import MapLinks from "./MapLinks";

export default function Requests({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  void version;

  const requests = requestsForUser(me.id);
  const users = getUsers();

  const today = new Date().toISOString().slice(0, 10);

  const videoTasks = useMemo(
    () =>
      getVideoTasks()
        .filter((t) => t.toUserId === me.id)
        .filter((t) => !(t.status === "cancelled" && (!t.cancelledAt || t.cancelledAt < today)))
        .sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

  const [deliveryUrls, setDeliveryUrls] = useState<Record<string, string>>({});
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  const pendingVideo = videoTasks.filter((t) => t.status === "pending");
  const activeVideo = videoTasks.filter((t) => t.status === "accepted");
  const historyVideo = videoTasks.filter((t) =>
    (["submitted", "completed", "rejected", "cancelled"] as VideoTaskStatus[]).includes(t.status)
  );

  const hasVideo =
    pendingVideo.length > 0 || activeVideo.length > 0 || historyVideo.length > 0;

  function refresh() {
    setVersion((v) => v + 1);
  }

  function submitDelivery(taskId: string) {
    const url = (deliveryUrls[taskId] ?? "").trim();
    updateVideoTask(taskId, {
      status: "submitted",
      deliveryUrl: url || undefined,
      deliveryNote: (deliveryNotes[taskId] ?? "").trim() || undefined,
      submittedAt: new Date().toISOString().slice(0, 10),
    });
    refresh();
  }

  return (
    <div className="requests-view">
      {/* ===== 動画編集依頼 ===== */}
      {hasVideo && (
        <section className="vtasks-section">
          <h2 className="vtasks-section-title">動画編集依頼</h2>

          {pendingVideo.length > 0 && (
            <>
              <h3 className="req-section-title">承認待ち（{pendingVideo.length}件）</h3>
              <div className="req-cards">
                {pendingVideo.map((t) => (
                  <div key={t.id} className="req-card vtask-card">
                    <div className="req-card-head">
                      <span className="task-status-tag pending">
                        {VIDEO_TASK_STATUS_LABEL.pending}
                      </span>
                      <span className="task-deadline-label">
                        締切 {t.deadline.replace(/-/g, "/")}
                      </span>
                    </div>
                    <div className="req-card-title">{t.title}</div>
                    {t.description && (
                      <div className="req-card-note">{t.description}</div>
                    )}
                    <div className="vtask-amount">{yen(t.amount)}</div>
                    <div className="req-card-actions">
                      <button
                        className="ghost danger"
                        onClick={() => {
                          updateVideoTask(t.id, { status: "rejected" });
                          refresh();
                        }}
                      >
                        却下
                      </button>
                      <button
                        className="primary"
                        onClick={() => {
                          updateVideoTask(t.id, { status: "accepted" });
                          refresh();
                        }}
                      >
                        承認する
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeVideo.length > 0 && (
            <>
              <h3 className="req-section-title">進行中（{activeVideo.length}件）</h3>
              <div className="req-cards">
                {activeVideo.map((t) => (
                  <div key={t.id} className="req-card vtask-card vtask-accepted">
                    <div className="req-card-head">
                      <span className="task-status-tag accepted">
                        {VIDEO_TASK_STATUS_LABEL.accepted}
                      </span>
                      <span className="task-deadline-label">
                        締切 {t.deadline.replace(/-/g, "/")}
                      </span>
                    </div>
                    <div className="req-card-title">{t.title}</div>
                    {t.description && (
                      <div className="req-card-note">{t.description}</div>
                    )}
                    <div className="vtask-amount">{yen(t.amount)}</div>
                    <div className="vtask-submit-form">
                      <label>
                        納品物URL
                        <input
                          type="url"
                          placeholder="https://drive.google.com/..."
                          value={deliveryUrls[t.id] ?? ""}
                          onChange={(e) =>
                            setDeliveryUrls((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        コメント（任意）
                        <textarea
                          rows={2}
                          placeholder="修正点など..."
                          value={deliveryNotes[t.id] ?? ""}
                          onChange={(e) =>
                            setDeliveryNotes((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="form-actions">
                        <button
                          className="primary"
                          onClick={() => submitDelivery(t.id)}
                        >
                          納品する
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {historyVideo.length > 0 && (
            <>
              <h3 className="req-section-title">動画依頼の履歴</h3>
              <div className="req-history">
                {historyVideo.map((t) => (
                  <div key={t.id} className="req-item">
                    <span className={`task-status-tag ${t.status}`}>
                      {VIDEO_TASK_STATUS_LABEL[t.status]}
                    </span>
                    <span className="req-text">
                      {t.deadline.replace(/-/g, "/")} ／ {t.title}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ===== スケジュール依頼 ===== */}
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
                <span className="tag">{EVENT_TYPE_LABEL[r.type]}</span>
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
