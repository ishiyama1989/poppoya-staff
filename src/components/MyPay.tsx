import { useMemo, useState } from "react";
import {
  EVENT_TYPE_LABEL,
  HONORIFIC,
  RECIPIENT_TYPE_LABEL,
  type RecipientType,
  type ScheduleEvent,
  type User,
} from "../types";
import {
  addRecipient,
  approveEventApproval,
  approvedEventApprovalsForUser,
  deleteRecipient,
  getConfirmedDeliverables,
  getEvents,
  getRecipients,
  getVideoTasks,
  pendingEventApprovalsForUser,
  rejectEventApproval,
} from "../store";
import { quarterLabel, quarterOf, todayStr, yen } from "../lib/date";
import { deliverablesForQuarter, videoTasksForQuarter } from "../lib/pay";
import { openReceiptPdf } from "../lib/receipt";
import { stampSvg } from "../lib/stamp";

// メンバーが報酬の承認依頼を承認し、確定報酬を確認・領収書を発行する画面
export default function MyPay({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const events = useMemo(() => getEvents(), [version]);
  const videoTasks = useMemo(() => getVideoTasks(), [version]);
  const deliverables = useMemo(() => getConfirmedDeliverables(), [version]);

  const eventById = useMemo(() => {
    const m: Record<string, ScheduleEvent> = {};
    for (const e of events) m[e.id] = e;
    return m;
  }, [events]);

  // 承認待ちの報酬（管理者からの承認依頼）
  const pending = useMemo(
    () => pendingEventApprovalsForUser(me.id),
    [me.id, version]
  );
  // 承認済みの報酬
  const approved = useMemo(
    () => approvedEventApprovalsForUser(me.id),
    [me.id, version]
  );

  // 期間（四半期）の一覧
  const quarters = useMemo(() => {
    const set = new Set<string>();
    for (const a of approved) {
      const e = eventById[a.eventId];
      if (e) set.add(quarterOf(e.date));
    }
    for (const t of videoTasks)
      if (t.toUserId === me.id && t.status === "completed")
        set.add(quarterOf(t.completedAt ?? t.deadline));
    for (const d of deliverables)
      if (d.assigneeId === me.id)
        set.add(quarterOf(d.deliveredAt ?? d.confirmedAt ?? d.createdAt));
    const arr = Array.from(set).sort().reverse();
    return arr.length ? arr : [quarterOf(todayStr())];
  }, [approved, videoTasks, deliverables, eventById, me.id]);

  const [quarter, setQuarter] = useState(quarters[0]);
  if (!quarters.includes(quarter)) setQuarter(quarters[0]);

  const [issuedTo, setIssuedTo] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("corporate");

  const recipients = useMemo(() => getRecipients(me.id), [me.id, version]);

  // 選択中の期間の確定報酬
  const approvedInQ = useMemo(
    () =>
      approved
        .filter((a) => {
          const e = eventById[a.eventId];
          return e && quarterOf(e.date) === quarter;
        })
        .sort((a, b) => {
          const da = eventById[a.eventId]?.date ?? "";
          const db = eventById[b.eventId]?.date ?? "";
          return da < db ? -1 : 1;
        }),
    [approved, eventById, quarter]
  );
  const vTasks = useMemo(
    () => videoTasksForQuarter(videoTasks, me.id, quarter),
    [videoTasks, me.id, quarter]
  );
  const dItems = useMemo(
    () => deliverablesForQuarter(deliverables, me.id, quarter),
    [deliverables, me.id, quarter]
  );

  const workReward = approvedInQ.reduce((s, a) => s + a.amount, 0);
  const videoReward = vTasks.reduce((s, t) => s + (t.amount || 0), 0);
  const deliverableReward = dItems.reduce((s, d) => s + (d.rewardAmount || 0), 0);
  const rewardAmount = workReward + videoReward + deliverableReward;

  function saveRecipient() {
    if (!issuedTo.trim()) return alert("宛名を入力してください。");
    addRecipient(me.id, issuedTo, recipientType);
    setVersion((v) => v + 1);
  }

  function issueReceipt() {
    if (rewardAmount <= 0) {
      alert("この期間の確定報酬がないため、領収書を発行できません。");
      return;
    }
    if (!issuedTo.trim()) {
      alert("宛名を入力（または選択）してください。");
      return;
    }
    const receiptLines: { date: string; title: string; hours: number; amount: number }[] = [];
    for (const a of approvedInQ) {
      const e = eventById[a.eventId];
      const d = e ? e.date.replace(/-/g, "/") : "";
      const t = e?.title ?? "報酬";
      receiptLines.push({ date: d, title: t, hours: a.hours, amount: a.amount });
      if (a.expense && a.expense > 0)
        receiptLines.push({ date: "", title: `　└ 交通費`, hours: 0, amount: a.expense });
      for (const it of a.extraItems ?? [])
        if (it.amount) receiptLines.push({ date: "", title: `　└ ${it.name}`, hours: 0, amount: it.amount });
    }
    for (const t of vTasks) {
      receiptLines.push({
        date: (t.completedAt ?? t.deadline).replace(/-/g, "/"),
        title: `動画編集: ${t.title}`,
        hours: 0,
        amount: t.amount,
      });
    }
    for (const d of dItems) {
      receiptLines.push({
        date: (d.deliveredAt ?? d.confirmedAt ?? d.createdAt).replace(/-/g, "/"),
        title: `納品物: ${d.title}`,
        hours: 0,
        amount: d.rewardAmount ?? 0,
      });
    }
    openReceiptPdf({
      receiptNo: `${quarter}-${me.id.slice(0, 4).toUpperCase()}`,
      issuedDate: todayStr().replace(/-/g, "/"),
      issuedTo: issuedTo.trim(),
      honorific: HONORIFIC[recipientType],
      issuerName: me.receiptName?.trim() || me.name,
      issuerInfo: {
        postalCode: me.postalCode,
        address: me.address,
        phone: me.phone,
        email: me.email,
      },
      stampSvg: me.stamp
        ? stampSvg(me.stamp.text, me.stamp.shape, me.stamp.orientation, me.stamp.font)
        : undefined,
      periodLabel: quarterLabel(quarter),
      amount: rewardAmount,
      lines: receiptLines,
    });
  }

  const canIssue = rewardAmount > 0;

  return (
    <div className="mypay-view">
      <div className="section-head">
        <h2>報酬の確認</h2>
        <p className="muted">
          管理者からの承認依頼を承認すると報酬が確定します（時給 {yen(me.hourlyRate)}/時）。
        </p>
      </div>

      {/* 承認待ちの報酬 */}
      {pending.length > 0 && (
        <div className="approval-pending-box">
          <h3 className="req-section-title">
            📢 承認待ちの報酬（{pending.length}件）
          </h3>
          <div className="approval-list">
            {pending.map((a) => {
              const e = eventById[a.eventId];
              return (
                <div key={a.id} className="approval-card">
                  <div className="approval-card-main">
                    <div className="approval-card-head">
                      <span className="req-date">
                        {e ? e.date.replace(/-/g, "/") : "—"}
                      </span>
                      {e && <span className="tag">{EVENT_TYPE_LABEL[e.type]}</span>}
                    </div>
                    <div className="approval-card-title">{e?.title ?? "報酬"}</div>
                    {e && (
                      <div className="approval-card-meta">
                        🕒 {e.start}–{e.end || "未定"} ／ 📍 {e.location || "未設定"}
                      </div>
                    )}
                    <div className="approval-card-amount">報酬 {yen(a.amount)}</div>
                  </div>
                  <div className="approval-card-action">
                    <button
                      className="ghost danger mini"
                      onClick={() => {
                        rejectEventApproval(a.id);
                        setVersion((v) => v + 1);
                      }}
                    >
                      却下
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        approveEventApproval(a.id);
                        setVersion((v) => v + 1);
                      }}
                    >
                      承認する
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label className="quarter-select">
        対象期間
        <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          {quarters.map((q) => (
            <option key={q} value={q}>
              {quarterLabel(q)}
            </option>
          ))}
        </select>
      </label>

      <div className="pay-summary">
        <div className="pay-card">
          <span className="pay-label">稼働報酬</span>
          <span className="pay-value">{yen(workReward)}</span>
        </div>
        <div className="pay-card">
          <span className="pay-label">動画報酬</span>
          <span className="pay-value">{yen(videoReward)}</span>
        </div>
        <div className="pay-card">
          <span className="pay-label">納品報酬</span>
          <span className="pay-value">{yen(deliverableReward)}</span>
        </div>
        <div className="pay-card highlight">
          <span className="pay-label">確定報酬</span>
          <span className="pay-value">{yen(rewardAmount)}</span>
        </div>
      </div>

      {/* 確定した稼働報酬の明細 */}
      <h3 className="req-section-title">確定した報酬明細</h3>
      <table className="members-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>内容</th>
            <th>種別</th>
            <th>報酬</th>
          </tr>
        </thead>
        <tbody>
          {approvedInQ.length === 0 && vTasks.length === 0 && dItems.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                この期間の確定報酬はありません。
              </td>
            </tr>
          ) : (
            <>
              {approvedInQ.map((a) => {
                const e = eventById[a.eventId];
                const date = e ? e.date.replace(/-/g, "/") : "—";
                const title = e?.title ?? "報酬";
                const parts: string[] = [];
                if (a.workAmount) parts.push(`稼働 ${yen(a.workAmount)}`);
                if (a.expense && a.expense > 0) parts.push(`交通費 ${yen(a.expense)}`);
                for (const it of a.extraItems ?? []) if (it.amount) parts.push(`${it.name} ${yen(it.amount)}`);
                return (
                  <tr key={a.id}>
                    <td>{date}</td>
                    <td>
                      {title}
                      {parts.length > 0 && <div className="breakdown-note">{parts.join("　/　")}</div>}
                    </td>
                    <td className="muted">{e ? EVENT_TYPE_LABEL[e.type] : "—"}</td>
                    <td className="amount">{yen(a.amount)}</td>
                  </tr>
                );
              })}
              {vTasks.map((t) => (
                <tr key={t.id}>
                  <td>{(t.completedAt ?? t.deadline).replace(/-/g, "/")}</td>
                  <td>{t.title}</td>
                  <td className="muted">動画編集</td>
                  <td className="amount">{yen(t.amount)}</td>
                </tr>
              ))}
              {dItems.map((d) => (
                <tr key={d.id}>
                  <td>{(d.deliveredAt ?? d.confirmedAt ?? d.createdAt).replace(/-/g, "/")}</td>
                  <td>{d.title}</td>
                  <td className="muted">納品物</td>
                  <td className="amount">{yen(d.rewardAmount ?? 0)}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      <div className="receipt-box">
        <h3>領収書の発行</h3>
        <p className="muted small">
          {canIssue
            ? "宛名を選ぶか入力して発行できます。個人は「様」、法人は「御中」が付きます。印刷ダイアログで「PDFとして保存」を選ぶとPDFになります。"
            : "報酬が確定すると発行できるようになります。"}
        </p>

        {recipients.length > 0 && (
          <div className="recipient-saved">
            <span className="muted small">登録済みの宛名：</span>
            <div className="recipient-chips">
              {recipients.map((r) => (
                <span key={r.id} className="recipient-chip">
                  <button
                    type="button"
                    className="recipient-pick"
                    onClick={() => {
                      setIssuedTo(r.name);
                      setRecipientType(r.type);
                    }}
                  >
                    {r.name} {HONORIFIC[r.type]}
                    <span className="recipient-tag">{RECIPIENT_TYPE_LABEL[r.type]}</span>
                  </button>
                  <button
                    type="button"
                    className="recipient-del"
                    title="削除"
                    onClick={async () => {
                      try {
                        await deleteRecipient(r.id);
                      } catch {
                        alert("削除に失敗しました。もう一度お試しください。");
                      }
                      setVersion((v) => v + 1);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="recipient-type">
          {(["corporate", "individual"] as RecipientType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`type-btn ${recipientType === t ? "on" : ""}`}
              disabled={!canIssue}
              onClick={() => setRecipientType(t)}
            >
              {RECIPIENT_TYPE_LABEL[t]}（{HONORIFIC[t]}）
            </button>
          ))}
        </div>

        <div className="receipt-row">
          <input
            value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
            placeholder={
              recipientType === "individual" ? "宛名（例: 山田 花子）" : "宛名（例: 株式会社○○）"
            }
            disabled={!canIssue}
          />
          <button className="ghost" onClick={saveRecipient} disabled={!canIssue}>
            ＋宛名を登録
          </button>
          <button className="primary" onClick={issueReceipt} disabled={!canIssue}>
            🧾 領収書を発行（PDF）
          </button>
        </div>
        {issuedTo.trim() && (
          <p className="muted small recipient-preview">
            宛名プレビュー： <strong>{issuedTo.trim()} {HONORIFIC[recipientType]}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
