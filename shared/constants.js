// 注文アプリの選択肢定義(サーバー/ブラウザ共用)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.APP_CONSTANTS = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    return {
        CHEST_LOGOS: ['有(白)', '有(カラー)', '無'],
        BACK_PRINTS: ['有', '無'],
        SIZES: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
        COLORS: [
            '1.BK', '2.NB', '3.GY', '4.WH', '5.BL',
            '6.LB', '7.CS', '8.RD', '9.OR', '10.YL',
            '11.DG', '12.LG', '13.PU', '14.PK', '15.GD',
            '16.FY', '17.SP', '18.OV', '19.RS', '20.MT',
            '持ち込み',
        ],
        BRING_OWN: '持ち込み',
        MAX_QTY: 999,
        MAX_NOTE_LENGTH: 500,
        MAX_ITEMS: 20,
        MAX_PLATES: 30,

        // スクリーン工賃の5種類(胸ロゴ×バックプリントの組み合わせ)
        LABOR_COMBOS: [
            { key: 'whiteBp', chestLogo: '有(白)', backPrint: '有', label: '白ロゴ+バックプリント' },
            { key: 'colorBp', chestLogo: '有(カラー)', backPrint: '有', label: 'カラーロゴ+バックプリント' },
            { key: 'noneBp', chestLogo: '無', backPrint: '有', label: 'ロゴ無+バックプリント' },
            { key: 'whiteNoBp', chestLogo: '有(白)', backPrint: '無', label: '白ロゴ+バックプリント無' },
            { key: 'colorNoBp', chestLogo: '有(カラー)', backPrint: '無', label: 'カラーロゴ+バックプリント無' },
        ],

        // CSV出力用 日本語→タイ語辞書(固定文言のみ。名前・備考は原文のまま)
        TH: {
            '名前': 'ชื่อ',
            '胸ロゴ': 'โลโก้หน้าอก',
            'バックプリント': 'สกรีนหลัง',
            'サイズ': 'ไซซ์',
            'カラー': 'สี',
            '数量': 'จำนวน',
            '単価': 'ราคาต่อตัว',
            '金額': 'จำนวนเงิน',
            '備考': 'หมายเหตุ',
            '入力者': 'ผู้กรอกข้อมูล',
            '更新日時': 'วันที่อัปเดต',
            '有(白)': 'มี (สีขาว)',
            '有(カラー)': 'มี (หลายสี)',
            '有': 'มี',
            '無': 'ไม่มี',
            '持ち込み': 'นำมาเอง',
            '合計': 'รวม',
            '受け渡し': 'การรับสินค้า',
            '済': 'รับแล้ว',
            '未': 'ยังไม่รับ',
            '確認者': 'ผู้ยืนยัน',
        },
    };
});
