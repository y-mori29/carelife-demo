# Carelife — Cloud Run デプロイ手順

バックエンド・フロントエンド・LINE Bot を Google Cloud Run（yorisoi-demo / asia-northeast1）にデプロイする手順です。

---

## 本番 URL（デプロイ済み）

| サービス | URL |
|----------|-----|
| フロントエンド | https://carelife-frontend-887034737640.asia-northeast1.run.app |
| バックエンド | https://carelife-backend-887034737640.asia-northeast1.run.app |
| LINE Bot | https://carelife-linebot-887034737640.asia-northeast1.run.app |

- **フロント** はビルド時に上記バックエンド URL を `VITE_API_BASE_URL` として埋め込み、API 呼び出し先にしている。
- **LINE Bot** は環境変数 `FRONTEND_URL` に上記フロント URL を設定し、返すリンクのベースにしている。
- **LINE Developers** の Webhook URL は `https://carelife-linebot-887034737640.asia-northeast1.run.app/webhook` に設定する（**本番ではすでに設定済み**）。
- **環境変数**（LINE トークン、Gemini API キー、GCP 認証など）は **GCP の Cloud Run「変数とシークレット」** で管理されています。デプロイスクリプトが `backend/.env` を読んで渡すこともありますが、稼働中の値は GCP 側の設定です。

---

## 前提

- GCP プロジェクト **yorisoi-demo** の環境構築済み（API 有効化・GCS・Artifact Registry・サービスアカウント）
- **gcloud** がインストールされ、`gcloud auth login` と `gcloud config set project yorisoi-demo` が完了していること
- **backend/.env** に少なくとも `GEMINI_API_KEY` が設定されていること（LINE テストする場合は `LINE_CHANNEL_SECRET` と `LINE_CHANNEL_ACCESS_TOKEN` も）

---

## 一括デプロイ（推奨）

### 1. 環境変数の準備

- **GEMINI_API_KEY**: backend/.env に書いてあればスクリプトが読み込みます。なければ実行前に `$env:GEMINI_API_KEY = "..."` で設定してください。
- **LINE Bot**: backend/.env に `LINE_CHANNEL_SECRET` と `LINE_CHANNEL_ACCESS_TOKEN` があればスクリプトが読み込みます。なければデプロイ後に Cloud Run コンソールで設定できます。
- **「LINEに送信する」で報告を LINE に届けるには**、**carelife-backend** にも **LINE_CHANNEL_ACCESS_TOKEN** が必要です。スクリプトは backend/.env の値を読み、バックエンドの環境変数に渡します。backend/.env に `LINE_CHANNEL_ACCESS_TOKEN` を入れた状態で `deploy-cloudrun.ps1` を実行してください。

### 2. デプロイ実行

プロジェクトルート（リポジトリのルート）で:

```powershell
.\scripts\deploy-cloudrun.ps1
```

スクリプトの流れ:

1. **carelife-backend** をデプロイ（ソースからビルド、PORT・環境変数・サービスアカウントを設定）
2. バックエンドの URL を取得
3. **carelife-frontend** をビルド（上記 URL を `VITE_API_BASE_URL` に埋め込み）→ Cloud Run にデプロイ
4. フロントエンドの URL を取得
5. **carelife-linebot** をデプロイ（`FRONTEND_URL` と LINE トークンを環境変数で設定）

### 3. デプロイ後の設定

- **LINE Developers** の該当チャネル → Messaging API → **Webhook URL** に  
  `https://<LINE Bot の Cloud Run URL>/webhook` を設定し、「Verify」で成功することを確認してください。
- 例: スクリプト最後に表示される「LINE Bot URL」が `https://carelife-linebot-xxx-an.a.run.app` なら、Webhook URL は `https://carelife-linebot-xxx-an.a.run.app/webhook` です。

---

## 個別デプロイ（手動）

### バックエンドのみ

```powershell
gcloud run deploy carelife-backend `
  --source ./backend `
  --region asia-northeast1 `
  --platform managed `
  --allow-unauthenticated `
  --service-account carelife-backend-sa@yorisoi-demo.iam.gserviceaccount.com `
  --set-env-vars "PROJECT_ID=yorisoi-demo,GCS_BUCKET=yorisoi-demo-recordings,GEMINI_API_KEY=あなたのキー" `
  --memory 1Gi `
  --timeout 300
```

### フロントエンド（バックエンド URL を埋め込み）

バックエンドの URL を取得したあと:

```powershell
cd frontend
gcloud builds submit --config=cloudbuild.yaml --substitutions="_VITE_API_BASE_URL=https://carelife-backend-xxx.run.app"
cd ..
gcloud run deploy carelife-frontend --image asia-northeast1-docker.pkg.dev/yorisoi-demo/carelife-repo/carelife-frontend:latest --region asia-northeast1 --platform managed --allow-unauthenticated
```

### LINE Bot

フロントエンドの URL を取得したあと:

```powershell
gcloud run deploy carelife-linebot `
  --source ./line-bot `
  --region asia-northeast1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "FRONTEND_URL=https://carelife-frontend-xxx.run.app,LINE_CHANNEL_SECRET=xxx,LINE_CHANNEL_ACCESS_TOKEN=xxx"
```

---

## サービス一覧（デプロイ後）

| サービス名 | 用途 | 主な環境変数 |
|------------|------|----------------|
| carelife-backend | API・録音・STT・要約・**LINE送信** | PROJECT_ID, GCS_BUCKET, GEMINI_API_KEY, **LINE_CHANNEL_ACCESS_TOKEN**（LINEに送信する用） |
| carelife-frontend | 通院報告 UI（静的＋serve） | （ビルド時に VITE_API_BASE_URL を埋め込み） |
| carelife-linebot | LINE Webhook・報告リンク返却 | FRONTEND_URL, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN |

---

## トラブルシューティング

| 現象 | 確認すること |
|------|----------------|
| バックエンドで GEMINI エラー | Cloud Run の carelife-backend の環境変数に GEMINI_API_KEY が設定されているか |
| フロントで API に接続できない | フロントは「ビルド時」の VITE_API_BASE_URL でバックエンドを参照している。再デプロイ時はバックエンド URL を再度渡してビルドし直す |
| LINE Bot が返信しない | Webhook URL が `https://<linebotのURL>/webhook` か。LINE_CHANNEL_ACCESS_TOKEN が Cloud Run に設定されているか |
| 「LINEに送信する」を押しても報告が LINE に届かない | [LINE_Webhook設定で動かないとき](./LINE_Webhook設定で動かないとき.md) の「LINEに送信するで報告が届かないとき」を参照 |
| ffmpeg がない | バックエンドの Dockerfile で ffmpeg をインストールしている。イメージを再ビルドしているか確認 |
