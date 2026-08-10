// Supabase Edge Function: ねっぱん！の予約通知メールを受け取り、reservationsテーブルに反映する
//
// 使い方:
//   google-apps-script/reservation-sync.gs をGoogle Apps Scriptに設置し、
//   Gmailの予約通知メールを定期的に読み取ってこの関数へPOSTしてもらう。
//   添付画像はApps Script側でGoogleドライブの文字認識にかけ、本文に連結して送られてくる。
//
// 必要なsecrets:
//   INBOUND_MAIL_TOKEN … Webhookの合言葉（任意。未設定なら検証しない）
//
// メール本文の書式はねっぱん！の設定によって変わるため、PATTERNS を実際のメールに合わせて調整する。
// 解析に失敗したメールは reservation_mail_errors に記録し、後から手動で確認・修正できるようにする。
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 受信Webhookを他人に叩かれないための合言葉。Supabaseのsecretsに設定し、
// メール受信サービス側からは ?token=... を付けて呼んでもらう。
const INBOUND_TOKEN = Deno.env.get("INBOUND_MAIL_TOKEN") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedReservation {
  bookingId: string;
  checkinDate: string; // "YYYY-MM-DD"
  checkoutDate: string; // "YYYY-MM-DD"
  guestName: string;
  roomType: string;
  cancelled: boolean;
}

// 「2026年8月10日」「2026/08/10」「2026-08-10」いずれの書き方にも対応する
function normalizeDate(raw: string): string | null {
  const m = raw.match(/(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 泊数からチェックアウト日を計算する（チェックアウト日が本文にない場合のフォールバック）
function addNights(dateStr: string, nights: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + nights);
  return d.toISOString().slice(0, 10);
}

// ラベル違いを吸収するため、複数の書き方を順に試す
const PATTERNS = {
  bookingId: [
    /予約番号[\s:：]*([A-Za-z0-9\-_]+)/,
    /申込番号[\s:：]*([A-Za-z0-9\-_]+)/,
    /予約ID[\s:：]*([A-Za-z0-9\-_]+)/,
  ],
  checkin: [
    /(?:チェックイン|ご到着|宿泊日|到着日)[\s:：]*([^\n]+)/,
    /宿泊期間[\s:：]*([^\n~〜]+)/,
  ],
  checkout: [
    /(?:チェックアウト|ご出発|出発日)[\s:：]*([^\n]+)/,
    /宿泊期間[\s:：]*[^\n~〜]+[~〜]([^\n]+)/,
  ],
  nights: [/(\d+)\s*泊/],
  guestName: [
    /(?:宿泊者名|お客様名|代表者名|ご予約者名|お名前)[\s:：]*([^\n]+)/,
  ],
  roomType: [/(?:部屋タイプ|room|客室|プラン名|部屋名)[\s:：]*([^\n]+)/i],
  cancelled: [/キャンセル|取消/],
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function parseReservationMail(text: string): ParsedReservation | null {
  const bookingId = firstMatch(text, PATTERNS.bookingId);
  const checkinRaw = firstMatch(text, PATTERNS.checkin);
  if (!bookingId || !checkinRaw) return null;

  const checkinDate = normalizeDate(checkinRaw);
  if (!checkinDate) return null;

  // チェックアウト日は「明示」→「泊数から計算」→「1泊とみなす」の順に決める
  let checkoutDate: string | null = null;
  const checkoutRaw = firstMatch(text, PATTERNS.checkout);
  if (checkoutRaw) checkoutDate = normalizeDate(checkoutRaw);
  if (!checkoutDate) {
    const nights = firstMatch(text, PATTERNS.nights);
    checkoutDate = addNights(checkinDate, nights ? Number(nights) : 1);
  }

  return {
    bookingId,
    checkinDate,
    checkoutDate,
    guestName: firstMatch(text, PATTERNS.guestName) ?? "",
    roomType: firstMatch(text, PATTERNS.roomType) ?? "",
    cancelled: PATTERNS.cancelled.some((re) => re.test(text)),
  };
}

// メール受信サービスによってJSONの形が違うため、本文らしきフィールドを順に探す
function extractBody(payload: Record<string, any>): string {
  const candidates = [
    payload.text,
    payload.plain,
    payload["body-plain"],
    payload.TextBody,
    payload.body?.text,
    payload.email?.text,
    payload.html,
    payload.HtmlBody,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      // HTMLの場合はタグを落として本文だけにする
      return c.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 合言葉が設定されている場合のみ照合する（未設定なら検証をスキップ）
    if (INBOUND_TOKEN) {
      const token = new URL(req.url).searchParams.get("token");
      if (token !== INBOUND_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const payload = await req.json();
    const body = extractBody(payload);
    if (!body) throw new Error("mail body not found in payload");

    // 対象の組織（1社専用運用なので最初の組織）
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) throw new Error("organization not found");

    // 本文（画像はApps Script側で文字に起こされて本文に連結済み）から読み取る
    const parsed = parseReservationMail(body);
    if (!parsed) {
      // 解析できなかったメールは捨てずに記録し、書式を後から調整できるようにする
      await supabase.from("reservation_mail_errors").insert({
        org_id: org.id,
        raw_body: body.slice(0, 5000),
        reason: "parse failed",
      });
      return new Response(
        JSON.stringify({ ok: false, error: "could not parse mail", saved: true }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const { error: upsertErr } = await supabase.from("reservations").upsert(
      {
        id: `${org.id}:${parsed.bookingId}`,
        org_id: org.id,
        neppan_booking_id: parsed.bookingId,
        checkin_date: parsed.checkinDate,
        checkout_date: parsed.checkoutDate,
        guest_name: parsed.guestName,
        room_type: parsed.roomType,
        status: parsed.cancelled ? "cancelled" : "confirmed",
        synced_at: new Date().toISOString(),
      },
      { onConflict: "org_id,neppan_booking_id" }
    );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true, reservation: parsed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
