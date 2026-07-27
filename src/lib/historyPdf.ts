// 稼働履歴を別ウィンドウで開き、ブラウザの印刷機能でPDF保存できるようにする。
import { yen } from "./date";
import { HISTORY_STATUS_LABEL, type HistoryRow, type HistorySummary } from "./pay";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openWorkHistoryPdf(data: {
  memberName: string;
  periodLabel: string;
  rows: HistoryRow[];
  summary: HistorySummary;
}): void {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    alert(
      "ポップアップがブロックされました。ブラウザでポップアップを許可してから再度お試しください。"
    );
    return;
  }

  const rows = data.rows
    .map(
      (r) => `<tr>
        <td>${esc(r.date.replace(/-/g, "/"))}</td>
        <td>${esc(r.title)}</td>
        <td>${esc(r.typeLabel)}</td>
        <td class="num">${r.hours > 0 ? r.hours.toFixed(1) + "h" : "—"}</td>
        <td class="num">${r.amount != null ? yen(r.amount) : "—"}</td>
        <td class="status status-${r.status}">${HISTORY_STATUS_LABEL[r.status]}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>稼働履歴 ${esc(data.memberName)} ${esc(data.periodLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; color: #222; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 18px; }
  .summary { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .card { border: 1px solid #e3e3e3; border-radius: 10px; padding: 10px 16px; min-width: 130px; }
  .card .label { font-size: 11px; color: #888; }
  .card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { border-bottom: 1px solid #eee; padding: 8px 10px; text-align: left; }
  th { background: #faf7f2; font-size: 11.5px; color: #666; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .status { font-weight: 600; }
  .status-confirmed { color: #0c8a5a; }
  .status-pending { color: #b46a00; }
  .status-noreward { color: #8a8a8a; }
  .status-undetermined { color: #5b6b7c; }
  .foot { margin-top: 16px; font-size: 11px; color: #999; }
  @media print { body { margin: 12mm; } .noprint { display: none; } button { display: none; } }
</style></head><body>
  <h1>稼働履歴</h1>
  <div class="sub">${esc(data.memberName)} ／ ${esc(data.periodLabel)}</div>
  <div class="summary">
    <div class="card"><div class="label">活動件数</div><div class="value">${data.summary.count}件</div></div>
    <div class="card"><div class="label">総稼働時間</div><div class="value">${data.summary.totalHours.toFixed(1)}h</div></div>
    <div class="card"><div class="label">確定報酬</div><div class="value">${yen(data.summary.confirmedAmount)}</div></div>
    <div class="card"><div class="label">承認待ち報酬</div><div class="value">${yen(data.summary.pendingAmount)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>日付</th><th>活動内容</th><th>種別</th>
      <th class="num">稼働</th><th class="num">報酬</th><th>状態</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="color:#999">この期間の活動はありません。</td></tr>`}</tbody>
  </table>
  <div class="foot">発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
