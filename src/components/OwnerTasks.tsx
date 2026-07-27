import { useMemo, useState } from "react";
import type { User } from "../types";
import { VIDEO_TASK_STATUS_LABEL, type VideoTaskStatus } from "../types";
import { addVideoTask, getMembers, getVideoTasks, updateVideoTask } from "../store";
import { yen } from "../lib/date";

type FilterStatus = VideoTaskStatus | "all";

const STATUS_FILTERS: FilterStatus[] = ["all", "pending", "accepted", "submitted", "completed", "cancelled"];

const FILTER_LABEL: Record<FilterStatus, string> = {
  all: "すべて",
  pending: "承認待ち",
  accepted: "進行中",
  submitted: "納品確認",
  completed: "完了",
  rejected: "却下",
  cancelled: "取り消し済み",
};

export default function OwnerTasks({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const tasks = useMemo(() => {
    // 取り消し済みで cancelledAt が昨日以前のものは完全非表示
    return getVideoTasks().filter(
      (t) => !(t.status === "cancelled" && (!t.cancelledAt || t.cancelledAt < today))
    );
  }, [version, today]);
  const members = useMemo(() => getMembers(), [version]);

  const filtered = useMemo(() => {
    const base = filter === "all"
      ? tasks
      : tasks.filter((t) => t.status === filter);
    return [...base].sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  }, [tasks, filter]);

  const countMap = useMemo(() => {
    const m: Partial<Record<VideoTaskStatus, number>> = {};
    for (const t of tasks) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [tasks]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="tasks-view">
      <div className="section-head">
        <h2>依頼管理</h2>
        <p className="muted">
          動画編集などの依頼を作成・管理します。メンバーが承認後に進行中になります。
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
              {s !== "all" && countMap[s as VideoTaskStatus] ? (
                <span className="task-filter-count">{countMap[s as VideoTaskStatus]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          ＋ 新規依頼
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>該当する依頼はありません。</p>
      ) : (
        <div className="task-cards">
          {filtered.map((t) => {
            const member = members.find((m) => m.id === t.toUserId);
            const isOverdue =
              t.deadline < today && !["completed", "rejected", "cancelled"].includes(t.status);
            return (
              <div key={t.id} className={`task-card status-${t.status}`}>
                <div className="task-card-head">
                  <span className={`task-status-tag ${t.status}`}>
                    {VIDEO_TASK_STATUS_LABEL[t.status]}
                  </span>
                  <span className="task-assignee-name">{member?.name ?? "—"}</span>
                  <span className={`task-deadline-label${isOverdue ? " overdue" : ""}`}>
                    締切 {t.deadline.replace(/-/g, "/")}
                  </span>
                </div>
                <div className="task-title-text">{t.title}</div>
                {t.description && (
                  <p className="task-desc-text">{t.description}</p>
                )}
                <div className="task-amount-text">{yen(t.amount)}</div>

                {t.status === "submitted" && (
                  <div className="task-delivery-review">
                    {t.deliveryUrl ? (
                      <>
                        <div className="task-delivery-label">納品物URL</div>
                        <a
                          href={t.deliveryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="task-delivery-url"
                        >
                          {t.deliveryUrl}
                        </a>
                      </>
                    ) : (
                      <div className="task-delivery-label">（URLなし）</div>
                    )}
                    {t.deliveryNote && (
                      <p className="task-delivery-note">{t.deliveryNote}</p>
                    )}
                    <div className="task-delivery-actions">
                      <button
                        className="ghost danger"
                        onClick={() => {
                          updateVideoTask(t.id, { status: "accepted" });
                          refresh();
                        }}
                      >
                        差し戻し
                      </button>
                      <button
                        className="primary"
                        onClick={() => {
                          updateVideoTask(t.id, {
                            status: "completed",
                            completedAt: new Date().toISOString().slice(0, 10),
                          });
                          refresh();
                        }}
                      >
                        納品完了
                      </button>
                    </div>
                  </div>
                )}

                {(t.status === "pending" || t.status === "accepted") && (
                  <div className="task-cancel-row">
                    <button
                      className="ghost danger small"
                      onClick={() => {
                        if (confirm("この依頼を取り消しますか？")) {
                          updateVideoTask(t.id, { status: "cancelled", cancelledAt: today });
                          refresh();
                        }
                      }}
                    >
                      取り消す
                    </button>
                  </div>
                )}

                {t.status === "cancelled" && (
                  <div className="task-cancel-row">
                    <button
                      className="ghost mini"
                      onClick={() => {
                        updateVideoTask(t.id, { status: "accepted", cancelledAt: undefined });
                        refresh();
                      }}
                    >
                      再開する
                    </button>
                  </div>
                )}

                {t.status === "completed" && t.completedAt && (
                  <p className="task-completed-note muted">
                    完了: {t.completedAt.replace(/-/g, "/")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <TaskForm
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

function TaskForm({
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(today);
  const [amount, setAmount] = useState("0");
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
    addVideoTask({
      fromUserId,
      toUserId,
      title: title.trim(),
      description: description.trim(),
      deadline,
      amount: Number(amount) || 0,
    });
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
            placeholder="例: カフェ案件リール動画編集"
          />
        </label>
        <label>
          詳細説明（任意）
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="素材は〇〇フォルダに入っています..."
          />
        </label>
        <div className="task-form-row">
          <label>
            締切日
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <label>
            報酬額（円）
            <input
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="ghost" onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>依頼を送る</button>
        </div>
      </div>
    </div>
  );
}
