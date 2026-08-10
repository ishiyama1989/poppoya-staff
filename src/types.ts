// アプリ全体で使うデータ型の定義（プロトタイプ）

export type Role = "owner" | "member";

// デジタル印影（領収書に使用）
export type StampShape = "circle" | "square";
export type StampOrientation = "vertical" | "horizontal";
export type StampFont = "mincho" | "gothic" | "maru" | "kaisho";
export interface StampConfig {
  text: string;
  shape: StampShape;
  orientation: StampOrientation;
  font: StampFont;
}

export interface User {
  id: string;
  name: string;
  password: string; // 4桁の数字。※プロトタイプ用。本番ではサーバ側でハッシュ化します
  role: Role;
  hourlyRate: number; // 時給（円）。オーナーが設定
  // プロフィール（任意・領収書に反映）
  receiptName?: string; // 領収書の発行者名（未設定なら表示名を使用）
  postalCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  stamp?: StampConfig;
}

// 予定（いつ・どこで・誰が・何を）
// 業務場所ごとに色分けするため、種別は場所名で持つ
export type EventType = "train" | "retro" | "locomo";

export interface ScheduleEvent {
  id: string;
  date: string; // "YYYY-MM-DD"
  type: EventType; // train=トレインルーム / retro=レトロルーム
  title: string; // 何をするか
  location: string; // どこで
  assigneeIds: string[]; // 誰が（複数可）
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  note: string;
}

// オーナーからメンバーへの依頼（申請）。メンバーが承認すると予定になる
export type RequestStatus = "pending" | "approved" | "rejected";

export interface AppRequest {
  id: string;
  date: string; // "YYYY-MM-DD"
  fromUserId: string; // 申請したオーナー
  toUserId: string; // 依頼されたメンバー
  type: EventType;
  title: string;
  location: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  note: string;
  status: RequestStatus;
  eventId?: string; // 元になった予定（あれば。承認時の重複作成を防ぐ）
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
};

// 領収書の宛名（宛名帳）。個人=様 / 法人=御中
export type RecipientType = "individual" | "corporate";

export interface Recipient {
  id: string;
  userId: string; // 登録したメンバー
  name: string;
  type: RecipientType;
}

export const HONORIFIC: Record<RecipientType, string> = {
  individual: "様",
  corporate: "御中",
};

export const RECIPIENT_TYPE_LABEL: Record<RecipientType, string> = {
  individual: "個人",
  corporate: "法人",
};

// 報酬の確定・承認（オーナーが稼働時間と金額を確定して承認 → メンバーの報酬に反映）
export type PayConfirmStatus = "requested" | "confirmed" | "approved";

export interface PayConfirmation {
  id: string;
  userId: string; // 対象メンバー
  quarter: string; // 対象四半期 "2026-Q2"
  hours: number; // 確定稼働時間（管理者が調整可能）
  workAmount: number; // 稼働報酬
  videoAmount: number; // 動画編集報酬
  amount: number; // 合計確定額（workAmount + videoAmount）
  note?: string; // 管理者メモ（任意）
  status: PayConfirmStatus; // approved=承認済み（メンバーに反映）
  requestedAt: string; // "YYYY-MM-DD"
  confirmedAt?: string;
  approvedAt?: string; // 承認日
}

// 予定ごとの報酬承認（予定が過ぎる→管理者が承認依頼→メンバーが承認→報酬確定）
export type EventApprovalStatus = "requested" | "approved" | "rejected";

export interface ExtraItem {
  name: string;
  amount: number;
}

export interface EventApproval {
  id: string;
  eventId: string; // 対象の予定
  userId: string; // 対象メンバー
  hours: number; // 稼働時間
  amount: number; // 合計額（稼働報酬＋交通費＋その他）
  note?: string;
  // 内訳（別々に計上）
  workAmount?: number; // 稼働報酬
  expense?: number; // 交通費
  extraItems?: ExtraItem[]; // その他の品目
  status: EventApprovalStatus; // requested=承認依頼中 / approved=メンバー承認済み
  requestedAt: string; // 管理者が依頼した日
  approvedAt?: string; // メンバーが承認した日
}

export const EVENT_APPROVAL_STATUS_LABEL: Record<EventApprovalStatus, string> = {
  requested: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
};

// メンバーの空き状況
// 時間帯（1日 / 午前 / 午後 / 夕方 / 夜）を複数選択 + コメント
export type AvailSlot = "allday" | "morning" | "afternoon" | "evening" | "night";

