# 介護施設向け通院報告支援システム（Carelife MVP）

要件定義書 **v02**（`20260307_要件定義書v02.md`）に基づく MVP です。  
既存「よりそい」の考え方を活かし、**LINE のみで完結**する通院報告の作成〜確認・送信までを一通り動かします。

**v02 の主な仕様**  
- 起動画面で患者氏名（姓・名）と担当者名を入力して開始  
- 録音終了時に「録音を終了しますか？」の確認画面  
- 補足入力は全質問を1画面で表示  
- 報告生成後は確認・編集画面で内容を修正し、「LINEに送信する」で送信  
- 途中で閉じた場合の再開（localStorage で下書き保存）

## 構成

- **backend** — 通院報告用 API（施設・患者・録音・補足・報告生成）
- **frontend** — 画面 SC-01〜SC-12 の Web アプリ（録音〜補足入力〜完了）
- **line-bot** — LINE Webhook 用サーバー（報告作成リンクを返す。認証情報は後から設定）

## すぐに動かす（MVP・モックモード）

GCP / LINE の設定がなくても、バックエンドをモックモードで動かし、フロントだけでフローを確認できます。

### 1. バックエンド（必ずこのプロジェクトの backend を使用）

**重要**: 「よりそい」用のバックエンド（yorisoi-workspace）ではなく、**本プロジェクトの `carelife_202603/backend`** を起動してください。別のバックエンドだと「patientId is required」などのエラーになります。

```powershell
cd c:\Users\green\Corsor\medicanvas\carelife_202603\backend
npm install
$env:MOCK_MODE="1"
npm start
```

→ `http://localhost:8081` で API が動きます。ブラウザで `http://localhost:8081/` を開き、`"message": "Carelife 通院報告支援 API"` と表示されれば通院報告用のバックエンドです。

### 2. フロントエンド

```bash
cd frontend
npm install
npm run dev
```

→ `http://localhost:5173` を開き、「開始する」から通院報告フローを操作できます。

- 施設・患者はモックデータで表示されます。
- 録音は「録音を始める」→「録音を終える」で時間計測のみ（音声は送信しない簡易版）。
- 補足質問に答えると、最後に**通院報告テキスト**が表示されます。

### 3. LINE Bot（任意）

LINE の Channel Secret / Access Token を用意したら:

```bash
cd line-bot
npm install
set LINE_CHANNEL_SECRET=xxx
set LINE_CHANNEL_ACCESS_TOKEN=xxx
set FRONTEND_URL=https://your-frontend-url
npm start
```

Webhook URL を `https://your-server/webhook` に設定すると、LINE で「報告」や「はじめる」と送ると、報告作成用のリンクが返ります。

## 環境変数（バックエンド）

| 変数 | 説明 |
|------|------|
| `PORT` | サーバーポート（既定: 8081） |
| `MOCK_MODE` | `1` のときモック（メモリ保存・報告はテンプレート生成）。GCP 未設定時は `1` 推奨。 |
| （今後）`GOOGLE_APPLICATION_CREDENTIALS` / `GCS_BUCKET` / `GEMINI_API_KEY` | モック以外で Firestore・GCS・AI を使う場合に設定 |

## 環境変数（フロントエンド）

| 変数 | 説明 |
|------|------|
| `VITE_API_BASE_URL` | API のベース URL（既定: http://localhost:8081） |

## ドキュメント

- [要件定義書](20260307_要件定義書v01.md)
- [開発計画](docs/開発計画_介護施設向け通院報告支援.md)

## 今後の拡張

- 実際の音声アップロード・文字起こし・AI 要約（GCP / 既存「よりそい」バックエンド連携）
- LINE 投稿・Chatwork 連携
- 認証・施設別設定
