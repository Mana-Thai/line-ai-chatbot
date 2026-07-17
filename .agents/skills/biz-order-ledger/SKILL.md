---
name: biz-order-ledger
description: 副業の受注管理台帳(business/orders.csv)の運用。「受注を記録」「案件の状況」「納期の確認」「今月の売上」「入金チェック」のタスクで使う。ステータスの定義と更新ルール、納期・未入金・月間売上のレポート出力。新しい受注・状況変化があったら必ずこの台帳を更新する。
---

# 受注管理台帳(business/orders.csv)

すべての案件を1つのCSVで管理する。**受注・状況変化のたびに必ず更新してコミットする**
(リモートセッションはコミットしないと消える)。

## 列とステータス

```csv
id,受注日,顧客名,連絡先,サービス,内容,金額,通貨,納期,ステータス,メモ
```

- `id`: `GV-001`(ギフト動画)/ `AP-001`(アパレル)/ `WEB-001`(Web)のように種別+連番
- `サービス`: `gift-video` / `apparel` / `web`
- `通貨`: `JPY` / `THB`
- `ステータス`の流れ:

  ```
  見積中 → 制作中 → 確認待ち → 入金待ち → 完了
                     (透かしプレビュー送付)  (入金確認→本納品)
  途中終了は「キャンセル」(行は消さない)
  ```

## 更新ルール

- 見積提示と同時に「見積中」で行を追加(`biz-quote` Skill)
- ステータスが変わったら即更新。日付やメモに経緯を残す(「7/15 プレビュー送付」等)
- **行は削除しない**(キャンセルもステータス変更で残す。実績と振り返りに使う)
- 個人情報は最小限に: 連絡先はLINE表示名程度。住所・電話番号はこのCSVに書かない。
  リポジトリがprivateであることを前提にする(publicにする場合はこのファイルを分離する)

## レポート(状況確認)

「今の案件状況は?」と聞かれたらこれを実行して報告する:

```bash
python3 - <<'EOF'
import csv, datetime
today = datetime.date.today()
rows = list(csv.DictReader(open("business/orders.csv", encoding="utf-8-sig")))
active = [r for r in rows if r["ステータス"] not in ("完了", "キャンセル")]
print("== 進行中の案件 (納期順) ==")
for r in sorted(active, key=lambda r: r["納期"]):
    d = (datetime.date.fromisoformat(r["納期"]) - today).days
    mark = "⚠️ " if d <= 3 else "   "
    print(f"{mark}{r['納期']} (あと{d}日) [{r['ステータス']}] {r['id']} {r['顧客名']} / {r['内容']}")
print("\n== 入金待ち ==")
for r in rows:
    if r["ステータス"] == "入金待ち":
        print(f"   {r['id']} {r['顧客名']} {r['金額']} {r['通貨']}")
print("\n== 今月の受注額 (通貨別) ==")
totals = {}
for r in rows:
    if r["受注日"][:7] == today.strftime("%Y-%m") and r["ステータス"] != "キャンセル":
        totals[r["通貨"]] = totals.get(r["通貨"], 0) + float(r["金額"])
for cur, amt in totals.items():
    print(f"   {amt:,.0f} {cur}")
EOF
```

- 納期3日前以内の案件は⚠️付きで最優先に報告する
- 「入金待ち」が1週間以上続いていたらリマインドを提案する(`biz-customer-messages`)

## 注意(税務)

このCSVは受注管理用。確定申告等の正式な帳簿・税務判断は税理士・
各国の税務当局の案内に従うこと(JPY/THB両方の収入がある場合は特に)。
