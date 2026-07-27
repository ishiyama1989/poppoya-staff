// 領収書を別ウィンドウで開き、ブラウザの印刷機能でPDF保存できるようにする。
// 日本語フォントの埋め込み不要（OSのフォントで描画され、文字化けしない）。

import { yen } from "./date";

export interface ReceiptData {
  receiptNo: string;
  issuedDate: string; // "YYYY/MM/DD"
  issuedTo: string; // 宛名（支払元）
  honorific: string; // 敬称（個人=様 / 法人=御中）
  issuerName: string; // 発行者（メンバー）
  issuerInfo?: {
    postalCode?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  stampSvg?: string; // デジタル印影のSVGマークアップ
  periodLabel: string;
  amount: number;
  lines: { date: string; title: string; hours: number; amount: number }[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openReceiptPdf(data: ReceiptData): void {
  const w = window.open("", "_blank", "width=820,height=1060");
  if (!w) {
    alert(
      "ポップアップがブロックされました。ブラウザでポップアップを許可してから再度お試しください。"
    );
    return;
  }

  const rows = data.lines
    .map((l) => {
      const unitPrice = l.hours > 0 ? Math.round(l.amount / l.hours) : l.amount;
      return `<tr>
        <td>${esc(l.title)}${l.date ? `<span class="row-date">（${esc(l.date)}）</span>` : ""}</td>
        <td class="num">${l.hours.toFixed(1)}h</td>
        <td class="num">${yen(unitPrice)}</td>
        <td class="num">${yen(l.amount)}</td>
      </tr>`;
    })
    .join("");

  const issuerLines = [
    data.issuerInfo?.postalCode ? `〒${esc(data.issuerInfo.postalCode)}` : "",
    data.issuerInfo?.address ? esc(data.issuerInfo.address) : "",
    data.issuerInfo?.phone ? `TEL: ${esc(data.issuerInfo.phone)}` : "",
    data.issuerInfo?.email ? esc(data.issuerInfo.email) : "",
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("");

  const stampHtml = data.stampSvg
    ? data.stampSvg
    : `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="27" fill="none" stroke="#c0392b" stroke-width="2.5"/>
        <text x="30" y="37" text-anchor="middle" font-family="serif" font-size="18" fill="#c0392b">印</text>
      </svg>`;

  w.document.write(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>領収書 ${esc(data.receiptNo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    padding: 48px 56px;
    font-size: 13px;
  }
  .sheet { max-width: 680px; margin: 0 auto; }

  /* 右上: 発行日・番号 */
  .doc-meta {
    text-align: right;
    font-size: 12px;
    color: #555;
    line-height: 1.8;
    margin-bottom: 18px;
  }

  /* 中央タイトル */
  .doc-title {
    text-align: center;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 14px;
    border-bottom: 3px double #1a1a1a;
    padding-bottom: 10px;
    margin-bottom: 26px;
  }

  /* 2カラム: 宛名(左) + 発行者(右) */
  .two-col {
    display: flex;
    gap: 28px;
    align-items: flex-start;
    margin-bottom: 28px;
  }
  .col-left { flex: 1; }
  .col-right {
    width: 210px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }

  /* 宛名 */
  .to-name {
    font-size: 20px;
    font-weight: 700;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 4px;
    margin-bottom: 12px;
    letter-spacing: 2px;
  }
  .receipt-note {
    font-size: 13px;
    color: #333;
    margin-bottom: 14px;
  }

  /* 領収金額 */
  .amount-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    border: 2px solid #1a1a1a;
    border-radius: 6px;
    padding: 10px 14px;
    background: #fafafa;
    width: fit-content;
  }
  .amount-label {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }
  .amount-value {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 1px;
  }

  /* 発行者情報 */
  .issuer-info {
    line-height: 1.8;
    font-size: 12px;
    color: #333;
    text-align: right;
  }
  .issuer-info .issuer-name {
    font-size: 17px;
    font-weight: 700;
    color: #1a1a1a;
    margin-bottom: 5px;
    letter-spacing: 1px;
  }

  /* 印鑑 */
  .stamp-wrap { margin-top: 2px; }
  .stamp-wrap svg { display: block; }

  /* 但し書き */
  .tadashi {
    font-size: 13px;
    color: #444;
    margin-bottom: 8px;
    line-height: 1.6;
  }
  .tadashi .hl {
    border-bottom: 1px solid #999;
    padding: 0 4px;
  }

  /* テーブル */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #c8cdd6;
    padding: 8px 10px;
    text-align: left;
    vertical-align: middle;
  }
  th {
    background: #f0f4f8;
    font-weight: 600;
    text-align: center;
  }
  td.num { text-align: right; white-space: nowrap; }
  tbody tr:nth-child(even) { background: #fafbfd; }
  .row-date { font-size: 11px; color: #888; margin-left: 4px; }
  tfoot td {
    font-weight: 700;
    background: #f0f4f8;
    text-align: right;
  }
  tfoot tr:last-child td {
    font-size: 14px;
    background: #e4ecf5;
  }

  /* 印刷ツールバー */
  .toolbar {
    position: sticky; top: 0; background: #f0f4f8;
    padding: 10px 0; margin: -48px -56px 36px;
    text-align: center; border-bottom: 1px solid #d5d9e3;
    z-index: 10;
  }
  .toolbar button {
    font: inherit; font-weight: 700; font-size: 14px;
    color: #fff; background: #ff7a59;
    border: none; border-radius: 8px; padding: 10px 24px; cursor: pointer;
  }
  .toolbar button:hover { background: #e085a0; }
  .hint { margin-top: 28px; font-size: 11.5px; color: #888; text-align: center; }

  @media print {
    body { padding: 24px 32px; }
    .toolbar, .hint { display: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">PDFとして保存 / 印刷</button>
  </div>
  <div class="sheet">

    <!-- 右上: 発行日 + 領収書番号 -->
    <div class="doc-meta">
      ${esc(data.issuedDate)}<br/>
      領収書番号: ${esc(data.receiptNo)}
    </div>

    <!-- 中央タイトル -->
    <div class="doc-title">領 収 書</div>

    <!-- 2カラム: 宛名(左) + 発行者情報+印鑑(右) -->
    <div class="two-col">
      <div class="col-left">
        <div class="to-name">${esc(data.issuedTo)}&ensp;${esc(data.honorific)}</div>
        <p class="receipt-note">下記のとおり領収いたしました。</p>
        <div class="amount-row">
          <span class="amount-label">領収金額</span>
          <span class="amount-value">${yen(data.amount)} -</span>
        </div>
      </div>
      <div class="col-right">
        <div class="issuer-info">
          <div class="issuer-name">${esc(data.issuerName)}</div>
          ${issuerLines}
        </div>
        <div class="stamp-wrap">${stampHtml}</div>
      </div>
    </div>

    <!-- 但し書き -->
    <div class="tadashi">
      但し、<span class="hl">SNS運用業務の報酬として（${esc(data.periodLabel)}分）</span>
    </div>

    <!-- 明細テーブル -->
    <table>
      <thead>
        <tr>
          <th>品名</th>
          <th class="num">数量</th>
          <th class="num">単価</th>
          <th class="num">金額</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">小計</td>
          <td class="num">${yen(data.amount)}</td>
        </tr>
        <tr>
          <td colspan="3">合計</td>
          <td class="num">${yen(data.amount)}</td>
        </tr>
      </tfoot>
    </table>

    <p class="hint">
      ※ 上の「PDFとして保存 / 印刷」ボタンを押し、印刷ダイアログで「PDFとして保存」を選んでください。
    </p>
  </div>
</body>
</html>`);
  w.document.close();
}
