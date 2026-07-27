import { useEffect, useState } from "react";
import type {
  StampFont,
  StampOrientation,
  StampShape,
  User,
} from "../types";
import { changePassword, updateUserProfile } from "../store";
import { STAMP_FONTS, stampSvg } from "../lib/stamp";
import { disablePush, enablePush, isPushEnabled, pushSupported } from "../lib/push";

// メンバーが自分のプロフィール（住所等）とデジタル印影を設定する画面
export default function ProfileSettings({
  me,
  onUpdated,
}: {
  me: User;
  onUpdated: (u: User) => void;
}) {
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
          新しいパスワード（6文字以上）
          <input
            type="password"
            placeholder="新しいパスワード"
            value={pwNext}
            onChange={(e) => { setPwNext(e.target.value); setPwMsg(null); }}
          />
        </label>
        <label>
          新しいパスワード（確認）
          <input
            type="password"
            placeholder="もう一度入力"
            value={pwNext2}
            onChange={(e) => { setPwNext2(e.target.value); setPwMsg(null); }}
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
