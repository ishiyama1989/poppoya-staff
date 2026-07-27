import { useMemo, useState } from "react";
import { SLOT_LABEL, type Availability } from "../types";
import { getAvailability, getMembers } from "../store";
import { WEEKDAYS, monthGrid, todayStr, ymd } from "../lib/date";

// オーナーが、メンバーの稼働日を検索する画面
// ・メンバーを選ぶと、その人の稼働日が一覧／カレンダーで分かる
// ・複数選ぶと「全員が空いている日（重なる日）」が分かる
export default function AvailabilitySearch() {
  const members = useMemo(() => getMembers(), []);
  const availability = useMemo(() => getAvailability(), []);

  const [selected, setSelected] = useState<string[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // 日付 → その日に空きを登録しているメンバーIDの集合
  const byDate = useMemo(() => {
    const map: Record<string, Map<string, Availability>> = {};
    for (const a of availability) {
      if (a.slots.length === 0 && !a.comment) continue;
      (map[a.date] ??= new Map()).set(a.userId, a);
    }
    return map;
  }, [availability]);

  // 選択メンバー「全員」が空いている日付（重なり）
  const matchDates = useMemo(() => {
    if (selected.length === 0) return [];
    return Object.keys(byDate)
      .filter((d) => selected.every((id) => byDate[d].has(id)))
      .sort();
  }, [byDate, selected]);

  const matchSet = useMemo(() => new Set(matchDates), [matchDates]);
  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }
  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div className="search-view">
      <div className="section-head">
        <h2>稼働日検索</h2>
        <p className="muted">
          メンバーを選ぶと稼働日が分かります。複数選ぶと「全員が空いている日」を検索できます。
        </p>
      </div>

      <div className="search-pickers">
        <span className="muted small">メンバーを選択：</span>
        <div className="search-chips">
          {members.map((m) => (
            <button
              key={m.id}
              className={`pick ${selected.includes(m.id) ? "on" : ""}`}
              onClick={() => toggle(m.id)}
            >
              {m.name}
            </button>
          ))}
          <button
            className="ghost mini"
            onClick={() => setSelected(members.map((m) => m.id))}
          >
            全員
          </button>
          <button className="ghost mini" onClick={() => setSelected([])}>
            クリア
          </button>
        </div>
      </div>

      {selected.length === 0 ? (
        <p className="muted">メンバーを選択してください。</p>
      ) : (
        <>
          {/* 一覧（全期間） */}
          <h3 className="req-section-title">該当する日（一覧）</h3>
          {matchDates.length === 0 ? (
            <p className="muted">
              {selected.length === 1
                ? "稼働日の登録がありません。"
                : "全員が重なって空いている日はありません。"}
            </p>
          ) : (
            <div className="match-list">
              {matchDates.map((d) => (
                <div key={d} className="match-row">
                  <span className="match-date">{d.replace(/-/g, "/")}</span>
                  <div className="match-members">
                    {selected.map((id) => {
                      const a = byDate[d].get(id);
                      const name = members.find((m) => m.id === id)?.name;
                      return (
                        <span key={id} className="match-member">
                          {name}：
                          {a?.slots.map((s) => SLOT_LABEL[s]).join("・") || "—"}
                          {a?.comment ? ` 💬${a.comment}` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* カレンダー（該当日をハイライト） */}
          <div className="cal-header">
            <button onClick={() => shiftMonth(-1)}>‹</button>
            <h2>
              {year}年 {month + 1}月
            </h2>
            <button onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`cal-wd ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}`}
              >
                {w}
              </div>
            ))}
            {grid.map((d) => {
              const ds = ymd(d);
              const inMonth = d.getMonth() === month;
              const hit = matchSet.has(ds);
              return (
                <div
                  key={ds}
                  className={`cal-cell ${inMonth ? "" : "dim"} ${
                    ds === todayStr() ? "today" : ""
                  } ${hit ? "hit" : ""}`}
                >
                  <div className="cal-date-row">
                    <span className="cal-date">{d.getDate()}</span>
                  </div>
                  {hit && <span className="cal-hit-mark">稼働</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
