# 介護施設向け通院報告支援システム（Carelife MVP）

要件定義書 **v02**（`20260307_要件定義書v02.md`）に基づく MVP です。  
**LINE のみで完結**する通院報告の作成〜確認・送信までを一通り利用できます。

---

## 現時点の状態（本番）

- **Cloud Run デプロイ**: バックエンド・フロントエンド・LINE Bot の 3 サービスを Cloud Run にデプロイ済みです。
- **認証・API**: LINE Channel Access Token / LINE Channel Secret、Gemini API キー、Google Application Credentials（GCP サービスアカウント）を設定し、本番で利用しています。
- **実装済み機能**:
  - 音声のアップロード（録音 → バックエンド送信 → GCS 保存）
  - 文字起こし（Speech-to-Text）
  - AI 要約（Gemini による通院報告文生成）
  - LINE への報告送信（Push メッセージ）
  - LINE Bot による「報告」キーワード／リッチメニューからの報告作成リンク返却

### 本番環境の URL と接続関係

Cloud Run にデプロイ済みの各サービスの URL と、それらのつながり方は以下のとおりです。

| サービス | URL | 役割 |
|----------|-----|------|
| **フロントエンド** | https://carelife-frontend-887034737640.asia-northeast1.run.app | 通院報告サポート画面。ユーザーが録音・補足入力・報告確認・LINE 送信を行う入口。 |
| **バックエンド** | https://carelife-backend-887034737640.asia-northeast1.run.app | 通院報告 API。フロントから録音アップロード・報告生成・LINE 送信リクエストを受け付ける。 |
| **LINE Bot** | https://carelife-linebot-887034737640.asia-northeast1.run.app | LINE Webhook 用。「報告」等に反応し、上記フロントの URL（`?userId=...` 付き）を返す。 |

**接続の流れ**

1. **LINE → フロント**: ユーザーが LINE で「報告」と送る（またはリッチメニューをタップ）と、Bot が **フロントエンドの URL**（`https://carelife-frontend-887034737640.asia-northeast1.run.app?userId=Uxxxx...`）を返す。ユーザーがそのリンクを開くと報告作成画面が表示される。
2. **フロント → バックエンド**: 報告画面では、録音送信・報告生成・「LINEに送信する」のリクエストをすべて **バックエンドの URL**（`https://carelife-backend-887034737640.asia-northeast1.run.app`）へ送る。フロントはビルド時にこの URL を `VITE_API_BASE_URL` として埋め込んでいる。
3. **LINE Developers**: LINE の Webhook URL には **LINE Bot の URL + `/webhook`**（`https://carelife-linebot-887034737640.asia-northeast1.run.app/webhook`）を設定する。

---

## 構成

| コンポーネント | 役割 |
|----------------|------|
| **backend** | 通院報告用 API（施設・患者・録音アップロード、GCS・STT・Gemini 要約、報告生成、LINE 送信） |
| **frontend** | 画面 SC-01〜SC-12（録音〜補足入力〜報告確認〜LINE 送信完了）の Web アプリ |
| **line-bot** | LINE Webhook サーバー（「報告」等に反応し、報告作成用フロント URL を返す。URL に userId 付与で「LINEに送信する」の宛先を特定） |

---

## 開発者向け：ローカル環境の構築・利用方法

他の開発者がこのリポジトリをクローンし、自分の環境で動かすための手順です。

### 1. リポジトリの取得

```bash
git clone https://github.com/y-mori29/carelife-demo.git
cd carelife-demo
```

### 2. バックエンドの設定と起動

**2-1. 依存関係のインストール**

```bash
cd backend
npm install
```

**2-2. 環境変数ファイルの用意**

- `backend/.env.example` をコピーして `backend/.env` を作成し、必要な値を設定します。
- **ローカルで「報告作成」まで試すだけ（GCP なし）**: `MOCK_MODE=1` のみ設定すれば、音声・GCS・Gemini を使わずモックで動作します。
- **実際の音声アップロード・文字起こし・要約を使う場合**: GCP プロジェクトと Gemini API キー、必要に応じてサービスアカウント鍵（`GOOGLE_APPLICATION_CREDENTIALS`）を設定してください。詳細は [docs/MVPローカル実行手順.md](docs/MVPローカル実行手順.md) を参照してください。

**2-3. 起動**

```bash
# リポジトリのルートから backend ディレクトリで
npm run dev
```

→ 既定で `http://localhost:8081` で API が動きます。

### 3. フロントエンドの起動

別のターミナルで:

```bash
cd frontend
npm install
npm run dev
```

→ ブラウザで `http://localhost:5173` を開き、通院報告フローを操作できます。  
未設定時は `VITE_API_BASE_URL` が `http://localhost:8081` になるため、上記バックエンドとそのまま連携します。

