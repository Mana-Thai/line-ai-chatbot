/**
 * Rules.gs — コスト判定エンジン(自動判定の心臓部)
 *
 * 入力(手入力またはTikTok API)の累計値から CPA・損益分岐CPA・ROI を計算し、
 * 緑 / 黄 / 赤 の3段階でライブ中の広告状況を判定する。
 *
 * すべての金額は THB(バーツ)、率は 0〜1 の小数(例: 40% = 0.40)。
 */

/** 設定シート(SETTINGS)の初期値。setupSystem 実行時に書き込まれる。 */
var DEFAULT_SETTINGS = {
  CPA_TARGET: 15,           // 目標CPA(注文1件あたり広告費の上限・バーツ)
  GROSS_MARGIN_RATE: 0.40,  // 粗利率(原価を除いた利益の割合)
  TIKTOK_FEE_RATE: 0.05,    // TikTok手数料率
  COUPON_RATE: 0.03,        // クーポン・割引の平均率
  NO_ORDER_COST_LIMIT: 80,  // 「無注文のまま」この広告費に達したら赤(バーツ)
  YELLOW_BUFFER_RATE: 0.15, // 損益分岐CPAのこの割合手前から黄で警告
  CURRENCY: 'THB'
};

/** 設定項目の説明(SETTINGS シートの3列目に出す。母親向けの日タイ併記)。 */
var SETTINGS_HELP = {
  CPA_TARGET: '目標CPA(注文1件あたり広告費の上限) / ต้นทุนต่อออเดอร์ที่ต้องการ (บาท)',
  GROSS_MARGIN_RATE: '粗利率 例:0.40=40% / อัตรากำไรขั้นต้น',
  TIKTOK_FEE_RATE: 'TikTok手数料率 例:0.05=5% / ค่าธรรมเนียม TikTok',
  COUPON_RATE: 'クーポン・割引の平均率 / ส่วนลด/คูปองเฉลี่ย',
  NO_ORDER_COST_LIMIT: '無注文のまま到達したら赤にする広告費 / ยิงแอดถึงยอดนี้แต่ยังไม่มีออเดอร์ = แดง',
  YELLOW_BUFFER_RATE: '損益分岐の手前どこから黄にするか 例:0.15 / เตือนสีเหลืองก่อนถึงจุดคุ้มทุน',
  CURRENCY: '通貨(表示用) / สกุลเงิน'
};

/**
 * コスト状況を判定する。
 * @param {Object} m  {adCost, orders, gmv} すべて累計値(数値)
 * @param {Object} s  設定オブジェクト(getSettings_ の戻り値)
 * @return {Object} 判定結果
 */
