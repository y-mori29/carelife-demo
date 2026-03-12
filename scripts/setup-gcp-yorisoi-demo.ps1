# GCP 環境構築スクリプト — 介護施設向け通院報告支援 MVP (yorisoi-demo)
# 実行前に: gcloud auth login で medicanvas.yorisoi@gmail.com でログインし、
#           gcloud config set project yorisoi-demo を実行しておくこと。
# 参照: docs/GCP環境構築計画_yorisoi-demo.md

$ErrorActionPreference = "Stop"
$PROJECT_ID = "yorisoi-demo"
$REGION = "asia-northeast1"
$BUCKET_NAME = "yorisoi-demo-recordings"
$AR_REPO = "carelife-repo"
$SA_NAME = "carelife-backend-sa"
$SA_EMAIL = "${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

Write-Host "=== GCP 環境構築: $PROJECT_ID ===" -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

Write-Host "`n--- 1. API 有効化 ---" -ForegroundColor Yellow
$apis = @(
  "firestore.googleapis.com",
  "storage.googleapis.com",
  "storage-api.googleapis.com",
  "speech.googleapis.com",
  "aiplatform.googleapis.com",
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "cloudbuild.googleapis.com",
  "firebase.googleapis.com"
)
gcloud services enable $apis

Write-Host "`n--- 2. GCS バケット作成 ---" -ForegroundColor Yellow
$bucketExists = gsutil ls -b "gs://$BUCKET_NAME" 2>$null
if (-not $bucketExists) {
  gsutil mb -l $REGION "gs://$BUCKET_NAME"
  Write-Host "バケット gs://$BUCKET_NAME を作成しました。"
} else {
  Write-Host "バケット gs://$BUCKET_NAME は既に存在します。"
}

# CORS 設定（scripts から見た cors ファイルのパス）
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$corsPath = Join-Path $scriptDir "gcs-cors.json"
if (Test-Path $corsPath) {
  Write-Host "CORS を適用しています..."
  gsutil cors set $corsPath "gs://$BUCKET_NAME"
} else {
  Write-Host "gcs-cors.json が見つかりません。CORS はスキップします。"
}

Write-Host "`n--- 3. Artifact Registry リポジトリ作成 ---" -ForegroundColor Yellow
$arExists = gcloud artifacts repositories describe $AR_REPO --location=$REGION 2>$null
if (-not $arExists) {
  gcloud artifacts repositories create $AR_REPO --repository-format=docker --location=$REGION --description="Docker images for Carelife MVP"
  Write-Host "リポジトリ $AR_REPO を作成しました。"
} else {
  Write-Host "リポジトリ $AR_REPO は既に存在します。"
}

Write-Host "`n--- 4. サービスアカウント作成 ---" -ForegroundColor Yellow
$saExists = gcloud iam service-accounts describe $SA_EMAIL 2>$null
if (-not $saExists) {
  gcloud iam service-accounts create $SA_NAME --display-name="Carelife Backend Cloud Run"
  Write-Host "サービスアカウント $SA_EMAIL を作成しました。"
} else {
  Write-Host "サービスアカウント $SA_EMAIL は既に存在します。"
}

Write-Host "`n--- 5. サービスアカウントにロール付与 ---" -ForegroundColor Yellow
$roles = @(
  "roles/datastore.user",
  "roles/storage.objectAdmin",
  "roles/speech.client",
  "roles/aiplatform.user",
  "roles/secretmanager.secretAccessor"
)
foreach ($role in $roles) {
  gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role=$role --quiet
}
Write-Host "ロールの付与が完了しました。"

Write-Host "`n=== 構築完了 ===" -ForegroundColor Green
Write-Host "次のステップ:"
Write-Host "  1. Firebase Console で Firestore を有効化（未作成の場合）: https://console.firebase.google.com/"
Write-Host "  2. LINE / Gemini 用シークレットを Secret Manager に登録（必要に応じて）"
Write-Host "  3. バックエンドの .env に PROJECT_ID=$PROJECT_ID, GCS_BUCKET=$BUCKET_NAME を設定"
