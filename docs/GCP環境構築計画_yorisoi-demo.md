# GCP 環境構築計画書 — 介護施設向け通院報告支援 MVP（yorisoi-demo）

- **作成日**: 2026年3月7日
- **前提**: 開発計画書・要件定義書に基づく MVP。既存「よりそい」の技術スタック（Firestore / GCS / Speech-to-Text / Gemini / Cloud Run）を流用する構成とする。
- **プロジェクトID**: `yorisoi-demo`
- **運用アカウント**: `medicanvas.yorisoi@gmail.com`

---

## 1. 概要とゴール

本ドキュメントは、GCP プロジェクト **yorisoi-demo** 上で、介護施設向け通院報告支援システムの MVP を動かすために必要な **インフラと権限の初期構築** を定義します。

構築後にできること:

- バックエンド（Node.js/Express）を Cloud Run にデプロイし、Firestore・GCS・Speech-to-Text・Gemini を利用する。
- フロントエンド・LINE Bot 用の Cloud Run サービスを同一プロジェクトにデプロイする準備ができる。
- 開発・検証用に必要な API 有効化・バケット・Firebase プロジェクト連携が完了している。

---

## 2. 必要な GCP サービス一覧

| サービス | 用途 | 備考 |
|----------|------|------|
| **Firebase / Firestore** | 施設・患者・通院報告（encounters）のデータ保存 | 既存「よりそい」と同様のデータモデルを流用 |
| **Cloud Storage (GCS)** | 録音音声ファイルの保存（チャンクアップロード・最終 WAV） | 署名付き URL でクライアントから直接アップロード |
| **Speech-to-Text API (V2)** | 音声の文字起こし（chirp_3、asia-northeast1） | 既存と同じリージョン・モデル |
| **Vertex AI / または Gemini API** | 通院報告の要約・構造化（Gemini） | MVP では Gemini API（AI Studio）でも可。本番は Vertex 推奨 |
| **Cloud Run** | Backend / Frontend / LINE Bot のコンテナホスティング | サーバーレス・オートスケール |
| **Artifact Registry** | Cloud Run 用 Docker イメージの保存 | 従来の GCR ではなく AR を推奨 |
| **Secret Manager** | LINE Channel Token・Gemini API Key 等の機密情報 | 本番運用で推奨 |
| **Cloud Build** | コンテナビルド・デプロイの自動化（任意） | 後から導入可 |

---

## 3. 構築手順（実行順）

### 3.0 前提条件

- プロジェクト **yorisoi-demo** は作成済み。
- 作業端末に **Google Cloud SDK (gcloud)** がインストール済み。
- 認証アカウント `medicanvas.yorisoi@gmail.com` でログインし、上記プロジェクトを操作する権限があること。

```powershell
# ログイン確認・プロジェクト指定
gcloud auth list
gcloud config set project yorisoi-demo
```

---

### 3.1 必要な API の有効化

以下の API を有効にします。

```powershell
# プロジェクトを指定
gcloud config set project yorisoi-demo

# Firestore（Firebase 経由で有効化されることが多いが、Datastore API は別）
gcloud services enable firestore.googleapis.com

# Cloud Storage
gcloud services enable storage.googleapis.com
gcloud services enable storage-api.googleapis.com

# Speech-to-Text V2（asia-northeast1 で chirp 利用のため）
gcloud services enable speech.googleapis.com

# Gemini / 生成 AI（Vertex AI 経由で使う場合）
gcloud services enable aiplatform.googleapis.com

# Cloud Run と Artifact Registry
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Secret Manager（LINE・Gemini 等のシークレット用）
gcloud services enable secretmanager.googleapis.com

# Cloud Build（後で CI/CD で使う場合）
gcloud services enable cloudbuild.googleapis.com

# Firebase 管理（Firestore を Firebase コンソールでも扱う場合）
gcloud services enable firebase.googleapis.com
```

**一括で有効化する場合（コピー用）:**

```powershell
gcloud config set project yorisoi-demo
gcloud services enable firestore.googleapis.com storage.googleapis.com storage-api.googleapis.com speech.googleapis.com aiplatform.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com firebase.googleapis.com
```

---

### 3.2 Firebase プロジェクトのリンク（Firestore）

Firestore は「Firebase プロジェクト」に紐づけて使うことが多いです。既に **yorisoi-demo** が Firebase 用に作成されている場合は、そのまま Firestore を有効化します。

