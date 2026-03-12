# LINE でテストするための手順

Carelife 通院報告を「LINE から起動して使う」「報告を LINE に送信する」までテストするために必要な手順をまとめます。

- **グループ LINE で Bot を使う・リッチメニューでボタンから起動する** 手順は → [LINEグループ・リッチメニュー利用手順](./LINEグループ・リッチメニュー利用手順.md) を参照してください。

---

## 全体の流れ

| 段階 | 内容 |
|------|------|
| **1. LINE 側の準備** | LINE Developers でチャネル（Bot）を作成し、Channel Secret と Access Token を取得する |
| **2. ローカルを外から見えるようにする** | ngrok などでフロント・バックエンド・LINE Bot に HTTPS の URL を付ける（LINE の Webhook は HTTPS 必須） |
| **3. LINE Bot の起動** | `line-bot` にトークンと Webhook 用 URL を設定して起動し、LINE で「報告」と送るとリンクが返るようにする |
| **4. （任意）報告を LINE に送信** | SC-11 の「LINEに送信する」を押したときに、バックエンド経由で LINE に報告文を投稿する機能を実装する |

---

## 1. LINE Developers でチャネルを作成する

### 1.1 アカウント・プロバイダー

1. [LINE Developers](https://developers.line.biz/ja/) にアクセスし、LINE アカウントでログインする。
2. 必要なら **プロバイダー** を作成する（「Create」→ 名前を入力。既にあればそのまま利用）。

### 1.2 Messaging API チャネルを作成

1. 対象プロバイダーで **「Create a new channel」** をクリック。
2. **「Messaging API」** を選び、次を入力する：
   - **Channel name**: 例）Carelife 通院報告（テスト用）
   - **Channel description**: 任意
   - **Category**: 例）Healthcare
   - **Subcategory**: 任意
   - **メールアドレス**・**プライバシーポリシー URL**・**利用規約 URL** は必須欄を適宜入力。
3. 規約に同意して作成する。

### 1.3 必要な情報を控える

チャネルができたら、以下をメモする：

| 項目 | どこにあるか |
|------|----------------|
| **Channel ID** | チャネル詳細の「Basic settings」タブ |
| **Channel Secret** | 同じく「Basic settings」→ 「Channel secret」の「Issue」または表示欄 |
| **Channel Access Token** | 「Messaging API」タブ → 「Channel access token」の「Issue」または「Reissue」 |

※ Access Token は再発行すると古いトークンは使えなくなるので、控えたら漏らさないようにする。

### 1.4 Bot を友だち追加

- 「Messaging API」タブの **QR コード** をスマートフォンで読み取り、作成した Bot を LINE の友だちに追加する。
- テスト時はこの Bot にメッセージを送り、Webhook で反応を確認する。

---

## 2. ローカルをインターネットから見えるようにする（ngrok）

LINE の Webhook は **HTTPS の URL** が必須です。ローカル（localhost）のままでは LINE から呼べないため、**ngrok** などでトンネルを張り、HTTPS の URL を用意します。

### 2.1 ngrok の利用

1. [ngrok](https://ngrok.com/) に登録し、ngrok をインストールする。
2. ターミナルで次のように **3 本** トンネルを張る（別々のターミナル、または ngrok の設定で複数ポートを指定）：

   - **フロントエンド**（例: ローカル 5173）  
     `ngrok http 5173`  
     → 表示された `https://xxxx.ngrok-free.app` を **フロントの公開 URL** として使う。
   - **バックエンド**（例: ローカル 8081）  
     `ngrok http 8081`  
     → 表示された `https://yyyy.ngrok-free.app` を **API の公開 URL** として使う。
   - **LINE Bot**（例: ローカル 3000）  
     `ngrok http 3000`  
     → 表示された `https://zzzz.ngrok-free.app` を **Webhook URL** に設定する。

3. 毎回起動で URL が変わる場合は、ngrok の有料プランで固定ドメインを取るか、起動のたびに LINE の Webhook URL を更新する。

### 2.2 フロントからバックエンドを叩くための設定

- フロントは「API のベース URL」に **バックエンドの ngrok URL** を向ける必要がある。
- 開発時は次のどちらかで対応する：
  - **ビルド時に指定**: `VITE_API_BASE_URL=https://yyyy.ngrok-free.app npm run dev`（または `.env` に記載）
  - **本番ビルドで指定**: `VITE_API_BASE_URL=https://yyyy.ngrok-free.app npm run build` して、そのビルドを配信する。

※ フロントも ngrok で公開した URL（https://xxxx.ngrok-free.app）を LINE Bot が「報告作成リンク」として返すようにする（後述）。

---

## 3. LINE Bot（line-bot）の設定と起動

### 3.1 LINE の Webhook 設定

1. LINE Developers の該当チャネル → **「Messaging API」** タブ。
2. **「Webhook URL」** に、line-bot の公開 URL を入力する。  
   例）`https://zzzz.ngrok-free.app/webhook`
3. **「Verify」** で成功すれば、LINE からイベントがこの URL に送られる。
4. **「Use webhook」** をオンにする。
5. （任意）「Auto-response messages」をオフにすると、Bot の応答は Webhook 側の実装だけになる。

### 3.2 line-bot の環境変数と起動

1. プロジェクトの **`line-bot`** ディレクトリで:

   ```bash
   cd line-bot
   npm install
   ```

2. 環境変数を設定して起動する（PowerShell の例）:

   ```powershell
   $env:LINE_CHANNEL_SECRET = "取得した Channel Secret"
   $env:LINE_CHANNEL_ACCESS_TOKEN = "取得した Channel Access Token"
   $env:FRONTEND_URL = "https://xxxx.ngrok-free.app"
   npm start
   ```

   - `FRONTEND_URL` には、**フロントエンドの ngrok URL** を入れる（LINE で「報告」と送ったときに返すリンクになる）。
   - ポートは既定で 3000。別ポートにする場合は `$env:PORT = "3000"` などで指定。

3. LINE で Bot に **「報告」** または **「はじめる」** などと送る。
4. Bot から「通院報告を作成します。下のリンクからはじめてください。」と、`FRONTEND_URL` のリンクが返れば OK。

---

## 4. テストの流れ（ここまででできること）

1. **PC 上で起動しておくもの**
   - フロントエンド: `npm run dev`（例: localhost:5173）
   - バックエンド: `node server.js`（例: localhost:8081）
   - LINE Bot: `npm start`（例: localhost:3000）
   - ngrok: 上記 3 ポート分（5173 / 8081 / 3000）

2. **スマートフォンで**
   - LINE で該当 Bot に「報告」と送る。
   - 返ってきたリンク（フロントの ngrok URL）をタップする。
   - ブラウザで Carelife の画面が開くので、患者名・担当者・録音〜報告作成まで操作する。

3. **注意**
   - フロントが参照する API は、`VITE_API_BASE_URL` で指定した **バックエンドの ngrok URL** である必要がある（スマホからもその URL で 8081 の処理に届くようにする）。

---

## 5. 「LINEに送信する」で報告を LINE に投稿する（任意）

現在、SC-11 の「LINEに送信する」は **画面遷移のみ** で、実際には LINE に報告文は送られません。テストで「送信したら LINE に報告が届く」ようにするには、次のような実装が必要です。

### 5.1 やることの概要

- **バックエンド**に「報告文を LINE に送る」API を 1 本用意する（例: `POST /api/carelife/send-to-line`）。
  - リクエスト body に `reportText` と、送信先の `userId`（LINE のユーザー ID）などを渡す。
  - バックエンドで LINE Messaging API の **Push Message** を使い、`LINE_CHANNEL_ACCESS_TOKEN` でそのユーザーに報告文を送る。
- **フロント**では、SC-11 で「LINEに送信する」を押したときに上記 API を呼び、成功したら SC-12（送信完了）へ遷移する。
- LINE の `userId` は、**LINE からリンクを開いたとき**に LIFF やクエリパラメータで渡すか、または Bot の Webhook で「どのユーザーがリンクを開いたか」を紐付ける必要がある（実装方針に応じて設計）。

### 5.2 必要な情報

- **Channel Access Token**: 上記 1.3 で取得したもの（バックエンドの環境変数 `LINE_CHANNEL_ACCESS_TOKEN` に設定）。
- **送信先の userId**: LINE のイベントで送られてくる `source.userId`。  
  テストでは「報告作成リンクを開いた人 = 報告を送る相手」とする場合、リンクに `?userId=xxx` を付けるなどしてフロント→バックエンドに渡す必要がある（LIFF を使うと `liff.getProfile()` で取得可能）。

---

## 6. チェックリスト（LINE テスト前の確認）

- [ ] LINE Developers で Messaging API チャネルを作成した
- [ ] Channel Secret と Channel Access Token を取得し、控えた
- [ ] Bot を LINE の友だちに追加した
- [ ] ngrok でフロント・バックエンド・line-bot の 3 つに HTTPS URL を付けた
- [ ] LINE の Webhook URL に `https://(line-botのngrok)/webhook` を設定し、Verify が成功した
- [ ] `line-bot` の `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` / `FRONTEND_URL` を設定して起動した
- [ ] フロントの `VITE_API_BASE_URL` をバックエンドの ngrok URL にした（リンクから開いたときに API が叩けるように）
- [ ] LINE で「報告」と送り、Bot からフロントのリンクが返ることを確認した
- [ ] そのリンクから開いた画面で、録音〜報告作成まで動作することを確認した
- [ ] （任意）「LINEに送信する」で実際に LINE に報告を送る機能を実装した

---

## 7. トラブルシューティング

| 現象 | 確認すること |
|------|----------------|
| Webhook の Verify が失敗する | ngrok が起動しているか。URL が `https://.../webhook` で末尾まで一致しているか。line-bot が 3000 番で待ち受けているか。 |
| 「報告」と送っても Bot が返信しない | LINE_CHANNEL_ACCESS_TOKEN が正しいか。line-bot のログにエラーが出ていないか。LINE の「Use webhook」がオンか。 |
| リンクを開いても画面が動かない | フロントの VITE_API_BASE_URL がバックエンドの ngrok URL になっているか。スマホからその ngrok URL にアクセスできるか。 |
| 録音や報告作成でエラーになる | バックエンドの ngrok が生きているか。CORS やネットワークエラーがブラウザのコンソールに出ていないか。 |

---

以上が、LINE を使ってテストするために必要な手順です。まずは **1〜4** までを実施すると、「LINE で Bot に話しかける → リンクが返る → そのリンクでアプリを操作する」までの流れを確認できます。
