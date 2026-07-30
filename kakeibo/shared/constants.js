// 家計簿アプリの定義(サーバー/ブラウザ共用)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.KAKEIBO_CONSTANTS = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // カテゴリは移行元のGoogleスプレッドシートの列名をそのまま使う(英語名で運用継続)
    const INCOME_CATEGORIES = ['Salary', 'Allowance', 'RYUSEI', 'Investment', 'Adjust'];
    const EXPENSE_CATEGORIES = [
        'Food', 'Alcohol', 'Car (C)', 'Car (P)', 'Mobile', 'Apartment', 'Consumables',
        'Health', 'Exercise', 'Study', 'Utilities', 'Clothes', 'Entertainment',
        'Family', 'Pet', 'Investment', 'Cooperation', 'Debt', 'Adjust',
    ];

    return {
        CURRENCY: 'THB',
        INCOME_CATEGORIES,
        EXPENSE_CATEGORIES,
        // 残高照合で差額を埋めるための専用カテゴリ(スプレッドシートのAdjust列に相当)
        ADJUST_CATEGORY: 'Adjust',
        // 現金クイック入力で大ボタンにするカテゴリ(使用頻度順)
        QUICK_EXPENSE_CATEGORIES: ['Food', 'Alcohol', 'Consumables', 'Car (P)', 'Entertainment', 'Health'],

        // 画面表示用の日本語ラベル(カテゴリ名自体は英語のまま保存する)
        CATEGORY_LABELS_JA: {
            Salary: '給料',
            Allowance: '手当',
            RYUSEI: 'RYUSEI',
            Investment: '投資',
            Food: '食費',
            Alcohol: '酒',
            'Car (C)': '車(C)',
            'Car (P)': '車(P)',
            Mobile: '携帯',
            Apartment: '家賃',
            Consumables: '日用品',
            Health: '医療',
            Exercise: '運動',
            Study: '学習',
            Utilities: '光熱費',
            Clothes: '衣類',
            Entertainment: '娯楽',
            Family: '家族',
            Pet: 'ペット',
            Cooperation: '交際費',
            Debt: '貸借',
            Adjust: '残高調整',
        },

        // 取引の入力元
        SOURCES: ['cash', 'screenshot', 'text', 'bot', 'adjust'],
        SOURCE_LABELS_JA: {
            cash: '現金',
            screenshot: 'スクショ',
            text: '通知テキスト',
            bot: 'LINE Bot',
            adjust: '残高調整',
        },

        TYPES: ['income', 'expense'],

        MAX_AMOUNT: 100000000,
        MAX_MEMO_LENGTH: 200,
        MAX_TEXT_LENGTH: 4000,
        MAX_CATEGORY_LENGTH: 40,
        MAX_NAME_LENGTH: 100,
        MAX_IMAGES_PER_REQUEST: 10,
        MAX_IMAGE_DATAURL_LENGTH: 1500000, // 約1.1MB(フロントで縮小してから送る)
        MAX_ACCOUNTS: 10,

        // 残高照合で「差額なし」とみなす許容誤差(バーツ)
        BALANCE_EPSILON: 0.01,

        // タイ語の銀行名 → 略称(相手口座の表示用)
        BANK_SHORT_NAMES: {
            'ไทยพาณิชย์': 'SCB',
            'ออมสิน': 'GSB',
            'กสิกรไทย': 'KBank',
            'กรุงเทพ': 'BBL',
            'กรุงไทย': 'KTB',
            'กรุงศรีอยุธยา': 'BAY',
            'ทหารไทยธนชาต': 'TTB',
            'ธนชาต': 'TBank',
            'ยูโอบี': 'UOB',
            'ซีไอเอ็มบี': 'CIMB',
            'เกียรตินาคินภัทร': 'KKP',
            'ทิสโก้': 'TISCO',
            'พร้อมเพย์': 'PromptPay',
        },
    };
});
