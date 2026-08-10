import { useMemo, useState } from "react";
import type { EventType, RequestStatus, User } from "../types";
import { EVENT_TYPE_LABEL, EVENT_TYPES, REQUEST_STATUS_LABEL } from "../types";
import {
  addRequest,
  approveRequest,
  getMembers,
  getUsers,
  pendingRequestsForUser,
  staffNamesOn,
  requestsFromUser,
  rejectRequest,
} from "../store";
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
  // 自分宛に届いていて、まだ返事をしていない依頼
  const incoming = useMemo(() => pendingRequestsForUser(me.id), [version, me.id]);
  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of getUsers()) map[u.id] = u.name;
    return map;
  }, [version]);

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

      {/* 自分宛に届いている依頼。ここで承認するとカレンダーに予定として入る */}
      {incoming.length > 0 && (
        <>
          <h3 className="req-section-title">
            自分宛の承認待ち（{incoming.length}件）
          </h3>
          <div className="req-cards">
            {incoming.map((r) => (
              <div key={r.id} className="req-card">
                <div className="req-card-head">
                  <span className="req-date">{r.date.replace(/-/g, "/")}</span>
                  <span className="tag">{EVENT_TYPE_LABEL[r.type]}</span>
                </div>
                <div className="req-card-title">{r.title}</div>
                <div className="req-card-meta">
                  🕒 {r.start}–{r.end || "未定"}
                  {r.location ? ` ／ 📍 ${r.location}` : ""}
                </div>
                <div className="req-card-meta">
                  依頼者: {userNameById[r.fromUserId] ?? "管理者"}
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
        </>
      )}

      <h3 className="req-section-title">送った依頼</h3>

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
  const [roomType, setRoomType] = useState<EventType>("train");
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
    // 基本は1日1人なので、すでに誰か入っている日は念のため確認する（絶対禁止ではない）
    const already = staffNamesOn(date);
    if (already.length > 0) {
      const ok = confirm(
        `${date.replace(/-/g, "/")}はすでに${already.join("・")}さんが入っています。\n` +
          `通常は1日1人ですが、それでも依頼を送りますか？`
      );
      if (!ok) return;
    }
    addRequest({
      date,
      fromUserId,
      toUserId,
      type: roomType,
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
        <label>
          業務場所
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>
            ))}
          </select>
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
