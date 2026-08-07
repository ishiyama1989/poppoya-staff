// SaaS版の認証（Supabase Auth）と組織・プロフィール取得
import { supabase } from "./supabase";

export interface Profile {
  id: string; // = auth.users.id (uuid)
  orgId: string;
  name: string;
  role: "owner" | "member";
  hourlyRate: number;
  receiptName?: string;
  postalCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  stamp?: {
    text: string;
    shape: "circle" | "square";
    orientation: "vertical" | "horizontal";
    font: "mincho" | "gothic" | "maru" | "kaisho";
  };
}

export interface Org {
  id: string;
  name: string;
  plan: string;
  theme: string;
}

// ログインID(半角英数)だけで使えるように、内部的にSupabase Auth用のメールアドレスへ変換する。
// メール確認は無効化しているため実際に届く必要はない（ダミードメイン）。
const LOGIN_ID_DOMAIN = "poppoya-staff.app";

export function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${LOGIN_ID_DOMAIN}`;
}

export async function signUp(loginId: string, password: string) {
  return supabase.auth.signUp({ email: loginIdToEmail(loginId), password });
}

export async function signIn(loginId: string, password: string) {
  return supabase.auth.signInWithPassword({ email: loginIdToEmail(loginId), password });
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getCurrentEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

// 自分のプロフィールを取得（無ければ null = まだ組織未作成）
export async function getMyProfile(): Promise<Profile | null> {
  const uid = await getCurrentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    name: data.name,
    role: data.role,
    hourlyRate: data.hourly_rate ?? 0,
    receiptName: data.receipt_name ?? undefined,
    postalCode: data.postal_code ?? undefined,
    address: data.address ?? undefined,
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    stamp: data.stamp_text
      ? {
          text: data.stamp_text,
          shape: data.stamp_shape ?? "circle",
          orientation: data.stamp_orientation ?? "vertical",
          font: data.stamp_font ?? "mincho",
        }
      : undefined,
  };
}

export async function getMyOrg(): Promise<Org | null> {
  const { data, error } = await supabase.from("organizations").select("*").maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    plan: data.plan ?? "free",
    theme: data.theme ?? "coral",
  };
}

// 会社の配色テーマを変更する
export async function updateOrgTheme(
  orgId: string,
  theme: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("organizations").update({ theme }).eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// サインアップ後、最初の1人は会社を自動作成してオーナーに、2人目以降は自動的にメンバーとして参加する
// （1社専用の運用のため、会社作成・招待コードの入力は不要）
export async function joinOrCreateOrg(
  memberName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("join_or_create_org", {
    member_name: memberName.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
