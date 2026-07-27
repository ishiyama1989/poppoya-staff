import { useState } from "react";
import "./App.css";
import {
  Calendar as CalendarIcon, Clock, Inbox, Banknote, Settings,
  Users, BarChart2, LogOut, ClipboardList, FolderKanban, History, type LucideIcon,
} from "lucide-react";
import type { User } from "./types";
import {
  countAwaitingAdmin,
  pendingEventApprovalsForUser,
  pendingRequestsForUser,
  pendingVideoTasksForUser,
  submittedVideoTasksCount,
} from "./store";
import Calendar from "./components/Calendar";
import AvailabilityView from "./components/Availability";
import OwnerMembers from "./components/OwnerMembers";
import OwnerTasks from "./components/OwnerTasks";
import Payments from "./components/Payments";
import Requests from "./components/Requests";
import MyPay from "./components/MyPay";
import Projects from "./components/Projects";
import WorkHistory from "./components/WorkHistory";
import ProfileSettings from "./components/ProfileSettings";

type Tab =
  | "calendar"
  | "availability"
  | "requests"
  | "mypay"
  | "settings"
  | "search"
  | "members"
  | "payments"
  | "tasks"
  | "projects"
  | "history";

export default function App({
  me,
  orgName,
  joinCode,
  onLogout,
}: {
  me: User;
  orgName: string;
  joinCode?: string;
  onLogout: () => void;
}) {
  const [user, setUser] = useState<User>(me);
  const [tab, setTab] = useState<Tab>("calendar");

  const isOwner = user.role === "owner";
  const pendingReqCount = isOwner ? 0 : pendingRequestsForUser(user.id).length;
  const pendingVideoCount = isOwner ? 0 : pendingVideoTasksForUser(user.id).length;
  const pendingCount = pendingReqCount + pendingVideoCount;
  const payCount = isOwner ? 0 : pendingEventApprovalsForUser(user.id).length;
  const taskCount = isOwner ? submittedVideoTasksCount() : 0;
  const awaitingCount = isOwner ? countAwaitingAdmin() : 0;
  const tabs: { key: Tab; label: string; icon: LucideIcon; ownerOnly?: boolean; memberOnly?: boolean }[] = [
    { key: "calendar", label: "カレンダー", icon: CalendarIcon },
    { key: "projects", label: "案件一覧", icon: FolderKanban },
    { key: "availability", label: "稼働日設定", icon: Clock, memberOnly: true },
    {
      key: "requests",
      label: `受けた依頼${pendingCount > 0 ? `（${pendingCount}）` : ""}`,
      icon: Inbox,
      memberOnly: true,
    },
    {
      key: "mypay",
      label: `報酬${payCount > 0 ? `（${payCount}）` : ""}`,
      icon: Banknote,
      memberOnly: true,
    },
    { key: "history", label: "稼働履歴", icon: History, memberOnly: true },
    {
      key: "tasks",
      label: `依頼管理${taskCount > 0 ? `（${taskCount}）` : ""}`,
      icon: ClipboardList,
      ownerOnly: true,
    },
    {
      key: "payments",
      label: `支払い集計${awaitingCount > 0 ? `（${awaitingCount}）` : ""}`,
      icon: BarChart2,
      ownerOnly: true,
    },
    { key: "history", label: "稼働履歴", icon: History, ownerOnly: true },
    { key: "members", label: "メンバー管理", icon: Users, ownerOnly: true },
    { key: "settings", label: "設定", icon: Settings },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo"><span className="logo-dot" />{orgName || "SNS Schedule"}</span>
        </div>
        <div className="topbar-right">
          <span className="user-badge">
            {user.name}
            <span className={`role ${user.role}`}>{isOwner ? "管理者" : "メンバー"}</span>
          </span>
          <button className="ghost" onClick={onLogout}>
            <LogOut size={13} strokeWidth={2} />
            <span className="logout-text">ログアウト</span>
          </button>
        </div>
      </header>

      <nav className="tabs">
        {tabs
          .filter((t) => (!t.ownerOnly || isOwner) && (!t.memberOnly || !isOwner))
          .map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "active" : ""}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={13} strokeWidth={2} />
              {t.label}
            </button>
          ))}
      </nav>

      <main className="content">
        {tab === "calendar" && (
          <Calendar
            me={user}
            onOpenRequests={() => setTab("requests")}
            onOpenMyPay={() => setTab("mypay")}
            onOpenPayments={() => setTab("payments")}
          />
        )}
        {tab === "availability" && !isOwner && <AvailabilityView me={user} />}
        {tab === "requests" && !isOwner && <Requests me={user} />}
        {tab === "mypay" && !isOwner && <MyPay me={user} />}
        {tab === "projects" && <Projects me={user} />}
        {tab === "history" && <WorkHistory me={user} />}
        {tab === "settings" && (
          <ProfileSettings me={user} onUpdated={(u) => setUser(u)} />
        )}
        {tab === "members" && isOwner && <OwnerMembers joinCode={joinCode} />}
        {tab === "payments" && isOwner && <Payments />}
        {tab === "tasks" && isOwner && <OwnerTasks me={user} />}
      </main>
    </div>
  );
}
