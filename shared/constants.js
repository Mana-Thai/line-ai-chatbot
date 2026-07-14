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
        MAX_QTY: 999,
        MAX_NOTE_LENGTH: 500,
    };
});
