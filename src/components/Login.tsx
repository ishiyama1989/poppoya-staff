import { useState } from "react";
import { login, registerUser } from "../store";
import type { User } from "../types";

export default function Login({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // 新規登録時の任意プロフィール
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // 数字のみ・4桁まで
  function onPasswordChange(v: string) {
    setPassword(v.replace(/\D/g, "").slice(0, 4));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("名前を入力してください");
    if (!/^\d{4}$/.test(password)) return setError("パスワードは4桁の数字で入力してください");

    if (mode === "register") {
      const res = registerUser({
        name: name.trim(),
        password,
        postalCode,
        address,
        phone,
        email,
      });
      if (!res.ok) return setError(res.error);
      login(name.trim(), password);
      return onAuth(res.user);
    }
    const res = login(name.trim(), password);
    if (!res.ok) return setError(res.error);
    onAuth(res.user);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <p className="brand"><span className="brand-mark" />SNS Schedule</p>
        <h1 className="brand-title">チームスケジュール</h1>
        <p className="muted">運用代行チームの予定・稼働状況・支払いをひとつに</p>

        <div className="tab-switch">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            ログイン
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            名前
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
          </label>
          <label>
            パスワード（4桁の数字）
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••"
            />
          </label>

          {mode === "register" && (
            <details className="reg-extra">
              <summary>プロフィール（任意・領収書に使用）</summary>
              <label>
                郵便番号
                <input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="123-4567"
                />
              </label>
              <label>
                住所
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="東京都渋谷区○○ 1-2-3"
                />
              </label>
              <label>
                電話番号
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="090-1234-5678"
                />
              </label>
              <label>
                メールアドレス
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            </details>
          )}

          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary full">
            {mode === "login" ? "ログイン" : "登録してはじめる"}
          </button>
        </form>

      </div>
    </div>
  );
}
