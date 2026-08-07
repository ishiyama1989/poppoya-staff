import { createClient } from '@supabase/supabase-js'
import type {
  AppRequest,
  AttendanceAlert,
  Availability,
  ChecklistItem,
  CommentTemplate,
  EventApproval,
  HandoverNote,
  PayConfirmation,
  Recipient,
  Reservation,
  ScheduleEvent,
  TimeClock,
  User,
} from '../types'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
)

// ---- 現在の組織コンテキスト（ログイン後に AppShell がセット） ----
let CURRENT_ORG_ID: string | null = null;
export function setOrgId(id: string | null): void {
  CURRENT_ORG_ID = id;
}

// ---- App ↔ DB transformers ----

const toDbUser = (u: User) => ({
  id: u.id,
  name: u.name,
  password: u.password,
  role: u.role,
  hourly_rate: u.hourlyRate,
  postal_code: u.postalCode ?? null,
  address: u.address ?? null,
  phone: u.phone ?? null,
  email: u.email ?? null,
  stamp_text: u.stamp?.text ?? null,
  stamp_shape: u.stamp?.shape ?? null,
  stamp_orientation: u.stamp?.orientation ?? null,
  stamp_font: u.stamp?.font ?? null,
})

const fromDbUser = (r: any): User => ({
  id: r.id,
  name: r.name,
  password: r.password,
  role: r.role,
  hourlyRate: r.hourly_rate ?? 0,
  postalCode: r.postal_code ?? undefined,
  address: r.address ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  stamp: r.stamp_text
    ? {
        text: r.stamp_text,
        shape: r.stamp_shape ?? 'circle',
        orientation: r.stamp_orientation ?? 'vertical',
        font: r.stamp_font ?? 'mincho',
      }
    : undefined,
})

const toDbEvent = (e: ScheduleEvent) => ({
  id: e.id,
  date: e.date,
  type: e.type,
  title: e.title,
  location: e.location,
  assignee_ids: e.assigneeIds,
  start_time: e.start,
  end_time: e.end,
  note: e.note,
  has_reward: e.hasReward !== false,
})

const fromDbEvent = (r: any): ScheduleEvent => ({
  id: r.id,
  date: r.date,
  type: r.type,
  title: r.title,
  location: r.location,
  assigneeIds: r.assignee_ids ?? [],
  start: r.start_time,
  end: r.end_time,
  note: r.note,
  hasReward: r.has_reward ?? true,
})

const toDbAvail = (a: Availability) => ({
  user_id: a.userId,
  date: a.date,
  slots: a.slots,
  comment: a.comment,
})

const fromDbAvail = (r: any): Availability => ({
  userId: r.user_id,
  date: r.date,
  slots: r.slots ?? [],
  comment: r.comment ?? '',
})

const toDbRequest = (r: AppRequest) => ({
  id: r.id,
  date: r.date,
  from_user_id: r.fromUserId,
  to_user_id: r.toUserId,
  type: r.type,
  title: r.title,
  location: r.location,
  start_time: r.start,
  end_time: r.end,
  note: r.note,
  status: r.status,
})

const fromDbRequest = (r: any): AppRequest => ({
  id: r.id,
  date: r.date,
  fromUserId: r.from_user_id,
  toUserId: r.to_user_id,
  type: r.type,
  title: r.title,
  location: r.location,
  start: r.start_time,
  end: r.end_time,
  note: r.note,
  status: r.status,
})

const toDbPayConf = (p: PayConfirmation) => ({
  id: p.id,
  user_id: p.userId,
  quarter: p.quarter,
  amount: p.amount,
  hours: p.hours,
  work_amount: p.workAmount,
  video_amount: p.videoAmount,
  note: p.note ?? null,
  status: p.status,
  requested_at: p.requestedAt,
  confirmed_at: p.confirmedAt ?? null,
  approved_at: p.approvedAt ?? null,
})