### 4. LINE Bot（任意）

LINE の Channel Secret / Channel Access Token を用意している場合:

```bash
cd line-bot
npm install
# 環境変数を設定（例: PowerShell）
$env:LINE_CHANNEL_SECRET="..."
$env:LINE_CHANNEL_ACCESS_TOKEN="..."
$env:FRONTEND_URL="http://localhost:5173"   # ローカルで試す場合
npm start
```

Webhook は HTTPS が必須のため、ローカルで受信する場合は **ngrok** 等でトンネルを張り、LINE Developers の Webhook URL に `https://xxxx.ngrok-free.app/webhook` を設定してください。手順は [docs/LINE_Webhook設定で動かないとき.md](docs/LINE_Webhook設定で動かないとき.md) を参照してください。

### 5. 本番（Cloud Run）へのデプロイ

GCP プロジェクトの準備と `backend/.env` の設定が済んでいれば、リポジトリのルートで以下を実行すると、backend / frontend / line-bot を一括デプロイできます。

```powershell
.\scripts\deploy-cloudrun.ps1
```

詳細は [docs/Cloud_Runデプロイ手順.md](docs/Cloud_Runデプロイ手順.md) を参照してください。

---

## 環境変数

### バックエンド（backend/.env）

| 変数 | 説明 | 本番（Cloud Run） | ローカル |
|------|------|-------------------|----------|
| `PORT` | サーバーポート | 8080（Cloud Run 既定） | 8081（既定） |
| `MOCK_MODE` | `1` または `true` でモック（GCS/STT/Gemini を使わない） | 未設定（実パイプライン） | 未設定で実機、`1` でモック |
| `PROJECT_ID` | GCP プロジェクト ID | デプロイ時に設定 | 実機利用時のみ |
| `GCS_BUCKET` | 録音保存用 GCS バケット名 | デプロイ時に設定 | 実機利用時のみ |
| `GOOGLE_APPLICATION_CREDENTIALS` | サービスアカウント鍵 JSON のパス | Cloud Run のデフォルト認証 | 実機利用時は `./sa-key.json` 等 |
| `GEMINI_API_KEY` | 通院報告生成用（Gemini）API キー | デプロイ時に設定 | 実機利用時のみ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API の Channel Access Token（Bot 返信・報告 Push 送信に使用） | デプロイ時に設定 | LINE 送信を試す場合のみ |
| `LINE_CHANNEL_SECRET` | LINE Webhook 検証用（line-bot で使用。backend では未使用） | line-bot デプロイ時に設定 | line-bot ローカル起動時 |

ひな形は `backend/.env.example` をコピーして `backend/.env` を作成し、値を埋めてください。`.env` は Git にコミットしないでください。

### フロントエンド

| 変数 | 説明 |
|------|------|
| `VITE_API_BASE_URL` | バックエンド API のベース URL。未設定時は `http://localhost:8081`。Cloud Run デプロイ時はビルド時にバックエンドの URL が埋め込まれます。 |

### line-bot

| 変数 | 説明 |
|------|------|
| `FRONTEND_URL` | 報告作成画面の URL。返すリンクに `?userId=...` を付与するため必須。 |
| `LINE_CHANNEL_SECRET` | Webhook 検証用。 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 返信・メッセージ送信用。 |

---

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [要件定義書 v01](20260307_要件定義書v01.md) / [v02](20260307_要件定義書v02.md) | 画面・機能・非機能の要件 |
| [開発計画](docs/開発計画_介護施設向け通院報告支援.md) | フェーズ分け・現状整理 |
| [ハンドオーバー](docs/ハンドオーバー_20260307.md) | 引き継ぎ用の状態まとめ |
| [Cloud Run デプロイ手順](docs/Cloud_Runデプロイ手順.md) | 本番デプロイの手順 |
| [MVP ローカル実行手順](docs/MVPローカル実行手順.md) | ローカルで音声〜要約まで動かす手順 |
| [LINE Webhook 設定で動かないとき](docs/LINE_Webhook設定で動かないとき.md) | LINE Bot・「LINEに送信する」のトラブルシュート |
| [LINE グループ・リッチメニュー利用手順](docs/LINEグループ・リッチメニュー利用手順.md) | グループでの利用・リッチメニュー設定 |

---

## 今後の拡張（未実装）

- **Chatwork 連携**: 報告文の Chatwork 送信
- **認証・施設別設定**: 利用者認証、施設ごとの設定の切り替え
- その他、要件定義書・開発計画に記載の将来フェーズ

※ 音声アップロード、文字起こし、AI 要約、LINE への報告送信は **すでに実装済み** です。
