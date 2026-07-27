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
  joinCode?: string;
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email: email.trim(), password });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
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
  return { id: data.id, name: data.name, plan: data.plan ?? "free", joinCode: data.join_code ?? undefined };
}

// 招待コードでメンバーとして組織に参加
export async function joinOrgByCode(
  code: string,
  memberName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("join_org_by_code", {
    code: code.trim(),
    member_name: memberName.trim(),
  });
  if (error) {
    if (/invalid code/i.test(error.message)) return { ok: false, error: "招待コードが正しくありません" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// サインアップ後、最初のログインで「組織＋オーナー」を作成
export async function createOrg(
  orgName: string,
  ownerName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("create_org_and_owner", {
    org_name: orgName.trim(),
    owner_name: ownerName.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
