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
