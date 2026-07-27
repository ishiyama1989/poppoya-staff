import { useMemo, useState } from "react";
import {
  SLOT_LABEL,
  SLOT_ORDER,
  type AvailSlot,
  type CommentTemplate,
  type User,
} from "../types";
import {
  addCommentTemplate,
  deleteCommentTemplate,
  getAvailability,
  getAvailabilityFor,
  getCommentTemplates,
  setAvailability,
} from "../store";
import { WEEKDAYS, monthGrid, todayStr, ymd } from "../lib/date";

// メンバーが稼働日設定を登録する画面
export default function AvailabilityView({ me }: { me: User }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editDate, setEditDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  // 自分の登録を日付ごとに引けるようにする
  const byDate = useMemo(() => {
    const map: Record<string, { slots: AvailSlot[]; comment: string }> = {};
    for (const a of getAvailability())
      if (a.userId === me.id) map[a.date] = { slots: a.slots, comment: a.comment };
    return map;
  }, [version, me.id]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div className="avail-view">
      <div className="section-head">
        <h2>稼働日設定</h2>
        <p className="muted">
          日付をクリックして、空いている時間帯（1日・午前・午後・夕方・夜）とコメントを登録します。
        </p>
      </div>

      <div className="cal-header">
        <button onClick={() => shiftMonth(-1)}>‹</button>
        <h2>
          {year}年 {month + 1}月
        </h2>
        <button onClick={() => shiftMonth(1)}>›</button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-wd ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}`}>
            {w}
          </div>
        ))}
        {grid.map((d) => {
          const ds = ymd(d);
          const inMonth = d.getMonth() === month;
          const rec = byDate[ds];
          const on = !!rec && (rec.slots.length > 0 || !!rec.comment);
          return (
            <button
              key={ds}
              className={`avail-cell ${inMonth ? "" : "dim"} ${on ? "on" : ""} ${
                ds === todayStr() ? "today" : ""
              }`}
              onClick={() => setEditDate(ds)}
            >
              <span className="avail-day">{d.getDate()}</span>
              {on && (
                <span className="avail-tags">
                  {rec.slots.map((s) => SLOT_LABEL[s]).join("・")}
                  {rec.comment && " 💬"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {editDate && (
        <SlotEditor
          date={editDate}
          userId={me.id}
          initial={getAvailabilityFor(me.id, editDate)}
          onClose={() => setEditDate(null)}
          onSave={(slots, comment) => {
            setAvailability(me.id, editDate, slots, comment);
            setEditDate(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function SlotEditor({
  date,
  userId,
  initial,
  onClose,
  onSave,
}: {
  date: string;
  userId: string;
  initial: { slots: AvailSlot[]; comment: string } | null;
  onClose: () => void;
  onSave: (slots: AvailSlot[], comment: string) => void;
}) {
  const [slots, setSlots] = useState<AvailSlot[]>(initial?.slots ?? []);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [templates, setTemplates] = useState<CommentTemplate[]>(() =>
    getCommentTemplates(userId)
  );
  const [newTemplate, setNewTemplate] = useState("");

  function toggle(slot: AvailSlot) {
    setSlots((cur) => {
      if (slot === "allday") {
        // 「1日」を選んだら他は解除。もう一度押すと全解除
        return cur.includes("allday") ? [] : ["allday"];
      }
      // 時間帯を選んだら「1日」は解除
      const base = cur.filter((s) => s !== "allday");
      return base.includes(slot) ? base.filter((s) => s !== slot) : [...base, slot];
    });
  }

  // 定型文をクリックでメモへ挿入（既に文字があれば改行して追記）
  function insertTemplate(text: string) {
    setComment((cur) => (cur.trim() ? `${cur.trim()}\n${text}` : text));
  }

  function saveTemplate() {
    const text = newTemplate.trim();
    if (!text) return;
    addCommentTemplate(userId, text);
    setTemplates(getCommentTemplates(userId));
    setNewTemplate("");
  }

  function removeTemplate(id: string) {
    deleteCommentTemplate(id);
    setTemplates(getCommentTemplates(userId));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal slot-editor" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>{date.replace(/-/g, "/")} の空き状況</h3>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <label>空いている時間帯（複数選択可）</label>
        <div className="slot-picker">
          {SLOT_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={`slot-btn ${slots.includes(s) ? "on" : ""} ${
                s === "allday" ? "allday" : ""
              }`}
              onClick={() => toggle(s)}
            >
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>

        <label style={{ marginTop: 16 }}>
          コメント
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="例: 17時以降なら撮影OK / オンラインのみ可 など"
          />
        </label>

        <div className="tpl-box">
          <div className="tpl-head">定型文（クリックでメモに追加）</div>
          <div className="tpl-chips">
            {templates.length === 0 ? (
              <span className="muted small">まだ定型文がありません。下で作成できます。</span>
            ) : (
              templates.map((t) => (
                <span key={t.id} className="tpl-chip">
                  <button
                    type="button"
                    className="tpl-insert"
                    onClick={() => insertTemplate(t.text)}
                    title="メモに追加"
                  >
                    {t.text}
                  </button>
                  <button
                    type="button"
                    className="tpl-del"
                    onClick={() => removeTemplate(t.id)}
                    title="この定型文を削除"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="tpl-add">
            <input
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTemplate();
                }
              }}
              placeholder="新しい定型文を入力"
            />
            <button type="button" className="ghost" onClick={saveTemplate}>
              ＋追加
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button
            className="ghost danger"
            onClick={() => onSave([], "")}
          >
            この日をクリア
          </button>
          <button className="primary" onClick={() => onSave(slots, comment)}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
