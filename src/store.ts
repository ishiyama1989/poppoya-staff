import type {
  AppRequest,
  AttendanceAlert,
  AttendanceAlertKind,
  Availability,
  CafeHours,
  ChecklistItem,
  CommentTemplate,
  HandoverNote,
  PayConfirmation,
  Recipient,
  RecipientType,
  Reservation,
  ScheduleEvent,
  TimeClock,
  User,
} from "./types";
import type { EventApproval } from "./types";
import {
  DEFAULT_CHECKIN_TIME,
  ROOM_TYPES,
  DEFAULT_CAFE_OPEN_TIME,
  DEFAULT_CAFE_CLOSE_TIME,
} from "./types";
import { addDays } from "./lib/date";
import { pinToAuthPassword } from "./lib/auth";
import {
  supabase,
  syncUsers,
  syncProfiles,
  syncEvents,
  syncAvailability,
  syncRequests,
  syncPayConfirmations,
  syncRecipients,
  syncTemplates,
  syncEventApprovals,
  syncTimeClocks,
  syncChecklistItems,
  syncHandoverNotes,
  syncAttendanceAlerts,
  syncReservations,
  syncCafeHours,
  deleteRemote,
} from "./lib/supabase";

const KEYS = {
  users: "sns_users",
  events: "sns_events",
  avail: "sns_availability",
  session: "sns_session",
  templates: "sns_comment_templates",
  requests: "sns_requests",
  payConf: "sns_pay_confirmations",
  recipients: "sns_recipients",
  eventApprovals: "sns_event_approvals",
  reservations: "sns_reservations",
  cafeHours: "sns_cafe_hours",
  timeClocks: "sns_time_clocks",
  checklistItems: "sns_checklist_items",
  handoverNotes: "sns_handover_notes",
  attendanceAlerts: "sns_attendance_alerts",
  version: "sns_schema_version",
};

const SCHEMA_VERSION = "5";

// オーナーは固定IDにして、どの端末で初期化しても1行に収束させる（重複防止）
const OWNER_ID = "owner-momoka";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// オーナーアカウントを作成（固定ID）。Supabaseが確実に空のときだけ App から呼ぶ。
export function seedOwner(): void {
  const owner: User = {
    id: OWNER_ID,
    name: "Momoka",
    password: "0000",
    role: "owner",
    hourlyRate: 0,
  };
  write<User[]>(KEYS.users, [owner]);
  write(KEYS.version, SCHEMA_VERSION);
  syncUsers([owner]);
}

// ---- ユーザー ----
export function getUsers(): User[] {
  return read<User[]>(KEYS.users, []);
}

export function saveUsers(users: User[]): void {
  write(KEYS.users, users);
  syncProfiles(users); // SaaS版：profiles テーブルを更新
}

export function getMembers(): User[] {
  return getUsers().filter((u) => u.role === "member");
}

export function registerUser(input: {
  name: string;
  password: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  email?: string;
}): { ok: true; user: User } | { ok: false; error: string } {
  const users = getUsers();
  const name = input.name.trim();
  if (users.some((u) => u.name === name)) {
    return { ok: false, error: "この名前は既に登録されています" };
  }
  const user: User = {
    id: uid(),
    name,
    password: input.password,
    role: "member",
    hourlyRate: 0,
    postalCode: input.postalCode?.trim() || undefined,
    address: input.address?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
  };
  saveUsers([...users, user]);
  return { ok: true, user };
}

export function updateUserProfile(
  userId: string,
  fields: {
    receiptName?: string;
    postalCode?: string;
    address?: string;
    phone?: string;
    email?: string;
    stamp?: User["stamp"];
  }
): User | null {
  let updated: User | null = null;
  saveUsers(
    getUsers().map((u) => {
      if (u.id !== userId) return u;
      updated = {
        ...u,
        receiptName: fields.receiptName?.trim() || undefined,
        postalCode: fields.postalCode?.trim() || undefined,
        address: fields.address?.trim() || undefined,
        phone: fields.phone?.trim() || undefined,
        email: fields.email?.trim() || undefined,
        stamp: fields.stamp,
      };
      return updated;
    })
  );
  return updated;
}

