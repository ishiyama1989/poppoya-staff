import { useMemo, useState } from "react";
import { ATTENDANCE_ALERT_LABEL, type User } from "../types";
import {
  getMembers,
  getTimeClocks,
  timeClocksForUser,
  todaysAttendanceAlerts,
} from "../store";
import { todayStr } from "../lib/date";

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

// 自分の打刻履歴（メンバー）／ 本日の全員の状況確認（オーナー）。
// 打刻そのものはカレンダー上部のパネルから行う。
export default function TimeClock({ me }: { me: User }) {
  const [version] = useState(0);
  const isOwner = me.role === "owner";
  const today = todayStr();

  const myHistory = useMemo(() => timeClocksForUser(me.id), [me.id, version]);

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
          <p className="muted small">
            出退勤の打刻は、シフトが入っている日にカレンダー画面の上部から行えます。
          </p>

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
