import { useEffect, useMemo, useRef, useState } from "react";
import { Clock as ClockIcon, ClipboardCheck, MapPin, User as UserIcon, Search } from "lucide-react";
import {
  CAFE_ORDER_STATUS_LABEL,
  EVENT_TYPE_COLOR,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  PAYMENT_METHOD_LABEL,
  REQUEST_STATUS_LABEL,
  RESERVATION_SOURCE_LABEL,
  MANUAL_RESERVATION_SOURCES,
  ROOM_TYPES,
  GUEST_COUNT_OPTIONS,
  STAY_COUNT_OPTIONS,
  CHECKIN_TIME_OPTIONS,
  type CafeHours,
  type ChecklistItem,
  type EventType,
  type PaymentMethod,
  type Reservation,
  type ScheduleEvent,
  type ShiftTemplate,
  type ShiftTiming,
  type User,
} from "../types";
import {
  addChecklistItem,
  addRequest,
  approveRequest,
  availabilityOn,
  deleteChecklistItem,
  deleteEvent,
  getAvailability,
  getAvailabilityFor,
  getChecklistItems,
  getEvents,
  eventsAwaitingAdmin,
  getMembers,
  getReservations,
  getShiftTemplates,
  shiftTemplateNameById,
  eventsForUserOn,
  timeClockFor,
  clockIn,
  clockOut,
  getCafeHours,
  cafeHoursOn,
  upsertCafeHours,
  newCafeHours,
  deleteCafeHours,
  getCafeOrders,
  pendingCafeOrdersByDeadline,
  toggleCafeOrderDone,
  deleteCafeOrder,
  approveCancelCafeOrder,
  rejectCancelCafeOrder,
  requestCancelCafeOrder,
  getUnseenAssignedEvents,
  getUnseenCafeOrders,
  getUnseenRespondedRequests,
  getUsers,
  markAssignedEventsSeen,
  markCafeOrdersSeen,
  markRespondedRequestsSeen,
  pendingEventApprovalsForUser,
  pendingRequestsForUser,
  rejectRequest,
  reservationsOn,
  findRoomConflict,
  upsertReservation,
  deleteReservation,
  newManualReservation,
  getReservationPlans,
  reservationPlanNameById,
  requestsOn,
  toggleChecklistItem,
  upsertEvent,
  uid,
} from "../store";
import { WEEKDAYS, addDays, monthGrid, todayStr, ymd } from "../lib/date";
import { sendPushToUsers } from "../lib/push";
import MapLinks from "./MapLinks";
import { CafeQuickOrderForm } from "./CafeOrders";

// プッシュ通知の文面に使う表示名（旧データの種別も残しておく）
const TYPE_JP: Record<string, string> = {
  train: "トレインルーム",
  retro: "レトロルーム",
  shift: "出勤",
  shooting: "撮影",
  meeting: "会議",
  delivery: "納品",
  other: "予定",
};

// 予約の部屋名 → カレンダー凡例と同じ色（トレイン=青 / レトロ=オレンジ）
const ROOM_TYPE_COLOR: Record<string, string> = {
  トレインルーム: EVENT_TYPE_COLOR.train,
  レトロルーム: EVENT_TYPE_COLOR.retro,
};

const ROOM_TYPE_ICON: Record<string, string> = {
  トレインルーム: "🚂",
  レトロルーム: "📺",
};

// 時間プルダウン用スロット（30分刻み）
const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

// シフトの1コマ（実際に働く日・時間・業務内容）
type ShiftSlot = { date: string; start: string; end: string; title: string; templateId: string };

// 1つの timing が、宿泊期間中どの日付に発生するかを返す。
function datesForTiming(timing: ShiftTiming, checkin: string, checkout: string): string[] {
  switch (timing) {
    case "checkin":
      return [checkin];
    case "checkout":
      return [checkout];
    case "every_morning": {
      const out: string[] = [];
      for (let d = addDays(checkin, 1); d <= checkout; d = addDays(d, 1)) out.push(d);
      return out;
    }
    case "middle_day": {
      const out: string[] = [];
      for (let d = addDays(checkin, 1); d < checkout; d = addDays(d, 1)) out.push(d);
      return out;
    }
  }
}

// 設定されたコマ（テンプレート）を、宿泊期間の実際の日付に展開する。
// 連泊の中日は清掃が不要なので、timingごとに発生する日を変えている。
// timingsを複数選択している場合はすべての日付をまとめて展開する（重複日は1つに）。
function expandTemplate(t: ShiftTemplate, checkin: string, checkout: string): ShiftSlot[] {
  const dates = new Set<string>();
  for (const timing of t.timings)
    for (const d of datesForTiming(timing, checkin, checkout)) dates.add(d);
  return [...dates].map((date) => ({
    date,
    start: t.startTime,
    end: t.endTime,
    title: t.name,
    templateId: t.id,
  }));
}

const slotKey = (s: ShiftSlot) => `${s.date}|${s.start}|${s.end}`;