1. **Firebase Console** で [Firebase Console](https://console.firebase.google.com/) を開く。
2. プロジェクト **yorisoi-demo** を選択（または「プロジェクトを追加」で GCP の yorisoi-demo をインポート）。
3. **Firestore Database** を「データベースを作成」で作成。本番は「本番モード」、開発は「テストモード」で開始可。
4. リージョンは **asia-northeast1 (東京)** を推奨（Speech-to-Text と合わせる）。

GCP 側では上記 3.1 の `firestore.googleapis.com` 有効化で API が使える状態になります。Firebase コンソールでの「作成」は一度だけ手動で行い、以降は gcloud や SDK から利用します。

---

### 3.3 Cloud Storage バケットの作成

録音データ用の GCS バケットを 1 つ作成します。リージョンは **asia-northeast1** に揃えます。

```powershell
# バケット名はプロジェクト内で一意にする（通常は gs://yorisoi-demo-* のような名前）
# 例: 録音用バケット
gsutil mb -l asia-northeast1 gs://yorisoi-demo-recordings

# 既存「よりそい」と同様に CORS を設定する場合（フロントからの署名付きアップロード用）
# cors.json を用意して gsutil cors set cors.json gs://yorisoi-demo-recordings
```

**CORS 設定ファイル例（`cors.json`）:**

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST"],
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-meta-*"],
    "maxAgeSeconds": 3600
  }
]
```

```powershell
# 上記 cors.json をプロジェクトルート等に保存した場合
gsutil cors set cors.json gs://yorisoi-demo-recordings
```

※ 本番では `origin` を特定ドメインに制限することを推奨。

---

### 3.4 Artifact Registry リポジトリの作成

Cloud Run 用の Docker イメージを置くリポジトリを作成します。

```powershell
# リージョンは asia-northeast1 推奨
gcloud artifacts repositories create carelife-repo ^
  --repository-format=docker ^
  --location=asia-northeast1 ^
  --description="Docker images for Carelife MVP (backend, frontend, line-bot)"
```

---

### 3.5 サービスアカウントの作成と権限付与

バックエンドが Cloud Run 上で Firestore / GCS / Speech-to-Text / Vertex AI（または Gemini）を利用するため、専用のサービスアカウント（SA）を作成し、最小限のロールを付与します。

```powershell
# サービスアカウント作成
gcloud iam service-accounts create carelife-backend-sa ^
  --display-name="Carelife Backend (Cloud Run)"

# メールアドレスを変数に（PowerShell）
$SA_EMAIL = "carelife-backend-sa@yorisoi-demo.iam.gserviceaccount.com"

# ロール付与
gcloud projects add-iam-policy-binding yorisoi-demo ^
  --member="serviceAccount:$SA_EMAIL" ^
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding yorisoi-demo ^
  --member="serviceAccount:$SA_EMAIL" ^
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding yorisoi-demo ^
  --member="serviceAccount:$SA_EMAIL" ^
  --role="roles/speech.client"

gcloud projects add-iam-policy-binding yorisoi-demo ^
  --member="serviceAccount:$SA_EMAIL" ^
  --role="roles/aiplatform.user"

# Secret Manager のシークレットを読む権限（LINE / Gemini 等を格納する場合）
gcloud projects add-iam-policy-binding yorisoi-demo ^
  --member="serviceAccount:$SA_EMAIL" ^
  --role="roles/secretmanager.secretAccessor"
```

※ Firestore は `datastore.user` でアクセス可能です。Firebase Admin で同じプロジェクトを指定していれば、この SA で Cloud Run から利用できます。

---

### 3.6 Secret Manager にシークレットを登録（任意・推奨）

LINE Channel Access Token や Gemini API Key などを Secret Manager に格納し、Cloud Run の環境変数で参照する構成にすると安全です。

```powershell
# 例: LINE Channel Access Token 用のシークレット作成（値は手動で設定）
echo -n "YOUR_LINE_CHANNEL_ACCESS_TOKEN" | gcloud secrets create LINE_CHANNEL_ACCESS_TOKEN --data-file=-

# Gemini API Key 用（Vertex を使う場合は不要になる場合あり）
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

※ 実際のトークン・キーは **手動で** コンソールまたは `gcloud secrets versions add` で設定してください。ここではプレースホルダーです。

---

### 3.7 Cloud Run デプロイ用の準備確認

- **Artifact Registry**: `asia-northeast1-docker.pkg.dev/yorisoi-demo/carelife-repo` にイメージを push 可能であること。
- **Cloud Run** でサービスをデプロイする際、上記サービスアカウント `carelife-backend-sa@yorisoi-demo.iam.gserviceaccount.com` を「サービスアカウント」に指定する。

デプロイ例（バックエンド用・後で実施）:

```powershell
gcloud run deploy carelife-backend ^
  --image=asia-northeast1-docker.pkg.dev/yorisoi-demo/carelife-repo/backend:latest ^
  --region=asia-northeast1 ^
  --platform=managed ^
  --service-account=carelife-backend-sa@yorisoi-demo.iam.gserviceaccount.com ^
  --set-env-vars="PROJECT_ID=yorisoi-demo,GCS_BUCKET=yorisoi-demo-recordings" ^
  --allow-unauthenticated
```

※ `--allow-unauthenticated` は開発用。本番では IAP や認証付きに変更することを推奨。

---

## 4. 環境変数・設定の整理（アプリ側）

バックエンドやフロントで参照する値をまとめます。**リポジトリにはコミットせず、.env や deploy 用 yaml で管理してください。**