export function login(
  name: string,
  password: string
): { ok: true; user: User } | { ok: false; error: string } {
  const user = getUsers().find(
    (u) => u.name === name.trim() && u.password === password
  );
  if (!user) return { ok: false, error: "名前またはパスワードが違います" };
  write(KEYS.session, user.id);
  return { ok: true, user };
}

export function logout(): void {
  localStorage.removeItem(KEYS.session);
}

export function currentUser(): User | null {
  const id = read<string | null>(KEYS.session, null);
  if (!id) return null;
  return getUsers().find((u) => u.id === id) ?? null;
}

// SaaS版：パスワード変更は Supabase Auth で行う（4桁の数字）
export async function changePassword(
  _userId: string,
  _current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d{4}$/.test(next)) {
    return { ok: false, error: "パスワードは4桁の数字にしてください" };
  }
  const { error } = await supabase.auth.updateUser({ password: pinToAuthPassword(next) });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function updateHourlyRate(userId: string, rate: number): void {
  saveUsers(getUsers().map((u) => (u.id === userId ? { ...u, hourlyRate: rate } : u)));
}

export function updateUser(
  userId: string,
  fields: { name: string; hourlyRate: number; password?: string }
): { ok: true } | { ok: false; error: string } {
  const users = getUsers();
  if (!users.some((u) => u.id === userId))
    return { ok: false, error: "ユーザーが見つかりません" };
  const name = fields.name.trim();
  if (!name) return { ok: false, error: "名前を入力してください" };
  if (users.some((u) => u.id !== userId && u.name === name))
    return { ok: false, error: "この名前は既に使われています" };

  saveUsers(
    users.map((u) =>
      u.id === userId
        ? {
            ...u,
            name,
            hourlyRate: fields.hourlyRate,
            password: fields.password ? fields.password : u.password,
          }
        : u
    )
  );
  return { ok: true };
}

export function deleteUser(userId: string): void {
  write(KEYS.users, getUsers().filter((u) => u.id !== userId));
  deleteRemote("users", { id: userId });
  saveEvents(
    getEvents().map((e) => ({
      ...e,
      assigneeIds: e.assigneeIds.filter((id) => id !== userId),
    }))
  );
  const newAvail = getAvailability().filter((a) => a.userId !== userId);
  write(KEYS.avail, newAvail);
  deleteRemote("availability", { user_id: userId });
  const newTemplates = read<CommentTemplate[]>(KEYS.templates, []).filter(
    (t) => t.userId !== userId
  );
  write(KEYS.templates, newTemplates);
  deleteRemote("comment_templates", { user_id: userId });
}

// ---- 予定 ----
export function getEvents(): ScheduleEvent[] {
  return read<ScheduleEvent[]>(KEYS.events, []);
}

export function saveEvents(events: ScheduleEvent[]): void {
  write(KEYS.events, events);
  syncEvents(events);
}

export function upsertEvent(ev: ScheduleEvent): void {
  const events = getEvents();
  const idx = events.findIndex((e) => e.id === ev.id);
  if (idx >= 0) events[idx] = ev;
  else events.push(ev);
  saveEvents(events);
}

export function deleteEvent(id: string): void {
  write(KEYS.events, getEvents().filter((e) => e.id !== id));
  deleteRemote("schedule_events", { id });
}

// ---- アプリ内通知（自分に割り当てられた新しい予定） ----
function seenEventsKey(userId: string): string {
  return `sns_seen_events_${userId}`;
}

// まだ確認していない、自分が担当の予定
export function getUnseenAssignedEvents(userId: string): ScheduleEvent[] {
  const seen = read<string[]>(seenEventsKey(userId), []);
  return getEvents().filter(
    (e) => e.assigneeIds.includes(userId) && !seen.includes(e.id)
  );
}

// 自分が担当の予定をすべて「確認済み」にする
export function markAssignedEventsSeen(userId: string): void {
  const ids = getEvents()
    .filter((e) => e.assigneeIds.includes(userId))
    .map((e) => e.id);
  write(seenEventsKey(userId), ids);
}

