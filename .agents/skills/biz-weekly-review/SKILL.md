---
name: biz-weekly-review
description: 副業の週次進捗レビュー。「今週のレビュー」「進捗確認」「目標に対してどう?」「週次チェック」のタスクで、週1回実行する。受注台帳(business/orders.csv)と収入プラン(business/income-plan.md)のマイルストーンを突き合わせ、納期・未入金・累計売上・目標乖離を1枚のレポートにし、遅れているときの対処(露出強化→単価見直しの順)まで判断する。
---

# 週次進捗レビュー(income-plan.md の§6を定型化)

週1回実行し、**「今どこにいるか」「目標に間に合うか」「今週何をするか」**を1枚で出す。
日々の案件状況だけなら `biz-order-ledger` のレポートで足りる — このSkillは
**収入プランのマイルストーンとの突き合わせと対処判断**が目的。

## 1. レポートを出す

```bash
python3 - <<'EOF'
import csv, datetime
today = datetime.date.today()
JPY_PER_THB = 4.4  # 為替はざっくりでよい。大きく動いたら更新

# income-plan.md のマイルストーン(累計THB)
MILESTONES = [
    (datetime.date(2026, 8, 15),  10_000,  "1ヶ月目標"),
    (datetime.date(2026, 10, 15), 100_000, "3ヶ月目標"),
    (datetime.date(2027, 1, 15),  200_000, "6ヶ月目標"),
]

rows = [r for r in csv.DictReader(open("business/orders.csv", encoding="utf-8-sig"))
        if not r["id"].startswith("SAMPLE")]

def thb(r):
    amt = float(r["金額"])
    return amt if r["通貨"] == "THB" else amt / JPY_PER_THB

booked = [r for r in rows if r["ステータス"] != "キャンセル"]
total = sum(thb(r) for r in booked)
week_ago = today - datetime.timedelta(days=7)
this_week = [r for r in booked if r["受注日"] >= week_ago.isoformat()]

print(f"== 週次レビュー {today} ==")
print(f"今週の新規受注: {len(this_week)}件 / {sum(thb(r) for r in this_week):,.0f} THB相当")
print(f"累計受注額: {total:,.0f} THB相当({len(booked)}件)\n")

print("== 目標との差 ==")
for due, target, label in MILESTONES:
    days = (due - today).days
    if days < -30: continue
    gap = target - total
    status = "✅ 達成" if gap <= 0 else f"あと {gap:,.0f} THB(残り{days}日)"
    print(f"  {label}({due} / {target:,} THB): {status}")

print("\n== 要対応 ==")
for r in rows:
    if r["ステータス"] == "入金待ち":
        print(f"  💰 未入金: {r['id']} {r['顧客名']} {r['金額']} {r['通貨']}")
    elif r["ステータス"] not in ("完了", "キャンセル"):
        d = (datetime.date.fromisoformat(r["納期"]) - today).days
        if d <= 3:
            print(f"  ⚠️ 納期あと{d}日: {r['id']} {r['顧客名']} / {r['内容']}")
EOF
```

## 2. 判断する(レポートに必ず添える)

数字を出すだけで終えず、次の順で判断コメントを付ける:

1. **未入金が1週間以上** → リマインド送付を提案(`biz-customer-messages`)
2. **納期3日前以内の案件** → 今週の最優先タスクに指定
3. **目標ペース判定** — 残り日数と不足額から「週あたり必要受注額」を計算して示す
   (例: あと3万THB/残り6週 → 週5,000THB = 小口3件 or 中型案件0.5件ペース)
4. **遅れている場合の対処は必ずこの順**(`income-plan.md` §6):
   - ① 露出を増やす — 告知の頻度・媒体・文面を変える(`biz-promotion`)
   - ② 商品構成を見直す — 高単価(Webアプリ/`line-ai-bot`)への営業を増やす
   - ③ 単価を見直す — **安易な値下げはしない**。下げるなら「モニター価格」と理由を付ける
5. **前倒しで進んでいる場合** → 稼働時間を確認し、週20時間に張り付いていれば
   値上げまたはレテイナー化を検討(時間を増やす方向に逃げない)

## 3. 今週のアクションを3つ決める

レビューの締めとして、来週のレビューまでにやることを最大3つ、具体的に書く
(例:「母の日告知第2弾をFBグループ2つに投稿」「◯◯さんの店にBotデモを見せる」)。
前週のアクションの実施状況も先頭で振り返る。

## 注意

- 台帳が未更新だとレビューが無意味になる。レビュー前に `biz-order-ledger` の
  ルールで最新化してからコミットする
- 為替レート(スクリプト先頭の `JPY_PER_THB`)は月1回程度見直す
- マイルストーン自体を変えたいときは `business/income-plan.md` を先に更新し、
  スクリプトの `MILESTONES` を合わせる
