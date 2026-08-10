// 予約通知メールに添付された画像（スクリーンショット等）から予約情報を読み取る。
// テキスト解析で拾えなかった場合の受け皿として使う。
import Anthropic from "npm:@anthropic-ai/sdk@0.116.0";

export interface ImageParsedReservation {
  bookingId: string | null;
  checkinDate: string | null; // "YYYY-MM-DD"
  checkoutDate: string | null; // "YYYY-MM-DD"
  guestName: string;
  roomType: string;
  cancelled: boolean;
}

// Claudeが読み取れる画像形式（それ以外は解析対象にしない）
const SUPPORTED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedImage(mediaType: string): mediaType is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

// 読み取れなかった項目はnullを返させ、こちら側で「解析失敗」と判断できるようにする。
// null許容は anyOf で書く（構造化出力がサポートする書き方）。
const nullableString = (description: string) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

const RESERVATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    bookingId: nullableString("予約番号・申込番号。画像内に見つからなければ null"),
    checkinDate: nullableString("チェックイン日を YYYY-MM-DD 形式で。不明なら null"),
    checkoutDate: nullableString(
      "チェックアウト日を YYYY-MM-DD 形式で。明記がなく泊数だけ分かる場合はチェックイン日から計算する。不明なら null"
    ),
    guestName: { type: "string", description: "宿泊者名。不明なら空文字" },
    roomType: { type: "string", description: "部屋タイプ・プラン名。不明なら空文字" },
    cancelled: { type: "boolean", description: "キャンセル・取消の通知なら true" },
  },
  required: [
    "bookingId",
    "checkinDate",
    "checkoutDate",
    "guestName",
    "roomType",
    "cancelled",
  ],
  additionalProperties: false,
};

const PROMPT = `この画像は宿泊施設の予約通知です。写っている予約情報を読み取ってください。

- 日付は必ず YYYY-MM-DD 形式にしてください（和暦や「8月10日」のような表記は西暦に直す）。
- チェックアウト日が書かれておらず「2泊」のような泊数だけある場合は、チェックイン日から計算してください。
- 画像から読み取れない項目は、推測せずに null（文字列の項目は空文字）にしてください。`;

// 画像1枚から予約情報を読み取る。読み取れなければ null
export async function parseReservationImage(
  base64Data: string,
  mediaType: SupportedMediaType
): Promise<ImageParsedReservation | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8192,
    output_config: {
      effort: "low", // 画像1枚からの単純な抽出なので深く考える必要はない
      format: { type: "json_schema", schema: RESERVATION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  // 安全側の判定：拒否された場合は解析失敗として扱う
  if (response.stop_reason === "refusal") return null;

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  try {
    return JSON.parse(textBlock.text) as ImageParsedReservation;
  } catch {
    return null;
  }
}