function evaluate(m, s) {
  var adCost = toNum_(m.adCost);
  var orders = Math.round(toNum_(m.orders));
  var gmv = toNum_(m.gmv);

  var marginRate = clamp01_(toNum_(s.GROSS_MARGIN_RATE))
    - clamp01_(toNum_(s.TIKTOK_FEE_RATE))
    - clamp01_(toNum_(s.COUPON_RATE));

  var aov = orders > 0 ? gmv / orders : 0;               // 平均注文単価
  var cpa = orders > 0 ? adCost / orders : null;          // 注文あたり広告費
  var roi = adCost > 0 ? gmv / adCost : null;             // 広告費に対する売上倍率
  var breakevenCpa = aov * marginRate;                    // これ以上のCPAは赤字
  var cpaTarget = toNum_(s.CPA_TARGET);
  var noOrderLimit = toNum_(s.NO_ORDER_COST_LIMIT);
  var yellowBuffer = clamp01_(toNum_(s.YELLOW_BUFFER_RATE));

  var res = {
    adCost: adCost, orders: orders, gmv: gmv,
    aov: round2_(aov), cpa: cpa === null ? null : round2_(cpa),
    roi: roi === null ? null : round2_(roi),
    breakevenCpa: round2_(breakevenCpa),
    marginRate: round2_(marginRate),
    status: 'green', level: 0,
    title: '', titleTh: '', reason: '', action: '', actionTh: '',
    color: '#1f9d55'
  };

  // --- 注文がまだ無い場合 ---
  if (orders <= 0) {
    if (adCost >= noOrderLimit && noOrderLimit > 0) {
      return set_(res, 'red', 2,
        '無注文のまま上限到達',
        'ยิงแอดถึงลิมิตแล้วแต่ยังไม่มีออเดอร์',
        '広告費 ' + money_(adCost, s) + ' を使って注文0件。ここで一度止めて新しいキャンペーンを作る。',
        'หยุดแคมเปญนี้ แล้วสร้างแคมเปญใหม่ทันที', '#e3342f');
    }
    if (adCost > 0) {
      return set_(res, 'yellow', 1,
        'まだ注文なし(監視中)',
        'ยังไม่มีออเดอร์ (กำลังเฝ้าดู)',
        '広告費 ' + money_(adCost, s) + '。上限 ' + money_(noOrderLimit, s) + ' までに注文が来るか様子見。',
        'รอดูว่าจะมีออเดอร์ก่อนถึงลิมิตไหม', '#f2a900');
    }
    return set_(res, 'green', 0,
      '開始待ち', 'พร้อมเริ่ม',
      'まだデータがありません。', 'ยังไม่มีข้อมูล', '#1f9d55');
  }

  // --- 注文がある場合:CPA で判定 ---
  var yellowLine = breakevenCpa > 0 ? breakevenCpa * (1 - yellowBuffer) : cpaTarget;

  if (breakevenCpa > 0 && cpa > breakevenCpa) {
    // 損益分岐を超過 = 1件売るごとに赤字
    return set_(res, 'red', 2,
      'CPAが赤字ライン超え',
      'ต้นทุนต่อออเดอร์เกินจุดคุ้มทุน',
      'CPA ' + money_(cpa, s) + ' > 損益分岐 ' + money_(breakevenCpa, s) +
        '。売るほど損。今すぐキャンペーンを作り直す。',
      'ขาดทุน! สร้างแคมเปญใหม่เดี๋ยวนี้', '#e3342f');
  }
  if (cpa > cpaTarget || cpa > yellowLine) {
    // 目標超過、または損益分岐の手前バッファに侵入
    return set_(res, 'yellow', 1,
      'CPAが目標を超過',
      'ต้นทุนต่อออเดอร์เกินเป้า',
      'CPA ' + money_(cpa, s) + ' が目標 ' + money_(cpaTarget, s) +
        ' を超過(赤字ライン ' + money_(breakevenCpa, s) + ')。入札が高いので作り直しを検討。',
      'ต้นทุนเริ่มสูง พิจารณาสร้างแคมเปญใหม่', '#f2a900');
  }
  // 目標内 = 良好
  return set_(res, 'green', 0,
    'コスト良好',
    'ต้นทุนดี กำไรงาม',
    'CPA ' + money_(cpa, s) + '(目標 ' + money_(cpaTarget, s) + '・赤字ライン ' + money_(breakevenCpa, s) +
      ')。ROI ' + (roi === null ? '-' : round2_(roi)) + '。このまま継続。',
    'ยิงแอดต่อได้เลย', '#1f9d55');
}

function set_(res, status, level, title, titleTh, reason, actionTh, color) {
  res.status = status; res.level = level;
  res.title = title; res.titleTh = titleTh;
  res.reason = reason; res.actionTh = actionTh;
  res.action = title; res.color = color;
  return res;
}

/* ---- 小さなユーティリティ ---- */
function toNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}
function clamp01_(n) { return Math.max(0, Math.min(1, n)); }
function round2_(n) { return Math.round(n * 100) / 100; }
function money_(n, s) {
  var cur = (s && s.CURRENCY) ? s.CURRENCY : 'THB';
  return round2_(n) + ' ' + cur;
}
