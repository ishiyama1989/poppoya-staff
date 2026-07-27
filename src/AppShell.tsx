import { useEffect, useState } from "react";
import "./App.css";
import type { User } from "./types";
import {
  getMyOrg,
  getMyProfile,
  signOut,
  type Org,
  type Profile,
} from "./lib/auth";
import { loadOrgData, setOrgId, supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import CreateOrg from "./components/CreateOrg";
import App from "./App";

type Stage = "loading" | "anon" | "needOrg" | "ready";

function toUser(p: Profile): User {
  return {
    id: p.id,
    name: p.name,
    password: "",
    role: p.role,
    hourlyRate: p.hourlyRate,
    receiptName: p.receiptName,
    postalCode: p.postalCode,
    address: p.address,
    phone: p.phone,
    email: p.email,
    stamp: p.stamp,
  };
}

// SaaS版の入口。認証 → 組織作成 → データ読み込み → 本体アプリ。
export default function AppShell() {
  const [stage, setStage] = useState<Stage>("loading");
  const [me, setMe] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);

  async function refresh() {
    setStage("loading");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setOrgId(null);
      setStage("anon");
      return;
    }
    const profile = await getMyProfile();
    if (!profile) {
      setStage("needOrg");
      return;
    }
    const o = await getMyOrg();
    setOrgId(profile.orgId);
    localStorage.setItem("sns_session", profile.id); // store.currentUser() 用
    await loadOrgData();
    setMe(toUser(profile));
    setOrg(o);
    setStage("ready");
  }

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setOrgId(null);
        setStage("anon");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut();
    setOrgId(null);
    setMe(null);
    setOrg(null);
    setStage("anon");
  }

  if (stage === "loading")
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>読み込み中...</p>
      </div>
    );
  if (stage === "anon") return <Auth onLoggedIn={refresh} />;
  if (stage === "needOrg") return <CreateOrg onCreated={refresh} />;

  // 認証＋組織＋データ読み込みOK。本体アプリを表示。
  return (
    <App
      me={me!}
      orgName={org?.name ?? ""}
      joinCode={org?.joinCode}
      onLogout={handleLogout}
    />
  );
}
