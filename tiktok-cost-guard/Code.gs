/**
 * Code.gs — TikTok LIVE Cost Guard(メイン)
 *
 * 無料構成:Google Apps Script + Google Sheets のみ。サーバー・DB不要。
 *
 * できること(Phase 0):
 *   - ライブ配信中に「広告費・注文数・GMV(累計)」を手入力
 *   - CPA・損益分岐CPA・ROI を自動計算し、緑/黄/赤で判定(Rules.gs)
 *   - すべて Google Sheets に記録(設定/LIVE/判定/通知)
 *   - 5分ごとの監視トリガーで、赤のまま放置されたLIVEを検知
 *
 * 後から追加(Phase 1+):LINE通知(Notifications.gs)、TikTok API連携(TikTok.gs)
 *
 * 最初に一度だけ setupSystem() を実行してください。
 */

var SPREADSHEET_NAME = 'TikTok LIVE Cost Guard';
var PROP_SHEET_ID = 'COST_GUARD_SHEET_ID';

var SHEETS = {
  SETTINGS: 'SETTINGS',
  SESSIONS: 'LIVE_SESSIONS',
  METRICS: 'METRICS',
  DECISIONS: 'DECISIONS',
  ALERTS: 'ALERT_LOG',
  DASHBOARD: 'DASHBOARD'
};

var HEADERS = {
  SETTINGS: ['key', 'value', 'help'],
  SESSIONS: ['session_id', 'name', 'started_at', 'ended_at', 'status'],
  METRICS: ['timestamp', 'session_id', 'ad_cost', 'orders', 'gmv', 'cpa', 'roi'],
  DECISIONS: ['timestamp', 'session_id', 'cpa', 'breakeven_cpa', 'status', 'title', 'reason'],
  ALERTS: ['timestamp', 'session_id', 'channel', 'status', 'message', 'sent_ok'],
  DASHBOARD: ['key', 'value']
};

/* ============================================================
 * 1. 初期設定(最初に一度だけ実行)
 * ========================================================== */
function setupSystem() {
  var ss = getOrCreateSpreadsheet_();

  ensureSheet_(ss, SHEETS.SETTINGS, HEADERS.SETTINGS);
  ensureSheet_(ss, SHEETS.SESSIONS, HEADERS.SESSIONS);
  ensureSheet_(ss, SHEETS.METRICS, HEADERS.METRICS);
  ensureSheet_(ss, SHEETS.DECISIONS, HEADERS.DECISIONS);
  ensureSheet_(ss, SHEETS.ALERTS, HEADERS.ALERTS);
  ensureSheet_(ss, SHEETS.DASHBOARD, HEADERS.DASHBOARD);

  seedSettings_(ss);
  installMonitorTrigger_();

  // 使わない初期シート「シート1 / Sheet1」を掃除
  var extra = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (extra && ss.getSheets().length > 1) ss.deleteSheet(extra);

  var url = ss.getUrl();
  Logger.log('✅ セットアップ完了');
  Logger.log('スプレッドシート: ' + url);
  Logger.log('5分ごとの監視トリガーを登録しました。');
  return url;
}

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 消された等 → 作り直す */ }
  }
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty(PROP_SHEET_ID, ss.getId());
  return ss;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var needHeader = first.join('') === '';
  if (needHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function seedSettings_(ss) {
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  var existing = {};
  var last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { existing[r[0]] = true; });
  }
  var rows = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!existing[k]) rows.push([k, DEFAULT_SETTINGS[k], SETTINGS_HELP[k] || '']);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

function installMonitorTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'monitorTick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monitorTick').timeBased().everyMinutes(5).create();
}

/* ============================================================
 * 2. Webアプリ(スマホから使う画面)
 * ========================================================== */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('TikTok LIVE Cost Guard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================================================
 * 3. 画面から呼ぶ関数(google.script.run 経由)
 * ========================================================== */

/** 設定 + 進行中LIVE を返す(画面の初期表示用) */
function getConfig() {
  var s = getSettings_();
  return { settings: s, active: getActiveSession_(), currency: s.CURRENCY || 'THB' };
}

/** 設定を保存 */
function saveSettings(obj) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  var last = sh.getLastRow();
  var map = {};
  if (last > 1) {
    var rng = sh.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < rng.length; i++) map[rng[i][0]] = 2 + i;
  }
  Object.keys(obj).forEach(function (k) {
    if (map[k]) {
      sh.getRange(map[k], 2).setValue(obj[k]);
    } else {
      sh.appendRow([k, obj[k], SETTINGS_HELP[k] || '']);
    }
  });
  return getSettings_();
}

/** LIVE開始 */
function startLive(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.SESSIONS);
  // 既存の開きっぱなしを閉じる(1本だけ運用)
  var active = getActiveSession_();
  if (active) closeSession_(active.session_id);
  var id = 'L' + Utilities.formatDate(new Date(), tz_(), 'yyMMdd-HHmmss');
  sh.appendRow([id, name || 'LIVE', new Date(), '', 'OPEN']);
  updateDashboard_({ 'アクティブLIVE': name || 'LIVE', 'session_id': id, '状態': '開始' });
  return { session_id: id, name: name || 'LIVE' };
}