const fromDbPayConf = (r: any): PayConfirmation => ({
  id: r.id,
  userId: r.user_id,
  quarter: r.quarter,
  amount: r.amount ?? 0,
  hours: r.hours ?? 0,
  workAmount: r.work_amount ?? 0,
  videoAmount: r.video_amount ?? 0,
  note: r.note ?? undefined,
  status: r.status,
  requestedAt: r.requested_at,
  confirmedAt: r.confirmed_at ?? undefined,
  approvedAt: r.approved_at ?? undefined,
})

const toDbRecipient = (r: Recipient) => ({
  id: r.id,
  user_id: r.userId,
  name: r.name,
  type: r.type,
})

const fromDbRecipient = (r: any): Recipient => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  type: r.type,
})

const toDbTemplate = (t: CommentTemplate) => ({
  id: t.id,
  user_id: t.userId,
  text: t.text,
})

const fromDbTemplate = (r: any): CommentTemplate => ({
  id: r.id,
  userId: r.user_id,
  text: r.text,
})


const toDbEventApproval = (a: EventApproval) => ({
  id: a.id,
  event_id: a.eventId,
  user_id: a.userId,
  hours: a.hours,
  amount: a.amount,
  note: a.note ?? null,
  work_amount: a.workAmount ?? null,
  expense: a.expense ?? null,
  extra_items: a.extraItems ?? null,
  status: a.status,
  requested_at: a.requestedAt,
  approved_at: a.approvedAt ?? null,
})

const fromDbEventApproval = (r: any): EventApproval => ({
  id: r.id,
  eventId: r.event_id,
  userId: r.user_id,
  hours: r.hours ?? 0,
  amount: r.amount ?? 0,
  note: r.note ?? undefined,
  workAmount: r.work_amount ?? undefined,
  expense: r.expense ?? undefined,
  extraItems: r.extra_items ?? undefined,
  status: r.status,
  requestedAt: r.requested_at,
  approvedAt: r.approved_at ?? undefined,
})

const toDbTimeClock = (t: TimeClock) => ({
  id: t.id,
  user_id: t.userId,
  date: t.date,
  clock_in: t.clockIn ?? null,
  clock_out: t.clockOut ?? null,
})

const fromDbTimeClock = (r: any): TimeClock => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  clockIn: r.clock_in ?? undefined,
  clockOut: r.clock_out ?? undefined,
})

const toDbChecklistItem = (c: ChecklistItem) => ({
  id: c.id,
  event_id: c.eventId,
  text: c.text,
  done: c.done,
})

const fromDbChecklistItem = (r: any): ChecklistItem => ({
  id: r.id,
  eventId: r.event_id,
  text: r.text,
  done: r.done ?? false,
})

const toDbHandoverNote = (n: HandoverNote) => ({
  id: n.id,
  date: n.date,
  user_id: n.userId,
  text: n.text,
  created_at: n.createdAt,
})

const fromDbHandoverNote = (r: any): HandoverNote => ({
  id: r.id,
  date: r.date,
  userId: r.user_id,
  text: r.text,
  createdAt: r.created_at ?? '',
})

const toDbAttendanceAlert = (a: AttendanceAlert) => ({
  id: a.id,
  user_id: a.userId,
  date: a.date,
  kind: a.kind,
  note: a.note,
  created_at: a.createdAt,
})

const fromDbAttendanceAlert = (r: any): AttendanceAlert => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  kind: r.kind,
  note: r.note ?? '',
  createdAt: r.created_at ?? '',
})

// 宿泊予約（ねっぱん！から同期。読み取り専用なので toDb 変換は不要）
const fromDbReservation = (r: any): Reservation => ({
  id: r.id,
  neppanBookingId: r.neppan_booking_id,
  checkinDate: r.checkin_date,
  checkoutDate: r.checkout_date,
  roomType: r.room_type ?? '',
  guestName: r.guest_name ?? '',
  status: r.status ?? 'confirmed',
})

// プロフィール（= アプリの User）。SaaS版では users テーブルの代わりに profiles を使う。
const toDbProfile = (u: User) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  hourly_rate: u.hourlyRate,
  receipt_name: u.receiptName ?? null,
  postal_code: u.postalCode ?? null,
  address: u.address ?? null,
  phone: u.phone ?? null,
  email: u.email ?? null,
  stamp_text: u.stamp?.text ?? null,
  stamp_shape: u.stamp?.shape ?? null,
  stamp_orientation: u.stamp?.orientation ?? null,
  stamp_font: u.stamp?.font ?? null,
})

