---
name: c-drive-cleanup
description: Windows の Cドライブの空き容量不足を解消するスキル。大容量ファイル・長期間使われていないファイルを分析し、ユーザーの承認を得たうえで Google Drive へ移動して空き容量を確保する。「Cドライブがいっぱい」「空き容量が足りない」「ディスク容量を空けたい」「Google Drive に退避したい」などの依頼で使用する。
---

# Cドライブ容量整理 & Google Drive 退避スキル

Cドライブを圧迫しているデータを分析し、「削除してよいもの」「Google Drive へ移動すべきもの」を分類・提案し、ユーザーの承認を得てから実行する。

## 絶対に守る安全ルール

1. **ユーザーの明示的な承認なしにファイルを移動・削除しない。** 分析結果を提示し、AskUserQuestion で対象を選んでもらってから実行する。
2. **以下のフォルダは絶対に対象にしない(参照のみ可):**
   - `C:\Windows`、`C:\Program Files`、`C:\Program Files (x86)`、`C:\ProgramData`
   - `C:\Users\<user>\AppData`(キャッシュ削除の例外は後述)
   - 隠し属性・システム属性のフォルダ(`$Recycle.Bin`、`System Volume Information` など)
   - OneDrive / Google Drive / Dropbox の同期フォルダ自体(二重移動を防ぐ)
   - 実行中のアプリのインストール先やプロジェクトの `node_modules` 等、動作に必要なもの
3. **移動は「コピー → 検証 → 削除」の順で行う。** コピー成功とサイズ・ハッシュの一致を確認するまで元ファイルを消さない。
4. 1回の実行で移動するのは承認された分だけ。承認範囲を勝手に広げない。
5. エラーが出たファイルはスキップして記録し、最後にまとめて報告する。

## フェーズ 1: 現状分析

PowerShell で以下を順に実行し、状況を把握する。

### 1-1. 空き容量の確認

```powershell
Get-PSDrive C | Select-Object @{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}}, @{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}
```

### 1-2. どのフォルダが容量を食っているか(第一階層)

```powershell
$targets = "$env:USERPROFILE\Documents","$env:USERPROFILE\Downloads","$env:USERPROFILE\Pictures","$env:USERPROFILE\Videos","$env:USERPROFILE\Music","$env:USERPROFILE\Desktop"
foreach ($t in $targets) {
  if (Test-Path $t) {
    $size = (Get-ChildItem $t -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Folder = $t; SizeGB = [math]::Round($size/1GB,2) }
  }
}
```

ユーザーフォルダ以外に大きなフォルダがないかも確認する(ゲーム、仮想マシン、動画編集素材などが `C:\` 直下にあるケースがある):

```powershell
Get-ChildItem C:\ -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notin 'Windows','Program Files','Program Files (x86)','ProgramData','Users','$Recycle.Bin' } |
  ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Folder = $_.FullName; SizeGB = [math]::Round($size/1GB,2) }
  } | Sort-Object SizeGB -Descending
```

### 1-3. 大容量ファイルの洗い出し(100MB 以上)

```powershell
Get-ChildItem "$env:USERPROFILE" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -gt 100MB -and $_.FullName -notmatch '\\AppData\\' } |
  Sort-Object Length -Descending | Select-Object -First 50 `
    @{n='SizeMB';e={[math]::Round($_.Length/1MB,0)}},
    @{n='LastAccess';e={$_.LastAccessTime.ToString('yyyy-MM-dd')}},
    FullName
```

### 1-4. 長期間アクセスされていないファイル(6ヶ月以上・10MB 以上)

```powershell
$cutoff = (Get-Date).AddMonths(-6)
Get-ChildItem "$env:USERPROFILE\Documents","$env:USERPROFILE\Pictures","$env:USERPROFILE\Videos","$env:USERPROFILE\Downloads" -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastAccessTime -lt $cutoff -and $_.Length -gt 10MB } |
  Sort-Object Length -Descending | Select-Object -First 100 `
    @{n='SizeMB';e={[math]::Round($_.Length/1MB,0)}},
    @{n='LastAccess';e={$_.LastAccessTime.ToString('yyyy-MM-dd')}},
    FullName