/** 累計値を記録して判定 */
function recordMetrics(sessionId, adCost, orders, gmv) {
  var ss = getSpreadsheet_();
  var s = getSettings_();
  var m = { adCost: adCost, orders: orders, gmv: gmv };
  var ev = evaluate(m, s);

  var now = new Date();
  ss.getSheetByName(SHEETS.METRICS).appendRow(
    [now, sessionId, ev.adCost, ev.orders, ev.gmv, ev.cpa, ev.roi]);
  ss.getSheetByName(SHEETS.DECISIONS).appendRow(
    [now, sessionId, ev.cpa, ev.breakevenCpa, ev.status, ev.title, ev.reason]);

  updateDashboard_({
    '最終更新': Utilities.formatDate(now, tz_(), 'HH:mm:ss'),
    '状態': ev.title + ' / ' + ev.titleTh,
    'CPA': ev.cpa, '損益分岐CPA': ev.breakevenCpa, 'ROI': ev.roi,
    '広告費': ev.adCost, '注文数': ev.orders, 'GMV': ev.gmv
  });

  // 赤なら通知(LINE未設定でもログには残る)
  if (ev.status === 'red') {
    try { sendAlert_(sessionId, ev, s); } catch (e) { Logger.log('alert error: ' + e); }
  }
  return ev;
}

/** LIVE終了 */
function endLive(sessionId) {
  closeSession_(sessionId);
  updateDashboard_({ '状態': '終了', 'アクティブLIVE': '(なし)' });
  return { ok: true };
}

/** 直近の判定履歴(画面表示用) */
function getRecentDecisions(sessionId, limit) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.DECISIONS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var n = Math.min(last - 1, 200);
  var rows = sh.getRange(last - n + 1, 1, n, HEADERS.DECISIONS.length).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    if (sessionId && rows[i][1] !== sessionId) continue;
    out.push({
      time: Utilities.formatDate(new Date(rows[i][0]), tz_(), 'HH:mm:ss'),
      cpa: rows[i][2], breakeven: rows[i][3], status: rows[i][4], title: rows[i][5]
    });
    if (out.length >= (limit || 8)) break;
  }
  return out;
}

/* ============================================================
 * 4. 5分ごとの監視(トリガー)
 * ========================================================== */
function monitorTick() {
  var active = getActiveSession_();
  if (!active) return;

  // TikTok API が設定済みなら自動取得して記録(未設定なら何もしない)
  try {
    var auto = fetchLiveMetrics(getSettings_());
    if (auto && auto.configured) {
      recordMetrics(active.session_id, auto.adCost, auto.orders, auto.gmv);
      return;
    }
  } catch (e) { Logger.log('tiktok fetch skipped: ' + e); }

  // 手入力運用時:最後の判定が赤のまま10分以上放置なら再通知
  var last = lastDecision_(active.session_id);
  if (last && last.status === 'red') {
    var ageMin = (Date.now() - new Date(last.time).getTime()) / 60000;
    if (ageMin >= 10 && !alertedRecently_(active.session_id, 15)) {
      var s = getSettings_();
      var ev = { status: 'red', title: last.title, titleTh: 'ยังแดงอยู่',
        reason: '赤のまま ' + Math.round(ageMin) + ' 分経過。対応してください。',
        actionTh: 'ยังไม่ได้แก้ กรุณาตรวจสอบ', cpa: last.cpa, breakevenCpa: last.breakeven };
      try { sendAlert_(active.session_id, ev, s); } catch (e2) { Logger.log(e2); }
    }
  }
}

/* ============================================================
 * 5. 内部ヘルパー
 * ========================================================== */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('先に setupSystem を実行してください。');
  return SpreadsheetApp.openById(id);
}

function getSettings_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.SETTINGS);
  var s = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { s[k] = DEFAULT_SETTINGS[k]; });
  var last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
      if (r[0] !== '') s[r[0]] = r[1];
    });
  }
  return s;
}

function getActiveSession_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.SESSIONS);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var rows = sh.getRange(2, 1, last - 1, HEADERS.SESSIONS.length).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][4] === 'OPEN') {
      return { session_id: rows[i][0], name: rows[i][1], started_at: rows[i][2] };
    }
  }
  return null;
}

function closeSession_(sessionId) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.SESSIONS);
  var last = sh.getLastRow();
  if (last < 2) return;
  var rows = sh.getRange(2, 1, last - 1, HEADERS.SESSIONS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === sessionId && rows[i][4] === 'OPEN') {
      sh.getRange(2 + i, 4).setValue(new Date());
      sh.getRange(2 + i, 5).setValue('CLOSED');
      return;
    }
  }
}

function lastDecision_(sessionId) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.DECISIONS);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var n = Math.min(last - 1, 100);
  var rows = sh.getRange(last - n + 1, 1, n, HEADERS.DECISIONS.length).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === sessionId) {
      return { time: rows[i][0], cpa: rows[i][2], breakeven: rows[i][3], status: rows[i][4], title: rows[i][5] };
    }
  }
  return null;
}

function updateDashboard_(kv) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEETS.DASHBOARD);
  var last = sh.getLastRow();
  var map = {};
  if (last > 1) {
    var rows = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) map[rows[i][0]] = 2 + i;
  }
  Object.keys(kv).forEach(function (k) {
    if (map[k]) sh.getRange(map[k], 2).setValue(kv[k]);
    else sh.appendRow([k, kv[k]]);
  });
}

function tz_() {
  return Session.getScriptTimeZone() || 'Asia/Bangkok';
}
