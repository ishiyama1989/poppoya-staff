import { useEffect, useState } from "react";
import type {
  NotificationRecipientMode,
  NotificationSchedule,
  ShiftTemplate,
  ShiftTiming,
  StampFont,
  StampOrientation,
  StampShape,
  User,
} from "../types";
import {
  NOTIFICATION_DAY_OPTIONS,
  NOTIFICATION_HOUR_OPTIONS,
  NOTIFICATION_MINUTE_OPTIONS,
  NOTIFICATION_RECIPIENT_MODE_LABEL,
  SHIFT_TIMINGS,
  SHIFT_TIMING_LABEL,
} from "../types";
import {
  changePassword,
  deleteNotificationSchedule,
  deleteShiftTemplate,
  getMembers,
  getNotificationSchedules,
  getShiftTemplates,
  newNotificationSchedule,
  newShiftTemplate,
  seedDefaultShiftTemplates,
  updateUserProfile,
  upsertNotificationSchedule,
  upsertShiftTemplate,
} from "../store";
import { STAMP_FONTS, stampSvg } from "../lib/stamp";
import { disablePush, enablePush, isPushEnabled, pushSupported } from "../lib/push";
import { updateOrgTheme } from "../lib/auth";
import { applyTheme, THEME_OPTIONS } from "../lib/theme";

