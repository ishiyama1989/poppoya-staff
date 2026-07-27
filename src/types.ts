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
export type EventType = "shooting" | "meeting" | "delivery" | "other";

export interface ScheduleEvent {
  id: string;
  date: string; // "YYYY-MM-DD"
  type: EventType; // shooting=撮影 / meeting=会議 / delivery=納品 / other=その他
  title: string; // 何をするか
  location: string; // どこで
  assigneeIds: string[]; // 誰が（複数可）
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  note: string;
  hasReward?: boolean; // 報酬の対象か（既定: true）。falseなら報酬承認の対象外
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

// 案件（請負中のクライアント案件）
export type ProjectStatus = "active" | "paused" | "done";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "請負中",
  paused: "一時停止",
  done: "完了",
};

export interface Project {
  id: string;
  name: string; // 案件名・クライアント名
  status: ProjectStatus;
  description: string;
  assigneeIds: string[]; // 担当メンバー
  startDate: string; // "YYYY-MM-DD"
  createdAt: string;
}

// 案件に紐づく資料（リンク or アップロードファイル）
export type MaterialKind = "link" | "file";

// 資料 = reference / 納品物 = deliverable
export type MaterialCategory = "material" | "deliverable";
// 納品物の種別
export type DeliverableMediaType = "video" | "image" | "other";

export const DELIVERABLE_MEDIA_LABEL: Record<DeliverableMediaType, string> = {
  video: "動画",
  image: "画像",
  other: "その他",
};

// 納品物の確認状態（pending=確認待ち / confirmed=報酬確定）
export type DeliverableStatus = "pending" | "confirmed";

export interface ProjectMaterial {
  id: string;
  projectId: string;
  title: string;
  kind: MaterialKind;
  url: string; // 資料のリンクURL / ストレージURL（納品物では空でも可）
  filePath?: string; // ストレージ上のパス（fileの場合）
  note?: string; // メモ
  createdBy: string; // 登録したユーザーID
  createdAt: string;
  category?: MaterialCategory; // 既定: material（資料）
  mediaType?: DeliverableMediaType; // 納品物の種別
  assigneeId?: string; // 納品物の担当者（メンバー）
  deliveredAt?: string; // 納品日 "YYYY-MM-DD"（未設定可）
  // 納品物の報酬ワークフロー
  delStatus?: DeliverableStatus; // 既定: pending
  rewardAmount?: number; // 管理者が確定した報酬額
  confirmedAt?: string; // 管理者が確定した日
}

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
  shooting: "撮影",
  meeting: "会議",
  delivery: "納品",
  other: "その他",
  work: "稼働", // 旧データ互換
};

export const EVENT_TYPE_COLOR: Record<string, string> = {
  shooting: "#f59e0b", // オレンジ
  meeting: "#8b5cf6", // 紫
  delivery: "#ef4444", // 赤
  other: "#64748b",   // グレー
  work: "#3b82f6",    // 旧データ互換（青）
};

// 凡例・選択肢に表示する順序
export const EVENT_TYPES: EventType[] = ["shooting", "meeting", "delivery", "other"];

// 動画編集依頼（依頼管理機能）
export type VideoTaskStatus = "pending" | "accepted" | "submitted" | "completed" | "rejected" | "cancelled";

export const VIDEO_TASK_STATUS_LABEL: Record<VideoTaskStatus, string> = {
  pending: "承認待ち",
  accepted: "進行中",
  submitted: "納品確認待ち",
  completed: "完了",
  rejected: "却下",
  cancelled: "取り消し済み",
};

export interface VideoTask {
  id: string;
  fromUserId: string;   // 依頼した管理者
  toUserId: string;     // 担当メンバー
  title: string;
  description: string;
  deadline: string;     // YYYY-MM-DD
  amount: number;
  status: VideoTaskStatus;
  createdAt: string;
  deliveryUrl?: string;
  deliveryNote?: string;
  submittedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}
