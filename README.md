# 介護施設向け通院報告支援システム（Carelife MVP）

要件定義書 **v02**（`20260307_要件定義書v02.md`）に基づく MVP です。  
**LINE のみで完結**する通院報告の作成〜確認・送信までを一通り利用できます。

---

## 現時点の状態（本番）

- **Cloud Run デプロイ**: バックエンド・フロントエンド・LINE Bot の 3 サービスを Cloud Run にデプロイ済みです。
- **認証・API**: 環境変数（LINE Channel Access Token / LINE Channel Secret、Gemini API キー、Google Application Credentials など）は **GCP（Google Cloud Platform）のメディキャンバスアカウント側** で、Cloud Run の各サービスの「変数とシークレット」に登録済みです。本番ではここから取得して利用しています。
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

他の開発者がこのリポジトリをクローンし、動作を確認したり開発したりするための手順です。

**前提の整理**

- **本番環境**: バックエンド・フロントエンド・LINE Bot はすでに Cloud Run にデプロイ済みです。環境変数（LINE トークン、Gemini API キー、GCP 認証など）は **GCP の Cloud Run「変数とシークレット」** に登録されており、LINE Developers の Webhook URL も本番の LINE Bot URL（`https://carelife-linebot-887034737640.asia-northeast1.run.app/webhook`）に設定済みです。
- **ローカルで「動きを確認する」だけなら**: バックエンドをローカルで動かす必要はありません。**フロントエンドだけ**起動し、本番のバックエンド URL を向ければ、録音〜報告作成〜LINE 送信まで確認できます。この場合 **`.env` は不要**です。
- **`.env` が必要なのは**: ローカルで **バックエンド** を起動して開発・デバッグするときだけです。本番は GCP に設定済みのため、通常の利用やフロントの確認では使いません。

### 1. リポジトリの取得

```bash
git clone https://github.com/medicanvas/carelife-demo.git
cd carelife-demo
```

### 2. 動きの確認（フロントエンドのみ・本番 API 利用）

本番のバックエンド・LINE Bot をそのまま使って、画面の流れを確認する方法です。**.env の用意もバックエンドの起動も不要**です。

```bash
cd frontend
npm install
# 本番バックエンドを向ける（未設定だと localhost:8081 になるため、明示指定）
# PowerShell の例:
$env:VITE_API_BASE_URL="https://carelife-backend-887034737640.asia-northeast1.run.app"
npm run dev
```

ブラウザで `http://localhost:5173` を開き、通院報告フローを操作できます。録音・報告生成・「LINEに送信する」は本番バックエンドに繋がります。LINE で報告を作成するときは、本番の LINE Bot が返すリンク（本番フロント URL）を開いても同じように動作します。

### 3. バックエンドをローカルで起動する場合（開発・デバッグ時）

バックエンドのコードを変更して試したいときだけ、ローカルでバックエンドを動かします。このときだけ **`backend/.env`** で環境変数（GEMINI_API_KEY、GCS、LINE トークンなど）を設定します。`backend/.env.example` をコピーして `backend/.env` を作成し、必要な値を入れてください。詳細は [docs/MVPローカル実行手順.md](docs/MVPローカル実行手順.md) を参照してください。

```bash
cd backend
npm install
npm run dev
```

フロントは `VITE_API_BASE_URL` を未設定（または `http://localhost:8081`）にすると、このローカルバックエンドに繋がります。

### 4. LINE Bot について（本番とローカル）

- **本番利用**: LINE Bot は Cloud Run にデプロイ済みです。LINE Developers の **Webhook URL** には、本番の LINE Bot URL + `/webhook`（`https://carelife-linebot-887034737640.asia-northeast1.run.app/webhook`）が設定されています。追加の作業は不要です。
- **ローカルで LINE Bot を開発・検証する場合のみ**: LINE の Webhook は HTTPS が必須のため、ローカルで Bot を動かすときは **ngrok** などでトンネルを張り、一時的に Webhook URL を ngrok の URL に変更する必要があります。通常の「動きの確認」では不要です。手順は [docs/LINE_Webhook設定で動かないとき.md](docs/LINE_Webhook設定で動かないとき.md) の「パターン B」を参照してください。

### 5. 本番（Cloud Run）へのデプロイ

GCP のメディキャンバスプロジェクトで、環境変数は Cloud Run の「変数とシークレット」で管理しています。デプロイ時は `backend/.env` を参照して Cloud Run に渡すこともできますが、本番の運用では GCP 側に登録した値が使われます。リポジトリのルートで以下を実行すると、backend / frontend / line-bot を一括デプロイできます。

```powershell
.\scripts\deploy-cloudrun.ps1
```

詳細は [docs/Cloud_Runデプロイ手順.md](docs/Cloud_Runデプロイ手順.md) を参照してください。

---

## 環境変数

**本番環境（Cloud Run）**: 環境変数は **GCP の Cloud Run「変数とシークレット」** に登録されています。メディキャンバスの GCP アカウントで各サービス（carelife-backend / carelife-frontend / carelife-linebot）の設定を確認・変更できます。**.env ファイルは本番では使用しません**（デプロイスクリプトが .env を読んで渡すことはありますが、稼働中の値は GCP 側の設定です）。

**ローカル環境**: ローカルで **バックエンド** を起動するときだけ `backend/.env` を使います。フロントのみ起動して本番 API を向ける場合は不要です。

### バックエンド（本番: GCP で管理 / ローカル: backend/.env）

| 変数 | 説明 | 本番（Cloud Run） | ローカル（backend を動かすときのみ） |
|------|------|-------------------|----------------------------------------|
| `PORT` | サーバーポート | 8080（既定） | 8081（既定） |
| `MOCK_MODE` | `1` でモック（GCS/STT/Gemini を使わない） | 未設定 | 未設定で実機、`1` でモック |
| `PROJECT_ID` / `GCS_BUCKET` / `GOOGLE_APPLICATION_CREDENTIALS` | GCP 用 | GCP で設定済み | 実機利用時のみ .env に記載 |
| `GEMINI_API_KEY` | 通院報告生成用 | GCP で設定済み | 実機利用時のみ .env に記載 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 報告の LINE 送信に使用 | GCP で設定済み | LINE 送信を試す場合のみ .env に記載 |
| `LINE_CHANNEL_SECRET` | line-bot で使用（backend では未使用） | line-bot の GCP で設定済み | line-bot をローカルで動かすときのみ |

ローカル用のひな形は `backend/.env.example` をコピーして `backend/.env` を作成し、値を埋めてください。`.env` は Git にコミットしないでください。

### フロントエンド

| 変数 | 説明 |
|------|------|
| `VITE_API_BASE_URL` | バックエンド API のベース URL。未設定時は `http://localhost:8081`。**本番 API で確認するとき**は `https://carelife-backend-887034737640.asia-northeast1.run.app` を指定。Cloud Run デプロイ時はビルド時に本番 URL が埋め込まれます。 |

### line-bot（本番: GCP で管理）

| 変数 | 説明 |
|------|------|
| `FRONTEND_URL` | 報告作成画面の URL。本番では本番フロントの URL を GCP に設定済み。 |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | Webhook 検証・返信用。本番では GCP に設定済み。 |

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
