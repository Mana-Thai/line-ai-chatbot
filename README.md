# LINE AI Chatbot

LINEでClaude AIと会話できるチャットボットです。

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成し、以下の値を設定してください：

```
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. LINE Developers Console

1. https://developers.line.biz/console/ にアクセス
2. Providerを作成（または既存のものを使用）
3. Messaging API channelを作成
4. Channel access token と Channel secret をコピー
5. Webhook URLを設定: `https://your-app.onrender.com/webhook`
6. "Use webhook" を有効化

### 4. Anthropic API Key

1. https://console.anthropic.com/ にアクセス
2. API Keysページでキーを作成
3. キーをコピーして`.env`に設定

## コマンド

- **リセット** - 会話履歴をクリア
- **ヘルプ** - ヘルプを表示

## デプロイ（Render）

1. GitHubにプッシュ
2. Renderで新しいWeb Serviceを作成
3. 環境変数を設定
4. デプロイ完了後、Webhook URLをLINE Developers Consoleに設定
