/**
 * TikTok.gs — TikTok 連携(Phase 2 以降のためのプレースホルダ)
 *
 * Phase 0/1 では使わない。設定が無ければ必ず {configured:false} を返すので、
 * monitorTick から呼ばれても何も起きない(手入力運用の邪魔をしない)。
 *
 * ▼ 将来ここでやること
 *   fetchLiveMetrics: GMV Max のレポートAPIから 広告費/注文数/GMV を取得
 *   createNewCampaign: しきい値超過時に LIVE GMV Max キャンペーンを作り直す
 *
 * ▼ 必要になるスクリプトプロパティ(プロジェクトの設定 → スクリプト プロパティ)
 *   TIKTOK_ACCESS_TOKEN … TikTok for Business のアクセストークン(OAuth)
 *   TIKTOK_ADVERTISER_ID … 広告主ID
 *   TIKTOK_STORE_ID      … TikTok Shop のストアID(GMV Max で必要)
 *
 * ▼ 注意(重要)
 *   - TikTok のレポートAPIには遅延がある(費用は最大11時間遅れることがある)。
 *     ライブ中の即時判定には手入力/半自動のほうが速い場合がある。
 *   - キャンペーンの自動作成は規約・アカウントリスクがあるため、
 *     まずは「通知だけ」→「ボタンで半自動」→「完全自動」の順に慎重に進める。
 *   - API v1.3 の gmv_max 系エンドポイントの利用には審査/認可が必要。
 */

var TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/**
 * ライブの最新指標を取得する。未設定なら {configured:false}。
 * @return {Object} {configured, adCost, orders, gmv} など
 */
function fetchLiveMetrics(s) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('TIKTOK_ACCESS_TOKEN');
  var advertiserId = p.getProperty('TIKTOK_ADVERTISER_ID');
  if (!token || !advertiserId) {
    return { configured: false };
  }

  // ─── ここから先は API 利用審査が通ってから実装する ───
  // 例(擬似コード):
  //   var url = TIKTOK_API_BASE + '/report/integrated/get/?' + query;
  //   var res = UrlFetchApp.fetch(url, {
  //     headers: { 'Access-Token': token }, muteHttpExceptions: true });
  //   var data = JSON.parse(res.getContentText());
  //   return { configured:true, adCost: ..., orders: ..., gmv: ... };
  //
  // 実装するまでは configured:false 相当で返し、手入力運用を壊さない。
  return { configured: false, note: 'TikTok API 未実装(手入力運用のまま)' };
}

/**
 * 新しい LIVE GMV Max キャンペーンを作成する(Phase 2)。
 * 現状は未実装。呼ばれても false を返すだけ。
 */
function createNewCampaign(s) {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TIKTOK_ACCESS_TOKEN')) return { ok: false, reason: 'not_configured' };
  // POST /gmv_max/campaign/create/ 等をここで実装(要:審査通過・ガードレール)
  return { ok: false, reason: 'not_implemented' };
}
