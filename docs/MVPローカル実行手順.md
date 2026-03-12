# MVP ローカル実行手順（録音 → 文字起こし → 要約表示）

今日の MVP で実装した範囲です。ローカルで「録音 → Speech-to-Text → Gemini 要約 → フロントに表示」まで動かせます。

---

## 前提

- プロジェクト **yorisoi-demo** の GCP 環境構築済み（API 有効化・GCS バケット・サービスアカウント）
- **ffmpeg** がインストールされ、`ffmpeg` コマンドがパスを通していること

### FFmpeg のインストール（Windows）

```powershell
winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
```

インストール後、**新しいターミナルを開く**か、PATH を反映してから `ffmpeg -version` で確認してください。

---

## 1. バックエンドの設定

1. **`.env` を用意**
   - `backend/.env.example` をコピーして `backend/.env` を作成
   - 以下を設定する:
     - `PROJECT_ID=yorisoi-demo`
     - `GCS_BUCKET=yorisoi-demo-recordings`
     - `GEMINI_API_KEY=<Google AI Studio で取得した API キー>`
   - **MOCK_MODE は設定しない**（または `MOCK_MODE=0`）。実音声パイプラインを使うため

2. **GCP 認証**
   - 次のいずれかで認証する:
     - **A**: サービスアカウントキー（JSON）をダウンロードし、`backend/sa-key.json` に置く。`.env` に `GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json` を追加
     - **B**: `gcloud auth application-default login` でログイン（開発用）

3. **起動**
   ```powershell
   cd backend
   npm install
   npm run dev
   ```
   - デフォルトで `http://localhost:8081` で待ち受け

---

## 2. フロントエンドの起動

```powershell
cd frontend
npm install
npm run dev
```

- ブラウザで表示される URL（例: `http://localhost:5173`）を開く
- フロントの API 先は `VITE_API_BASE_URL` 未設定時は `http://localhost:8081` になります

---

## 3. 動作確認の流れ

1. **SC-01**: 患者さんの姓・名・担当者名を入力 → 次へ
2. **SC-02**: 病院名・診療科・医師名（任意）→ 録音の準備へ
3. **SC-04**: 「録音を始める」→ マイク許可を出す
4. **SC-05**: 録音中。話した内容が録音される
5. 「録音を終える」→ 「はい、終了する」
6. **SC-06** → 次へ
7. **SC-08**: 補足質問（任意で入力）→ 次へ／確認へ
8. **SC-09**: 「報告を作成する」
9. **SC-10**: 処理中（STT ＋ Gemini 要約）
10. **SC-11**: **文字起こし**と**通院報告（要約）**が表示される。内容を確認・編集し、「LINEに送信する」で完了

---

## 4. トラブルシューティング

| 現象 | 確認すること |
|------|----------------|
| 報告の生成に失敗しました | バックエンドの `.env` に `GEMINI_API_KEY` と `GCS_BUCKET` が設定されているか。GCP 認証（SA キー or `gcloud auth application-default login`）が通っているか |
| 音声ファイルが必要です | ブラウザでマイク許可を出しているか。録音を実際に開始・終了してから「報告を作成する」を押しているか |
| ffmpeg エラー | `ffmpeg` がインストールされ、パスが通っているか。バックエンドのコンソールに FFmpeg のエラーが出ていないか |
| CORS エラー | バックエンドが `http://localhost:5173` 等のオリジンを許可しているか（現在 `origin: true` で全許可） |

---

## 5. 今日の MVP で入っている範囲

- **バックエンド**
  - 録音ファイルを multipart で受信
  - ffmpeg で 16kHz mono WAV に変換 → GCS にアップロード
  - Speech-to-Text V2（chirp_3, asia-northeast1）で文字起こし
  - Gemini（gemini-3.1-flash-lite-preview）で通院報告風の要約文を生成
  - レスポンスで `transcript` と `reportText` を返却
- **フロントエンド**
  - MediaRecorder で実録音（audio/webm）
  - 録音終了時に Blob を保持し、「報告を作成する」で FormData として送信
  - SC-11 で「文字起こし」と「通院報告（要約）」の両方を表示

**LINE 連携**は今回の MVP には含めていません。SC-12「LINEに送信する」は画面遷移のみで、実際の LINE 投稿は今後の実装です。
