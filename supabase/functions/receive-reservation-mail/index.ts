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
  source: string; // 予約サイト（neppan / rakuten / jalan / booking / airbnb / other）
  bookingId: string;
  checkinDate: string; // "YYYY-MM-DD"
  checkoutDate: string; // "YYYY-MM-DD"
  guestName: string;
  roomType: string;
  cancelled: boolean;
}

// 送信元アドレス（なければ件名・本文）から、どの予約サイトからの通知かを判定する
const SOURCE_RULES: { source: string; label: string; match: RegExp }[] = [
  { source: "neppan", label: "ねっぱん", match: /neppan|hpdsp/i },
  { source: "rakuten", label: "楽天トラベル", match: /rakuten|楽天/i },
  { source: "jalan", label: "じゃらん", match: /jalan|recruit|じゃらん/i },
  { source: "booking", label: "Booking.com", match: /booking\.com/i },
  { source: "airbnb", label: "Airbnb", match: /airbnb/i },
  { source: "ikyu", label: "一休", match: /ikyu|一休/i },
];

export const SOURCE_LABEL: Record<string, string> = SOURCE_RULES.reduce(
  (acc, r) => ({ ...acc, [r.source]: r.label }),
  { other: "その他" } as Record<string, string>
);

export function detectSource(from: string, subject: string, text: string): string {
  // 送信元が一番確実。次に件名、最後に本文の先頭で判定する
  for (const haystack of [from, subject, text.slice(0, 500)]) {
    if (!haystack) continue;
    for (const rule of SOURCE_RULES) {
      if (rule.match.test(haystack)) return rule.source;
    }
  }
  return "other";
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

type FieldPatterns = {
  bookingId: RegExp[];
  checkin: RegExp[];
  checkout: RegExp[];
  nights: RegExp[];
  guestName: RegExp[];
  roomType: RegExp[];
  cancelled: RegExp[];
};

// どの予約サイトでも共通して試すパターン（ラベル違いを幅広く吸収する）
const GENERIC_PATTERNS: FieldPatterns = {
  bookingId: [
    /予約番号[\s:：]*([A-Za-z0-9\-_]+)/,
    /申込番号[\s:：]*([A-Za-z0-9\-_]+)/,
    /予約ID[\s:：]*([A-Za-z0-9\-_]+)/,
    /確認番号[\s:：]*([A-Za-z0-9\-_]+)/,
  ],
  checkin: [
    /(?:チェックイン|ご到着|宿泊日|到着日|ご利用日)[\s:：]*([^\n]+)/,
    /宿泊期間[\s:：]*([^\n~〜]+)/,
  ],
  checkout: [
    /(?:チェックアウト|ご出発|出発日)[\s:：]*([^\n]+)/,
    /宿泊期間[\s:：]*[^\n~〜]+[~〜]([^\n]+)/,
  ],
  nights: [/(\d+)\s*泊/],
  guestName: [
    /(?:宿泊者名|お客様名|代表者名|ご予約者名|ご宿泊者|お名前)[\s:：]*([^\n]+)/,
  ],
  roomType: [/(?:部屋タイプ|room|客室|プラン名|部屋名|宿泊プラン)[\s:：]*([^\n]+)/i],
  cancelled: [/キャンセル|取消/],
};

// 予約サイトごとの固有表記。共通パターンより先に試す。
// 実際のメールを見て合わない箇所があれば、ここに書き足せば個別に対応できる。
const SOURCE_PATTERNS: Record<string, Partial<FieldPatterns>> = {
  rakuten: {
    bookingId: [/(?:予約番号|受付番号)[\s:：]*([A-Za-z0-9\-_]+)/],
    guestName: [/(?:宿泊者名|ご利用者名|申込者名)[\s:：]*([^\n]+)/],
  },
  jalan: {
    bookingId: [/(?:予約番号|申込番号)[\s:：]*([A-Za-z0-9\-_]+)/],
    guestName: [/(?:宿泊者名|申込者名)[\s:：]*([^\n]+)/],
  },
  booking: {
    // Booking.comは英語表記で届くことがある
    bookingId: [/(?:Booking number|Reservation number|予約番号)[\s:：]*([A-Za-z0-9\-_]+)/i],
    checkin: [/(?:Check-?in|チェックイン)[\s:：]*([^\n]+)/i],
    checkout: [/(?:Check-?out|チェックアウト)[\s:：]*([^\n]+)/i],
    guestName: [/(?:Guest name|Guest|宿泊者名)[\s:：]*([^\n]+)/i],
    cancelled: [/キャンセル|取消|cancell?ed/i],
  },
  airbnb: {
    bookingId: [/(?:確認コード|Confirmation code)[\s:：]*([A-Za-z0-9\-_]+)/i],
    guestName: [/(?:ゲスト|Guest)[\s:：]*([^\n]+)/i],
    cancelled: [/キャンセル|取消|cancell?ed/i],
  },
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// 「そのサイト固有のパターン」→「共通パターン」の順で探す
function matchField(
  text: string,
  source: string,
  field: keyof FieldPatterns
): string | null {
  const specific = SOURCE_PATTERNS[source]?.[field];
  if (specific) {
    const hit = firstMatch(text, specific);
    if (hit) return hit;
  }
  return firstMatch(text, GENERIC_PATTERNS[field]);
}

function matchesAny(text: string, source: string, field: keyof FieldPatterns): boolean {
  const patterns = [
    ...(SOURCE_PATTERNS[source]?.[field] ?? []),
    ...GENERIC_PATTERNS[field],
  ];
  return patterns.some((re) => re.test(text));
}

export function parseReservationMail(
  text: string,
  source = "other"
): ParsedReservation | null {
  const bookingId = matchField(text, source, "bookingId");
  const checkinRaw = matchField(text, source, "checkin");
  if (!bookingId || !checkinRaw) return null;

  const checkinDate = normalizeDate(checkinRaw);
  if (!checkinDate) return null;

  // チェックアウト日は「明示」→「泊数から計算」→「1泊とみなす」の順に決める
  let checkoutDate: string | null = null;
  const checkoutRaw = matchField(text, source, "checkout");
  if (checkoutRaw) checkoutDate = normalizeDate(checkoutRaw);
  if (!checkoutDate) {
    const nights = matchField(text, source, "nights");
    checkoutDate = addNights(checkinDate, nights ? Number(nights) : 1);
  }

  return {
    source,
    bookingId,
    checkinDate,
    checkoutDate,
    guestName: matchField(text, source, "guestName") ?? "",
    roomType: matchField(text, source, "roomType") ?? "",
    cancelled: matchesAny(text, source, "cancelled"),
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

    // どの予約サイトからの通知かを判定（送信元→件名→本文の順に見る）
    const from = String(payload.from ?? payload.From ?? "");
    const subject = String(payload.subject ?? payload.Subject ?? "");
    const source = detectSource(from, subject, body);

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
    const parsed = parseReservationMail(body, source);
    if (!parsed) {
      // 解析できなかったメールは捨てずに記録し、書式を後から調整できるようにする
      await supabase.from("reservation_mail_errors").insert({
        org_id: org.id,
        raw_body: body.slice(0, 5000),
        reason: `parse failed (${source})`,
      });
      return new Response(
        JSON.stringify({ ok: false, error: "could not parse mail", saved: true }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // 予約サイトが違えば予約番号が偶然かぶることもあるため、サイト名込みで一意にする
    const uniqueKey = `${parsed.source}:${parsed.bookingId}`;

    const { error: upsertErr } = await supabase.from("reservations").upsert(
      {
        id: `${org.id}:${uniqueKey}`,
        org_id: org.id,
        neppan_booking_id: uniqueKey,
        source: parsed.source,
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
