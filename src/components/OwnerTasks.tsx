import { useMemo, useState } from "react";
import type { RequestStatus, User } from "../types";
import { REQUEST_STATUS_LABEL } from "../types";
import { addRequest, getMembers, requestsFromUser, rejectRequest } from "../store";
import { sendPushToUsers } from "../lib/push";
import MapLinks from "./MapLinks";

type FilterStatus = RequestStatus | "all";

const STATUS_FILTERS: FilterStatus[] = ["all", "pending", "approved", "rejected"];

const FILTER_LABEL: Record<FilterStatus, string> = {
  all: "すべて",
  ...REQUEST_STATUS_LABEL,
};

// オーナーがスタッフに「この日シフトに入れませんか？」と依頼を送り、状況を管理する画面
export default function OwnerTasks({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showForm, setShowForm] = useState(false);

  const requests = useMemo(() => requestsFromUser(me.id), [version, me.id]);
  const members = useMemo(() => getMembers(), [version]);

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  const countMap = useMemo(() => {
    const m: Partial<Record<RequestStatus, number>> = {};
    for (const r of requests) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [requests]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="tasks-view">
      <div className="section-head">
        <h2>依頼管理</h2>
        <p className="muted">
          スタッフに「この日シフトに入れませんか？」と依頼を送れます。承認されるとカレンダーに予定として登録されます。
        </p>
      </div>

      <div className="tasks-toolbar">
        <div className="task-filter-tabs">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`task-filter-btn${filter === s ? " active" : ""}`}
              onClick={() => setFilter(s)}
            >
              {FILTER_LABEL[s]}
              {s !== "all" && countMap[s as RequestStatus] ? (
                <span className="task-filter-count">{countMap[s as RequestStatus]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button className="primary" onClick={() => setShowForm(true)} disabled={members.length === 0}>
          ＋ 新規依頼
        </button>
      </div>

      {members.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>
          メンバーが登録されていません。先にスタッフに新規登録してもらいましょう。
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>該当する依頼はありません。</p>
      ) : (
        <div className="task-cards">
          {filtered.map((r) => {
            const member = members.find((m) => m.id === r.toUserId);
            return (
              <div key={r.id} className={`task-card status-${r.status}`}>
                <div className="task-card-head">
                  <span className={`req-status ${r.status}`}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                  <span className="task-assignee-name">{member?.name ?? "—"}</span>
                  <span className="task-deadline-label">
                    {r.date.replace(/-/g, "/")} {r.start}–{r.end || "未定"}
                  </span>
                </div>
                <div className="task-title-text">{r.title}</div>
                {r.location && (
                  <p className="task-desc-text">
                    📍 {r.location} <MapLinks query={r.location} />
                  </p>
                )}
                {r.note && <p className="task-desc-text">{r.note}</p>}

                {r.status === "pending" && (
                  <div className="task-cancel-row">
                    <button
                      className="ghost danger small"
                      onClick={() => {
                        if (confirm("この依頼を取り消しますか？")) {
                          rejectRequest(r.id);
                          refresh();
                        }
                      }}
                    >
                      取り消す
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ShiftRequestForm
          fromUserId={me.id}
          members={members}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShiftRequestForm({
  fromUserId,
  members,
  onClose,
  onSaved,
}: {
  fromUserId: string;
  members: ReturnType<typeof getMembers>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [toUserId, setToUserId] = useState(members[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("この日シフトに入れませんか？");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function save() {
    if (!title.trim()) {
      setError("依頼内容を入力してください");
      return;
    }
    if (!toUserId) {
      setError("担当者を選択してください");
      return;
    }
    addRequest({
      date,
      fromUserId,
      toUserId,
      type: "shift",
      title: title.trim(),
      location: location.trim(),
      start,
      end,
      note: note.trim(),
    });
    sendPushToUsers(
      [toUserId],
      "新しい依頼が届きました",
      `${date.slice(5).replace("-", "/")} ${start}〜${end || "未定"}　${title.trim()}`,
      "/"
    );
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>新規依頼を作成</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <label>
          担当者
          <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label>
          依頼内容
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: この日シフトに入れませんか？"
          />
        </label>
        <div className="task-form-row">
          <label>
            対象日
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            場所（任意）
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="フロント / 客室 など"
            />
          </label>
        </div>
        <div className="task-form-row">
          <label>
            開始
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            終了（任意）
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label>
          メモ（任意）
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="補足があれば入力してください"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="ghost" onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>依頼を送る</button>
        </div>
      </div>
    </div>
  );
}
