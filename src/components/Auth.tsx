import { useState } from "react";
import { signIn, signUp } from "../lib/auth";

type Mode = "login" | "signup";

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

// 宿ぽっぽや専用ツールの入口：ログインID（半角英数）＋パスワードでログイン/新規登録
export default function Auth({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!loginId.trim() || !password) {
      setError("ログインIDとパスワードを入力してください");
      return;
    }
    if (mode === "signup" && !LOGIN_ID_PATTERN.test(loginId.trim())) {
      setError("ログインIDは半角英数字3〜20文字で入力してください");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { error } = await signUp(loginId, password);
      if (error) setError(translate(error.message));
      else onLoggedIn();
    } else {
      const { error } = await signIn(loginId, password);
      if (error) setError(translate(error.message));
      else onLoggedIn();
    }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="logo"><span className="logo-dot" />宿ぽっぽや</span>
        <p className="muted">スタッフ管理ツール</p>

        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode("login"); setError(""); }}
          >
            ログイン
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => { setMode("signup"); setError(""); }}
          >
            新規登録
          </button>
        </div>

        <label>
          ログインID（半角英数字）
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="例: yamada"
            autoComplete="username"
          />
        </label>
        <label>
          パスワード{mode === "signup" ? "（6文字以上）" : ""}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary full" disabled={busy} onClick={submit}>
          {busy ? "処理中…" : mode === "signup" ? "登録する" : "ログイン"}
        </button>

        {mode === "signup" && (
          <p className="muted small">
            登録すると、次の画面でお名前を入力します。
          </p>
        )}
      </div>
    </div>
  );
}

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "ログインIDまたはパスワードが違います";
  if (/already registered|already been registered/i.test(msg)) return "このログインIDは既に使われています";
  if (/rate limit|too many/i.test(msg)) return "回数制限です。少し待って再度お試しください";
  return msg;
}
