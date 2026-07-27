// Supabase Edge Function: ねっぱん！のiCal(.ics)フィードを取得し、reservationsテーブルに同期する
// organizations.neppan_ical_url が設定されている組織すべてを対象にする（マルチテナント対応）。
// スケジュール実行: Supabaseダッシュボード → Edge Functions → sync-neppan → Schedule で
// 15〜30分おきなど、定期実行を設定する。
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IcsEvent {
  uid: string;
  dtstart: string; // "YYYY-MM-DD"
  dtend: string; // "YYYY-MM-DD"
  summary: string;
  status?: string;
}

// iCalの行折り返し（継続行は先頭が空白/タブ）を1行にまとめる
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

// "20260801" / "20260801T000000Z" → "2026-08-01"
function toDate(v: string): string {
  const d = v.slice(0, 8);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      if (cur?.uid && cur.dtstart && cur.dtend) events.push(cur as IcsEvent);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).split(";")[0]; // ;VALUE=DATE 等のパラメータは無視
      const value = line.slice(idx + 1).trim();
      if (key === "UID") cur.uid = value;
      else if (key === "DTSTART") cur.dtstart = toDate(value);
      else if (key === "DTEND") cur.dtend = toDate(value);
      else if (key === "SUMMARY") cur.summary = value;
      else if (key === "STATUS") cur.status = value.toLowerCase();
    }
  }
  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, neppan_ical_url")
      .not("neppan_ical_url", "is", null);
    if (orgErr) throw orgErr;

    const results: Record<string, number | string> = {};

    for (const org of orgs ?? []) {
      const url = org.neppan_ical_url as string;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const events = parseIcs(await res.text());

        // このEdge Functionが把握している予約は「常にこの2フィールドの組で一意」。
        // 全削除はせず行ごとにupsertする（他組織・他テーブルと同じ方針）。
        const rows = events.map((e) => ({
          id: `${org.id}:${e.uid}`,
          org_id: org.id,
          neppan_booking_id: e.uid,
          checkin_date: e.dtstart,
          checkout_date: e.dtend,
          guest_name: e.summary ?? "",
          status: e.status === "cancelled" ? "cancelled" : "confirmed",
          synced_at: new Date().toISOString(),
        }));

        if (rows.length > 0) {
          const { error: upsertErr } = await supabase
            .from("reservations")
            .upsert(rows, { onConflict: "org_id,neppan_booking_id" });
          if (upsertErr) throw upsertErr;
        }

        // フィード上から消えた予約（＝ねっぱん側でキャンセルされた）は status を cancelled にする。
        // 行は消さず、フラグを立てるだけ（削除しない方針）。
        const currentIds = rows.map((r) => r.neppan_booking_id);
        const { error: cancelErr } = await supabase
          .from("reservations")
          .update({ status: "cancelled", synced_at: new Date().toISOString() })
          .eq("org_id", org.id)
          .eq("status", "confirmed")
          .not("neppan_booking_id", "in", `(${currentIds.map((id) => `"${id}"`).join(",") || '""'})`);
        if (cancelErr) throw cancelErr;

        results[org.id] = rows.length;
      } catch (e) {
        results[org.id] = `error: ${String(e)}`;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
