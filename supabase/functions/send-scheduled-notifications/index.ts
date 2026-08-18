// Supabase Edge Function: 通知スケジュール（notification_schedules）に設定された
// 「毎月◯日◯時」を過ぎたものを見つけて、対象メンバーへプッシュ通知を送る。
//
// pg_cron から数分おきに呼ばれる想定（例: */5 * * * *）。
// 「今日が dayOfMonth で、現在時刻が hour:minute 以降」かつ「今日まだ送っていない」
// スケジュールを送信対象とする（cronの間隔がずれても、その日のうちに1回だけ送られる）。
//
// 必要なsecrets（send-pushと共通）:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// このFunction専用のsecrets:
//   CRON_SECRET … pg_cronからの呼び出しであることを確認する合言葉
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

webpush.setVapidDetails(
  "mailto:admin@sns-schedule.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 日本時間（JST = UTC+9）の年月日時分を取り出す
function nowJst(): { dateKey: string; day: number; hour: number; minute: number } {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    dateKey: jst.toISOString().slice(0, 10), // "YYYY-MM-DD"（JST基準）
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
  };
}

async function sendToUsers(userIds: string[], title: string, body: string): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);

  const payload = JSON.stringify({ title, body, url: "/" });
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s: { endpoint: string; subscription: unknown }) => {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    })
  );
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (CRON_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { dateKey, day, hour, minute } = nowJst();

    const { data: schedules, error } = await supabase
      .from("notification_schedules")
      .select("*")
      .eq("enabled", true)
      .eq("day_of_month", day);

    if (error) throw error;

    let processed = 0;
    let totalSent = 0;

    for (const s of schedules ?? []) {
      // 今日すでに送っていればスキップ（二重送信防止）
      if (s.last_sent_at && String(s.last_sent_at).slice(0, 10) === dateKey) continue;
      // まだ設定時刻に達していなければスキップ
      const past = hour > s.hour || (hour === s.hour && minute >= s.minute);
      if (!past) continue;

      let userIds: string[] = [];
      if (s.recipient_mode === "selected") {
        userIds = Array.isArray(s.recipient_ids) ? s.recipient_ids : [];
      } else {
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("org_id", s.org_id)
          .neq("role", "owner");
        userIds = (members ?? []).map((m: { id: string }) => m.id);
      }

      const sent = await sendToUsers(userIds, s.name || "お知らせ", s.message || "");
      totalSent += sent;
      processed++;

      await supabase
        .from("notification_schedules")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", s.id);
    }

    return new Response(JSON.stringify({ ok: true, processed, totalSent }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