const fromDbProfile = (r: any): User => ({
  id: r.id,
  name: r.name,
  password: "", // SaaS版は Supabase Auth が管理（未使用）
  role: r.role,
  hourlyRate: r.hourly_rate ?? 0,
  receiptName: r.receipt_name ?? undefined,
  postalCode: r.postal_code ?? undefined,
  address: r.address ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  stamp: r.stamp_text
    ? {
        text: r.stamp_text,
        shape: r.stamp_shape ?? "circle",
        orientation: r.stamp_orientation ?? "vertical",
        font: r.stamp_font ?? "mincho",
      }
    : undefined,
})

// プロフィール更新（自分 or 同組織のメンバー）。upsertではなくupdateでRLSを通す。
export function syncProfiles(users: User[]): void {
  for (const u of users) {
    supabase.from("profiles").update(toDbProfile(u)).eq("id", u.id).then(
      () => {},
      () => {}
    );
  }
}

// ---- Sync helper: 行ごとに upsert（全削除はしない＝データ消失を防ぐ） ----
// すべての行に現在の org_id を自動付与（マルチテナント分離）。
async function upsertRows<T>(
  table: string,
  items: T[],
  toDb: (item: T) => Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  if (items.length === 0) return
  const rows = items.map((i) => ({ ...toDb(i), org_id: CURRENT_ORG_ID }))
  await supabase.from(table).upsert(rows, { onConflict })
}

// 特定の行だけを削除（削除操作はこちらで明示的に行う）
export function deleteRemote(table: string, match: Record<string, unknown>): void {
  supabase.from(table).delete().match(match).then(() => {}, () => {})
}

// ---- Public sync functions (fire-and-forget from store.ts) ----

export function syncUsers(users: User[]): void {
  upsertRows('users', users, toDbUser, 'id').catch(() => {})
}

export function syncEvents(events: ScheduleEvent[]): void {
  upsertRows('schedule_events', events, toDbEvent, 'id').catch(() => {})
}

export function syncAvailability(avail: Availability[]): void {
  upsertRows('availability', avail, toDbAvail, 'user_id,date').catch(() => {})
}

export function syncRequests(requests: AppRequest[]): void {
  upsertRows('app_requests', requests, toDbRequest, 'id').catch(() => {})
}

export function syncPayConfirmations(list: PayConfirmation[]): void {
  upsertRows('pay_confirmations', list, toDbPayConf, 'id').catch(() => {})
}

export function syncRecipients(recipients: Recipient[]): void {
  upsertRows('recipients', recipients, toDbRecipient, 'id').catch(() => {})
}

export function syncTemplates(templates: CommentTemplate[]): void {
  upsertRows('comment_templates', templates, toDbTemplate, 'id').catch(() => {})
}

export function syncEventApprovals(list: EventApproval[]): void {
  upsertRows('event_approvals', list, toDbEventApproval, 'id').catch(() => {})
}

export function syncTimeClocks(list: TimeClock[]): void {
  upsertRows('time_clocks', list, toDbTimeClock, 'id').catch(() => {})
}

export function syncChecklistItems(list: ChecklistItem[]): void {
  upsertRows('shift_checklist_items', list, toDbChecklistItem, 'id').catch(() => {})
}

export function syncHandoverNotes(list: HandoverNote[]): void {
  upsertRows('handover_notes', list, toDbHandoverNote, 'id').catch(() => {})
}

export function syncAttendanceAlerts(list: AttendanceAlert[]): void {
  upsertRows('attendance_alerts', list, toDbAttendanceAlert, 'id').catch(() => {})
}