| 変数名 | 説明 | 設定元例 |
|--------|------|-----------|
| `PROJECT_ID` | GCP プロジェクト ID | `yorisoi-demo` |
| `GCS_BUCKET` | 録音保存用バケット名 | `yorisoi-demo-recordings` |
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカル開発用 SA キー JSON パス | 任意（Cloud Run では不要） |
| `GEMINI_API_KEY` または Vertex 利用 | 通院報告生成用 AI | Secret Manager または環境変数 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot 用 | Secret Manager または環境変数 |
| `LINE_CHANNEL_SECRET` | Webhook 検証用 | Secret Manager または環境変数 |

---

## 4.1 請求（ビリング）の有効化について

以下の API・リソースは **GCP プロジェクトに請求アカウントをリンクしないと有効化・作成できません**。

- Speech-to-Text API
- Vertex AI (aiplatform) API
- Cloud Run API
- Artifact Registry API
- Secret Manager API
- Cloud Build API
- **GCS バケットの作成**（Storage API は有効でも、バケット作成時に請求が必要）

**実施済み（請求なしで完了）**

- プロジェクト設定: `yorisoi-demo`
- API 有効化: Firestore, Storage, Storage API
- サービスアカウント作成: `carelife-backend-sa@yorisoi-demo.iam.gserviceaccount.com`
- 上記 SA へのロール付与: datastore.user, storage.objectAdmin, speech.client, aiplatform.user, secretmanager.secretAccessor

**請求有効化後に実行するコマンド**

1. [GCP コンソール](https://console.cloud.google.com/billing) でプロジェクト `yorisoi-demo` に請求アカウントをリンクする。
2. 以下を実行する。

```powershell
gcloud config set project yorisoi-demo

# 残り API の有効化
gcloud services enable speech.googleapis.com aiplatform.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com firebase.googleapis.com

# GCS バケット作成
gsutil mb -l asia-northeast1 gs://yorisoi-demo-recordings

# CORS 設定（scripts/gcs-cors.json を用意している場合）
gsutil cors set scripts/gcs-cors.json gs://yorisoi-demo-recordings

# Artifact Registry リポジトリ作成
gcloud artifacts repositories create carelife-repo --repository-format=docker --location=asia-northeast1 --description="Docker images for Carelife MVP"
```

---

## 5. チェックリスト（構築完了確認）

- [ ] `gcloud config set project yorisoi-demo` でプロジェクトが指定されている
- [ ] 3.1 の API がすべて有効（`gcloud services list --enabled` で確認）
- [ ] Firebase Console で Firestore が作成され、asia-northeast1 である
- [ ] GCS バケット `yorisoi-demo-recordings` が存在し、必要なら CORS 設定済み
- [ ] Artifact Registry に `carelife-repo` が作成されている
- [ ] サービスアカウント `carelife-backend-sa` が作成され、上記ロールが付与されている
- [ ] （任意）Secret Manager に LINE / Gemini 用シークレットが登録されている

---

## 6. 次のステップ（計画書との対応）

- **フェーズ 1（バックエンド拡張）**: 上記環境が整ったら、`backend` に Firestore / GCS / Speech-to-Text / Gemini を組み込み、通院報告パイプラインと API を実装。
- **フェーズ 2〜3（フロント・LINE）**: フロント・LINE Bot 用の Cloud Run サービスを同じプロジェクトに追加し、環境変数でバックエンド URL を渡す。
- **フェーズ 4（LINE 投稿・Chatwork）**: LINE Messaging API 用のトークンを Secret Manager で管理し、本番運用に備える。

---

## 7. 他に必要な情報・確認事項

実施前に以下を確認するとスムーズです。

1. **請求・クォータ**  
   - プロジェクト `yorisoi-demo` の請求先アカウントがリンクされているか。  
   - Speech-to-Text / Vertex AI 等は無料枠を超えると課金されるため、必要に応じてクォータやアラートを設定してください。

2. **Firebase の組織・オーナー**  
   - Firebase プロジェクトのオーナーが `medicanvas.yorisoi@gmail.com` で問題ないか。  
   - 複数人で開発する場合は、Firestore のセキュリティルールと IAM を早めに整理することを推奨。

3. **LINE 公式アカウント**  
   - LINE Bot 用の Channel ID / Channel Secret / Channel Access Token は、LINE Developers で別途取得が必要です。  
   - 取得後、Secret Manager に登録するか、開発用に .env で渡すかを決めてください。

4. **Gemini API と Vertex AI のどちらを使うか**  
   - MVP では **Gemini API（AI Studio の API Key）** で十分な場合が多いです。  
   - 本番で SLA や VPC を気にする場合は **Vertex AI** に切り替え、`aiplatform.googleapis.com` とサービスアカウントの `roles/aiplatform.user` で利用できます。

---

以上で、GCP 環境構築計画書は一通り揃っています。  
次のアクションとして、**3.0〜3.6 のコマンドを実行する**ことで、Cursor や手元の環境から実際の環境構築を進められます。必要に応じて、実行用のスクリプト（例: `scripts/setup-gcp.ps1`）にまとめてもよいです。
