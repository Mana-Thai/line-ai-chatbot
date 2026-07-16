---
name: roblox-game-dev
description: Robloxのゲームを作るときの開発手順とルール。「Roblox」「ロブロックス」「Robloxでゲームを作りたい」のタスクで使う。企画の整理、Luauスクリプトの開発フロー(小規模=コピペ方式/本格=Rojo同期)、スクリプトの配置場所、サーバー権威の設計ルール、Studioでのテスト、公開設定までをまとめたもの。
---

# Robloxゲーム開発の進め方

前提: **Roblox Studio(Windows/Mac用アプリ)を操作するのはユーザー本人**。
Claude/Codexはリポジトリ側でLuauスクリプト・手順書・設定ファイルを作り、
ユーザーがStudioに取り込む分業で進める。「Studioでこう操作してください」の指示は
1ステップずつ具体的に書くこと。

## 最初に決めること(ユーザーに確認)

1. **ジャンルとコアループ**: 30秒で説明できる遊びの1周(例: 障害物を避けてゴール→報酬→次のステージ)
2. **1人用か複数人用か**: 複数人ならサーバー同期の設計が最初から必要
3. **勝敗・終了条件とスコア**
4. **操作**: PC(WASD+マウス)だけか、スマホ(タッチ)でも遊ばせるか

## 開発フローの2択

### A) コピペ方式(まずはこれ。小規模・スクリプト数本まで)

1. リポジトリに `src/` を作り、スクリプトを1ファイル=1つの Script として書く
2. 各ファイルの冒頭コメントに**配置場所と種類**を明記する
   (例: `-- ServerScriptService に Script として配置`)
3. ユーザーへの手順書(どこで右クリック→何をInsertして貼るか)を添える

### B) Rojo同期方式(本格開発・スクリプトが増えたら)

[Rojo](https://rojo.space/) でリポジトリのファイルをStudioへ自動同期する。
`default.project.json` で `src/server` → ServerScriptService などの対応を定義し、
PC側で `rojo serve`、Studio側でRojoプラグインからConnect。
gitで履歴管理でき、Claude/Codexが直接編集→即Studioに反映される。
導入はユーザーのPC作業(Rojoのインストール+Studioプラグイン)が必要なので、
コピペ方式が窮屈になってから提案する。

## スクリプトの配置ルール(どこに何を置くか)

| 場所 | 種類 | 用途 |
|---|---|---|
| `ServerScriptService` | Script | サーバー処理(スコア確定・当たり判定の確定・保存) |
| `StarterPlayer/StarterPlayerScripts` | LocalScript | クライアント処理(入力・カメラ・演出) |
| `ReplicatedStorage` | ModuleScript / RemoteEvent | 共有定数・共有ロジック・クライアント⇄サーバー通信路 |
| `StarterGui` | ScreenGui + LocalScript | UI |
| `ServerStorage` | — | クライアントに見せないサーバー専用の素材・テンプレート |

## 設計ルール(必ず守る)

1. **サーバー権威**: スコア・所持金・アイテム付与・勝敗の確定は必ずサーバー側で行う。
   クライアントは「操作の申告」だけ(`webapp-access-control` と同じ思想。
   クライアントのLocalScriptは改造される前提で書く)
2. **RemoteEventの引数は必ずサーバーで検証**: 型・範囲・頻度(連打)・
   「そのプレイヤーにその操作の権利があるか」をチェックしてから反映する
3. Luauの基本: 変数は `local`、サービスは `game:GetService("...")` で取得、
   イベント接続は `:Connect()`。プレイヤー退出時の後片付け(`PlayerRemoving`)を忘れない
4. データ保存が必要なら `DataStoreService`(呼び出し回数制限があるので
   退出時+定期保存にまとめる。Studioでのテストは Game Settings → Security →
   「Enable Studio Access to API Services」をON)

## テスト(Studioでユーザーに依頼する)

- **1人プレイ**: F5(Play)で開始。動作・エラーは「表示 → 出力」ウィンドウで確認
  (エラーの赤文字はコピーしてClaudeに貼ってもらう)
- **複数人**: 「テスト」タブ → Clients and Servers → Players: 2〜3 → Start。
  確認項目: 途中参加/退出でエラーが出ないか、スコア等が全員に同期されるか、
  リスポーン後も状態が正しいか
- Claude側でできること: Luauの文法・ロジックの机上確認、手順書の整備。
  実行確認は必ずStudioで行う

## 公開と仲間との共有

1. ファイル → 「Robloxに公開」で保存(初回はゲーム名・説明を設定)
2. ホーム → Game Settings: アイコン・説明、**年齢に関するアンケート**(公開に必須)に回答
3. 公開範囲: Game Settings → Permissions → 「公開」にするとURL/ゲームページから誰でも参加可能。
   Robloxには「URLを知っている人だけ」の限定公開は無い(非公開は自分と共同編集者のみ)ので、
   仲間と遊ぶ段階になったら「公開」にしてゲームページのURLをLINEで共有する
4. 更新は Studio から再公開するだけ(即反映)

## 素材(Toolbox)の注意

- Toolboxの無料モデルには**悪意あるスクリプトが仕込まれていることがある**。
  モデルを入れたら中の Script/LocalScript を展開して確認し、不要なスクリプトは削除する
- 音楽・画像は権利に注意(Robloxの審査で消されることがある)。公式カタログの音源が安全
