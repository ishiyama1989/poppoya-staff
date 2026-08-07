// 報酬計算の共通ロジック
// 稼働(work)・撮影(shooting)を労働時間としてカウントし、納品(delivery)は除外。

import type { EventApproval, ScheduleEvent, VideoTask } from "../types";
import { hoursBetween, quarterOf } from "./date";

export interface PayLine {
  event: ScheduleEvent;
  hours: number;
  amount: number;
}

// 指定ユーザー・指定四半期の報酬明細
export function payLinesFor(
  events: ScheduleEvent[],
  userId: string,
  hourlyRate: number,
  quarter: string
): PayLine[] {
  return events
    .filter(
      (e) =>
        e.type !== "delivery" &&
        quarterOf(e.date) === quarter &&
        e.assigneeIds.includes(userId)
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => {
      const hours = hoursBetween(e.start, e.end);
      return { event: e, hours, amount: hours * hourlyRate };
    });
}

// そのユーザーに稼働実績のある四半期一覧（新しい順）
export function quartersForUserWork(
  events: ScheduleEvent[],
  userId: string
): string[] {
  const set = new Set<string>();
  for (const e of events)
    if (e.type !== "delivery" && e.assigneeIds.includes(userId))
      set.add(quarterOf(e.date));
  return Array.from(set).sort().reverse();
}

// 完了した動画編集依頼を四半期で割り当てる（完了日→なければ締切日で判定）
export function videoTasksForQuarter(
  tasks: VideoTask[],
  userId: string,
  quarter: string
): VideoTask[] {
  return tasks
    .filter(
      (t) =>
        t.toUserId === userId &&
        t.status === "completed" &&
        quarterOf(t.completedAt ?? t.deadline) === quarter
    )
    .sort((a, b) => ((a.completedAt ?? a.deadline) < (b.completedAt ?? b.deadline) ? -1 : 1));
}

// ---- 稼働履歴 ----
export type HistoryStatus = "confirmed" | "pending" | "noreward" | "undetermined";

export const HISTORY_STATUS_LABEL: Record<HistoryStatus, string> = {
  confirmed: "確定",
  pending: "承認待ち",
  noreward: "報酬なし",
  undetermined: "未確定",
};

export interface HistoryRow {
  id: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  typeLabel: string;
  hours: number; // 動画は0
  amount: number | null; // 未確定/報酬なしは null
  status: HistoryStatus;
}

export interface HistorySummary {
  count: number;
  totalHours: number;
  confirmedAmount: number;
  pendingAmount: number;
}

const HIST_TYPE_LABEL: Record<string, string> = {
  shooting: "撮影",
  meeting: "会議",
  delivery: "納品",
  other: "その他",
  work: "稼働",
};

// そのユーザーに活動（担当予定 or 完了動画）のある四半期一覧（新しい順）
export function workHistoryQuarters(
  events: ScheduleEvent[],
  videoTasks: VideoTask[],
  userId: string
): string[] {
  const set = new Set<string>();
  for (const e of events)
    if (e.assigneeIds.includes(userId)) set.add(quarterOf(e.date));
  for (const t of videoTasks)
    if (t.toUserId === userId && t.status === "completed")
      set.add(quarterOf(t.completedAt ?? t.deadline));
  return Array.from(set).sort().reverse();
}

// 指定ユーザー・四半期の稼働履歴（すべての活動）を組み立てる
export function buildWorkHistory(
  events: ScheduleEvent[],
  approvals: EventApproval[],
  videoTasks: VideoTask[],
  userId: string,
  quarter: string
): { rows: HistoryRow[]; summary: HistorySummary } {
  const rows: HistoryRow[] = [];

  for (const e of events) {
    if (!e.assigneeIds.includes(userId)) continue;
    if (quarterOf(e.date) !== quarter) continue;
    const appr = approvals.find(
      (a) => a.eventId === e.id && a.userId === userId && a.status !== "rejected"
    );
    if (appr && (appr.status === "approved" || appr.status === "requested")) {
      const status: HistoryStatus = appr.status === "approved" ? "confirmed" : "pending";
      // 稼働報酬の行
      rows.push({
        id: e.id,
        date: e.date,
        title: e.title,
        typeLabel: HIST_TYPE_LABEL[e.type] ?? e.type,
        hours: appr.hours,
        amount: appr.workAmount ?? appr.amount,
        status,
      });
      // 交通費・その他は別行で計上
      if (appr.expense && appr.expense > 0) {
        rows.push({
          id: e.id + ":exp",
          date: e.date,
          title: `${e.title}（交通費）`,
          typeLabel: "交通費",
          hours: 0,
          amount: appr.expense,
          status,
        });
      }
      for (const [i, it] of (appr.extraItems ?? []).entries()) {
        if (!it.amount) continue;
        rows.push({
          id: `${e.id}:item${i}`,
          date: e.date,
          title: `${e.title}（${it.name}）`,
          typeLabel: "その他",
          hours: 0,
          amount: it.amount,
          status,
        });
      }
    } else {
      const status: HistoryStatus = e.hasReward === false ? "noreward" : "undetermined";
      rows.push({
        id: e.id,
        date: e.date,
        title: e.title,
        typeLabel: HIST_TYPE_LABEL[e.type] ?? e.type,
        hours: hoursBetween(e.start, e.end),
        amount: null,
        status,
      });
    }
  }

  for (const t of videoTasks) {
    if (t.toUserId !== userId || t.status !== "completed") continue;
    const d = t.completedAt ?? t.deadline;
    if (quarterOf(d) !== quarter) continue;
    rows.push({
      id: t.id,
      date: d,
      title: t.title,
      typeLabel: "動画編集",
      hours: 0,
      amount: t.amount,
      status: "confirmed",
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい順

  const summary: HistorySummary = {
    count: rows.length,
    totalHours: rows.reduce((s, r) => s + r.hours, 0),
    confirmedAmount: rows
      .filter((r) => r.status === "confirmed")
      .reduce((s, r) => s + (r.amount ?? 0), 0),
    pendingAmount: rows
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + (r.amount ?? 0), 0),
  };

  return { rows, summary };
}