// メンバーが自分のプロフィール（住所等）とデジタル印影を設定する画面
export default function ProfileSettings({
  me,
  orgId,
  orgTheme,
  onUpdated,
}: {
  me: User;
  orgId: string;
  orgTheme: string;
  onUpdated: (u: User) => void;
}) {
  const [theme, setTheme] = useState(orgTheme);
  const [themeBusy, setThemeBusy] = useState(false);

  async function pickTheme(id: string) {
    if (id === theme || themeBusy) return;
    setThemeBusy(true);
    applyTheme(id); // 先に見た目を切り替え、保存は裏で行う
    setTheme(id);
    const res = await updateOrgTheme(orgId, id);
    if (!res.ok) {
      applyTheme(orgTheme);
      setTheme(orgTheme);
      alert("テーマの保存に失敗しました: " + res.error);
    }
    setThemeBusy(false);
  }
  const [receiptName, setReceiptName] = useState(me.receiptName ?? "");
  const [postalCode, setPostalCode] = useState(me.postalCode ?? "");
  const [address, setAddress] = useState(me.address ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [email, setEmail] = useState(me.email ?? "");

  const [stampOn, setStampOn] = useState(!!me.stamp);
  const [stampText, setStampText] = useState(
    me.stamp?.text ?? me.name.split(/\s+/)[0] // 既定は苗字
  );
  const [stampShape, setStampShape] = useState<StampShape>(
    me.stamp?.shape ?? "circle"
  );
  const [stampOrientation, setStampOrientation] = useState<StampOrientation>(
    me.stamp?.orientation ?? "vertical"
  );
  const [stampFont, setStampFont] = useState<StampFont>(
    me.stamp?.font ?? "mincho"
  );
  const [saved, setSaved] = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwNext2, setPwNext2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    isPushEnabled().then(setPushOn);
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    if (pushOn) {
      await disablePush();
      setPushOn(false);
      setPushMsg("通知をオフにしました");
    } else {
      const r = await enablePush(me.id);
      if (r.ok) {
        setPushOn(true);
        setPushMsg("この端末で通知を受け取れるようになりました");
      } else {
        setPushMsg(r.error);
      }
    }
    setPushBusy(false);
  }

  async function savePw() {
    if (pwNext !== pwNext2) {
      setPwMsg({ ok: false, text: "新しいパスワードが一致しません" });
      return;
    }
    const result = await changePassword(me.id, pwCurrent, pwNext);
    if (result.ok) {
      setPwMsg({ ok: true, text: "パスワードを変更しました" });
      setPwCurrent(""); setPwNext(""); setPwNext2("");
    } else {
      setPwMsg({ ok: false, text: result.error });
    }
  }

  function save() {
    const updated = updateUserProfile(me.id, {
      receiptName,
      postalCode,
      address,
      phone,
      email,
      stamp:
        stampOn && stampText.trim()
          ? {
              text: stampText.trim(),
              shape: stampShape,
              orientation: stampOrientation,
              font: stampFont,
            }
          : undefined,
    });
    if (updated) {
      onUpdated(updated);
      setSaved(true);
    }
  }

  return (
    <div className="settings-view">
      <div className="section-head">
        <h2>ユーザー設定</h2>
        <p className="muted">
          ここで登録した情報は、領収書の発行時に自動で反映されます。
        </p>
      </div>

      {me.role === "owner" && (
        <div className="settings-card">
          <h3>デザインテーマ</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            画面の配色を選べます。全メンバーの画面に反映されます。
          </p>
          <div className="theme-picker">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch-btn ${theme === t.id ? "on" : ""}`}
                disabled={themeBusy}
                onClick={() => pickTheme(t.id)}
              >
                <span className="theme-swatch" style={{ background: t.swatch }} />
                {t.label}
                {theme === t.id && <span className="theme-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {me.role === "owner" && <ShiftTemplateSettings />}
      {me.role === "owner" && <NotificationScheduleSettings />}

      <div className="settings-card">
        <h3>プッシュ通知</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          予定や依頼が登録されたとき、この端末に通知が届きます。
        </p>
        {pushSupported() ? (
          <>
            <label className="check-line">
              <input
                type="checkbox"
                checked={pushOn}
                disabled={pushBusy}
                onChange={togglePush}
              />
              この端末で通知を受け取る
            </label>
            {pushMsg && (
              <p className="muted small" style={{ color: pushOn ? "var(--success)" : undefined }}>
                {pushMsg}
              </p>
            )}
            <p className="muted small">
              ※ iPhoneはホーム画面に追加したアプリから開いた場合のみ通知が使えます
            </p>
          </>
        ) : (
          <p className="muted small">
            この端末・ブラウザは通知に対応していません。iPhoneの場合はホーム画面に追加してから開いてください。
          </p>
        )}
      </div>

      {me.role !== "owner" && (
        <div className="settings-card">
          <h3>プロフィール（領収書の発行者欄に表示）</h3>
          <label>
            発行者の名前
            <input
              value={receiptName}
              onChange={(e) => {
                setReceiptName(e.target.value);
                setSaved(false);
              }}
              placeholder={`未設定なら表示名「${me.name}」が使われます`}
            />
          </label>
          <label>
            郵便番号
            <input
              value={postalCode}
              onChange={(e) => {
                setPostalCode(e.target.value);
                setSaved(false);
              }}
              placeholder="123-4567"
            />
          </label>
          <label>
            住所
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setSaved(false);
              }}
              placeholder="東京都渋谷区○○ 1-2-3"
            />
          </label>
          <div className="row">
            <label>
              電話番号
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSaved(false);
                }}
                placeholder="090-1234-5678"
              />
            </label>
            <label>
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSaved(false);
                }}
                placeholder="you@example.com"
              />
            </label>
          </div>
        </div>
      )}

      {me.role !== "owner" && (
        <div className="settings-card">
          <h3>デジタル印影</h3>
          <label className="check-line">
            <input
              type="checkbox"
              checked={stampOn}
              onChange={(e) => {
                setStampOn(e.target.checked);
                setSaved(false);
              }}
            />
            領収書に印影を使用する
          </label>

          {stampOn && (
            <div className="stamp-editor">
              <div className="stamp-fields">
                <label>
                  印影の文字（苗字や名前）
                  <input
                    value={stampText}
                    onChange={(e) => {
                      setStampText(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="例: 山田"
                    maxLength={9}
                  />
                </label>
                <div className="row">
                  <label>
                    向き
                    <div className="shape-toggle">
                      {(["vertical", "horizontal"] as StampOrientation[]).map((o) => (
                        <button
                          key={o}
                          type="button"
                          className={`type-btn ${stampOrientation === o ? "on" : ""}`}
                          onClick={() => {
                            setStampOrientation(o);
                            setSaved(false);
                          }}
                        >
                          {o === "vertical" ? "縦書き" : "横書き"}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label>
                    形
                    <div className="shape-toggle">
                      {(["circle", "square"] as StampShape[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`type-btn ${stampShape === s ? "on" : ""}`}
                          onClick={() => {
                            setStampShape(s);
                            setSaved(false);
                          }}
                        >
                          {s === "circle" ? "丸" : "角"}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
                <label>
                  フォント
                  <div className="font-toggle">
                    {(Object.keys(STAMP_FONTS) as StampFont[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`type-btn ${stampFont === f ? "on" : ""}`}
                        style={{ fontFamily: STAMP_FONTS[f].family }}
                        onClick={() => {
                          setStampFont(f);
                          setSaved(false);
                        }}
                      >
                        {STAMP_FONTS[f].label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
              <div className="stamp-preview">
                <span className="muted small">プレビュー</span>
                <div
                  className="stamp-svg"
                  dangerouslySetInnerHTML={{
                    __html: stampSvg(
                      stampText || "印",
                      stampShape,
                      stampOrientation,
                      stampFont,
                      88
                    ),
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="settings-card">
        <h3>パスワード変更</h3>
        <label>
          新しいパスワード（4桁の数字）
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={pwNext}
            onChange={(e) => { setPwNext(e.target.value.replace(/\D/g, "").slice(0, 4)); setPwMsg(null); }}
          />
        </label>
        <label>
          新しいパスワード（確認）
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={pwNext2}
            onChange={(e) => { setPwNext2(e.target.value.replace(/\D/g, "").slice(0, 4)); setPwMsg(null); }}
          />
        </label>
        {pwMsg && (
          <p className={pwMsg.ok ? "muted" : "error"} style={pwMsg.ok ? { color: "var(--success)" } : {}}>
            {pwMsg.text}
          </p>
        )}
        <div className="settings-actions">
          <button className="primary" onClick={savePw}>パスワードを変更</button>
        </div>
      </div>

      <div className="settings-actions">
        <button className="primary" onClick={save}>
          {saved ? "保存しました ✓" : "設定を保存"}
        </button>
      </div>
    </div>
  );
}

// 管理者がシフトのコマ（勤務パターン）を追加・編集する設定。
// ここで定義したコマが、予約日からシフト依頼を送るときの選択肢になる。
function ShiftTemplateSettings() {
  const [templates, setTemplates] = useState<ShiftTemplate[]>(() => getShiftTemplates());
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);

  function refresh() {
    setTemplates(getShiftTemplates());
  }

  return (
    <div className="settings-card">
      <h3>シフトのコマ</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        予約日からシフト依頼を送るときの選択肢です。「いつ」を設定しておくと、連泊でも
        実際に働く日を自動で割り出します。
      </p>

      {templates.length === 0 ? (
        <>
          <p className="muted small">まだコマがありません。</p>
          <button
            className="primary mini"
            onClick={() => {
              seedDefaultShiftTemplates();
              refresh();
            }}
          >
            標準の4コマを作成する
          </button>
        </>
      ) : (
        <div className="slot-list">
          {templates.map((t) => (
            <div key={t.id} className="slot-row">
              <div className="reservation-head">
                <span className="avail-chip">{t.name || "（名前未設定）"}</span>
                {t.timings.map((ti) => (
                  <span key={ti} className="tag">
                    {SHIFT_TIMING_LABEL[ti]}
                  </span>
                ))}
              </div>
              <div className="reservation-meta">
                {t.startTime}〜{t.endTime}
              </div>
              <div className="event-actions">
                <button className="ghost" onClick={() => setEditing(t)}>
                  編集
                </button>
                <button
                  className="ghost danger"
                  onClick={() => {
                    if (confirm(`コマ「${t.name}」を削除しますか？`)) {
                      deleteShiftTemplate(t.id);
                      refresh();
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!editing && templates.length > 0 && (
        <button className="ghost mini" onClick={() => setEditing(newShiftTemplate())}>
          ＋ コマを追加
        </button>
      )}

      {editing && (
        <ShiftTemplateEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={(t) => {
            upsertShiftTemplate(t);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShiftTemplateEditor({
  value,
  onCancel,
  onSave,
}: {
  value: ShiftTemplate;
  onCancel: () => void;
  onSave: (t: ShiftTemplate) => void;
}) {
  const [draft, setDraft] = useState<ShiftTemplate>(value);

  function set<K extends keyof ShiftTemplate>(key: K, val: ShiftTemplate[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function toggleTiming(timing: ShiftTiming) {
    setDraft((d) => ({
      ...d,
      timings: d.timings.includes(timing)
        ? d.timings.filter((t) => t !== timing)
        : [...d.timings, timing],
    }));
  }

  function handleSave() {
    if (!draft.name.trim()) return alert("業務名を入力してください");
    if (draft.timings.length === 0) return alert("いつの業務か、1つ以上選んでください");
    if (draft.endTime <= draft.startTime)
      return alert("終了時間は開始時間より後にしてください");
    onSave({ ...draft, name: draft.name.trim() });
  }

  return (
    <div className="event-form">
      <label>
        業務名
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例: 朝食対応"
        />
      </label>
      <label>いつの業務か（複数選択可）</label>
      <div className="slot-picker">
        {SHIFT_TIMINGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`slot-btn ${draft.timings.includes(t) ? "on" : ""}`}
            onClick={() => toggleTiming(t)}
          >
            {SHIFT_TIMING_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="row">
        <label>
          開始
          <input
            type="time"
            value={draft.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </label>
        <label>
          終了
          <input
            type="time"
            value={draft.endTime}
            onChange={(e) => set("endTime", e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button className="primary" onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}

// オーナーが「毎月◯日◯時に、指定したメンバーへリマインド通知を送る」設定を管理する画面。
// 実際の送信はEdge Function（send-scheduled-notifications）がpg_cronから定期的に呼ばれて行う。
function NotificationScheduleSettings() {
  const [schedules, setSchedules] = useState<NotificationSchedule[]>(() =>
    getNotificationSchedules()
  );
  const [editing, setEditing] = useState<NotificationSchedule | null>(null);
  const members = getMembers();

  function refresh() {
    setSchedules(getNotificationSchedules());
  }

  function recipientLabel(s: NotificationSchedule): string {
    if (s.recipientMode === "all") return "すべて";
    if (s.recipientIds.length === 0) return "（未選択）";
    return (
      s.recipientIds
        .map((id) => members.find((m) => m.id === id)?.name)
        .filter(Boolean)
        .join("・") || "（未選択）"
    );
  }

  return (
    <div className="settings-card">
      <h3>通知スケジュール</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        「毎月25日 9:00にバイト全員へ、稼働可能日の入力をお願いする通知を送る」といった、
        定期的なリマインド通知を設定できます。
      </p>

      {schedules.length === 0 ? (
        <p className="muted small">まだ通知スケジュールがありません。</p>
      ) : (
        <div className="slot-list">
          {schedules.map((s) => (
            <div key={s.id} className="slot-row">
              <div className="reservation-head">
                <span className="avail-chip">{s.name || "（名前未設定）"}</span>
                <span className={`tag ${s.enabled ? "" : "muted"}`}>
                  {s.enabled ? "有効" : "無効"}
                </span>
              </div>
              <div className="reservation-meta">
                毎月{s.dayOfMonth}日 {String(s.hour).padStart(2, "0")}:
                {String(s.minute).padStart(2, "0")} ／ 送信先: {recipientLabel(s)}
              </div>
              <div className="event-note">{s.message}</div>
              <div className="event-actions">
                <button className="ghost" onClick={() => setEditing(s)}>
                  編集
                </button>
                <button
                  className="ghost danger"
                  onClick={() => {
                    if (confirm(`通知「${s.name}」を削除しますか？`)) {
                      deleteNotificationSchedule(s.id);
                      refresh();
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!editing && (
        <button className="ghost mini" onClick={() => setEditing(newNotificationSchedule())}>
          ＋ 通知を追加
        </button>
      )}

      {editing && (
        <NotificationScheduleEditor
          value={editing}
          members={members}
          onCancel={() => setEditing(null)}
          onSave={(s) => {
            upsertNotificationSchedule(s);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NotificationScheduleEditor({
  value,
  members,
  onCancel,
  onSave,
}: {
  value: NotificationSchedule;
  members: User[];
  onCancel: () => void;
  onSave: (s: NotificationSchedule) => void;
}) {
  const [draft, setDraft] = useState<NotificationSchedule>(value);

  function set<K extends keyof NotificationSchedule>(key: K, val: NotificationSchedule[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function toggleRecipient(id: string) {
    setDraft((d) => ({
      ...d,
      recipientIds: d.recipientIds.includes(id)
        ? d.recipientIds.filter((x) => x !== id)
        : [...d.recipientIds, id],
    }));
  }

  function handleSave() {
    if (!draft.name.trim()) return alert("通知の種類の名前を入力してください");
    if (!draft.message.trim()) return alert("通知メッセージを入力してください");
    if (draft.recipientMode === "selected" && draft.recipientIds.length === 0)
      return alert("送信先を1人以上選択してください");
    onSave({ ...draft, name: draft.name.trim(), message: draft.message.trim() });
  }

  return (
    <div className="event-form">
      <label>
        通知の種類の名前
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例: 稼働可能日の入力リマインド"
        />
      </label>

      <label>
        通知メッセージ
        <textarea
          rows={3}
          value={draft.message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="例: 来月の稼働可能日の入力をお願いします。"
        />
      </label>

      <label>送信先</label>
      <div className="slot-picker">
        {(["all", "selected"] as NotificationRecipientMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`slot-btn ${draft.recipientMode === mode ? "on" : ""}`}
            onClick={() => set("recipientMode", mode)}
          >
            {NOTIFICATION_RECIPIENT_MODE_LABEL[mode]}
          </button>
        ))}
      </div>

      {draft.recipientMode === "selected" && (
        <div className="search-chips" style={{ marginTop: 8 }}>
          {members.length === 0 ? (
            <span className="muted small">メンバーが登録されていません。</span>
          ) : (
            members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pick ${draft.recipientIds.includes(m.id) ? "on" : ""}`}
                onClick={() => toggleRecipient(m.id)}
              >
                {m.name}
              </button>
            ))
          )}
        </div>
      )}

      <div className="row">
        <label>
          毎月
          <select
            value={draft.dayOfMonth}
            onChange={(e) => set("dayOfMonth", Number(e.target.value))}
          >
            {NOTIFICATION_DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}日
              </option>
            ))}
          </select>
        </label>
        <label>
          時
          <select value={draft.hour} onChange={(e) => set("hour", Number(e.target.value))}>
            {NOTIFICATION_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}時
              </option>
            ))}
          </select>
        </label>
        <label>
          分
          <select value={draft.minute} onChange={(e) => set("minute", Number(e.target.value))}>
            {NOTIFICATION_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}分
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        <span>この通知を有効にする</span>
      </label>

      <div className="form-actions">
        <button className="ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button className="primary" onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  );
}
