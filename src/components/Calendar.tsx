import { useMemo, useRef, useState } from "react";
import { Clock as ClockIcon, MapPin, User as UserIcon, Search } from "lucide-react";
import {
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  REQUEST_STATUS_LABEL,
  SLOT_LABEL,
  type EventType,
  type ScheduleEvent,
  type User,
} from "../types";
import {
  addRequest,
  approveRequest,
  availabilityOn,
  deleteEvent,
  getAvailability,
  getEvents,
  eventsAwaitingAdmin,
  getMembers,
  getUnseenAssignedEvents,
  getUsers,
  markAssignedEventsSeen,
  pendingEventApprovalsForUser,
  pendingRequestsForUser,
  rejectRequest,
  requestsOn,
  upsertEvent,
  uid,
} from "../store";
import { WEEKDAYS, monthGrid, todayStr, ymd } from "../lib/date";
import { sendPushToUsers } from "../lib/push";
import MapLinks from "./MapLinks";

const TYPE_JP: Record<string, string> = {
  shooting: "撮影",
  meeting: "会議",
  delivery: "納品",
  other: "予定",
};

// 時間プルダウン用スロット（30分刻み）
const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

export default function Calendar({
  me,
  onOpenRequests,
  onOpenMyPay,
  onOpenPayments,
}: {
  me: User;
  onOpenRequests?: () => void;
  onOpenMyPay?: () => void;
  onOpenPayments?: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const draggingId = useRef<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const isOwner = me.role === "owner";
  const events = useMemo(() => getEvents(), [version]);
  const users = useMemo(() => getUsers(), [version]);
  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  const [searchSelected, setSearchSelected] = useState<string[]>([]);
  const allMembers = useMemo(() => (isOwner ? getMembers() : []), [isOwner, version]);
  const availByDateIds = useMemo(() => {
    if (!isOwner) return {} as Record<string, Set<string>>;
    const map: Record<string, Set<string>> = {};
    for (const a of getAvailability())
      if (a.slots.length > 0 || a.comment)
        (map[a.date] ??= new Set()).add(a.userId);
    return map;
  }, [version, isOwner]);
  const searchMatchDates = useMemo(() => {
    if (searchSelected.length === 0) return new Set<string>();
    return new Set(
      Object.keys(availByDateIds).filter((d) =>
        searchSelected.every((id) => availByDateIds[d].has(id))
      )
    );
  }, [availByDateIds, searchSelected]);

  const pending = useMemo(
    () => (me.role === "member" ? pendingRequestsForUser(me.id) : []),
    [version, me]
  );
  const pendingPay = useMemo(
    () => (me.role === "member" ? pendingEventApprovalsForUser(me.id) : []),
    [version, me]
  );
  // オーナー：過ぎた予定で承認依頼を送るべきもの
  const awaitingAdmin = useMemo(
    () => (me.role === "owner" ? eventsAwaitingAdmin() : []),
    [version, me]
  );
  // メンバー：自分に割り当てられた新しい予定（未確認）
  const unseenEvents = useMemo(
    () => (me.role === "member" ? getUnseenAssignedEvents(me.id) : []),
    [version, me]
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  const availNamesByDate = useMemo(() => {
    const nameById: Record<string, string> = {};
    for (const u of users) if (u.role === "member") nameById[u.id] = u.name;
    const map: Record<string, { name: string; slots: string[] }[]> = {};
    for (const a of getAvailability())
      if ((a.slots.length > 0 || a.comment) && nameById[a.userId])
        (map[a.date] ??= []).push({
          name: nameById[a.userId],
          slots: a.slots.map((s) => SLOT_LABEL[s]),
        });
    return map;
  }, [version, users]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }
  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="cal-layout">
      <div className="cal-main full">
        {isOwner && (
          <div className="search-panel">
            <div className="search-panel-head">
              <Search size={13} strokeWidth={2} />
              稼働日検索
              {searchSelected.length > 0 && searchMatchDates.size > 0 && (
                <span className="search-badge">{searchMatchDates.size}日</span>
              )}
            </div>
            <div className="search-body">
              <div className="search-chips">
                {allMembers.map((m) => (
                  <button
                    key={m.id}
                    className={`pick ${searchSelected.includes(m.id) ? "on" : ""}`}
                    onClick={() =>
                      setSearchSelected((cur) =>
                        cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]
                      )
                    }
                  >
                    {m.name}
                  </button>
                ))}
                <button className="ghost mini" onClick={() => setSearchSelected(allMembers.map((m) => m.id))}>全員</button>
                <button className="ghost mini" onClick={() => setSearchSelected([])}>クリア</button>
              </div>
              {searchSelected.length > 0 && searchMatchDates.size === 0 && (
                <p className="muted small" style={{ marginTop: 10 }}>該当する日はありません</p>
              )}
              {searchMatchDates.size > 0 && (
                <div className="match-list" style={{ marginTop: 12, marginBottom: 0 }}>
                  {[...searchMatchDates].sort().map((d) => {
                    const avails = getAvailability().filter(
                      (a) => searchSelected.includes(a.userId) && a.date === d
                    );
                    return (
                      <div key={d} className="match-row">
                        <span className="match-date">{d.replace(/-/g, "/")}</span>
                        <div className="match-members">
                          {avails.map((a) => (
                            <span key={a.userId}>
                              {allMembers.find((m) => m.id === a.userId)?.name}：
                              {a.slots.map((s) => SLOT_LABEL[s]).join("・") || "—"}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {pending.length > 0 && (
          <div className="pending-requests">
            <div className="pending-requests-head">
              <span className="pending-banner-text">
                承認待ちの依頼が <strong>{pending.length}件</strong> あります
              </span>
              {onOpenRequests && (
                <button className="ghost mini" onClick={onOpenRequests}>
                  一覧で見る →
                </button>
              )}
            </div>
            {pending.map((r) => (
              <div key={r.id} className="banner-req-row">
                <div className="banner-req-info">
                  <span className="banner-req-main">
                    <span className="tag">{EVENT_TYPE_LABEL[r.type]}</span>
                    {r.title}
                  </span>
                  <span className="banner-req-sub">
                    {r.date.slice(5).replace("-", "/")} {r.start}–{r.end || "未定"}
                    {r.location ? ` / ${r.location}` : ""}
                  </span>
                </div>
                <div className="banner-req-btns">
                  <button
                    className="ghost danger mini"
                    onClick={() => {
                      rejectRequest(r.id);
                      refresh();
                    }}
                  >
                    却下
                  </button>
                  <button
                    className="primary mini"
                    onClick={() => {
                      approveRequest(r.id);
                      refresh();
                    }}
                  >
                    承認
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {pendingPay.length > 0 && (
          <div className="pending-banner pay">
            <span className="pending-banner-text">
              報酬の承認依頼が <strong>{pendingPay.length}件</strong> 届いています
            </span>
            {onOpenMyPay && (
              <button className="primary" onClick={onOpenMyPay}>
                確認する →
              </button>
            )}
          </div>
        )}
        {awaitingAdmin.length > 0 && (
          <div className="pending-banner">
            <span className="pending-banner-text">
              終了した予定が <strong>{awaitingAdmin.length}件</strong> あります。報酬の承認依頼を送りましょう
            </span>
            {onOpenPayments && (
              <button className="primary" onClick={onOpenPayments}>
                確認する →
              </button>
            )}
          </div>
        )}
        {unseenEvents.length > 0 && (
          <div className="pending-banner event">
            <span className="pending-banner-text">
              新しい予定が <strong>{unseenEvents.length}件</strong> 登録されました
              <span className="unseen-dates">
                {[...new Set(unseenEvents.map((e) => e.date))]
                  .sort()
                  .slice(0, 4)
                  .map((d) => d.slice(5).replace("-", "/"))
                  .join("、")}
              </span>
            </span>
            <button
              className="primary"
              onClick={() => {
                markAssignedEventsSeen(me.id);
                refresh();
              }}
            >
              確認しました
            </button>
          </div>
        )}
        <div className="cal-header">
          <button onClick={() => shiftMonth(-1)}>‹</button>
          <h2>
            {year}年 {month + 1}月
          </h2>
          <button onClick={() => shiftMonth(1)}>›</button>
          <button
            className="today-btn"
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth());
            }}
          >
            今日
          </button>
        </div>

        <div className="legend">
          {EVENT_TYPES.map((t) => (
            <span key={t}>
              <i style={{ background: EVENT_TYPE_COLOR[t] }} /> {EVENT_TYPE_LABEL[t]}
            </span>
          ))}
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`cal-wd ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}`}>
              {w}
            </div>
          ))}
          {grid.map((d) => {
            const ds = ymd(d);
            const inMonth = d.getMonth() === month;
            const dayEvents = eventsByDate[ds] ?? [];
            const isDragOver = dragOverDate === ds;
            const isSearchHit = searchMatchDates.has(ds);
            const isMyDay = !isOwner && inMonth && dayEvents.some((e) => e.assigneeIds.includes(me.id));
            return (
              <div
                key={ds}
                className={`cal-cell ${inMonth ? "" : "dim"} ${
                  ds === todayStr() ? "today" : ""
                } ${selected === ds ? "sel" : ""} ${isDragOver ? "drag-over" : ""} ${isSearchHit ? "hit" : ""} ${isMyDay ? "my-day" : ""}`}
                onClick={() => setSelected(ds)}
                onDragOver={isOwner ? (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOverDate(ds); } : undefined}
                onDragLeave={isOwner ? (ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOverDate(null); } : undefined}
                onDrop={isOwner ? (ev) => {
                  ev.preventDefault();
                  const id = draggingId.current;
                  if (id) {
                    const evt = events.find((e) => e.id === id);
                    if (evt && evt.date !== ds) {
                      upsertEvent({ ...evt, date: ds });
                      refresh();
                    }
                  }
                  draggingId.current = null;
                  setDragOverDate(null);
                } : undefined}
              >
                <div className="cal-date-row">
                  <span className="cal-date">{d.getDate()}</span>
                </div>
                {isOwner && availNamesByDate[ds] && (
                  <div className="cal-avail-names">
                    {availNamesByDate[ds].slice(0, 3).map((entry, i) => (
                      <span
                        key={i}
                        className="cal-avail-name"
                        title={`稼働: ${entry.name} ${entry.slots.join("・")}`}
                      >
                        {entry.name}
                        {entry.slots.length > 0 && (
                          <span className="cal-avail-slots">
                            {entry.slots.join("・")}
                          </span>
                        )}
                      </span>
                    ))}
                    {availNamesByDate[ds].length > 3 && (
                      <span className="cal-avail-name more">
                        +{availNamesByDate[ds].length - 3}
                      </span>
                    )}
                  </div>
                )}
                <div className="cal-events">
                  {dayEvents.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`cal-chip ${isOwner ? "draggable" : ""} ${!isOwner && e.assigneeIds.includes(me.id) ? "my-chip" : ""}`}
                      style={{ background: EVENT_TYPE_COLOR[e.type] }}
                      title={e.title}
                      draggable={isOwner}
                      onDragStart={isOwner ? (ev) => {
                        ev.stopPropagation();
                        draggingId.current = e.id;
                        ev.dataTransfer.effectAllowed = "move";
                      } : undefined}
                      onDragEnd={isOwner ? () => {
                        draggingId.current = null;
                        setDragOverDate(null);
                      } : undefined}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="cal-more">+{dayEvents.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayPanel
          date={selected}
          me={me}
          users={users}
          events={eventsByDate[selected] ?? []}
          onClose={() => setSelected(null)}
          onChange={refresh}
        />
      )}
    </div>
  );
}

function DayPanel({
  date,
  me,
  users,
  events,
  onClose,
  onChange,
}: {
  date: string;
  me: User;
  users: User[];
  events: ScheduleEvent[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [requestTo, setRequestTo] = useState<User | null>(null);
  const [requestingEvent, setRequestingEvent] = useState<ScheduleEvent | null>(null);
  const availList = availabilityOn(date).filter((a) =>
    users.some((u) => u.id === a.userId && u.role === "member")
  );
  const dayRequests = requestsOn(date);
  const members = users.filter((u) => u.role === "member");

  function newEvent(): ScheduleEvent {
    return {
      id: uid(),
      date,
      type: "shooting",
      title: "",
      location: "",
      assigneeIds: [],
      start: "10:00",
      end: "",
      note: "",
      hasReward: true,
    };
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>{date.replace(/-/g, "/")}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        {me.role === "owner" && (
          <div className="avail-box">
            <strong>この日に空いているメンバー</strong>
            <div className="avail-member-list">
              {availList.length === 0 ? (
                <span className="muted">登録なし</span>
              ) : (
                availList.map((a) => {
                  const member = users.find((u) => u.id === a.userId);
                  return (
                    <div key={a.userId} className="avail-member">
                      <span className="avail-chip">{member?.name ?? ""}</span>
                      <span className="avail-slots">
                        {a.slots.map((s) => SLOT_LABEL[s]).join("・") || "—"}
                      </span>
                      {a.comment && <span className="avail-comment">{a.comment}</span>}
                      {member && (
                        <button
                          className="ghost mini req-btn"
                          onClick={() => setRequestTo(member)}
                        >
                          依頼する
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {me.role === "owner" && requestTo && (
          <RequestForm
            date={date}
            fromUserId={me.id}
            toUser={requestTo}
            onCancel={() => setRequestTo(null)}
            onSent={() => {
              setRequestTo(null);
              onChange();
            }}
          />
        )}

        {me.role === "owner" && dayRequests.length > 0 && (
          <div className="req-box">
            <strong>送信した依頼</strong>
            {dayRequests.map((r) => (
              <div key={r.id} className="req-item">
                <span className={`req-status ${r.status}`}>
                  {REQUEST_STATUS_LABEL[r.status]}
                </span>
                <span className="req-text">
                  {users.find((u) => u.id === r.toUserId)?.name} ／ {r.title}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="event-list">
          {events.length === 0 && <p className="muted">予定はありません</p>}
          {events.map((e) => {
            const isMyEvent = me.role === "member" && e.assigneeIds.includes(me.id);
            const coAssignees = isMyEvent
              ? e.assigneeIds
                  .filter((id) => id !== me.id)
                  .map((id) => users.find((u) => u.id === id)?.name)
                  .filter((n): n is string => !!n)
              : [];
            return (
              <div key={e.id} className={`event-item ${isMyEvent ? "my-event" : ""}`}>
                <span className="dot" style={{ background: EVENT_TYPE_COLOR[e.type] }} />
                <div className="event-body">
                  <div className="event-title">
                    {e.title}{" "}
                    <span className="tag">{EVENT_TYPE_LABEL[e.type]}</span>
                  </div>
                  <div className="event-meta">
                    <ClockIcon size={11} strokeWidth={2} style={{verticalAlign:"middle",marginRight:3}} />
                    {e.start}–{e.end || "未定"}
                    <span style={{margin:"0 4px",opacity:.4}}>·</span>
                    <MapPin size={11} strokeWidth={2} style={{verticalAlign:"middle",marginRight:3}} />
                    {e.location || "場所未設定"}
                  </div>
                  {e.location && (
                    <div className="event-meta">
                      <MapLinks query={e.location} />
                    </div>
                  )}
                  <div className={`event-meta ${isMyEvent ? "event-companions" : ""}`}>
                    <UserIcon size={11} strokeWidth={2} style={{verticalAlign:"middle",marginRight:3}} />
                    {isMyEvent
                      ? coAssignees.length > 0
                        ? `同行: ${coAssignees.join(", ")}`
                        : "一人で参加"
                      : e.assigneeIds
                          .map((id) => users.find((u) => u.id === id)?.name)
                          .filter(Boolean)
                          .join(", ") || "未割当"}
                  </div>
                  {e.note && <div className="event-note">{e.note}</div>}
                </div>
                <div className="event-actions">
                  {me.role === "owner" && (
                    <button
                      className="ghost mini"
                      onClick={() => setRequestingEvent(e)}
                    >
                      依頼する
                    </button>
                  )}
                  <button className="ghost" onClick={() => setEditing(e)}>
                    編集
                  </button>
                  {me.role === "owner" && (
                    <button
                      className="ghost danger"
                      onClick={() => {
                        if (confirm("この予定を削除しますか？")) {
                          deleteEvent(e.id);
                          onChange();
                        }
                      }}
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 予定から直接依頼を送るフォーム */}
        {me.role === "owner" && requestingEvent && (
          <EventRequestForm
            event={requestingEvent}
            fromUserId={me.id}
            members={members}
            onClose={() => setRequestingEvent(null)}
            onSent={() => {
              setRequestingEvent(null);
              onChange();
            }}
          />
        )}

        {editing ? (
          <EventForm
            value={editing}
            users={users}
            me={me}
            onCancel={() => setEditing(null)}
            onSave={(ev) => {
              upsertEvent(ev);
              setEditing(null);
              onChange();
            }}
          />
        ) : (
          !requestingEvent && (
            <button className="primary full" onClick={() => setEditing(newEvent())}>
              ＋ 予定を追加
            </button>
          )
        )}
        {me.role === "owner" && (
          <p className="muted small">
            ※ 撮影日・納品日もここで「種別」を選んで登録します
          </p>
        )}
      </div>
    </div>
  );
}

// 既存の予定内容でメンバーへ依頼を送るフォーム
function EventRequestForm({
  event,
  fromUserId,
  members,
  onClose,
  onSent,
}: {
  event: ScheduleEvent;
  fromUserId: string;
  members: User[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    members.filter((m) => event.assigneeIds.includes(m.id)).map((m) => m.id)
  );

  function send() {
    if (selected.length === 0) return alert("送信先を選択してください");
    for (const toUserId of selected) {
      addRequest({
        date: event.date,
        fromUserId,
        toUserId,
        type: event.type,
        title: event.title,
        location: event.location,
        start: event.start,
        end: event.end,
        note: event.note,
        eventId: event.id,
      });
    }
    sendPushToUsers(
      selected,
      "新しい依頼が届きました",
      `${event.date.slice(5).replace("-", "/")} ${event.start}〜${event.end || "未定"}　${TYPE_JP[event.type] ?? ""}「${event.title}」`,
      "/"
    );
    onSent();
  }

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  return (
    <div className="event-form req-form">
      <div className="req-form-head">この予定内容で依頼を送る</div>
      <p className="muted small" style={{ marginBottom: 8 }}>
        「{event.title}」{event.start}–{event.end || "未定"}
      </p>
      <label>
        送信先メンバー
        <div className="assignee-chips">
          {members.length === 0 && <span className="muted">メンバー未登録</span>}
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pick ${selected.includes(m.id) ? "on" : ""}`}
              onClick={() => toggle(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </label>
      <div className="form-actions">
        <button className="ghost" onClick={onClose}>キャンセル</button>
        <button className="primary" onClick={send}>依頼を送る</button>
      </div>
    </div>
  );
}

function EventForm({
  value,
  users,
  me,
  onCancel,
  onSave,
}: {
  value: ScheduleEvent;
  users: User[];
  me: User;
  onCancel: () => void;
  onSave: (e: ScheduleEvent) => void;
}) {
  const [draft, setDraft] = useState<ScheduleEvent>(value);
  const members = users.filter((u) => u.role === "member");

  function set<K extends keyof ScheduleEvent>(key: K, val: ScheduleEvent[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }
  function toggleAssignee(id: string) {
    setDraft((d) => ({
      ...d,
      assigneeIds: d.assigneeIds.includes(id)
        ? d.assigneeIds.filter((x) => x !== id)
        : [...d.assigneeIds, id],
    }));
  }

  function handleSave(alsoRequest: boolean) {
    if (!draft.title.trim()) return alert("内容を入力してください");
    const saved = { ...draft, title: draft.title.trim() };
    onSave(saved);
    if (me.role === "owner" && draft.assigneeIds.length > 0) {
      if (alsoRequest) {
        for (const toUserId of draft.assigneeIds) {
          addRequest({
            date: saved.date,
            fromUserId: me.id,
            toUserId,
            type: saved.type,
            title: saved.title,
            location: saved.location,
            start: saved.start,
            end: saved.end,
            note: saved.note,
            eventId: saved.id,
          });
        }
      }
      // 担当者にプッシュ通知
      sendPushToUsers(
        draft.assigneeIds,
        alsoRequest ? "新しい依頼が届きました" : "新しい予定が登録されました",
        `${saved.date.slice(5).replace("-", "/")} ${saved.start}〜${saved.end || "未定"}　${TYPE_JP[saved.type] ?? ""}「${saved.title}」`,
        "/"
      );
    }
  }

  const canRequest = me.role === "owner" && draft.assigneeIds.length > 0;

  return (
    <div className="event-form">
      <label>
        何をするか
        <input
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="例: カフェ案件 撮影"
        />
      </label>
      <div className="row">
        <label>
          種別
          <select
            value={draft.type}
            onChange={(e) => set("type", e.target.value as EventType)}
          >
            <option value="shooting">撮影</option>
            <option value="meeting">会議</option>
            <option value="delivery">納品</option>
            <option value="other">その他</option>
          </select>
        </label>
        <label>
          場所
          <input
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="渋谷スタジオ / 住所など"
          />
          <MapLinks query={draft.location} />
        </label>
      </div>
      <div className="row">
        <label>
          開始
          <select value={draft.start} onChange={(e) => set("start", e.target.value)}>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          終了
          <select value={draft.end} onChange={(e) => set("end", e.target.value)}>
            <option value="">未定</option>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        担当者
        <div className="assignee-chips">
          {members.length === 0 && <span className="muted">メンバー未登録</span>}
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`pick ${draft.assigneeIds.includes(m.id) ? "on" : ""}`}
              onClick={() => toggleAssignee(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </label>
      <label>
        メモ
        <textarea value={draft.note} onChange={(e) => set("note", e.target.value)} rows={2} />
      </label>
      {me.role === "owner" && (
        <label className="reward-toggle">
          報酬
          <div className="shape-toggle">
            {([true, false] as boolean[]).map((v) => (
              <button
                key={String(v)}
                type="button"
                className={`type-btn ${(draft.hasReward !== false) === v ? "on" : ""}`}
                onClick={() => set("hasReward", v)}
              >
                {v ? "あり" : "なし"}
              </button>
            ))}
          </div>
          <span className="muted small">
            「なし」にすると、この予定は報酬の承認対象になりません
          </span>
        </label>
      )}
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={() => handleSave(false)}>保存</button>
        {canRequest && (
          <button className="primary" onClick={() => handleSave(true)}>
            保存して依頼する
          </button>
        )}
      </div>
      {canRequest && (
        <p className="muted small" style={{ marginTop: 6 }}>
          「保存して依頼する」で担当者全員に依頼を送信します
        </p>
      )}
    </div>
  );
}

// オーナーがメンバーへ依頼（申請）を送るフォーム
function RequestForm({
  date,
  fromUserId,
  toUser,
  onCancel,
  onSent,
}: {
  date: string;
  fromUserId: string;
  toUser: User;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [type, setType] = useState<EventType>("shooting");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  function send() {
    if (!title.trim()) return alert("依頼内容を入力してください");
    addRequest({
      date,
      fromUserId,
      toUserId: toUser.id,
      type,
      title: title.trim(),
      location,
      start,
      end,
      note,
    });
    sendPushToUsers(
      [toUser.id],
      "新しい依頼が届きました",
      `${date.slice(5).replace("-", "/")} ${start}〜${end || "未定"}　${TYPE_JP[type] ?? ""}「${title.trim()}」`,
      "/"
    );
    onSent();
  }

  return (
    <div className="event-form req-form">
      <div className="req-form-head">
        <strong>{toUser.name}</strong> さんへ依頼
      </div>
      <label>
        依頼内容
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: カフェ案件の撮影をお願いします"
        />
      </label>
      <div className="row">
        <label>
          種別
          <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            <option value="shooting">撮影</option>
            <option value="meeting">会議</option>
            <option value="delivery">納品</option>
            <option value="other">その他</option>
          </select>
        </label>
        <label>
          場所
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="渋谷スタジオ / 住所など"
          />
          <MapLinks query={location} />
        </label>
      </div>
      <div className="row">
        <label>
          開始
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          終了
          <select value={end} onChange={(e) => setEnd(e.target.value)}>
            <option value="">未定</option>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        メモ
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={send}>依頼を送る</button>
      </div>
    </div>
  );
}
