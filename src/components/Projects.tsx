import { useMemo, useRef, useState } from "react";
import {
  DELIVERABLE_MEDIA_LABEL,
  PROJECT_STATUS_LABEL,
  type DeliverableMediaType,
  type Project,
  type ProjectStatus,
  type User,
} from "../types";
import {
  addMaterial,
  addProject,
  deleteMaterial,
  deleteProject,
  getMaterialsFor,
  getMembers,
  getProjects,
  updateMaterial,
  updateProject,
} from "../store";
import { uploadMaterialFile } from "../lib/supabase";
import { sendPushToUsers } from "../lib/push";
import { yen } from "../lib/date";

const STATUS_ORDER: ProjectStatus[] = ["active", "paused", "done"];

export default function Projects({ me }: { me: User }) {
  const [version, setVersion] = useState(0);
  const projects = useMemo(() => getProjects(), [version]);
  const members = useMemo(() => getMembers(), [version]);

  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const sa = STATUS_ORDER.indexOf(a.status);
        const sb = STATUS_ORDER.indexOf(b.status);
        if (sa !== sb) return sa - sb;
        return a.createdAt < b.createdAt ? 1 : -1;
      }),
    [projects]
  );

  const open = openId ? projects.find((p) => p.id === openId) ?? null : null;

  function refresh() {
    setVersion((v) => v + 1);
  }

  return (
    <div className="projects-view">
      <div className="section-head">
        <h2>案件一覧</h2>
        <p className="muted">
          請負中の案件と資料をチームで共有します。資料はリンクでもファイルでも追加できます。
        </p>
      </div>

      <div className="tasks-toolbar">
        <span className="muted small">{projects.length}件の案件</span>
        <button className="primary" onClick={() => setShowForm(true)}>
          ＋ 新規案件追加
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>
          まだ案件がありません。「新規案件追加」から登録してください。
        </p>
      ) : (
        <div className="project-cards">
          {sorted.map((p) => {
            const mats = getMaterialsFor(p.id);
            return (
              <button
                key={p.id}
                className="project-card"
                onClick={() => setOpenId(p.id)}
              >
                <div className="project-card-head">
                  <span className={`project-status ${p.status}`}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </span>
                  <span className="project-mat-count">📎 {mats.length}</span>
                </div>
                <div className="project-card-name">{p.name}</div>
                {p.description && (
                  <p className="project-card-desc">{p.description}</p>
                )}
                <div className="project-card-foot">
                  {p.assigneeIds
                    .map((id) => members.find((m) => m.id === id)?.name)
                    .filter(Boolean)
                    .map((n) => (
                      <span key={n} className="project-assignee">{n}</span>
                    ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <ProjectForm
          members={members}
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            setShowForm(false);
            refresh();
            setOpenId(id);
          }}
        />
      )}

      {open && (
        <ProjectDetail
          me={me}
          project={open}
          members={members}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onDeleted={() => {
            setOpenId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProjectForm({
  members,
  onClose,
  onSaved,
}: {
  members: User[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setAssigneeIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function save() {
    if (!name.trim()) {
      setError("案件名を入力してください");
      return;
    }
    const p = addProject({
      name: name.trim(),
      status,
      description: description.trim(),
      assigneeIds,
      startDate,
    });
    onSaved(p.id);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>新規案件を追加</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <label>
          案件名・クライアント名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: ラクサ SNS運用"
          />
        </label>
        <div className="task-form-row">
          <label>
            ステータス
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>
            開始日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <label>
          概要
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="案件の内容・進め方など"
          />
        </label>
        <label>担当メンバー</label>
        <div className="assignee-pick">
          {members.length === 0 ? (
            <span className="muted small">メンバーがいません</span>
          ) : (
            members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`type-btn ${assigneeIds.includes(m.id) ? "on" : ""}`}
                onClick={() => toggle(m.id)}
              >
                {m.name}
              </button>
            ))
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="ghost" onClick={onClose}>キャンセル</button>
          <button className="primary" onClick={save}>案件を追加</button>
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({
  me,
  project,
  members,
  onClose,
  onChanged,
  onDeleted,
}: {
  me: User;
  project: Project;
  members: User[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<null | "material" | "deliverable">(null);
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [description, setDescription] = useState(project.description);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(project.assigneeIds);

  const today = new Date().toISOString().slice(0, 10);
  const [matTitle, setMatTitle] = useState("");
  const [matUrl, setMatUrl] = useState("");
  const [matNote, setMatNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(0);

  const isOwner = me.role === "owner";

  // 納品物の追加フォーム（リンク/ファイルなし）
  const [delTitle, setDelTitle] = useState("");
  const [delMedia, setDelMedia] = useState<DeliverableMediaType>("video");
  const [delAssignee, setDelAssignee] = useState(members[0]?.id ?? "");
  const [delDate, setDelDate] = useState(today);
  const [delDateSet, setDelDateSet] = useState(true); // false = 納品日 未設定
  const [delNote, setDelNote] = useState("");

  // 管理者の納品確認フォーム（納品物ごと）
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confAmount, setConfAmount] = useState("0");
  const [confDate, setConfDate] = useState(today);
  const [confDateSet, setConfDateSet] = useState(true);

  const allMaterials = useMemo(() => getMaterialsFor(project.id), [project.id, v]);
  const materials = allMaterials.filter((m) => m.category !== "deliverable");
  const deliverables = allMaterials.filter((m) => m.category === "deliverable");
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name ?? "—";
  const mediaIcon = (t?: DeliverableMediaType) =>
    t === "image" ? "🖼" : t === "other" ? "📦" : "🎬";

  function refreshMats() {
    setV((x) => x + 1);
    onChanged();
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  function saveInfo() {
    updateProject(project.id, {
      name: name.trim() || project.name,
      status,
      description: description.trim(),
      assigneeIds,
    });
    setEditing(false);
    onChanged();
  }

  function addLink() {
    if (!matTitle.trim() || !matUrl.trim()) {
      alert("タイトルとURLを入力してください");
      return;
    }
    addMaterial({
      projectId: project.id,
      title: matTitle.trim(),
      kind: "link",
      url: matUrl.trim(),
      note: matNote.trim() || undefined,
      createdBy: me.id,
      category: "material",
    });
    setMatTitle("");
    setMatUrl("");
    setMatNote("");
    refreshMats();
    setAdding(null);
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const res = await uploadMaterialFile(project.id, file);
    if (res) {
      addMaterial({
        projectId: project.id,
        title: matTitle.trim() || file.name,
        kind: "file",
        url: res.url,
        filePath: res.path,
        note: matNote.trim() || undefined,
        createdBy: me.id,
        category: "material",
      });
      setMatTitle("");
      setMatNote("");
      refreshMats();
      setAdding(null);
    } else {
      setUploadMsg("アップロードに失敗しました（ストレージ設定をご確認ください）");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---- 納品物の登録（リンク/ファイルなし） ----
  function addDeliverable() {
    if (!delTitle.trim()) {
      alert("タイトルを入力してください");
      return;
    }
    addMaterial({
      projectId: project.id,
      title: delTitle.trim(),
      kind: "link",
      url: "",
      note: delNote.trim() || undefined,
      createdBy: me.id,
      category: "deliverable",
      mediaType: delMedia,
      assigneeId: delAssignee || undefined,
      deliveredAt: delDateSet ? delDate || undefined : undefined,
      delStatus: "pending",
    });
    setDelTitle("");
    setDelNote("");
    refreshMats();
    setAdding(null);
  }

  // ---- 管理者の納品確認（報酬確定） ----
  function openConfirm(m: { id: string; deliveredAt?: string; rewardAmount?: number }) {
    setConfirmingId(m.id);
    setConfAmount(String(m.rewardAmount ?? 0));
    setConfDateSet(!!m.deliveredAt);
    setConfDate(m.deliveredAt ?? today);
  }
  function confirmDeliverable(id: string, assigneeId?: string, title?: string) {
    updateMaterial(id, {
      delStatus: "confirmed",
      rewardAmount: Math.round(Number(confAmount)) || 0,
      deliveredAt: confDateSet ? confDate || undefined : undefined,
      confirmedAt: today,
    });
    if (assigneeId) {
      sendPushToUsers(
        [assigneeId],
        "納品物の報酬が確定しました",
        `「${title ?? "納品物"}」の報酬 ${yen(Math.round(Number(confAmount)) || 0)} が確定しました`,
        "/"
      );
    }
    setConfirmingId(null);
    refreshMats();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="day-panel modal project-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-panel-head">
          <h3>{editing ? "案件を編集" : project.name}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        {editing ? (
          <>
            <label>
              案件名
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              ステータス
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>
              概要
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>担当メンバー</label>
            <div className="assignee-pick">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`type-btn ${assigneeIds.includes(m.id) ? "on" : ""}`}
                  onClick={() => toggleAssignee(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <div className="form-actions">
              <button className="ghost danger" onClick={() => {
                if (confirm("この案件と資料を削除しますか？")) onDeleted2();
              }}>
                案件を削除
              </button>
              <button className="ghost" onClick={() => setEditing(false)}>キャンセル</button>
              <button className="primary" onClick={saveInfo}>保存</button>
            </div>
          </>
        ) : (
          <>
            <div className="project-info">
              <span className={`project-status ${project.status}`}>
                {PROJECT_STATUS_LABEL[project.status]}
              </span>
              <span className="muted small">開始 {project.startDate.replace(/-/g, "/")}</span>
              <div className="project-detail-actions">
                <button className="ghost mini" onClick={() => setEditing(true)}>編集</button>
                <button
                  className={`ghost mini ${adding === "material" ? "on" : ""}`}
                  onClick={() => setAdding(adding === "material" ? null : "material")}
                >
                  ＋資料追加
                </button>
                <button
                  className={`ghost mini ${adding === "deliverable" ? "on" : ""}`}
                  onClick={() => setAdding(adding === "deliverable" ? null : "deliverable")}
                >
                  ＋納品物追加
                </button>
              </div>
            </div>
            {project.description && <p className="project-detail-desc">{project.description}</p>}
            {project.assigneeIds.length > 0 && (
              <div className="project-card-foot" style={{ marginBottom: 8 }}>
                担当：
                {project.assigneeIds
                  .map((id) => members.find((m) => m.id === id)?.name)
                  .filter(Boolean)
                  .map((n) => <span key={n} className="project-assignee">{n}</span>)}
              </div>
            )}

            {/* 資料の追加フォーム（ボタンで開閉） */}
            {adding === "material" && (
              <div className="material-add">
                <div className="material-add-head">
                  <h4 className="material-head">資料を追加</h4>
                  <button className="ghost mini" onClick={() => setAdding(null)}>閉じる</button>
                </div>
                <input
                  placeholder="タイトル（例: 構成台本）"
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                />
                <input
                  placeholder="リンクURL（Googleドライブ・Canva等）"
                  value={matUrl}
                  onChange={(e) => setMatUrl(e.target.value)}
                />
                <input
                  placeholder="メモ（任意）"
                  value={matNote}
                  onChange={(e) => setMatNote(e.target.value)}
                />
                <div className="material-add-actions">
                  <button className="ghost" onClick={addLink}>🔗 リンクを追加</button>
                  <button className="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? "アップロード中…" : "📄 ファイルを選択"}
                  </button>
                  <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onFilePicked} />
                </div>
                {uploadMsg && <p className="error">{uploadMsg}</p>}
                <p className="muted small">※ ファイルはタイトル未入力ならファイル名で登録されます</p>
              </div>
            )}

            {/* 納品物の追加フォーム（ボタンで開閉。リンク/ファイルなし） */}
            {adding === "deliverable" && (
              <div className="material-add">
                <div className="material-add-head">
                  <h4 className="material-head">納品物を追加</h4>
                  <button className="ghost mini" onClick={() => setAdding(null)}>閉じる</button>
                </div>
                <input
                  placeholder="タイトル（例: リール本編 vol.1）"
                  value={delTitle}
                  onChange={(e) => setDelTitle(e.target.value)}
                />
                <div className="task-form-row">
                  <label>
                    種別
                    <select value={delMedia} onChange={(e) => setDelMedia(e.target.value as DeliverableMediaType)}>
                      {(Object.keys(DELIVERABLE_MEDIA_LABEL) as DeliverableMediaType[]).map((t) => (
                        <option key={t} value={t}>{DELIVERABLE_MEDIA_LABEL[t]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    担当者
                    <select value={delAssignee} onChange={(e) => setDelAssignee(e.target.value)}>
                      <option value="">未設定</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={delDateSet}
                    onChange={(e) => setDelDateSet(e.target.checked)}
                  />
                  納品日を設定する
                </label>
                {delDateSet && (
                  <input type="date" value={delDate} onChange={(e) => setDelDate(e.target.value)} />
                )}
                <textarea
                  rows={2}
                  placeholder="メモ（任意）"
                  value={delNote}
                  onChange={(e) => setDelNote(e.target.value)}
                />
                <div className="material-add-actions">
                  <button className="primary" onClick={addDeliverable}>登録する</button>
                </div>
              </div>
            )}

            {/* 資料の一覧（あれば表示） */}
            {materials.length > 0 && (
              <>
                <h4 className="material-head">資料（{materials.length}）</h4>
                <div className="material-list">
                  {materials.map((m) => (
                    <div key={m.id} className="material-row">
                      <span className="material-kind">{m.kind === "file" ? "📄" : "🔗"}</span>
                      <div className="material-body">
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="material-title">
                          {m.title}
                        </a>
                        {m.note && <div className="material-note">{m.note}</div>}
                      </div>
                      <button
                        className="material-del"
                        title="削除"
                        onClick={() => {
                          if (confirm("この資料を削除しますか？")) {
                            deleteMaterial(m.id);
                            refreshMats();
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 納品物の一覧（あれば表示） */}
            {deliverables.length > 0 && (
              <>
                <h4 className="material-head">納品物（{deliverables.length}）</h4>
                <div className="material-list">
                  {deliverables.map((m) => {
                    const confirmed = m.delStatus === "confirmed";
                    return (
                      <div key={m.id} className="material-row deliverable-row">
                        <span className="material-kind">{mediaIcon(m.mediaType)}</span>
                        <div className="material-body">
                          <span className="material-title plain">{m.title}</span>
                          <div className="material-note">
                            担当: {memberName(m.assigneeId)} ／ 納品日:{" "}
                            {m.deliveredAt ? m.deliveredAt.replace(/-/g, "/") : "未設定"}
                          </div>
                          {m.note && <div className="material-note">📝 {m.note}</div>}
                          <div className="deliverable-status">
                            {confirmed ? (
                              <span className="hist-status confirmed">
                                確定 {yen(m.rewardAmount ?? 0)}
                              </span>
                            ) : (
                              <span className="hist-status pending">確認待ち</span>
                            )}
                          </div>

                          {/* 管理者の納品確認フォーム */}
                          {isOwner && confirmingId === m.id && (
                            <div className="confirm-deliverable">
                              <div className="task-form-row">
                                <label>
                                  報酬額（円）
                                  <input
                                    type="number"
                                    min={0}
                                    step={500}
                                    value={confAmount}
                                    onChange={(e) => setConfAmount(e.target.value)}
                                  />
                                </label>
                              </div>
                              <label className="check-line">
                                <input
                                  type="checkbox"
                                  checked={confDateSet}
                                  onChange={(e) => setConfDateSet(e.target.checked)}
                                />
                                納品日を設定する
                              </label>
                              {confDateSet && (
                                <input
                                  type="date"
                                  value={confDate}
                                  onChange={(e) => setConfDate(e.target.value)}
                                />
                              )}
                              <div className="material-add-actions">
                                <button className="ghost mini" onClick={() => setConfirmingId(null)}>
                                  キャンセル
                                </button>
                                <button
                                  className="primary mini"
                                  onClick={() => confirmDeliverable(m.id, m.assigneeId, m.title)}
                                >
                                  確定する
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="deliverable-actions">
                          {isOwner && confirmingId !== m.id && (
                            <button className="ghost mini" onClick={() => openConfirm(m)}>
                              {confirmed ? "再確認" : "納品確認"}
                            </button>
                          )}
                          <button
                            className="material-del"
                            title="削除"
                            onClick={() => {
                              if (confirm("この納品物を削除しますか？")) {
                                deleteMaterial(m.id);
                                refreshMats();
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {materials.length === 0 && deliverables.length === 0 && adding === null && (
              <p className="muted small" style={{ marginTop: 12 }}>
                資料・納品物はまだありません。「＋資料追加」「＋納品物追加」から登録できます。
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );

  function onDeleted2() {
    deleteProject(project.id);
    onDeleted();
  }
}
