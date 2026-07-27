import { useState } from "react";
import { signIn, signUp } from "../lib/auth";

type Mode = "login" | "signup";

// SaaS版の入口：メール＋パスワードでログイン / 新規登録
export default function Auth({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit() {
    setError("");
    setInfo("");
    if (!email.trim() || !password) {
      setError("メールとパスワードを入力してください");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await signUp(email, password);
      if (error) {
        setError(translate(error.message));
      } else if (data.session) {
        // メール確認オフの場合は即ログイン
        onLoggedIn();
      } else {
        // メール確認オンの場合
        setInfo(
          "確認メールを送信しました。メール内のリンクをタップして登録を完了し、ログインしてください。"
        );
        setMode("login");
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(translate(error.message));
      else onLoggedIn();
    }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="logo"><span className="logo-dot" />SNS Schedule</span>
        <p className="muted">運用代行チームの予定・報酬・案件をひとつに。</p>

        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode("login"); setError(""); setInfo(""); }}
          >
            ログイン
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => { setMode("signup"); setError(""); setInfo(""); }}
          >
            新規登録
          </button>
        </div>

        <label>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
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
        {info && <p className="muted" style={{ color: "var(--success)" }}>{info}</p>}

        <button className="primary full" disabled={busy} onClick={submit}>
          {busy ? "処理中…" : mode === "signup" ? "登録する" : "ログイン"}
        </button>

        {mode === "signup" && (
          <p className="muted small">
            登録すると、次の画面で会社（組織）を作成します。
          </p>
        )}
      </div>
    </div>
  );
}

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "メールまたはパスワードが違います";
  if (/already registered|already been registered/i.test(msg)) return "このメールは既に登録されています";
  if (/Email not confirmed/i.test(msg)) return "メール確認が未完了です。確認メールのリンクを開いてください";
  if (/rate limit|too many/i.test(msg)) return "回数制限です。少し待って再度お試しください";
  return msg;
}