// ---- SaaS版：ログイン中の組織のデータを読み込む（RLSで自組織のみ） ----
export async function loadOrgData(): Promise<void> {
  const [
    profiles, events, avail, requests, pay, recipients,
    templates, approvals, reservations,
    timeClocks, checklistItems, handoverNotes, attendanceAlerts,
  ] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('schedule_events').select('*'),
    supabase.from('availability').select('*'),
    supabase.from('app_requests').select('*'),
    supabase.from('pay_confirmations').select('*'),
    supabase.from('recipients').select('*'),
    supabase.from('comment_templates').select('*'),
    supabase.from('event_approvals').select('*'),
    supabase.from('reservations').select('*'),
    supabase.from('time_clocks').select('*'),
    supabase.from('shift_checklist_items').select('*'),
    supabase.from('handover_notes').select('*'),
    supabase.from('attendance_alerts').select('*'),
  ])
  const put = (key: string, rows: any[] | null | undefined, map: (r: any) => unknown) => {
    if (rows) localStorage.setItem(key, JSON.stringify(rows.map(map)))
  }
  put('sns_users', profiles.data, fromDbProfile)
  put('sns_events', events.data, fromDbEvent)
  put('sns_availability', avail.data, fromDbAvail)
  put('sns_requests', requests.data, fromDbRequest)
  put('sns_pay_confirmations', pay.data, fromDbPayConf)
  put('sns_recipients', recipients.data, fromDbRecipient)
  put('sns_comment_templates', templates.data, fromDbTemplate)
  put('sns_event_approvals', approvals.data, fromDbEventApproval)
  put('sns_reservations', reservations.data, fromDbReservation)
  put('sns_time_clocks', timeClocks.data, fromDbTimeClock)
  put('sns_checklist_items', checklistItems.data, fromDbChecklistItem)
  put('sns_handover_notes', handoverNotes.data, fromDbHandoverNote)
  put('sns_attendance_alerts', attendanceAlerts.data, fromDbAttendanceAlert)
}

// ---- Hydration: Supabase → localStorage on app start（旧・単一テナント用。SaaS版では未使用） ----

const SCHEMA_VERSION = '5'
const SCHEMA_KEY = 'sns_schema_version'

// Supabase を唯一の正とし、起動時に localStorage を上書きする。
// 戻り値: ok=接続できたか, userCount=Supabase上のユーザー数
export async function hydrateFromSupabase(): Promise<{ ok: boolean; userCount: number }> {
  try {
    const [users, events, avail, requests, payConf, recipients, templates] =
      await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('schedule_events').select('*'),
        supabase.from('availability').select('*'),
        supabase.from('app_requests').select('*'),
        supabase.from('pay_confirmations').select('*'),
        supabase.from('recipients').select('*'),
        supabase.from('comment_templates').select('*'),
      ])

    if (users.error) throw users.error

    if (users.data) localStorage.setItem('sns_users', JSON.stringify(users.data.map(fromDbUser)))
    if (events.data) localStorage.setItem('sns_events', JSON.stringify(events.data.map(fromDbEvent)))
    if (avail.data) localStorage.setItem('sns_availability', JSON.stringify(avail.data.map(fromDbAvail)))
    if (requests.data) localStorage.setItem('sns_requests', JSON.stringify(requests.data.map(fromDbRequest)))
    if (payConf.data) localStorage.setItem('sns_pay_confirmations', JSON.stringify(payConf.data.map(fromDbPayConf)))
    if (recipients.data) localStorage.setItem('sns_recipients', JSON.stringify(recipients.data.map(fromDbRecipient)))
    if (templates.data) localStorage.setItem('sns_comment_templates', JSON.stringify(templates.data.map(fromDbTemplate)))

    localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION)

    // 後から追加したテーブルは未作成でも全体を壊さないよう個別に取得。
    try {
      const approvals = await supabase.from('event_approvals').select('*')
      if (!approvals.error && approvals.data) {
        localStorage.setItem(
          'sns_event_approvals',
          JSON.stringify(approvals.data.map(fromDbEventApproval))
        )
      }
    } catch {
      /* テーブル未作成などは無視 */
    }
    return { ok: true, userCount: users.data?.length ?? 0 }
  } catch {
    return { ok: false, userCount: 0 }
  }
}
