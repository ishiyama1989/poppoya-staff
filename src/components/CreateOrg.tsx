import { useEffect, useState } from "react";
import { getOrgThemeBeforeJoin, joinOrCreateOrg, signOut } from "../lib/auth";
import { applyTheme } from "../lib/theme";

// サインアップ後：お名前を入力するだけで参加完了（1社専用のため会社作成・招待コードは不要）
export default function CreateOrg({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 設定で選ばれている配色テーマをこの画面にも反映する
  useEffect(() => {
    getOrgThemeBeforeJoin().then(applyTheme);
  }, []);

  async function submit() {
    setError("");
    if (!name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    setBusy(true);
    const res = await joinOrCreateOrg(name);
    setBusy(false);
    if (res.ok) onCreated();
    else setError(res.error);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="logo"><span className="logo-dot" />ようこそ</span>
        <p className="muted">お名前を入力して始めましょう。</p>

        <label>
          あなたのお名前
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary full" disabled={busy} onClick={submit}>
          {busy ? "処理中…" : "始める"}
        </button>
        <button className="ghost full" onClick={async () => { await signOut(); location.reload(); }}>
          ログアウト
        </button>
      </div>
    </div>
  );
}