// ---- 空き状況 ----
export function getAvailability(): Availability[] {
  return read<Availability[]>(KEYS.avail, []).map((a) => ({
    userId: a.userId,
    date: a.date,
    slots: Array.isArray(a.slots) ? a.slots : [],
    comment: typeof a.comment === "string" ? a.comment : "",
  }));
}

export function getAvailabilityFor(
  userId: string,
  date: string
): Availability | null {
  return getAvailability().find((a) => a.userId === userId && a.date === date) ?? null;
}

export function setAvailability(
  userId: string,
  date: string,
  slots: Availability["slots"],
  comment: string
): void {
  const list = getAvailability().filter(
    (a) => !(a.userId === userId && a.date === date)
  );
  if (slots.length > 0 || comment.trim()) {
    const row = { userId, date, slots, comment: comment.trim() };
    list.push(row);
    write(KEYS.avail, list);
    syncAvailability([row]);
  } else {
    // 空にした場合はその日の登録を削除
    write(KEYS.avail, list);
    deleteRemote("availability", { user_id: userId, date });
  }
}

export function availabilityOn(date: string): Availability[] {
  return getAvailability().filter(
    (a) => a.date === date && (a.slots.length > 0 || a.comment)
  );
}

// ---- コメント定型文 ----
export function getCommentTemplates(userId: string): CommentTemplate[] {
  return read<CommentTemplate[]>(KEYS.templates, []).filter(
    (t) => t.userId === userId
  );
}

export function addCommentTemplate(userId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const all = read<CommentTemplate[]>(KEYS.templates, []);
  if (all.some((t) => t.userId === userId && t.text === trimmed)) return;
  all.push({ id: uid(), userId, text: trimmed });
  write(KEYS.templates, all);
  syncTemplates(all);
}

export function deleteCommentTemplate(id: string): void {
  const all = read<CommentTemplate[]>(KEYS.templates, []).filter(
    (t) => t.id !== id
  );
  write(KEYS.templates, all);
  deleteRemote("comment_templates", { id });
}

// ---- 依頼（申請） ----
export function getRequests(): AppRequest[] {
  return read<AppRequest[]>(KEYS.requests, []);
}

function saveRequests(rs: AppRequest[]): void {
  write(KEYS.requests, rs);
  syncRequests(rs);
}

export function addRequest(input: Omit<AppRequest, "id" | "status">): void {
  const rs = getRequests();
  rs.push({ ...input, id: uid(), status: "pending" });
  saveRequests(rs);
}

export function requestsOn(date: string): AppRequest[] {
  return getRequests().filter((r) => r.date === date);
}

export function pendingRequestsForUser(userId: string): AppRequest[] {
  return getRequests().filter(
    (r) => r.toUserId === userId && r.status === "pending"
  );
}

