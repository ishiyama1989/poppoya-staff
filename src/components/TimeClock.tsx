import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { ATTENDANCE_ALERT_LABEL, type AttendanceAlertKind, type User } from "../types";
import {
  clockIn,
  clockOut,
  getMembers,
  getTimeClocks,
  getUsers,
  reportAttendanceAlert,
  timeClockFor,
  timeClocksForUser,
  todaysAttendanceAlerts,
} from "../store";
import { todayStr } from "../lib/date";
import { sendPushToUsers } from "../lib/push";

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function workedHours(clockInIso?: string, clockOutIso?: string): string {
  if (!clockInIso || !clockOutIso) return "—";
  const mins = (new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 60000;
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}時間${m > 0 ? `${m}分` : ""}`;
}

// 出退勤の打刻・遅刻欠勤連絡（メンバー）／ 本日の全員の状況確認（オーナー）
export default function TimeClock({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const isOwner = me.role === "owner";
  const today = todayStr();

  const myToday = useMemo(() => timeClockFor(me.id, today), [me.id, version, today]);
  const myHistory = useMemo(() => timeClocksForUser(me.id), [me.id, version]);

  const [showAlertForm, setShowAlertForm] = useState<AttendanceAlertKind | null>(null);
  const [alertNote, setAlertNote] = useState("");

  function refresh() {
    setVersion((v) => v + 1);
  }

  function sendAlert(kind: AttendanceAlertKind) {
    reportAttendanceAlert(me.id, kind, alertNote);
    const ownerIds = getUsers().filter((u) => u.role === "owner").map((u) => u.id);
    sendPushToUsers(
      ownerIds,
      `${ATTENDANCE_ALERT_LABEL[kind]}の連絡`,
      `${me.name}さんから${ATTENDANCE_ALERT_LABEL[kind]}の連絡です${alertNote.trim() ? `：${alertNote.trim()}` : ""}`,
      "/"
    );
    setAlertNote("");
    setShowAlertForm(null);
    refresh();
  }

  const members = useMemo(() => getMembers(), [version]);
  const clocksToday = useMemo(
    () => getTimeClocks().filter((t) => t.date === today),
    [version, today]
  );
  const alertsToday = useMemo(() => todaysAttendanceAlerts(), [version]);

  return (
    <div className="timeclock-view">
      <div className="section-head">
        <h2>出退勤</h2>
        <p className="muted">{today.replace(/-/g, "/")} の勤怠</p>
      </div>

      {!isOwner && (
        <>
          <div className="clock-box">
            <div className="clock-status">
              <span>出勤 <strong>{fmtTime(myToday?.clockIn)}</strong></span>
              <span>退勤 <strong>{fmtTime(myToday?.clockOut)}</strong></span>
            </div>
            <div className="clock-actions">
              <button
                className="primary"
                onClick={() => {
                  clockIn(me.id);
                  refresh();
                }}
                disabled={!!myToday?.clockIn}
              >
                出勤する
              </button>
              <button
                className="ghost"
                onClick={() => {
                  clockOut(me.id);
                  refresh();
                }}
                disabled={!myToday?.clockIn || !!myToday?.clockOut}
              >
                退勤する
              </button>
            </div>
          </div>

          <div className="clock-box">
            <strong>
              <Megaphone size={14} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              遅刻・欠勤の連絡
            </strong>
            {!showAlertForm ? (
              <div className="clock-actions">
                <button className="ghost danger" onClick={() => setShowAlertForm("late")}>
                  今日遅れます
                </button>
                <button className="ghost danger" onClick={() => setShowAlertForm("absent")}>
                  今日休みます
                </button>
              </div>
            ) : (
              <div className="alert-form">
                <textarea
                  value={alertNote}
                  onChange={(e) => setAlertNote(e.target.value)}
                  placeholder="理由・到着予定時刻など（任意）"
                  rows={2}
                />
                <div className="form-actions">
                  <button className="ghost" onClick={() => setShowAlertForm(null)}>
                    キャンセル
                  </button>
                  <button className="primary" onClick={() => sendAlert(showAlertForm)}>
                    {ATTENDANCE_ALERT_LABEL[showAlertForm]}を送信
                  </button>
                </div>
              </div>
            )}
          </div>

          <h3 className="req-section-title">最近の打刻履歴</h3>
          <table className="members-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>稼働時間</th>
              </tr>
            </thead>
            <tbody>
              {myHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">まだ記録がありません</td>
                </tr>
              ) : (
                myHistory.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date.replace(/-/g, "/")}</td>
                    <td>{fmtTime(t.clockIn)}</td>
                    <td>{fmtTime(t.clockOut)}</td>
                    <td>{workedHours(t.clockIn, t.clockOut)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}

      {isOwner && (
        <>
          {alertsToday.length > 0 && (
            <>
              <div className="pending-banner">
                <span className="pending-banner-text">
                  本日の遅刻・欠勤連絡が <strong>{alertsToday.length}件</strong> あります
                </span>
              </div>
              <div className="req-box">
                {alertsToday.map((a) => {
                  const u = members.find((m) => m.id === a.userId);
                  return (
                    <div key={a.id} className="req-item">
                      <span className={`req-status ${a.kind === "absent" ? "rejected" : "pending"}`}>
                        {ATTENDANCE_ALERT_LABEL[a.kind]}
                      </span>
                      <span className="req-text">
                        {u?.name ?? "?"}
                        {a.note ? `／${a.note}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h3 className="req-section-title">本日のスタッフ出退勤状況</h3>
          <table className="members-table">
            <thead>
              <tr>
                <th>スタッフ</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>稼働時間</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">メンバーが登録されていません</td>
                </tr>
              ) : (
                members.map((m) => {
                  const t = clocksToday.find((x) => x.userId === m.id);
                  return (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{fmtTime(t?.clockIn)}</td>
                      <td>{fmtTime(t?.clockOut)}</td>
                      <td>{workedHours(t?.clockIn, t?.clockOut)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