```

注意: NTFS の設定によっては LastAccessTime が更新されないことがある。その場合は LastWriteTime を代わりに使い、その旨をユーザーに伝える。

## フェーズ 2: 分類と提案

分析結果を次の 3 カテゴリに分けてレポートし、AskUserQuestion で承認を取る。

| カテゴリ | 内容 | 例 |
|---|---|---|
| A. 削除候補 | クラウドに置く価値もない一時データ | ごみ箱、`%TEMP%`、ブラウザキャッシュ、Downloads 内の古いインストーラー (.exe/.msi/.iso) |
| B. Google Drive 移動候補 | 使用頻度が低いが残したいデータ | 半年以上アクセスのない動画・写真・過去の文書・古いプロジェクト一式 |
| C. 現状維持 | 判断が難しい・使用中の可能性があるもの | 最近アクセスされたファイル、用途不明の大容量ファイル |

レポートには各項目の **パス・サイズ・最終アクセス日・見込み解放容量の合計** を必ず含める。用途が判断できないファイルは勝手に分類せず C に入れてユーザーに確認する。

カテゴリ A の安全な削除例(承認後のみ実行):

```powershell
Clear-RecycleBin -Force                                  # ごみ箱
Remove-Item "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue   # 一時ファイル
```

## フェーズ 3: Google Drive への移動

### 3-1. Google Drive の場所を検出

Google Drive for Desktop がインストールされていれば、通常は仮想ドライブ(例 `G:\マイドライブ` / `G:\My Drive`)としてマウントされている:

```powershell
Get-PSDrive -PSProvider FileSystem | Where-Object { Test-Path "$($_.Root)My Drive" -ErrorAction SilentlyContinue } | Select-Object Root
# 見つからなければ日本語表記も確認
Get-PSDrive -PSProvider FileSystem | Where-Object { Test-Path "$($_.Root)マイドライブ" -ErrorAction SilentlyContinue } | Select-Object Root
```

見つからない場合はユーザーに Google Drive for Desktop のインストール状況を確認する。未インストールなら https://www.google.com/drive/download/ を案内し、インストール完了後に再開する。

**移動前に Google Drive 側の空き容量(無料枠は 15GB)を確認する。** 移動予定の合計が空き容量を超える場合は、その旨を伝えて対象を絞る。

### 3-2. 移動先フォルダの作成

Google Drive 内に整理用フォルダを作る(例: `<GDrive>\PC退避\2026-07\Videos` のように日付+元の分類で分ける)。

### 3-3. コピー → 検証 → 削除

**必ずこの 3 段階で行う。`Move-Item` や `robocopy /MOVE` の一発移動は使わない**(同期完了前にローカルから消えるリスクがあるため)。

```powershell
# 1) コピー(フォルダ単位の場合)
robocopy "C:\元フォルダ" "G:\マイドライブ\PC退避\2026-07\元フォルダ名" /E /Z /R:2 /W:5 /LOG+:"$env:USERPROFILE\Desktop\gdrive_move_log.txt"

# 2) 検証: ファイル数とサイズの一致確認
$src = Get-ChildItem "C:\元フォルダ" -Recurse -File | Measure-Object Length -Sum
$dst = Get-ChildItem "G:\マイドライブ\PC退避\2026-07\元フォルダ名" -Recurse -File | Measure-Object Length -Sum
"src: $($src.Count) files / $($src.Sum) bytes"
"dst: $($dst.Count) files / $($dst.Sum) bytes"

# 特に重要なファイルはハッシュでも検証する
# (Get-FileHash で src/dst を比較)
```

robocopy の終了コードは 0〜7 が成功(8 以上が失敗)である点に注意。

**3) 同期完了を待つ:** Google Drive の仮想ドライブへのコピーは即座にクラウドへ上がるとは限らない。タスクトレイの Drive アイコンが「同期完了」になるまで待つようユーザーに伝えるか、少量なら Drive の Web 側で存在を確認してから次へ進む。

**4) 検証が取れたものだけ元ファイルを削除:**

```powershell
Remove-Item "C:\元フォルダ" -Recurse -Force
```

### 3-4. ローカルにキャッシュを残さない設定

仮想ドライブへコピーしたファイルがローカルにキャッシュされると容量削減にならない。移動したフォルダは「オフラインアクセスを削除(空き容量を増やす)」= オンラインのみに設定する:

```powershell
attrib +U -P "G:\マイドライブ\PC退避\*" /S /D
```

(`+U` = オンラインのみ、`+P` = オフライン保持。エクスプローラー右クリック →「オフライン アクセス」→「空き容量を増やす」でも可。)

## フェーズ 4: 結果報告

最後に必ず以下を報告する:

1. 実行前後の Cドライブ空き容量(フェーズ 1-1 のコマンドを再実行)
2. 削除したもの・移動したものの一覧と合計サイズ
3. スキップ・失敗したファイルとその理由
4. Google Drive 側の残り容量

## トラブルシューティング

- **移動中に「ファイルが使用中」エラー** → 該当アプリを閉じてもらうか、そのファイルはスキップして報告する。
- **Google Drive の容量不足** → 削除候補(カテゴリ A)を優先し、移動対象を絞る。有料プラン(Google One)の案内は求められた場合のみ。
- **robocopy がコード 8 以上で終了** → ログファイルを確認し、失敗したファイルを特定して報告する。元ファイルは削除しない。
- **移動後にユーザーがファイルを開けない** → Google Drive の同期状態と、エクスプローラーで該当ファイルの雲マーク(オンラインのみ)を確認する。ダブルクリックで自動ダウンロードされることを説明する。