export interface Availability {
  userId: string;
  date: string; // "YYYY-MM-DD"
  slots: AvailSlot[];
  comment: string;
}

export const SLOT_LABEL: Record<AvailSlot, string> = {
  allday: "1日",
  morning: "午前",
  afternoon: "午後",
  evening: "夕方",
  night: "夜",
};

// 表示・選択の順番
export const SLOT_ORDER: AvailSlot[] = [
  "allday",
  "morning",
  "afternoon",
  "evening",
  "night",
];

// コメントの定型文（ユーザーごとに作成・使い回し）
export interface CommentTemplate {
  id: string;
  userId: string;
  text: string;
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  train: "トレインルーム",
  retro: "レトロルーム",
  locomo: "LOCOMO CAFE",
  // 以下は旧データ互換（過去に登録済みの予定が壊れないように残す）
  shift: "出勤",
  shooting: "撮影",
  meeting: "会議",
  delivery: "納品",
  other: "その他",
  work: "稼働",
};

export const EVENT_TYPE_COLOR: Record<string, string> = {
  train: "#3b82f6", // 青
  retro: "#f59e0b", // オレンジ
  locomo: "#12b886", // 緑
  // 以下は旧データ互換
  shift: "#12b886",
  shooting: "#f59e0b",
  meeting: "#8b5cf6",
  delivery: "#ef4444",
  other: "#64748b",
  work: "#3b82f6",
};

// 凡例・選択肢に表示する順序
export const EVENT_TYPES: EventType[] = ["train", "retro", "locomo"];

// 宿泊予約（ねっぱん！のiCalフィードから同期。アプリ側では編集不可・読み取り専用）
export type ReservationStatus = "confirmed" | "cancelled";

export interface Reservation {
  id: string;
  neppanBookingId: string;
  source: string; // manual（手入力）/ neppan / rakuten / jalan / booking / airbnb / ikyu / other
  checkinDate: string; // "YYYY-MM-DD"
  checkoutDate: string; // "YYYY-MM-DD"
  checkinTime: string; // "HH:MM"
  roomType: string;
  guestName: string;
  address: string;
  adults: number; // 大人
  children: number; // 就学児
  infants: number; // 幼児
  note: string;
  status: ReservationStatus;
}

// 客室（宿ぽっぽやは2部屋）
// 宿泊できるのはこの2室のみ。1室につき1日1組までしか受けられない。
// （LOCOMO CAFE は宿泊ではなく業務場所なので、ここには含めない）
export const ROOM_TYPES = ["トレインルーム", "レトロルーム"] as const;

// 人数プルダウンの選択肢（0〜5人）
export const GUEST_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5];

// チェックイン時刻の選択肢。宿の受け入れ開始が15:00のため、それ以前は選べない。
export const CHECKIN_TIME_OPTIONS: string[] = (() => {
  const list: string[] = [];
  for (let h = 15; h <= 23; h++) {
    list.push(`${String(h).padStart(2, "0")}:00`);
    list.push(`${String(h).padStart(2, "0")}:30`);
  }
  return list;
})();

export const DEFAULT_CHECKIN_TIME = "15:00";

// 予約サイトの表示名
export const RESERVATION_SOURCE_LABEL: Record<string, string> = {
  manual: "手入力",
  neppan: "ねっぱん",
  rakuten: "楽天トラベル",
  jalan: "じゃらん",
  booking: "Booking.com",
  airbnb: "Airbnb",
  ikyu: "一休",
  other: "その他",
};

// 出退勤打刻（1ユーザー・1日1レコード）
export interface TimeClock {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  clockIn?: string; // ISO日時
  clockOut?: string; // ISO日時
}

// シフト(予定)ごとの業務チェックリスト
export interface ChecklistItem {
  id: string;
  eventId: string;
  text: string;
  done: boolean;
}

// 申し送り・引き継ぎメモ（日付単位・全員が閲覧/追加可能）
export interface HandoverNote {
  id: string;
  date: string; // "YYYY-MM-DD"
  userId: string; // 書いた人
  text: string;
  createdAt: string; // ISO日時
}

// 遅刻・欠勤の連絡
export type AttendanceAlertKind = "late" | "absent";

export const ATTENDANCE_ALERT_LABEL: Record<AttendanceAlertKind, string> = {
  late: "遅刻",
  absent: "欠勤",
};

export interface AttendanceAlert {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  kind: AttendanceAlertKind;
  note: string;
  createdAt: string; // ISO日時
}

