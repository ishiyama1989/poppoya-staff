import { useMemo, useState } from "react";
import {
  eventsAwaitingAdmin,
  getEventApprovals,
  getEvents,
  getMembers,
  requestEventApproval,
  setEventReward,
} from "../store";
import { hoursBetween, quarterLabel, quarterOf, yen } from "../lib/date";
import { sendPushToUsers } from "../lib/push";
import {
  EVENT_APPROVAL_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  type ScheduleEvent,
  type User,
} from "../types";

// オーナーが「過ぎた予定」ごとに報酬を確認し、メンバーへ承認依頼を送る画面
export default function Payments() {
  const [version, setVersion] = useState(0);
  const events = useMemo(() => getEvents(), [version]);
  const members = useMemo(() => getMembers(), [version]);
  const approvals = useMemo(() => getEventApprovals(), [version]);

  const memberById = useMemo(() => {
    const m: Record<string, User> = {};
    for (const u of members) m[u.id] = u;
    return m;
  }, [members]);
  const eventById = useMemo(() => {
    const m: Record<string, ScheduleEvent> = {};
    for (const e of events) m[e.id] = e;
    return m;
  }, [events]);

  // 確認待ち（まだ承認依頼を送っていない過ぎた予定）
  const awaiting = useMemo(() => eventsAwaitingAdmin(), [version]);
  // 承認依頼を送る前の「時間」「金額」「交通費」「その他項目」の編集用
  const [hoursMap, setHoursMap] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [expenseMap, setExpenseMap] = useState<Record<string, string>>({});
  const [itemsMap, setItemsMap] = useState<
    Record<string, { name: string; amount: string }[]>
  >({});

  function amountKey(eventId: string, userId: string) {
    return `${eventId}:${userId}`;
  }
  function getItems(key: string) {
    return itemsMap[key] ?? [];
  }
  function addItem(key: string) {
    setItemsMap((m) => ({ ...m, [key]: [...(m[key] ?? []), { name: "", amount: "" }] }));
  }
  function updateItem(key: string, i: number, field: "name" | "amount", val: string) {
    setItemsMap((m) => {
      const arr = [...(m[key] ?? [])];
      arr[i] = { ...arr[i], [field]: val };
      return { ...m, [key]: arr };
    });
  }
  function removeItem(key: string, i: number) {
    setItemsMap((m) => ({ ...m, [key]: (m[key] ?? []).filter((_, idx) => idx !== i) }));
  }
  function extraTotal(key: string) {
    const exp = Number(expenseMap[key] || 0) || 0;
    const items = (itemsMap[key] ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
    return exp + items;
  }
  function defaultHours(e: ScheduleEvent) {
    return hoursBetween(e.start, e.end);
  }
  function defaultAmount(e: ScheduleEvent, userId: string) {
    const rate = memberById[userId]?.hourlyRate ?? 0;
    return Math.round(defaultHours(e) * rate);
  }
  // 時間を変更したら、金額を「時間×時給」で自動再計算（金額は手動編集も可）
  function onHoursChange(e: ScheduleEvent, userId: string, val: string) {
    const key = amountKey(e.id, userId);
    setHoursMap((m) => ({ ...m, [key]: val }));
    const rate = memberById[userId]?.hourlyRate ?? 0;
    const h = Number(val);
    if (!Number.isNaN(h)) {
      setAmounts((m) => ({ ...m, [key]: String(Math.round(h * rate)) }));
    }
  }

  function send(e: ScheduleEvent, userId: string) {
    const key = amountKey(e.id, userId);
    const hours =
      hoursMap[key] !== undefined ? Number(hoursMap[key]) || 0 : defaultHours(e);
    const work =
      amounts[key] !== undefined ? Number(amounts[key]) || 0 : defaultAmount(e, userId);
    const expense = Number(expenseMap[key] || 0) || 0;
    const items = getItems(key).filter((it) => it.name.trim() || Number(it.amount));
    const itemsSum = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const amount = work + expense + itemsSum;

    const extraItems = items.map((it) => ({
      name: it.name.trim() || "その他",
      amount: Number(it.amount) || 0,
    }));

    requestEventApproval(e.id, userId, hours, amount, undefined, {
      workAmount: work,
      expense,
      extraItems,
    });
    sendPushToUsers(
      [userId],
      "報酬の承認依頼が届きました",
      `${e.date.slice(5).replace("-", "/")}「${e.title}」の報酬 ${yen(amount)} を確認してください`,
      "/"
    );
    setVersion((v) => v + 1);
  }

  // メンバーの承認待ち / 承認済み
  const requested = approvals.filter((a) => a.status === "requested");
  const approved = approvals.filter((a) => a.status === "approved");

  // 承認済みをメンバー×四半期で集計
  const approvedSummary = useMemo(() => {
    const map: Record<string, { name: string; quarter: string; total: number; count: number }> = {};
    for (const a of approved) {
      const e = eventById[a.eventId];
      const q = e ? quarterOf(e.date) : "—";
      const k = `${a.userId}:${q}`;
      const name = memberById[a.userId]?.name ?? "—";
      if (!map[k]) map[k] = { name, quarter: q, total: 0, count: 0 };
      map[k].total += a.amount;
      map[k].count += 1;
    }
    return Object.values(map).sort((x, y) =>
      x.quarter === y.quarter ? x.name.localeCompare(y.name) : x.quarter < y.quarter ? 1 : -1
    );
  }, [approved, eventById, memberById]);

  return (
    <div className="payments-view">
      <div className="section-head">
        <h2>支払い集計・承認</h2>
        <p className="muted">
          予定が過ぎると下に表示されます。内容を確認して
          <strong>「承認依頼を送る」</strong>とメンバーに通知が届き、メンバーが承認すると報酬が確定します。
        </p>
      </div>

      {/* 確認待ち */}
      <h3 className="req-section-title">
        確認待ちの予定（{awaiting.length}件）
      </h3>
      {awaiting.length === 0 ? (
        <p className="muted">承認依頼を送る予定はありません。</p>
      ) : (
        <div className="approval-list">
          {awaiting.map(({ event: e, userId }) => {
            const key = amountKey(e.id, userId);
            const hoursVal =
              hoursMap[key] !== undefined ? hoursMap[key] : String(defaultHours(e));
            const amountVal =
              amounts[key] !== undefined ? amounts[key] : String(defaultAmount(e, userId));
            return (
              <div key={key} className="approval-card">
                <div className="approval-card-main">
                  <div className="approval-card-head">
                    <span className="req-date">{e.date.replace(/-/g, "/")}</span>
                    <span className="tag">{EVENT_TYPE_LABEL[e.type]}</span>
                    <span className="approval-member">{memberById[userId]?.name ?? "—"}</span>
                  </div>
                  <div className="approval-card-title">{e.title}</div>
                  <div className="approval-card-meta">
                    🕒 {e.start}–{e.end || "未定"} ／ 📍 {e.location || "未設定"}
                  </div>
                  <div className="approval-card-meta muted">
                    時給 {yen(memberById[userId]?.hourlyRate ?? 0)}/時
                  </div>
                  {e.note && <div className="approval-card-note">{e.note}</div>}
                </div>
                <div className="approval-card-form">
                  <label className="approval-amount-label">
                    稼働時間（h）
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={hoursVal}
                      onChange={(ev) => onHoursChange(e, userId, ev.target.value)}
                    />
                  </label>
                  <label className="approval-amount-label">
                    報酬額（円）
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={amountVal}
                      onChange={(ev) =>
                        setAmounts((m) => ({ ...m, [key]: ev.target.value }))
                      }
                    />
                  </label>
                  <label className="approval-amount-label">
                    交通費（円）
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={expenseMap[key] ?? ""}
                      placeholder="0"
                      onChange={(ev) =>
                        setExpenseMap((m) => ({ ...m, [key]: ev.target.value }))
                      }
                    />
                  </label>

                  <div className="approval-extra-col">
                    <span className="approval-extra-label">その他の項目</span>
                    {getItems(key).map((it, i) => (
                      <div key={i} className="approval-item-row">
                        <input
                          className="item-name"
                          placeholder="品目名（例: 消耗品費・材料費）"
                          value={it.name}
                          onChange={(ev) => updateItem(key, i, "name", ev.target.value)}
                        />
                        <input
                          className="item-amount"
                          type="number"
                          min={0}
                          step={100}
                          placeholder="金額"
                          value={it.amount}
                          onChange={(ev) => updateItem(key, i, "amount", ev.target.value)}
                        />
                        <button className="material-del" title="削除" onClick={() => removeItem(key, i)}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button className="ghost mini" onClick={() => addItem(key)}>
                      ＋ 項目を追加
                    </button>
                  </div>

                  <div className="approval-foot">
                    <span className="approval-total-line">
                      合計 <strong>{yen((Number(amountVal) || 0) + extraTotal(key))}</strong>
                    </span>
                    <div className="approval-btns">
                      <button
                        className="ghost mini"
                        onClick={() => {
                          if (confirm("この予定を報酬なし（対象外）にしますか？")) {
                            setEventReward(e.id, false);
                            setVersion((v) => v + 1);
                          }
                        }}
                      >
                        報酬なし
                      </button>
                      <button className="primary mini" onClick={() => send(e, userId)}>
                        承認依頼を送る
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* メンバーの承認待ち */}
      {requested.length > 0 && (
        <>
          <h3 className="req-section-title">メンバーの承認待ち（{requested.length}件）</h3>
          <table className="members-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>内容</th>
                <th>メンバー</th>
                <th>報酬</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {requested.map((a) => {
                const e = eventById[a.eventId];
                return (
                  <tr key={a.id}>
                    <td>{e ? e.date.replace(/-/g, "/") : "—"}</td>
                    <td>{e?.title ?? "—"}</td>
                    <td>{memberById[a.userId]?.name ?? "—"}</td>
                    <td className="amount">{yen(a.amount)}</td>
                    <td><span className="req-status pending">{EVENT_APPROVAL_STATUS_LABEL.requested}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* 承認済み（確定報酬） */}
      {approvedSummary.length > 0 && (
        <>
          <h3 className="req-section-title">承認済みの確定報酬</h3>
          <table className="members-table">
            <thead>
              <tr>
                <th>メンバー</th>
                <th>期間</th>
                <th>件数</th>
                <th>確定報酬</th>
              </tr>
            </thead>
            <tbody>
              {approvedSummary.map((s, i) => (
                <tr key={i}>
                  <td>{s.name}</td>
                  <td>{quarterLabel(s.quarter)}</td>
                  <td>{s.count}件</td>
                  <td className="amount"><strong>{yen(s.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
