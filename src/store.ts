import type {
  AppRequest,
  Availability,
  CommentTemplate,
  PayConfirmation,
  Recipient,
  RecipientType,
  ScheduleEvent,
  User,
  VideoTask,
} from "./types";
import type { EventApproval, Project, ProjectMaterial } from "./types";
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
  syncVideoTasks,
  syncEventApprovals,
  syncProjects,
  syncProjectMaterials,
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
  videoTasks: "sns_video_tasks",
  eventApprovals: "sns_event_approvals",
  projects: "sns_projects",
  materials: "sns_project_materials",
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

// SaaS版：パスワード変更は Supabase Auth で行う（6文字以上）
export async function changePassword(
  _userId: string,
  _current: string,
  next: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (next.length < 6) {
    return { ok: false, error: "新しいパスワードは6文字以上にしてください" };
  }
  const { error } = await supabase.auth.updateUser({ password: next });
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

// 予定の報酬有無を切り替える
export function setEventReward(eventId: string, hasReward: boolean): void {
  const ev = getEvents().find((e) => e.id === eventId);
  if (!ev) return;
  upsertEvent({ ...ev, hasReward });
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

// ---- 動画編集依頼 ----
export function getVideoTasks(): VideoTask[] {
  return read<VideoTask[]>(KEYS.videoTasks, []);
}

function saveVideoTasks(tasks: VideoTask[]): void {
  write(KEYS.videoTasks, tasks);
  syncVideoTasks(tasks);
}

export function addVideoTask(
  data: Omit<VideoTask, "id" | "status" | "createdAt">
): void {
  const tasks = getVideoTasks();
  tasks.push({ ...data, id: uid(), status: "pending", createdAt: today() });
  saveVideoTasks(tasks);
}

export function updateVideoTask(id: string, patch: Partial<VideoTask>): void {
  saveVideoTasks(getVideoTasks().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function pendingVideoTasksForUser(userId: string): VideoTask[] {
  return getVideoTasks().filter((t) => t.toUserId === userId && t.status === "pending");
}

export function submittedVideoTasksCount(): number {
  return getVideoTasks().filter((t) => t.status === "submitted").length;
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
    if (e.type === "delivery") continue;
    if (e.hasReward === false) continue; // 報酬なしの予定は対象外
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

// ---- 案件 ----
export function getProjects(): Project[] {
  return read<Project[]>(KEYS.projects, []);
}

function saveProjects(list: Project[]): void {
  write(KEYS.projects, list);
  syncProjects(list);
}

export function addProject(
  data: Omit<Project, "id" | "createdAt">
): Project {
  const project: Project = { ...data, id: uid(), createdAt: today() };
  saveProjects([...getProjects(), project]);
  return project;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<Project, "id" | "createdAt">>
): void {
  saveProjects(getProjects().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function deleteProject(id: string): void {
  // 案件と紐づく資料をローカル＆リモートから削除
  write(KEYS.projects, getProjects().filter((p) => p.id !== id));
  deleteRemote("projects", { id });
  const remainingMaterials = getMaterials().filter((m) => m.projectId !== id);
  write(KEYS.materials, remainingMaterials);
  deleteRemote("project_materials", { project_id: id });
}

// ---- 案件の資料 ----
export function getMaterials(): ProjectMaterial[] {
  return read<ProjectMaterial[]>(KEYS.materials, []);
}

export function getMaterialsFor(projectId: string): ProjectMaterial[] {
  return getMaterials()
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

function saveMaterials(list: ProjectMaterial[]): void {
  write(KEYS.materials, list);
  syncProjectMaterials(list);
}

export function addMaterial(
  data: Omit<ProjectMaterial, "id" | "createdAt">
): void {
  const mat: ProjectMaterial = { ...data, id: uid(), createdAt: today() };
  saveMaterials([...getMaterials(), mat]);
}

export function updateMaterial(
  id: string,
  patch: Partial<ProjectMaterial>
): void {
  saveMaterials(getMaterials().map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export function deleteMaterial(id: string): void {
  write(KEYS.materials, getMaterials().filter((m) => m.id !== id));
  deleteRemote("project_materials", { id });
}

// 管理者が報酬を確定した納品物（報酬集計用）
export function getConfirmedDeliverables(): ProjectMaterial[] {
  return getMaterials().filter(
    (m) => m.category === "deliverable" && m.delStatus === "confirmed"
  );
}
