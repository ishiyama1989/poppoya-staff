import { useState } from "react";
import { createOrg, joinOrgByCode, signOut } from "../lib/auth";

type Mode = "create" | "join";

// サインアップ後：会社を新規作成する or 招待コードで既存の会社に参加する
export default function CreateOrg({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<Mode>("create");
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    setBusy(true);
    let res;
    if (mode === "create") {
      if (!orgName.trim()) {
        setError("会社・チーム名を入力してください");
        setBusy(false);
        return;
      }
      res = await createOrg(orgName, name);
    } else {
      if (!code.trim()) {
        setError("招待コードを入力してください");
        setBusy(false);
        return;
      }
      res = await joinOrgByCode(code, name);
    }
    setBusy(false);
    if (res.ok) onCreated();
    else setError(res.error);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="logo"><span className="logo-dot" />ようこそ</span>
        <p className="muted">会社を新しく作るか、招待コードでチームに参加します。</p>

        <div className="auth-tabs">
          <button className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>
            会社を作る
          </button>
          <button className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }}>
            招待コードで参加
          </button>
        </div>

        {mode === "create" ? (
          <label>
            会社・チーム名
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="例: ○○運用代行"
            />
          </label>
        ) : (
          <label>
            招待コード
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="例: A1B2C3"
              autoCapitalize="characters"
            />
          </label>
        )}

        <label>
          あなたのお名前
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 石田 桃花"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary full" disabled={busy} onClick={submit}>
          {busy ? "処理中…" : mode === "create" ? "会社を作成して始める" : "参加する"}
        </button>
        <button className="ghost full" onClick={async () => { await signOut(); location.reload(); }}>
          ログアウト
        </button>
      </div>
    </div>
  );
}