export function requestsForUser(userId: string): AppRequest[] {
  return getRequests()
    .filter((r) => r.toUserId === userId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// オーナー：自分が送った依頼（すべて。日付が新しい順）
export function requestsFromUser(userId: string): AppRequest[] {
  return getRequests()
    .filter((r) => r.fromUserId === userId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// オーナー：承認待ちの依頼件数（タブのバッジ表示用）
export function pendingRequestsSentByUser(userId: string): number {
  return getRequests().filter(
    (r) => r.fromUserId === userId && r.status === "pending"
  ).length;
}

export function approveRequest(id: string): void {
  const rs = getRequests();
  const r = rs.find((x) => x.id === id);
  if (!r || r.status !== "pending") return;
  r.status = "approved";
  saveRequests(rs);

  const events = getEvents();
  // 1) eventId が分かればその予定（同一端末で依頼を作った場合）
  let target = r.eventId ? events.find((e) => e.id === r.eventId) : undefined;
  // 2) 内容が一致する既存予定を探す（重複作成を防ぐ・端末をまたいでも有効）
  if (!target) {
    target = events.find(
      (e) =>
        e.date === r.date &&
        e.title === r.title &&
        e.type === r.type &&
        e.start === r.start &&
        e.end === r.end
    );
  }
  // 既存の予定があれば、その予定に担当者を追加するだけ（新規作成しない）
  if (target) {
    if (!target.assigneeIds.includes(r.toUserId)) {
      upsertEvent({
        ...target,
        assigneeIds: [...target.assigneeIds, r.toUserId],
      });
    }
    return;
  }
  // 3) 元になる予定がない（手動依頼など）場合のみ新規作成
  upsertEvent({
    id: uid(),
    date: r.date,
    type: r.type,
    title: r.title,
    location: r.location,
    assigneeIds: [r.toUserId],
    start: r.start,
    end: r.end,
    note: r.note,
  });
}

export function rejectRequest(id: string): void {
  const rs = getRequests();
  const r = rs.find((x) => x.id === id);
  if (!r || r.status !== "pending") return;
  r.status = "rejected";
  saveRequests(rs);
}

// ---- 報酬の確認依頼 ----
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getPayConfirmations(): PayConfirmation[] {
  return read<PayConfirmation[]>(KEYS.payConf, []);
}

function savePayConfirmations(list: PayConfirmation[]): void {
  write(KEYS.payConf, list);
  syncPayConfirmations(list);
}

export function payConfirmationFor(
  userId: string,
  quarter: string
): PayConfirmation | null {
  return (
    getPayConfirmations().find(
      (p) => p.userId === userId && p.quarter === quarter
    ) ?? null
  );
}

// 管理者が稼働時間・報酬を確定して承認する（メンバーの報酬に反映される）
export function approvePayment(
  userId: string,
  quarter: string,
  data: { hours: number; workAmount: number; videoAmount: number; note?: string }
): void {
  const list = getPayConfirmations();
  const idx = list.findIndex(
    (p) => p.userId === userId && p.quarter === quarter
  );
  const workAmount = Math.round(data.workAmount) || 0;
  const videoAmount = Math.round(data.videoAmount) || 0;
  const rec: PayConfirmation = {
    id: idx >= 0 ? list[idx].id : uid(),
    userId,
    quarter,
    hours: data.hours,
    workAmount,
    videoAmount,
    amount: workAmount + videoAmount,
    note: data.note?.trim() || undefined,
    status: "approved",
    requestedAt: idx >= 0 ? list[idx].requestedAt : today(),
    approvedAt: today(),
  };
  if (idx >= 0) list[idx] = rec;
  else list.push(rec);
  savePayConfirmations(list);
}

// 承認を取り消す（メンバーへの反映を解除）
export function unapprovePayment(userId: string, quarter: string): void {
  const list = getPayConfirmations().filter(
    (p) => !(p.userId === userId && p.quarter === quarter)
  );
  write(KEYS.payConf, list);
  syncPayConfirmations(list);
  deleteRemote("pay_confirmations", { user_id: userId, quarter });
}

export function pendingPayConfirmationsForUser(
  userId: string
): PayConfirmation[] {
  return getPayConfirmations().filter(
    (p) => p.userId === userId && p.status === "approved"
  );
}

// ---- 承認された報酬の未読通知（メンバー） ----
function seenPayKey(userId: string): string {
  return `sns_seen_pay_${userId}`;
}

export function getUnseenApprovedPayments(userId: string): PayConfirmation[] {
  const seen = read<string[]>(seenPayKey(userId), []);
  return getPayConfirmations().filter(
    (p) =>
      p.userId === userId &&
      p.status === "approved" &&
      !seen.includes(`${p.id}:${p.approvedAt ?? ""}`)
  );
}

export function markPaymentsSeen(userId: string): void {
  const ids = getPayConfirmations()
    .filter((p) => p.userId === userId && p.status === "approved")
    .map((p) => `${p.id}:${p.approvedAt ?? ""}`);
  write(seenPayKey(userId), ids);
}

// ---- 宛名帳 ----
export function getRecipients(userId: string): Recipient[] {
  return read<Recipient[]>(KEYS.recipients, []).filter(
    (r) => r.userId === userId
  );
}

export function addRecipient(
  userId: string,
  name: string,
  type: RecipientType
): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const all = read<Recipient[]>(KEYS.recipients, []);
  if (
    all.some(
      (r) => r.userId === userId && r.name === trimmed && r.type === type
    )
  )
    return;
  all.push({ id: uid(), userId, name: trimmed, type });
  write(KEYS.recipients, all);
  syncRecipients(all);
}

export async function deleteRecipient(id: string): Promise<void> {
  const all = read<Recipient[]>(KEYS.recipients, []);
  write(KEYS.recipients, all.filter((r) => r.id !== id));
  const { error } = await supabase.from("recipients").delete().eq("id", id);
  if (error) {
    write(KEYS.recipients, all);
    throw error;
  }
}

// ---- 予定ごとの報酬承認 ----
export function getEventApprovals(): EventApproval[] {
  return read<EventApproval[]>(KEYS.eventApprovals, []);
}

function saveEventApprovals(list: EventApproval[]): void {
  write(KEYS.eventApprovals, list);
  syncEventApprovals(list);
}

export function approvalForEvent(
  eventId: string,
  userId: string
): EventApproval | null {
  return (
    getEventApprovals().find(
      (a) => a.eventId === eventId && a.userId === userId
    ) ?? null
  );
}

// 管理者：予定の報酬をメンバーに承認依頼する（内訳付き）
export function requestEventApproval(
  eventId: string,
  userId: string,
  hours: number,
  amount: number,
  note?: string,
  breakdown?: {
    workAmount?: number;
    expense?: number;
    extraItems?: { name: string; amount: number }[];
  }
): void {
  const list = getEventApprovals();
  const idx = list.findIndex(
    (a) => a.eventId === eventId && a.userId === userId
  );
  const items = (breakdown?.extraItems ?? []).filter((it) => it.amount);
  const rec: EventApproval = {
    id: idx >= 0 ? list[idx].id : uid(),
    eventId,
    userId,
    hours,
    amount: Math.round(amount) || 0,
    note: note?.trim() || undefined,
    workAmount: breakdown?.workAmount,
    expense: breakdown?.expense || undefined,
    extraItems: items.length ? items : undefined,
    status: "requested",
    requestedAt: today(),
  };
  if (idx >= 0) list[idx] = rec;
  else list.push(rec);
  saveEventApprovals(list);
}

// メンバー：承認依頼を承認（報酬が確定）
export function approveEventApproval(id: string): void {
  const list = getEventApprovals();
  const a = list.find((x) => x.id === id);
  if (!a || a.status !== "requested") return;
  a.status = "approved";
  a.approvedAt = today();
  saveEventApprovals(list);
}

// メンバー：承認依頼を却下
export function rejectEventApproval(id: string): void {
  const list = getEventApprovals();
  const a = list.find((x) => x.id === id);
  if (!a || a.status !== "requested") return;
  a.status = "rejected";
  saveEventApprovals(list);
}

// 管理者：まだ承認依頼を送っていない「過ぎた予定×担当者」の一覧
export interface AwaitingApprovalItem {
  event: ScheduleEvent;
  userId: string;
}
export function eventsAwaitingAdmin(): AwaitingApprovalItem[] {
  const t = today();
  const approvals = getEventApprovals();
  const items: AwaitingApprovalItem[] = [];
  for (const e of getEvents()) {
    if (e.date >= t) continue; // 過ぎた予定のみ
    for (const userId of e.assigneeIds) {
      const has = approvals.some(
        (a) => a.eventId === e.id && a.userId === userId
      );
      if (!has) items.push({ event: e, userId });
    }
  }
  return items.sort((a, b) => (a.event.date < b.event.date ? 1 : -1));
}

export function countAwaitingAdmin(): number {
  return eventsAwaitingAdmin().length;
}

// メンバー宛の承認待ち（承認依頼が届いている）
export function pendingEventApprovalsForUser(userId: string): EventApproval[] {
  return getEventApprovals().filter(
    (a) => a.userId === userId && a.status === "requested"
  );
}

// メンバーの承認済み報酬
export function approvedEventApprovalsForUser(userId: string): EventApproval[] {
  return getEventApprovals().filter(
    (a) => a.userId === userId && a.status === "approved"
  );
}


// ---- 宿泊予約（ねっぱん！から同期。読み取り専用） ----
export function getReservations(): Reservation[] {
  return read<Reservation[]>(KEYS.reservations, []);
}

// 指定日に宿泊中（チェックイン〜チェックアウト前日まで）の予約
export function reservationsOn(date: string): Reservation[] {
  return getReservations().filter(
    (r) =>
      r.status === "confirmed" &&
      r.checkinDate <= date &&
      date < r.checkoutDate
  );
}

// 同じ部屋の宿泊期間が重なっている予約を探す（1室1日1組までのため）。
// 自分自身は対象外。重なりがなければ null。
export function findRoomConflict(target: Reservation): Reservation | null {
  return (
    getReservations().find(
      (r) =>
        r.id !== target.id &&
        r.status === "confirmed" &&
        r.roomType === target.roomType &&
        // 期間が少しでも重なっていれば衝突（チェックアウト日は次の組が入れる）
        target.checkinDate < r.checkoutDate &&
        r.checkinDate < target.checkoutDate
    ) ?? null
  );
}

// その日にすでにシフトが入っているスタッフの名前（基本は1日1人のため確認に使う）
export function staffNamesOn(date: string): string[] {
  const nameById: Record<string, string> = {};
  for (const u of getUsers()) nameById[u.id] = u.name;
  const names = new Set<string>();
  for (const e of getEvents()) {
    if (e.date !== date) continue;
    for (const id of e.assigneeIds) if (nameById[id]) names.add(nameById[id]);
  }
  return [...names];
}

function saveReservations(list: Reservation[]): void {
  write(KEYS.reservations, list);
  syncReservations(list);
}

// 管理者がカレンダーから手入力した予約を保存する（新規・編集どちらも）
export function upsertReservation(reservation: Reservation): void {
  const list = getReservations();
  const idx = list.findIndex((r) => r.id === reservation.id);
  if (idx >= 0) list[idx] = reservation;
  else list.push(reservation);
  saveReservations(list);
}

// 手入力の予約に付ける新しいID。予約サイト由来のものと衝突しないよう manual: を付ける
export function newManualReservation(date: string): Reservation {
  const key = `manual:${uid()}`;
  return {
    id: key,
    neppanBookingId: key,
    source: "manual",
    checkinDate: date,
    checkoutDate: addDays(date, 1),
    checkinTime: DEFAULT_CHECKIN_TIME,
    roomType: ROOM_TYPES[0],
    guestName: "",
    address: "",
    adults: 1,
    children: 0,
    infants: 0,
    note: "",
    status: "confirmed",
  };
}

export function deleteReservation(id: string): void {
  write(KEYS.reservations, getReservations().filter((r) => r.id !== id));
  deleteRemote("reservations", { id });
}

// ---- LOCOMO CAFE の営業時間（1日1件） ----
export function getCafeHours(): CafeHours[] {
  return read<CafeHours[]>(KEYS.cafeHours, []);
}

export function cafeHoursOn(date: string): CafeHours | null {
  return getCafeHours().find((c) => c.date === date) ?? null;
}

function saveCafeHours(list: CafeHours[]): void {
  write(KEYS.cafeHours, list);
  syncCafeHours(list);
}

// その日の営業時間を保存する（同じ日付が既にあれば上書き、1日1件のため）
export function upsertCafeHours(hours: CafeHours): void {
  const list = getCafeHours().filter((c) => c.date !== hours.date || c.id === hours.id);
  const idx = list.findIndex((c) => c.id === hours.id);
  if (idx >= 0) list[idx] = hours;
  else list.push(hours);
  saveCafeHours(list);
}

export function newCafeHours(date: string): CafeHours {
  return {
    id: `cafe:${uid()}`,
    date,
    closed: false,
    openTime: DEFAULT_CAFE_OPEN_TIME,
    closeTime: DEFAULT_CAFE_CLOSE_TIME,
    note: "",
  };
}

export function deleteCafeHours(id: string): void {
  write(KEYS.cafeHours, getCafeHours().filter((c) => c.id !== id));
  deleteRemote("cafe_hours", { id });
}

// ---- 出退勤打刻 ----
export function getTimeClocks(): TimeClock[] {
  return read<TimeClock[]>(KEYS.timeClocks, []);
}

function saveTimeClocks(list: TimeClock[]): void {
  write(KEYS.timeClocks, list);
  syncTimeClocks(list);
}

export function timeClockFor(userId: string, date: string): TimeClock | null {
  return (
    getTimeClocks().find((t) => t.userId === userId && t.date === date) ?? null
  );
}

// 自分の直近の打刻履歴（新しい順）
export function timeClocksForUser(userId: string, limit = 14): TimeClock[] {
  return getTimeClocks()
    .filter((t) => t.userId === userId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

export function clockIn(userId: string): TimeClock {
  const date = today();
  const list = getTimeClocks();
  const idx = list.findIndex((t) => t.userId === userId && t.date === date);
  const now = new Date().toISOString();
  let rec: TimeClock;
  if (idx >= 0) {
    rec = { ...list[idx], clockIn: list[idx].clockIn ?? now };
    list[idx] = rec;
  } else {
    rec = { id: uid(), userId, date, clockIn: now };
    list.push(rec);
  }
  saveTimeClocks(list);
  return rec;
}

export function clockOut(userId: string): TimeClock {
  const date = today();
  const list = getTimeClocks();
  const idx = list.findIndex((t) => t.userId === userId && t.date === date);
  const now = new Date().toISOString();
  let rec: TimeClock;
  if (idx >= 0) {
    rec = { ...list[idx], clockOut: now };
    list[idx] = rec;
  } else {
    rec = { id: uid(), userId, date, clockOut: now };
    list.push(rec);
  }
  saveTimeClocks(list);
  return rec;
}

// ---- シフト(予定)ごとの業務チェックリスト ----
export function getChecklistItems(eventId: string): ChecklistItem[] {
  return read<ChecklistItem[]>(KEYS.checklistItems, []).filter(
    (c) => c.eventId === eventId
  );
}

function saveChecklistItems(list: ChecklistItem[]): void {
  write(KEYS.checklistItems, list);
  syncChecklistItems(list);
}

export function addChecklistItem(eventId: string, text: string): ChecklistItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const all = read<ChecklistItem[]>(KEYS.checklistItems, []);
  const item: ChecklistItem = { id: uid(), eventId, text: trimmed, done: false };
  all.push(item);
  saveChecklistItems(all);
  return item;
}

export function toggleChecklistItem(id: string): void {
  const all = read<ChecklistItem[]>(KEYS.checklistItems, []);
  saveChecklistItems(all.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
}

export function deleteChecklistItem(id: string): void {
  const all = read<ChecklistItem[]>(KEYS.checklistItems, []).filter((c) => c.id !== id);
  write(KEYS.checklistItems, all);
  deleteRemote("shift_checklist_items", { id });
}

// ---- 申し送り・引き継ぎメモ ----
export function getHandoverNotes(): HandoverNote[] {
  return read<HandoverNote[]>(KEYS.handoverNotes, []);
}

export function handoverNotesOn(date: string): HandoverNote[] {
  return getHandoverNotes()
    .filter((n) => n.date === date)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

function saveHandoverNotes(list: HandoverNote[]): void {
  write(KEYS.handoverNotes, list);
  syncHandoverNotes(list);
}

export function addHandoverNote(
  date: string,
  userId: string,
  text: string
): HandoverNote | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const note: HandoverNote = {
    id: uid(),
    date,
    userId,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  saveHandoverNotes([...getHandoverNotes(), note]);
  return note;
}

export function deleteHandoverNote(id: string): void {
  write(KEYS.handoverNotes, getHandoverNotes().filter((n) => n.id !== id));
  deleteRemote("handover_notes", { id });
}

// ---- 遅刻・欠勤の連絡 ----
export function getAttendanceAlerts(): AttendanceAlert[] {
  return read<AttendanceAlert[]>(KEYS.attendanceAlerts, []);
}

function saveAttendanceAlerts(list: AttendanceAlert[]): void {
  write(KEYS.attendanceAlerts, list);
  syncAttendanceAlerts(list);
}

export function reportAttendanceAlert(
  userId: string,
  kind: AttendanceAlertKind,
  note: string
): AttendanceAlert {
  const alert: AttendanceAlert = {
    id: uid(),
    userId,
    date: today(),
    kind,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  saveAttendanceAlerts([...getAttendanceAlerts(), alert]);
  return alert;
}

export function todaysAttendanceAlerts(): AttendanceAlert[] {
  const t = today();
  return getAttendanceAlerts()
    .filter((a) => a.date === t)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
