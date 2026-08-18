// Supabase Edge Function: 2種類の定期通知をまとめて処理する。
// 1) 通知スケジュール（notification_schedules）… 毎月◯日◯時に管理者が設定した通知
// 2) シフト前通知（profiles.shift_reminder_*）… 各メンバーが設定した「シフトの
//    何日前に通知するか」に基づき、担当しているシフトの開始時刻のN日前ちょうど
//    （＝N×24時間前）に「シフトが近づいています」通知を送る
//
// pg_cron から数分おきに呼ばれる想定（例: */5 * * * *）。
// どちらも「まだ送っていないか」をDBで判定してから送るので、cronの間隔がずれても
// 二重送信にはならない。
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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 日本時間（JST = UTC+9）の年月日時分を取り出す
function nowJst(): { dateKey: string; day: number; hour: number; minute: number } {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return {
    dateKey: jst.toISOString().slice(0, 10), // "YYYY-MM-DD"（JST基準）
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
  };
}

// "YYYY-MM-DD" + "HH:MM"（JSTのつもり）を、UTCの数直線上でも比較できる
// タイムスタンプに変換する（Date.now() + JST_OFFSET_MS と同じ座標系）。
function jstToShiftedMs(date: string, time: string): number | null {
  if (!date || !time) return null;
  const t = Date.parse(`${date}T${time}:00Z`);
  return Number.isNaN(t) ? null : t;
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

// シフト前通知：担当しているシフトの開始時刻ちょうどN日前（＝N×24時間前）を
// 過ぎていて、まだ送っていないメンバーへ「シフトが近づいています」を送る。
async function processShiftReminders(nowShifted: number, todayKey: string): Promise<number> {
  const { data: events, error } = await supabase
    .from("schedule_events")
    .select("id, date, start_time, end_time, title, assignee_ids")
    .gte("date", todayKey);
  if (error) throw error;

  const candidates = (events ?? []).filter(
    (e: { assignee_ids: string[] | null }) => (e.assignee_ids ?? []).length > 0
  );
  if (candidates.length === 0) return 0;

  const allUserIds = [
    ...new Set(candidates.flatMap((e: { assignee_ids: string[] }) => e.assignee_ids)),
  ];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, shift_reminder_enabled, shift_reminder_days_before")
    .in("id", allUserIds);
  const profileById = new Map(
    (profiles ?? []).map((p: { id: string }) => [p.id, p])
  );

  const eventIds = candidates.map((e: { id: string }) => e.id);
  const { data: logs } = await supabase
    .from("shift_reminder_log")
    .select("event_id, user_id")
    .in("event_id", eventIds);
  const alreadySent = new Set(
    (logs ?? []).map((l: { event_id: string; user_id: string }) => `${l.event_id}:${l.user_id}`)
  );

  let sentCount = 0;
  for (const e of candidates) {
    const startMs = jstToShiftedMs(e.date, e.start_time);
    if (startMs === null) continue; // 開始時刻未定のシフトは対象外

    const toSend: string[] = [];
    const logRows: { event_id: string; user_id: string }[] = [];
    for (const userId of e.assignee_ids as string[]) {
      if (alreadySent.has(`${e.id}:${userId}`)) continue;
      const profile = profileById.get(userId) as
        | { shift_reminder_enabled?: boolean; shift_reminder_days_before?: number }
        | undefined;
      if (!profile || profile.shift_reminder_enabled === false) continue;
      const daysBefore = profile.shift_reminder_days_before ?? 1;
      const targetMs = startMs - daysBefore * 24 * 60 * 60 * 1000;
      if (nowShifted < targetMs) continue; // まだ通知時刻に達していない
      toSend.push(userId);
      logRows.push({ event_id: e.id, user_id: userId });
    }
    if (toSend.length === 0) continue;

    await sendToUsers(
      toSend,
      "シフトのお知らせ",
      `${e.date.slice(5).replace("-", "/")} ${e.start_time}〜${e.end_time || "未定"}のシフトが入っています「${e.title}」`
    );
    await supabase.from("shift_reminder_log").insert(logRows);
    sentCount += toSend.length;
  }
  return sentCount;
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
    const nowShifted = Date.now() + JST_OFFSET_MS;

    const reminderSent = await processShiftReminders(nowShifted, dateKey);

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

    return new Response(JSON.stringify({ ok: true, processed, totalSent, reminderSent }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
