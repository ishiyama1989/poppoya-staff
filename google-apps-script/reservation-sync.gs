/**
 * ねっぱん！の予約通知メールを Gmail から読み取り、poppoya-staff に登録する。
 * 添付画像はGoogleドライブの文字認識（OCR）で文字に起こして本文に連結する。
 * Googleアカウントがあれば無料で動作し、外部のメール受信サービスは不要。
 *
 * ===== セットアップ =====
 * 1. https://script.google.com で新しいプロジェクトを作り、このファイルの内容を貼り付ける
 * 2. 左メニュー「サービス」＋ →「Drive API」を追加（画像の文字認識に必要）
 * 3. 左メニュー「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加:
 *      ENDPOINT_URL … Supabaseの receive-reservation-mail 関数のURL
 *      INBOUND_TOKEN … Supabase側に設定した合言葉（設定していなければ空でよい）
 *      SEARCH_QUERY  … 予約通知メールを絞り込むGmail検索条件
 *                      例: from:neppan.com  /  subject:予約
 * 4. 関数 syncReservations を一度手動実行し、権限を承認する
 * 5. 左メニュー「トリガー」→ syncReservations を「時間主導型・15分おき」で登録する
 */

// 処理済みのメールに付けるラベル。同じメールを二重に登録しないための目印。
var PROCESSED_LABEL = 'poppoya-登録済み';

// 1回の実行で処理するメールの上限（実行時間切れを避けるため）
var MAX_THREADS_PER_RUN = 20;

function syncReservations() {
  var props = PropertiesService.getScriptProperties();
  var endpointUrl = props.getProperty('ENDPOINT_URL');
  var inboundToken = props.getProperty('INBOUND_TOKEN') || '';
  var searchQuery = props.getProperty('SEARCH_QUERY');

  if (!endpointUrl) throw new Error('スクリプトプロパティ ENDPOINT_URL が未設定です');
  if (!searchQuery) throw new Error('スクリプトプロパティ SEARCH_QUERY が未設定です');

  var label = getOrCreateLabel_(PROCESSED_LABEL);

  // 未処理（ラベルなし）のメールだけを対象にする
  var query = searchQuery + ' -label:"' + PROCESSED_LABEL + '"';
  var threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);

  var sent = 0;
  var failed = 0;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();
    var threadOk = true;

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var text = buildMailText_(message);
      if (!text) continue;

      // 送信元と件名も送る（どの予約サイトからの通知か判定するため）
      var meta = { from: message.getFrom(), subject: message.getSubject() };

      if (postToEndpoint_(endpointUrl, inboundToken, text, meta)) {
        sent++;
      } else {
        failed++;
        threadOk = false; // 失敗したメールは次回また処理できるようラベルを付けない
      }
    }

    if (threadOk) thread.addLabel(label);
  }

  Logger.log('送信: ' + sent + '件 / 失敗: ' + failed + '件');
}

/** メール1通から、本文と画像の文字起こしを連結したテキストを作る */
function buildMailText_(message) {
  var parts = [];

  var body = message.getPlainBody();
  if (body) parts.push(body);

  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    var attachment = attachments[i];
    if (!isImage_(attachment.getContentType())) continue;

    var ocrText = imageToText_(attachment);
    if (ocrText) parts.push('----- 添付画像の読み取り結果 -----\n' + ocrText);
  }

  return parts.join('\n\n');
}

function isImage_(contentType) {
  return contentType === 'image/png' ||
    contentType === 'image/jpeg' ||
    contentType === 'image/gif' ||
    contentType === 'image/bmp';
}

/**
 * 画像をGoogleドライブに一時アップロードして文字認識にかけ、テキストを取り出す。
 * 読み取り後の一時ファイルは必ず削除する。
 */
function imageToText_(blob) {
  var tempFile = null;
  try {
    // convert:true でGoogleドキュメント化し、ocr:true で画像内の文字を読み取らせる
    tempFile = Drive.Files.insert(
      { title: 'poppoya-ocr-' + Date.now() },
      blob,
      { convert: true, ocr: true, ocrLanguage: 'ja' }
    );
    return DocumentApp.openById(tempFile.id).getBody().getText();
  } catch (e) {
    Logger.log('画像の読み取りに失敗: ' + e);
    return '';
  } finally {
    if (tempFile && tempFile.id) {
      try {
        Drive.Files.remove(tempFile.id);
      } catch (e) {
        Logger.log('一時ファイルの削除に失敗: ' + e);
      }
    }
  }
}

/** Supabaseの関数へ送信。成功したらtrue */
function postToEndpoint_(endpointUrl, inboundToken, text, meta) {
  var url = endpointUrl;
  if (inboundToken) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(inboundToken);
  }

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      text: text,
      from: meta.from,
      subject: meta.subject
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var bodyText = response.getContentText();

  // 解析できなかった場合も200が返るため、中身のokまで確認する
  var ok = false;
  try {
    ok = code === 200 && JSON.parse(bodyText).ok === true;
  } catch (e) {
    ok = false;
  }

  if (!ok) Logger.log('登録できませんでした (HTTP ' + code + '): ' + bodyText);
  return ok;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