// その日にチェックインする予約からコマを作る。
// 予約がない日は「その日から1泊」とみなして同じルールで展開する。
function buildShiftSlots(
  date: string,
  reservations: Reservation[],
  templates: ShiftTemplate[]
): ShiftSlot[] {
  const starting = reservations.filter((r) => r.checkinDate === date);
  const stays =
    starting.length > 0
      ? starting.map((r) => ({ checkin: r.checkinDate, checkout: r.checkoutDate }))
      : [{ checkin: date, checkout: addDays(date, 1) }];

  const source = stays.flatMap((s) =>
    templates.flatMap((t) => expandTemplate(t, s.checkin, s.checkout))
  );

  // 同じ日・同じ時間のコマは1つにまとめる（2部屋同時予約で朝食が重複するため）
  const merged = new Map<string, ShiftSlot>();
  for (const s of source) if (!merged.has(slotKey(s))) merged.set(slotKey(s), s);
  return [...merged.values()].sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)
  );
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
    () => (me.role !== "owner" ? pendingRequestsForUser(me.id) : []),
    [version, me]
  );
  const pendingPay = useMemo(
    () => (me.role !== "owner" ? pendingEventApprovalsForUser(me.id) : []),
    [version, me]
  );
  // オーナー：過ぎた予定で承認依頼を送るべきもの
  const awaitingAdmin = useMemo(
    () => (me.role === "owner" ? eventsAwaitingAdmin() : []),
    [version, me]
  );
  // メンバー・カフェ管理人：自分に割り当てられた新しい予定（未確認）
  const unseenEvents = useMemo(
    () => (me.role !== "owner" ? getUnseenAssignedEvents(me.id) : []),
    [version, me]
  );
  // オーナー：自分が送った依頼が承認・却下された（未確認）
  const unseenResponded = useMemo(
    () => (me.role === "owner" ? getUnseenRespondedRequests(me.id) : []),
    [version, me]
  );
  // オーナー：カフェの発注が新しく届いた（未確認）
  const unseenCafeOrders = useMemo(
    () => (me.role === "owner" ? getUnseenCafeOrders(me.id) : []),
    [version, me]
  );
  // オーナー：カフェの発注の取り消し依頼（承認/却下するまでずっと表示する）
  const cafeCancelRequests = useMemo(
    () => (me.role === "owner" ? getCafeOrders().filter((o) => o.cancelRequested) : []),
    [version, me]
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  // 宿泊予約（ねっぱん！から同期）：チェックイン〜チェックアウト前日の各日に展開
  const reservations = useMemo(() => getReservations(), [version]);
  const reservationsByDate = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    for (const r of reservations) {
      if (r.status !== "confirmed") continue;
      for (let d = new Date(r.checkinDate); ymd(d) < r.checkoutDate; d.setDate(d.getDate() + 1)) {
        (map[ymd(d)] ??= []).push(r);
      }
    }
    return map;
  }, [reservations]);

  // LOCOMO CAFEの営業時間（日付ごとに1件）
  const cafeHours = useMemo(() => getCafeHours(), [version]);
  const cafeHoursByDate = useMemo(() => {
    const map: Record<string, CafeHours> = {};
    for (const c of cafeHours) map[c.date] = c;
    return map;
  }, [cafeHours]);

  // カフェの発注締切（未対応の発注のみ、締切日ごとにまとめる）
  const canManageCafe = me.role === "owner" || me.role === "cafe_manager";
  const cafeOrderDeadlines = useMemo(
    () => (canManageCafe ? pendingCafeOrdersByDeadline() : {}),
    [version, canManageCafe]
  );

  // 予約はあるのにスタッフが一人も配置されていない日（当月のみ）
  const shortStaffedDates = useMemo(() => {
    if (!isOwner) return [] as string[];
    return grid
      .filter((d) => d.getMonth() === month)
      .map((d) => ymd(d))
      .filter((ds) => {
        if ((reservationsByDate[ds]?.length ?? 0) === 0) return false;
        const staffIds = new Set<string>();
        for (const e of eventsByDate[ds] ?? []) for (const id of e.assigneeIds) staffIds.add(id);
        return staffIds.size === 0;
      });
  }, [grid, month, reservationsByDate, eventsByDate, isOwner]);

  const availNamesByDate = useMemo(() => {
    const nameById: Record<string, string> = {};
    for (const u of users) if (u.role !== "owner") nameById[u.id] = u.name;
    const map: Record<string, { name: string; slots: string[] }[]> = {};
    for (const a of getAvailability())
      if ((a.slots.length > 0 || a.comment) && nameById[a.userId])
        (map[a.date] ??= []).push({
          name: nameById[a.userId],
          slots: a.slots.map((s) => shiftTemplateNameById(s)),
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
        {!isOwner && <TodayPunchPanel me={me} onChange={refresh} />}

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
                              {a.slots.map((s) => shiftTemplateNameById(s)).join("・") || "—"}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {searchMatchDates.size > 0 && (
                <BulkShiftForm
                  dates={[...searchMatchDates].sort()}
                  memberIds={searchSelected}
                  members={allMembers}
                  onDone={() => {
                    refresh();
                    setSearchSelected([]);
                  }}
                />
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
                  <span className="banner-req-main">{r.title}</span>
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
        {unseenResponded.length > 0 && (
          <div className="pending-banner event">
            <span className="pending-banner-text">
              依頼の返答が <strong>{unseenResponded.length}件</strong> 届いています
              <span className="unseen-dates">
                {unseenResponded
                  .slice(0, 4)
                  .map((r) => {
                    const name = users.find((u) => u.id === r.toUserId)?.name ?? "";
                    return `${name}：${REQUEST_STATUS_LABEL[r.status]}`;
                  })
                  .join("、")}
              </span>
            </span>
            <button
              className="primary"
              onClick={() => {
                markRespondedRequestsSeen(me.id);
                refresh();
              }}
            >
              確認しました
            </button>
          </div>
        )}
        {unseenCafeOrders.length > 0 && (
          <div className="pending-banner event">
            <span className="pending-banner-text">
              カフェの発注が <strong>{unseenCafeOrders.length}件</strong> 届いています
              <span className="unseen-dates">
                {unseenCafeOrders
                  .slice(0, 4)
                  .map((o) => o.items)
                  .join("、")}
              </span>
            </span>
            <button
              className="primary"
              onClick={() => {
                markCafeOrdersSeen(me.id);
                refresh();
              }}
            >
              確認しました
            </button>
          </div>
        )}
        {cafeCancelRequests.length > 0 && (
          <div className="pending-banner warn">
            <span className="pending-banner-text">
              カフェの発注の取り消し依頼が <strong>{cafeCancelRequests.length}件</strong> あります
              <span className="unseen-dates">
                {cafeCancelRequests
                  .slice(0, 4)
                  .map((o) => o.items)
                  .join("、")}
              </span>
            </span>
          </div>
        )}
        {shortStaffedDates.length > 0 && (
          <div className="pending-banner warn">
            <span className="pending-banner-text">
              予約はあるのにスタッフが未配置の日が <strong>{shortStaffedDates.length}日</strong> あります
              <span className="unseen-dates">
                {shortStaffedDates.slice(0, 4).map((d) => d.slice(5).replace("-", "/")).join("、")}
              </span>
            </span>
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
            const isShortStaffed = isOwner && inMonth && shortStaffedDates.includes(ds);
            return (
              <div
                key={ds}
                className={`cal-cell ${inMonth ? "" : "dim"} ${
                  ds === todayStr() ? "today" : ""
                } ${selected === ds ? "sel" : ""} ${isDragOver ? "drag-over" : ""} ${isSearchHit ? "hit" : ""} ${isMyDay ? "my-day" : ""} ${isShortStaffed ? "short-staffed" : ""}`}
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
                {ROOM_TYPES.map((room) => {
                  const list = (reservationsByDate[ds] ?? []).filter((r) => r.roomType === room);
                  if (list.length === 0) return null;
                  return (
                    <div
                      key={room}
                      className="cal-reservations"
                      style={{ color: ROOM_TYPE_COLOR[room], background: `${ROOM_TYPE_COLOR[room]}1a` }}
                      title={list.map((r) => r.guestName || "予約").join("、")}
                    >
                      {ROOM_TYPE_ICON[room]} {room} {list.length}件
                    </div>
                  );
                })}
                {cafeHoursByDate[ds] && (
                  <div className="cal-reservations cal-cafe-hours">
                    ☕ {cafeHoursByDate[ds].openTime}–{cafeHoursByDate[ds].closeTime}
                  </div>
                )}
                {cafeOrderDeadlines[ds] && (
                  <div
                    className="cal-reservations cal-cafe-deadline"
                    title={cafeOrderDeadlines[ds].map((o) => o.items).join("、")}
                  >
                    📦 締切:{" "}
                    {cafeOrderDeadlines[ds]
                      .slice(0, 2)
                      .map((o) => o.items)
                      .join("、")}
                    {cafeOrderDeadlines[ds].length > 2 &&
                      ` 他${cafeOrderDeadlines[ds].length - 2}件`}
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

function punchTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// カレンダー上部の打刻パネル。シフトが入っている日だけ表示し、現在時刻と打刻時刻を出す。
function TodayPunchPanel({ me, onChange }: { me: User; onChange: () => void }) {
  const today = todayStr();
  const [now, setNow] = useState(() => new Date());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const myShifts = useMemo(() => eventsForUserOn(me.id, today), [me.id, today, version]);
  const clock = useMemo(() => timeClockFor(me.id, today), [me.id, today, version]);

  // シフトが入っていない日は打刻の必要がないので出さない
  if (myShifts.length === 0) return null;

  const clockLabel = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  return (
    <div className="punch-panel">
      <div className="punch-head">
        <ClockIcon size={14} strokeWidth={2} />
        <span className="punch-now">{clockLabel}</span>
        <span className="punch-date">{today.replace(/-/g, "/")}</span>
      </div>

      <div className="punch-shifts">
        {myShifts.map((e) => (
          <span key={e.id} className="punch-shift">
            {e.title} {e.start}–{e.end || "未定"}
          </span>
        ))}
      </div>

      <div className="punch-status">
        <span>出勤 <strong>{punchTime(clock?.clockIn)}</strong></span>
        <span>退勤 <strong>{punchTime(clock?.clockOut)}</strong></span>
      </div>

      <div className="clock-actions">
        <button
          className="primary"
          disabled={!!clock?.clockIn}
          onClick={() => {
            clockIn(me.id);
            setVersion((v) => v + 1);
            onChange();
          }}
        >
          出勤する
        </button>
        <button
          className="ghost"
          disabled={!clock?.clockIn || !!clock?.clockOut}
          onClick={() => {
            clockOut(me.id);
            setVersion((v) => v + 1);
            onChange();
          }}
        >
          退勤する
        </button>
      </div>
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
  // 日付を開いた時点で予約の入力欄を出しておく（ボタンを押す手間をなくす）
  const [editingReservation, setEditingReservation] = useState<Reservation>(() =>
    newManualReservation(date)
  );
  const [requestFormIds, setRequestFormIds] = useState<string[] | null>(null);
  const [requestingEvent, setRequestingEvent] = useState<ScheduleEvent | null>(null);
  const [editingCafeHours, setEditingCafeHours] = useState<CafeHours | null>(null);
  const availList = availabilityOn(date).filter((a) =>
    users.some((u) => u.id === a.userId && u.role !== "owner")
  );
  const dayReservations = reservationsOn(date);
  const dayRequests = requestsOn(date);
  const members = users.filter((u) => u.role !== "owner");
  const dayCafeHours = cafeHoursOn(date);
  const shiftTemplates = getShiftTemplates();
  // カフェ管理人はメンバーとほぼ同じ権限だが、LOCOMO CAFEの営業時間だけ追加・編集できる
  const canManageCafe = me.role === "owner" || me.role === "cafe_manager";
  // この営業日を対象に、すでに発注されている内容（対応済みも含めて表示する）
  const cafeDateOrders = getCafeOrders().filter((o) => o.cafeDate === date);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>{date.replace(/-/g, "/")}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        {dayReservations.length > 0 && (
          <div className="avail-box">
            <strong>この日の宿泊予約（{dayReservations.length}件）</strong>
            <div className="reservation-list">
              {dayReservations.map((r) => (
                <div key={r.id} className="reservation-item">
                  <div className="reservation-head">
                    <span className="avail-chip">{r.guestName || "ゲスト"}</span>
                    <span className="tag">{r.roomType || "部屋未設定"}</span>
                    <span className="tag muted">
                      {RESERVATION_SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                    {r.planId && (
                      <span className="tag muted">{reservationPlanNameById(r.planId)}</span>
                    )}
                  </div>
                  <div className="reservation-meta">
                    {r.checkinDate.slice(5).replace("-", "/")}〜
                    {r.checkoutDate.slice(5).replace("-", "/")}
                    <span className="reservation-sep">·</span>
                    IN {r.checkinTime}
                    <span className="reservation-sep">·</span>
                    {guestSummary(r)}
                  </div>
                  {r.address && <div className="reservation-meta">📍 {r.address}</div>}
                  {r.note && <div className="event-note">{r.note}</div>}
                  {me.role === "owner" && (
                    <div className="reservation-meta">
                      💴{" "}
                      {r.paymentMethod
                        ? `${PAYMENT_METHOD_LABEL[r.paymentMethod]}${
                            r.paymentMethod === "onsite"
                              ? `・${(r.paymentAmount ?? 0).toLocaleString()}円`
                              : ""
                          }`
                        : "決済方法未設定"}
                    </div>
                  )}
                  {me.role === "owner" && (
                    <div className="event-actions">
                      <button className="ghost" onClick={() => setEditingReservation(r)}>
                        編集
                      </button>
                      <button
                        className="ghost danger"
                        onClick={() => {
                          if (confirm(`「${r.guestName || "ゲスト"}」の予約を削除しますか？`)) {
                            deleteReservation(r.id);
                            onChange();
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LOCOMO CAFEの営業時間 */}
        <div className="avail-box">
          <strong>☕ LOCOMO CAFE</strong>
          {editingCafeHours ? (
            <CafeHoursForm
              value={editingCafeHours}
              onCancel={() => setEditingCafeHours(null)}
              onSave={(c) => {
                upsertCafeHours(c);
                setEditingCafeHours(null);
                onChange();
              }}
            />
          ) : dayCafeHours ? (
            <div className="reservation-item">
              <div className="reservation-meta">
                営業時間 {dayCafeHours.openTime}〜{dayCafeHours.closeTime}
              </div>
              {dayCafeHours.note && <div className="event-note">{dayCafeHours.note}</div>}
              {canManageCafe && (
                <div className="event-actions">
                  <button className="ghost" onClick={() => setEditingCafeHours(dayCafeHours)}>
                    編集
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => {
                      if (confirm("LOCOMO CAFEのこの日の営業時間を削除しますか？")) {
                        deleteCafeHours(dayCafeHours.id);
                        onChange();
                      }
                    }}
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          ) : canManageCafe ? (
            <button
              className="ghost mini"
              onClick={() => setEditingCafeHours(newCafeHours(date))}
            >
              ＋ 営業時間を設定
            </button>
          ) : (
            <span className="muted">営業なし</span>
          )}

          {dayCafeHours && canManageCafe && cafeDateOrders.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <strong>この営業日への発注</strong>
              <div className="req-cards">
                {cafeDateOrders.map((o) => (
                  <div key={o.id} className="req-card">
                    <div className="req-card-head">
                      <span
                        className={`req-status ${o.status === "done" ? "approved" : "pending"}`}
                      >
                        {CAFE_ORDER_STATUS_LABEL[o.status]}
                      </span>
                      {o.cancelRequested && (
                        <span className="req-status pending">取り消し依頼中</span>
                      )}
                    </div>
                    {me.role === "owner" && (
                      <div className="req-card-meta">
                        発注者: {users.find((u) => u.id === o.userId)?.name ?? "不明"}
                      </div>
                    )}
                    <div className="req-card-title">{o.items}</div>
                    {o.note && <div className="req-card-note">{o.note}</div>}

                    {o.status === "pending" && me.role === "owner" && (
                      <div className="req-card-actions">
                        {o.cancelRequested ? (
                          <>
                            <button
                              className="ghost"
                              onClick={() => {
                                rejectCancelCafeOrder(o.id);
                                onChange();
                              }}
                            >
                              依頼を却下する
                            </button>
                            <button
                              className="ghost danger"
                              onClick={() => {
                                if (confirm("取り消しを承認して、この発注を削除しますか？")) {
                                  approveCancelCafeOrder(o.id);
                                  onChange();
                                }
                              }}
                            >
                              承認して取り消す
                            </button>
                          </>
                        ) : (
                          <button
                            className="ghost danger"
                            onClick={() => {
                              if (confirm("この発注を削除しますか？")) {
                                deleteCafeOrder(o.id);
                                onChange();
                              }
                            }}
                          >
                            発注を取り消す
                          </button>
                        )}
                      </div>
                    )}

                    {o.status === "pending" && me.role !== "owner" && o.userId === me.id && (
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
                              onChange();
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
            </div>
          )}

          {dayCafeHours && me.role !== "owner" && canManageCafe && (
            <div style={{ marginTop: 10 }}>
              <strong>発注する</strong>
              <CafeQuickOrderForm me={me} cafeDate={date} onSent={onChange} />
            </div>
          )}
        </div>

        {canManageCafe && (pendingCafeOrdersByDeadline()[date]?.length ?? 0) > 0 && (
          <div className="avail-box">
            <strong>📦 発注締切</strong>
            <div className="req-cards">
              {pendingCafeOrdersByDeadline()[date].map((o) => (
                <div key={o.id} className="req-card">
                  <div className="req-card-title">{o.items}</div>
                  {o.cafeDate && (
                    <div className="req-card-meta">
                      対象のカフェ営業日: {o.cafeDate.replace(/-/g, "/")}
                    </div>
                  )}
                  {me.role === "owner" && (
                    <div className="req-card-meta">
                      発注者: {users.find((u) => u.id === o.userId)?.name ?? "不明"}
                    </div>
                  )}
                  {o.note && <div className="req-card-note">{o.note}</div>}
                  {o.cancelRequested && (
                    <p className="muted small" style={{ margin: "4px 0", color: "var(--danger)" }}>
                      ⚠️ 取り消し依頼中です
                      {me.role === "owner" ? "（承認すると発注が削除されます）" : ""}
                    </p>
                  )}
                  {me.role === "owner" && o.cancelRequested && (
                    <div className="event-actions">
                      <button
                        className="ghost"
                        onClick={() => {
                          rejectCancelCafeOrder(o.id);
                          onChange();
                        }}
                      >
                        依頼を却下する
                      </button>
                      <button
                        className="ghost danger"
                        onClick={() => {
                          if (confirm("取り消しを承認して、この発注を削除しますか？")) {
                            approveCancelCafeOrder(o.id);
                            onChange();
                          }
                        }}
                      >
                        承認して取り消す
                      </button>
                    </div>
                  )}
                  {me.role === "owner" && (
                    <div className="event-actions">
                      <button
                        className="ghost danger"
                        onClick={() => {
                          if (confirm("この発注を削除しますか？")) {
                            deleteCafeOrder(o.id);
                            onChange();
                          }
                        }}
                      >
                        発注を取り消す
                      </button>
                      <button
                        className="primary"
                        onClick={() => {
                          toggleCafeOrderDone(o.id);
                          onChange();
                        }}
                      >
                        対応済みにする
                      </button>
                    </div>
                  )}
                  {me.role !== "owner" && o.userId === me.id && !o.cancelRequested && (
                    <div className="event-actions">
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
                          onChange();
                        }}
                      >
                        取り消しを依頼する
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                        {a.slots.map((s) => shiftTemplateNameById(s)).join("・") || "—"}
                      </span>
                      {a.comment && <span className="avail-comment">{a.comment}</span>}
                      {member && (
                        <button
                          className="ghost mini req-btn"
                          onClick={() => setRequestFormIds([member.id])}
                        >
                          依頼する
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {members.length > 0 && !requestFormIds && (
              <button
                className="ghost mini"
                onClick={() => setRequestFormIds([])}
              >
                ＋ シフトの依頼を送る
              </button>
            )}
          </div>
        )}

        {me.role === "owner" && requestFormIds && (
          <RequestForm
            date={date}
            fromUserId={me.id}
            members={members}
            reservations={getReservations()}
            templates={shiftTemplates}
            initialSelectedIds={requestFormIds}
            onCancel={() => setRequestFormIds(null)}
            onSent={() => {
              setRequestFormIds(null);
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
                  {users.find((u) => u.id === r.toUserId)?.name} ／ {r.title} ／{" "}
                  {r.date.slice(5).replace("-", "/")} {r.start}〜
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="event-list">
          {events.length === 0 && <p className="muted">予定はありません</p>}
          {events.map((e) => {
            const isMyEvent = me.role !== "owner" && e.assigneeIds.includes(me.id);
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
                        : me.name
                      : e.assigneeIds
                          .map((id) => users.find((u) => u.id === id)?.name)
                          .filter(Boolean)
                          .join(", ") || "未割当"}
                  </div>
                  {e.note && <div className="event-note">{e.note}</div>}
                  <EventChecklist eventId={e.id} canManage={me.role === "owner"} />
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
                  {me.role === "owner" && (
                    <button className="ghost" onClick={() => setEditing(e)}>
                      編集
                    </button>
                  )}
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
          me.role === "owner" &&
          !requestingEvent && (
            <ReservationForm
              // 保存・キャンセル後は空のフォームに戻し、続けて次の予約を入力できるようにする
              key={editingReservation.id}
              value={editingReservation}
              onCancel={() => setEditingReservation(newManualReservation(date))}
              onSave={(rs) => {
                rs.forEach(upsertReservation);
                setEditingReservation(newManualReservation(date));
                onChange();
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

// 人数の内訳を「大人2・就学児1」のように短くまとめる
// LOCOMO CAFEの営業時間を入力するフォーム（営業する日だけ登録する）
function CafeHoursForm({
  value,
  onCancel,
  onSave,
}: {
  value: CafeHours;
  onCancel: () => void;
  onSave: (c: CafeHours) => void;
}) {
  const [draft, setDraft] = useState<CafeHours>(value);
  function set<K extends keyof CafeHours>(key: K, val: CafeHours[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }
  function handleSave() {
    if (draft.closeTime <= draft.openTime) {
      return alert("閉店時間は開店時間より後にしてください");
    }
    onSave(draft);
  }
  return (
    <div className="event-form">
      <div className="row">
        <label>
          開店時間
          <select value={draft.openTime} onChange={(e) => set("openTime", e.target.value)}>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          閉店時間
          <select value={draft.closeTime} onChange={(e) => set("closeTime", e.target.value)}>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        メモ（オプション・任意）
        <textarea
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          rows={2}
          placeholder="例: 貸切営業 / 臨時休業の理由など"
        />
      </label>
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}

function guestSummary(r: Reservation): string {
  const parts: string[] = [];
  if (r.adults) parts.push(`大人${r.adults}`);
  if (r.children) parts.push(`就学児${r.children}`);
  if (r.infants) parts.push(`幼児${r.infants}`);
  parts.push(r.pastStayCount > 0 ? `過去${r.pastStayCount}回宿泊` : "初めてのご宿泊");
  return parts.length > 0 ? parts.join("・") : "人数未設定";
}

// 管理者が予約を手入力するフォーム
function ReservationForm({
  value,
  onCancel,
  onSave,
}: {
  value: Reservation;
  onCancel: () => void;
  onSave: (rs: Reservation[]) => void;
}) {
  const [draft, setDraft] = useState<Reservation>(value);
  // 同じお客様がトレインルーム・レトロルームを両方申し込むことがあるため複数選択可
  const [selectedRooms, setSelectedRooms] = useState<string[]>([value.roomType]);
  const reservationPlans = getReservationPlans();
  // 手入力しやすいよう文字列のまま保持し、保存時にだけ数値へ変換する
  const [amountStr, setAmountStr] = useState(String(value.paymentAmount ?? 0));

  function set<K extends keyof Reservation>(key: K, val: Reservation[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function setPaymentMethod(pm: PaymentMethod) {
    setDraft((d) => ({ ...d, paymentMethod: pm }));
    if (pm === "prepaid") setAmountStr("0");
  }

  function toggleRoom(room: string) {
    setSelectedRooms((cur) => {
      if (cur.includes(room)) {
        if (cur.length === 1) return cur; // 最低1部屋は選択された状態を保つ
        return cur.filter((r) => r !== room);
      }
      return [...cur, room];
    });
  }

  function handleSave() {
    if (!draft.guestName.trim()) return alert("氏名を入力してください");
    if (draft.checkoutDate <= draft.checkinDate)
      return alert("チェックアウト日はチェックイン日より後にしてください");

    const guestName = draft.guestName.trim();
    const paymentAmount =
      draft.paymentMethod === "onsite" ? Math.max(0, Number(amountStr) || 0) : 0;
    const base = { ...draft, guestName, paymentAmount };
    // 選択した部屋ごとに1件ずつ予約を作る。元の部屋はIDを維持し、追加分は新規発行する
    const candidates: Reservation[] = selectedRooms.map((room) => {
      if (room === base.roomType) return base;
      const key = `manual:${uid()}`;
      return { ...base, id: key, neppanBookingId: key, roomType: room };
    });

    // 1室につき1日1組までなので、期間が重なる予約があれば登録させない
    for (const r of candidates) {
      const conflict = findRoomConflict(r);
      if (conflict) {
        return alert(
          `${r.roomType}はすでに埋まっています。\n` +
            `${conflict.checkinDate.replace(/-/g, "/")}〜${conflict.checkoutDate.replace(/-/g, "/")}` +
            `「${conflict.guestName || "ゲスト"}」様のご予約と重なっています。`
        );
      }
    }

    onSave(candidates);
  }

  return (
    <div className="event-form">
      <label>
        部屋（複数選択可）
        <div className="shape-toggle">
          {ROOM_TYPES.map((room) => (
            <button
              key={room}
              type="button"
              className={`type-btn ${selectedRooms.includes(room) ? "on" : ""}`}
              onClick={() => toggleRoom(room)}
            >
              {room}
            </button>
          ))}
        </div>
      </label>

      <label>
        予約元
        <select value={draft.source} onChange={(e) => set("source", e.target.value)}>
          {MANUAL_RESERVATION_SOURCES.map((s) => (
            <option key={s} value={s}>{RESERVATION_SOURCE_LABEL[s]}</option>
          ))}
        </select>
      </label>

      <label>
        プラン
        {reservationPlans.length === 0 ? (
          <p className="muted small">
            まだプランが登録されていません。設定画面から追加してください。
          </p>
        ) : (
          <select
            value={draft.planId ?? ""}
            onChange={(e) => set("planId", e.target.value || undefined)}
          >
            <option value="">選択なし</option>
            {reservationPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </label>

      <div className="row">
        <label>
          チェックイン日
          <input
            type="date"
            value={draft.checkinDate}
            onChange={(e) => set("checkinDate", e.target.value)}
          />
        </label>
        <label>
          チェックアウト日
          <input
            type="date"
            value={draft.checkoutDate}
            onChange={(e) => set("checkoutDate", e.target.value)}
          />
        </label>
      </div>

      <label>
        チェックイン時間
        <select
          value={draft.checkinTime}
          onChange={(e) => set("checkinTime", e.target.value)}
        >
          {CHECKIN_TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label>
        氏名
        <input
          value={draft.guestName}
          onChange={(e) => set("guestName", e.target.value)}
          placeholder="例: 山田 太郎"
        />
      </label>

      <label>
        住所
        <input
          value={draft.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="例: 東京都渋谷区○○ 1-2-3"
        />
      </label>

      <label>
        過去の宿泊回数
        <select
          value={draft.pastStayCount}
          onChange={(e) => set("pastStayCount", Number(e.target.value))}
        >
          {STAY_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>{n === 10 ? "10回以上" : `${n}回`}</option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>
          大人
          <select
            value={draft.adults}
            onChange={(e) => set("adults", Number(e.target.value))}
          >
            {GUEST_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}人</option>
            ))}
          </select>
        </label>
        <label>
          就学児
          <select
            value={draft.children}
            onChange={(e) => set("children", Number(e.target.value))}
          >
            {GUEST_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}人</option>
            ))}
          </select>
        </label>
        <label>
          幼児
          <select
            value={draft.infants}
            onChange={(e) => set("infants", Number(e.target.value))}
          >
            {GUEST_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}人</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        決済方法
        <div className="shape-toggle">
          {(["onsite", "prepaid"] as PaymentMethod[]).map((pm) => (
            <button
              key={pm}
              type="button"
              className={`type-btn ${draft.paymentMethod === pm ? "on" : ""}`}
              onClick={() => setPaymentMethod(pm)}
            >
              {PAYMENT_METHOD_LABEL[pm]}
            </button>
          ))}
        </div>
      </label>

      {draft.paymentMethod === "onsite" ? (
        <label>
          金額
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="例: 8000"
          />
        </label>
      ) : (
        draft.paymentMethod === "prepaid" && (
          <p className="muted small">事前決済のため、現地でのお支払いは0円です。</p>
        )
      )}

      <label>
        メモ（オプション・任意）
        <textarea
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          rows={3}
          placeholder="例: 夕食なし / アレルギーあり / 到着が遅れる可能性あり"
        />
      </label>

      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={handleSave}>保存</button>
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
  const members = users.filter((u) => u.role !== "owner");

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

  // 担当者が既にいる予定の勤務時間（開始・終了）を変えた場合は、即確定せず
  // 担当者の承認を経てから予定に反映する（無断でシフト時間が変わるのを防ぐ）。
  const timeChanged = draft.start !== value.start || draft.end !== value.end;
  const needsApproval = draft.assigneeIds.length > 0 && timeChanged;

  function handleSave(alsoRequest: boolean) {
    if (!draft.title.trim()) return alert("内容を入力してください");
    const title = draft.title.trim();

    if (me.role === "owner" && needsApproval) {
      // 時間の変更は担当者の承認待ちにする。予定自体は元の時間のまま保存する。
      const saved = { ...draft, title, start: value.start, end: value.end };
      onSave(saved);
      for (const toUserId of draft.assigneeIds) {
        addRequest({
          date: draft.date,
          fromUserId: me.id,
          toUserId,
          type: draft.type,
          title,
          location: draft.location,
          start: draft.start,
          end: draft.end,
          note: draft.note,
          eventId: value.id,
        });
      }
      sendPushToUsers(
        draft.assigneeIds,
        "勤務時間の変更確認をお願いします",
        `${draft.date.slice(5).replace("-", "/")} ${draft.start}〜${draft.end || "未定"}　${TYPE_JP[draft.type] ?? ""}「${title}」`,
        "/"
      );
      return;
    }

    const saved = { ...draft, title };
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
      <label>
        種別
        <select
          value={draft.type}
          onChange={(e) => set("type", e.target.value as EventType)}
        >
          <option value="train">トレインルーム</option>
          <option value="retro">レトロルーム</option>
        </select>
      </label>
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
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={() => handleSave(false)}>
          {needsApproval ? "変更を依頼する" : "保存"}
        </button>
        {canRequest && !needsApproval && (
          <button className="primary" onClick={() => handleSave(true)}>
            保存して依頼する
          </button>
        )}
      </div>
      {needsApproval ? (
        <p className="muted small" style={{ marginTop: 6 }}>
          勤務時間を変更したので、担当者に承認を依頼します。承認されるまで予定の時間は変わりません。
        </p>
      ) : (
        canRequest && (
          <p className="muted small" style={{ marginTop: 6 }}>
            「保存して依頼する」で担当者全員に依頼を送信します
          </p>
        )
      )}
    </div>
  );
}

// オーナーがメンバーへ依頼（申請）を送るフォーム。
// 予約から必要なコマ（業務・実際の勤務日）を割り出し、コマごとに送信先を選べる。
function RequestForm({
  date,
  fromUserId,
  members,
  reservations,
  templates,
  initialSelectedIds,
  onCancel,
  onSent,
}: {
  date: string;
  fromUserId: string;
  members: User[];
  reservations: Reservation[];
  templates: ShiftTemplate[];
  initialSelectedIds: string[];
  onCancel: () => void;
  onSent: () => void;
}) {
  // 画面からは部屋の選択・場所欄をなくしたが、type/location列自体はDB上必須のため固定値で送る
  const type: EventType = "train";
  const location = "";
  const [note, setNote] = useState("");

  const slots = useMemo(
    () => buildShiftSlots(date, reservations, templates),
    [date, reservations, templates]
  );
  // コマごとの送信先。まとめて依頼も、コマ別に違う人へ依頼もできるようにしている。
  const [assignees, setAssignees] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(slots.map((s) => [slotKey(s), initialSelectedIds]))
  );
  // 特定の1人に「依頼する」で開いた場合は、その人が稼働可能日設定で
  // 対応できると登録しているコマに自動でチェックを入れる。
  const [checked, setChecked] = useState<string[]>(() => {
    if (initialSelectedIds.length !== 1) return [];
    const avail = getAvailabilityFor(initialSelectedIds[0], date);
    if (!avail) return [];
    return slots.filter((s) => avail.slots.includes(s.templateId)).map(slotKey);
  });

  function toggleSlot(key: string) {
    setChecked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }
  function toggleAssignee(key: string, memberId: string) {
    setAssignees((cur) => {
      const list = cur[key] ?? [];
      return {
        ...cur,
        [key]: list.includes(memberId)
          ? list.filter((id) => id !== memberId)
          : [...list, memberId],
      };
    });
  }
  // 全コマに同じ人をまとめて設定する（1人に全部お願いしたいとき用）
  function applyToAll(memberId: string) {
    const allHave = slots.every((s) => (assignees[slotKey(s)] ?? []).includes(memberId));
    setAssignees((cur) => {
      const next = { ...cur };
      for (const s of slots) {
        const key = slotKey(s);
        const list = next[key] ?? [];
        next[key] = allHave ? list.filter((id) => id !== memberId) : [...new Set([...list, memberId])];
      }
      return next;
    });
    if (!allHave) setChecked(slots.map(slotKey));
  }

  function send() {
    if (checked.length === 0) return alert("依頼するコマを選択してください");
    const targets = slots.filter((s) => checked.includes(slotKey(s)));
    for (const s of targets) {
      if ((assignees[slotKey(s)] ?? []).length === 0) {
        return alert(`「${s.title}」の送信先を選択してください`);
      }
    }
    const notified = new Set<string>();
    for (const s of targets) {
      for (const toUserId of assignees[slotKey(s)] ?? []) {
        addRequest({
          date: s.date,
          fromUserId,
          toUserId,
          type,
          title: s.title,
          location,
          start: s.start,
          end: s.end,
          note,
        });
        notified.add(toUserId);
      }
    }
    sendPushToUsers(
      [...notified],
      "新しい依頼が届きました",
      `${targets.length}件のシフト依頼が届いています`,
      "/"
    );
    onSent();
  }

  return (
    <div className="event-form req-form">
      <div className="req-form-head">シフトの依頼を送る</div>

      <label>
        全コマにまとめて依頼する
        <div className="search-chips">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pick ${slots.every((s) => (assignees[slotKey(s)] ?? []).includes(m.id)) ? "on" : ""}`}
              onClick={() => applyToAll(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </label>

      <label>依頼するコマ（複数選択可）</label>
      <div className="slot-list">
        {slots.map((s) => {
          const key = slotKey(s);
          const on = checked.includes(key);
          return (
            <div key={key} className={`slot-row ${on ? "on" : ""}`}>
              <label className="checkbox-row">
                <input type="checkbox" checked={on} onChange={() => toggleSlot(key)} />
                <span>
                  {s.date.slice(5).replace("-", "/")} {s.start}〜{s.end} ／ {s.title}
                </span>
              </label>
              {on && (
                <div className="search-chips slot-assignees">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`pick ${(assignees[key] ?? []).includes(m.id) ? "on" : ""}`}
                      onClick={() => toggleAssignee(key, m.id)}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

// 稼働日検索の結果(複数日)に対して、選択メンバー全員分のシフトをまとめて作成する
function BulkShiftForm({
  dates,
  memberIds,
  members,
  onDone,
}: {
  dates: string[];
  memberIds: string[];
  members: User[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const templates = useMemo(() => getShiftTemplates(), []);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  // 画面から種別選択・場所欄をなくしたが、type/location列自体はDB上必須のため固定値で送る
  const type: EventType = "train";
  const location = "";

  function toggleTemplate(id: string) {
    setTemplateIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function create() {
    if (memberIds.length === 0) return alert("メンバーを選択してください");
    const selected = templates.filter((t) => templateIds.includes(t.id));
    if (selected.length === 0) return alert("業務を選択してください");
    for (const date of dates) {
      for (const t of selected) {
        upsertEvent({
          id: uid(),
          date,
          type,
          title: t.name,
          location,
          assigneeIds: memberIds,
          start: t.startTime,
          end: t.endTime,
          note: "",
        });
      }
    }
    sendPushToUsers(
      memberIds,
      "新しい予定が登録されました",
      `${dates.length}日ぶんのシフトが登録されました：${selected.map((t) => t.name).join("・")}`,
      "/"
    );
    setTemplateIds([]);
    setOpen(false);
    onDone();
  }

  if (dates.length === 0) return null;

  return (
    <div className="bulk-shift-box">
      {!open ? (
        <button type="button" className="primary mini" onClick={() => setOpen(true)}>
          ＋この{dates.length}日でまとめてシフト作成
        </button>
      ) : (
        <div className="event-form">
          <label>何をするか（複数選択可）</label>
          <div className="slot-picker">
            {templates.length === 0 ? (
              <span className="muted small">
                シフトのコマが設定されていません。設定画面から追加してください。
              </span>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`slot-btn ${templateIds.includes(t.id) ? "on" : ""}`}
                  onClick={() => toggleTemplate(t.id)}
                >
                  {t.name}（{t.startTime}〜{t.endTime}）
                </button>
              ))
            )}
          </div>
          <p className="muted small">
            対象: {dates.length}日（{dates.slice(0, 3).map((d) => d.slice(5).replace("-", "/")).join("、")}
            {dates.length > 3 ? "…" : ""}） ×{" "}
            {members.filter((m) => memberIds.includes(m.id)).map((m) => m.name).join("、")}
          </p>
          <div className="form-actions">
            <button className="ghost" onClick={() => setOpen(false)}>キャンセル</button>
            <button className="primary" onClick={create}>作成する</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 予定(シフト)ごとの業務チェックリスト
function EventChecklist({
  eventId,
  canManage,
}: {
  eventId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(() => getChecklistItems(eventId));
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  function refresh() {
    setItems(getChecklistItems(eventId));
  }

  function add() {
    if (!text.trim()) return;
    addChecklistItem(eventId, text);
    setText("");
    refresh();
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="checklist-box" onClick={(ev) => ev.stopPropagation()}>
      <button
        type="button"
        className="ghost mini checklist-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        <ClipboardCheck size={12} strokeWidth={2} />
        業務チェックリスト{items.length > 0 ? `（${doneCount}/${items.length}）` : ""}
        {open ? " ▲" : " ▼"}
      </button>
      {open && (
        <div className="checklist-body">
          {items.map((i) => (
            <label key={i.id} className={`checklist-item ${i.done ? "done" : ""}`}>
              <input
                type="checkbox"
                checked={i.done}
                onChange={() => {
                  toggleChecklistItem(i.id);
                  refresh();
                }}
              />
              <span>{i.text}</span>
              {canManage && (
                <button
                  type="button"
                  className="checklist-del"
                  onClick={() => {
                    deleteChecklistItem(i.id);
                    refresh();
                  }}
                >
                  ×
                </button>
              )}
            </label>
          ))}
          {canManage && (
            <div className="checklist-add">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例: 布団を上げる"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <button type="button" className="ghost mini" onClick={add}>
                ＋追加
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
