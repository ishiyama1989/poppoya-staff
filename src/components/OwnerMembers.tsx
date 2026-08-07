import { useState } from "react";
import { getMembers, updateUser } from "../store";
import type { User } from "../types";

// オーナーがメンバーを編集する画面
export default function OwnerMembers() {
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<User | null>(null);
  const members = getMembers();
  void version;

  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="members-view">
      <div className="section-head">
        <h2>メンバー管理</h2>
        <p className="muted">
          新しいスタッフは、ログイン画面の「新規登録」でログインIDとパスワードを作れば自動的に参加します。
        </p>
      </div>

      <h3 className="req-section-title">メンバー（{members.length}名）</h3>
      {members.length === 0 ? (
        <p className="muted">
          まだメンバーがいません。新規登録の方法を伝えて参加してもらいましょう。
        </p>
      ) : (
        <table className="members-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>時給</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>¥{m.hourlyRate.toLocaleString("ja-JP")}</td>
                <td>
                  <button className="ghost" onClick={() => setEditing(m)}>
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <UserEditor
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function UserEditor({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [rate, setRate] = useState(String(user.hourlyRate));
  const [error, setError] = useState("");

  function save() {
    const res = updateUser(user.id, {
      name,
      hourlyRate: Number(rate) || 0,
    });
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>メンバー情報の編集</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <label>
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          時給（円）
          <input
            type="number"
            min={0}
            step={50}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="ghost" onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
