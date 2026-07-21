/**
 * Notifications.gs — 通知(赤判定のとき)
 *
 * Phase 0:通知は ALERT_LOG シートに必ず記録される(LINE未設定でも動く)。
 * Phase 1:スクリプトプロパティに LINE の資格情報を入れると、LINEにも push される。
 *
 * ▼ LINEを有効にする手順(後で):
 *   プロジェクトの設定 → スクリプト プロパティ に以下を追加
 *     LINE_CHANNEL_TOKEN … LINE Messaging API のチャネルアクセストークン(長期)
 *     LINE_TO            … 送信先の userId / groupId
 *   ※ 旧「LINE Notify」は 2025年に終了したため Messaging API を使う。
 *      Messaging API の push は無料枠あり(月の無料通数の範囲内)。
 */

/** 赤判定などをアラートとして送る(内部から呼ぶ)。LINE未設定でもログには残す。 */
function sendAlert_(sessionId, ev, s) {
  var msg = buildAlertMessage_(ev, s);
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_TOKEN');
  var to = props.getProperty('LINE_TO');

  var sentOk = false;
  var channel = 'log';
  if (token && to) {
    channel = 'line';
    sentOk = pushLine_(token, to, msg);
  }
  logAlert_(sessionId, channel, ev.status, msg, sentOk);
  return { channel: channel, sentOk: sentOk, message: msg };
}

/** 通知本文(日タイ併記) */
function buildAlertMessage_(ev, s) {
  var cur = (s && s.CURRENCY) ? s.CURRENCY : 'THB';
  var lines = [
    '🔴 ' + (ev.title || 'コスト警告') + ' / ' + (ev.titleTh || ''),
    'CPA: ' + fmt_(ev.cpa) + ' ' + cur + '  (損益分岐: ' + fmt_(ev.breakevenCpa) + ' ' + cur + ')',
    '広告費: ' + fmt_(ev.adCost) + ' / 注文: ' + fmt_(ev.orders) + ' / GMV: ' + fmt_(ev.gmv),
    '👉 ' + (ev.reason || ''),
    '👉 ' + (ev.actionTh || 'สร้างแคมเปญใหม่')
  ];
  return lines.join('\n');
}

/** LINE Messaging API で push。成功で true。 */
function pushLine_(token, to, text) {
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code !== 200) Logger.log('LINE push failed ' + code + ': ' + res.getContentText());
    return code === 200;
  } catch (e) {
    Logger.log('LINE push error: ' + e);
    return false;
  }
}

function logAlert_(sessionId, channel, status, message, sentOk) {
  var ss = getSpreadsheet_();
  ss.getSheetByName(SHEETS.ALERTS)
    .appendRow([new Date(), sessionId, channel, status, message, sentOk ? 'OK' : '']);
}

/** 直近 minutes 分以内にこのセッションでアラート送信済みか(重複通知の抑制)。 */
function alertedRecently_(sessionId, minutes) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.ALERTS);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var n = Math.min(last - 1, 50);
  var rows = sh.getRange(last - n + 1, 1, n, HEADERS.ALERTS.length).getValues();
  var cutoff = Date.now() - minutes * 60000;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === sessionId && new Date(rows[i][0]).getTime() >= cutoff) return true;
  }
  return false;
}

function fmt_(n) {
  if (n === null || n === undefined || n === '') return '-';
  var x = Math.round(Number(n) * 100) / 100;
  return isNaN(x) ? '-' : String(x);
}

/* ============================================================
 * LINE webhook(通知先IDの自動取得)
 *
 * Botをグループに入れる/友だち追加する/何か送ると、その source ID を
 * LINE_IDS シートに記録し、LINE_TO が未設定なら自動でそれに設定する。
 * これで「通知先IDを手で調べる」作業が不要になる。
 *
 * ※ Webアプリを「アクセス=全員」で(再)デプロイし、その /exec URL を
 *   LINE Developers の Webhook URL に設定する必要がある(READMEのPhase 1参照)。
 * ========================================================== */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(function (ev) {
      var src = ev.source || {};
      var id = src.groupId || src.roomId || src.userId || '';
      var type = src.type || '';
      if (!id) return;
      recordLineId_(type, id, JSON.stringify(src));
      var autoset = maybeAutoSetLineTo_(id);
      if (ev.replyToken) {
        replyLine_(ev.replyToken,
          '✅ 通知先として登録しました / ตั้งเป็นปลายทางแจ้งเตือนแล้ว\n' +
          (autoset ? '(自動設定 / ตั้งอัตโนมัติ)\n' : '') + id);
      }
    });
  } catch (err) {
    Logger.log('doPost error: ' + err);
  }
  return ContentService.createTextOutput('OK'); // LINEには常に200を返す
}

/** LINE_IDS シートに記録(同じIDは1回だけ)。 */
function recordLineId_(type, id, raw) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.LINE_IDS);
  if (!sh) sh = ensureSheet_(ss, SHEETS.LINE_IDS, HEADERS.LINE_IDS);
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 3, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return; // 既出
  }
  sh.appendRow([new Date(), type, id, raw]);
}

/** LINE_TO が未設定なら、来たIDを通知先に自動設定。設定したら true。 */
function maybeAutoSetLineTo_(id) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LINE_TO')) return false;
  props.setProperty('LINE_TO', id);
  return true;
}

/** replyToken を使って即時返信(登録確認用)。 */
function replyLine_(replyToken, text) {
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
  if (!token) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { Logger.log('replyLine error: ' + e); return false; }
}

/* ============================================================
 * 手動で叩く確認用の関数(Apps Scriptエディタから実行)
 * ========================================================== */

/** LINE設定の状態をログに出す。 */
function showLineConfig() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('LINE_CHANNEL_TOKEN: ' + (p.getProperty('LINE_CHANNEL_TOKEN') ? '設定済み ✅' : '未設定 ❌'));
  Logger.log('LINE_TO: ' + (p.getProperty('LINE_TO') || '未設定 ❌(Botを友だち追加/グループ招待すると自動登録)'));
}

/** テスト通知を送る(赤アラートの体裁で1通)。LINE未設定ならログのみ。 */
function testLineAlert() {
  var s = getSettings_();
  var ev = {
    status: 'red', title: 'テスト通知', titleTh: 'ทดสอบการแจ้งเตือน',
    cpa: 20, breakevenCpa: 15, adCost: 100, orders: 5, gmv: 550,
    reason: 'これはテストです。実際の判定ではありません。', actionTh: 'นี่คือการทดสอบ'
  };
  var r = sendAlert_('TEST', ev, s);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
