import { useMemo, useState } from "react";
import type { User } from "../types";
import {
  getConfirmedDeliverables,
  getEventApprovals,
  getEvents,
  getMembers,
  getVideoTasks,
} from "../store";
import { quarterLabel, quarterOf, todayStr, yen } from "../lib/date";
import {
  HISTORY_STATUS_LABEL,
  buildWorkHistory,
  workHistoryQuarters,
} from "../lib/pay";
import { openWorkHistoryPdf } from "../lib/historyPdf";

// 四半期ごとの稼働履歴。メンバーは自分、管理者はメンバーを選んで閲覧。
export default function WorkHistory({ me }: { me: User }) {
  const isOwner = me.role === "owner";
  const events = useMemo(() => getEvents(), []);
  const approvals = useMemo(() => getEventApprovals(), []);
  const videoTasks = useMemo(() => getVideoTasks(), []);
  const deliverables = useMemo(() => getConfirmedDeliverables(), []);
  const members = useMemo(() => getMembers(), []);

  const [targetId, setTargetId] = useState(isOwner ? members[0]?.id ?? "" : me.id);
  const target = isOwner ? members.find((m) => m.id === targetId) : me;

  const currentQuarter = quarterOf(todayStr());
  const quarters = useMemo(() => {
    const set = new Set<string>(
      target ? workHistoryQuarters(events, videoTasks, target.id, deliverables) : []
    );
    set.add(currentQuarter); // 現在の四半期は常に選べるようにする
    return Array.from(set).sort().reverse();
  }, [events, videoTasks, deliverables, target, currentQuarter]);

  // デフォルトは「現在の四半期」
  const [quarter, setQuarter] = useState(currentQuarter);
  if (!quarters.includes(quarter)) setQuarter(currentQuarter);

  const { rows, summary } = useMemo(
    () =>
      target
        ? buildWorkHistory(events, approvals, videoTasks, target.id, quarter, deliverables)
        : { rows: [], summary: { count: 0, totalHours: 0, confirmedAmount: 0, pendingAmount: 0 } },
    [events, approvals, videoTasks, deliverables, target, quarter]
  );

  function exportPdf() {
    if (!target) return;
    openWorkHistoryPdf({
      memberName: target.name,
      periodLabel: quarterLabel(quarter),
      rows,
      summary,
    });
  }

  return (
    <div className="history-view">
      <div className="section-head">
        <h2>稼働履歴</h2>
        <p className="muted">
          四半期ごとの活動内容・稼働時間・報酬をまとめて確認できます。
        </p>
      </div>

      <div className="history-controls">
        {isOwner && (
          <label className="quarter-select">
            メンバー
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {members.length === 0 ? (
                <option value="">メンバーがいません</option>
              ) : (
                members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              )}
            </select>
          </label>
        )}
        <label className="quarter-select">
          対象期間
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {quarters.map((q) => (
              <option key={q} value={q}>{quarterLabel(q)}</option>
            ))}
          </select>
        </label>
        <button className="ghost" onClick={exportPdf} disabled={!target}>
          🖨 PDFで出力
        </button>
      </div>

      <div className="pay-summary">
        <div className="pay-card">
          <span className="pay-label">活動件数</span>
          <span className="pay-value">{summary.count}件</span>
        </div>
        <div className="pay-card">
          <span className="pay-label">総稼働時間</span>
          <span className="pay-value">{summary.totalHours.toFixed(1)}h</span>
        </div>
        <div className="pay-card highlight">
          <span className="pay-label">確定報酬</span>
          <span className="pay-value">{yen(summary.confirmedAmount)}</span>
        </div>
        <div className="pay-card">
          <span className="pay-label">承認待ち</span>
          <span className="pay-value">{yen(summary.pendingAmount)}</span>
        </div>
      </div>

      <table className="members-table history-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>活動内容</th>
            <th>種別</th>
            <th>稼働</th>
            <th>報酬</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">この期間の活動はありません。</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{r.date.replace(/-/g, "/")}</td>
                <td>{r.title}</td>
                <td className="muted hist-type">{r.typeLabel}</td>
                <td>{r.hours > 0 ? `${r.hours.toFixed(1)}h` : "—"}</td>
                <td className="amount">{r.amount != null ? yen(r.amount) : "—"}</td>
                <td>
                  <span className={`hist-status ${r.status}`}>
                    {HISTORY_STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
