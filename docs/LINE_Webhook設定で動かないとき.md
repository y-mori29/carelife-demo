# LINE Bot が動かないとき — Webhook 設定の確認

@537echua（【開発環境】よりそい）の Messaging API で「報告」やリッチメニューに反応しない場合、**Webhook URL が未設定** であることがほとんどです。

---

## 1. 原因：Webhook URL が空

LINE の「Messaging API設定」で **Webhook URL** が空欄のままでは、次のような動作になりません。

- ユーザーが「報告」と送る
- リッチメニューのボタンを押す
- グループでメッセージを送る

→ いずれのイベントも **あなたのサーバー（line-bot）に届かない** ため、Bot が返信できません。

**必ず Webhook URL を設定し、「Use webhook」をオンにしてください。**

---

## 2. やること（2パターン）

### パターン A：Cloud Run に line-bot をデプロイしている場合

1. デプロイ後、表示された **LINE Bot の URL** を確認する。  
   例）`https://carelife-linebot-xxxxx-an.a.run.app`
2. LINE Developers → **【開発環境】よりそい** → **Messaging API設定** を開く。
3. **Webhook設定** の **Webhook URL** に次を入力する。  
   `https://carelife-linebot-xxxxx-an.a.run.app/webhook`  
   （実際の URL はデプロイ時に表示されたものに置き換える。末尾は必ず `/webhook`）
4. **「更新」**（または「保存」）を押す。
5. **「検証」** を押し、成功することを確認する。
6. **「Use webhook」** を **オン** にする。

これで、LINE から送られたイベントが Cloud Run の line-bot に届き、「報告」やリッチメニューに反応するようになります。

---

### パターン B：ローカルで line-bot を動かして試す場合

LINE の Webhook は **HTTPS** が必須のため、localhost のままでは設定できません。**ngrok** などで HTTPS の URL を用意します。

1. **ngrok** で line-bot のポートを公開する。  
   例）line-bot がポート 8080 なら:  
   `ngrok http 8080`  
   → 表示された `https://xxxx.ngrok-free.app` を控える。
2. LINE Developers → **【開発環境】よりそい** → **Messaging API設定**。
3. **Webhook URL** に  
   `https://xxxx.ngrok-free.app/webhook`  
   を入力し、**更新** → **検証** で成功を確認。
4. **Use webhook** を **オン** にする。
5. ローカルで line-bot を起動し、LINE で「報告」と送って反応を確認する。

※ ngrok の URL は起動のたびに変わる場合があるため、その都度 LINE の Webhook URL を更新する必要があります。

---

## 3. LIFF について（Carelife では不要）

「LIFF」タブには「Messaging API チャネルには LIFF アプリを追加できません」と表示されます。

**Carelife では LIFF は使っていません。** 報告画面は通常の Web リンク（フロントエンドの URL）を開く方式です。  
Bot が「報告」などに反応して **そのリンクを返す** だけでよいため、LIFF の設定は不要です。Messaging API と Webhook の設定だけで動作します。

---

## 4. 設定の確認チェックリスト

- [ ] **Webhook URL** に `https://（line-bot の URL）/webhook` を設定した
- [ ] Webhook の **検証** が成功している
- [ ] **Use webhook** が **オン** になっている
- [ ] line-bot が起動している（Cloud Run の場合はデプロイ済み）
- [ ] line-bot の環境変数に **LINE_CHANNEL_ACCESS_TOKEN** と **FRONTEND_URL** が設定されている

「グループトーク・複数人トークへの参加を許可する」が有効になっていれば、グループでの利用も可能です。

---

## 5. 「LINEに送信する」で報告が LINE に届かないとき

「報告」と送ると Bot からリンクが返り、報告作成までは動くが、**「LINEに送信する」を押しても報告が LINE のトークに届かない**場合は、次の2点を確認してください。

### 原因1：バックエンド（carelife-backend）に LINE トークンが渡っていない

「LINEに送信する」を押すと、フロントエンドが **carelife-backend** の `POST /api/carelife/send-to-line` を呼び、バックエンドが LINE Messaging API の Push で報告を送ります。このとき **carelife-backend** に **LINE_CHANNEL_ACCESS_TOKEN** が設定されていないと、送信できません。

**重要：line-bot と backend は別サービスです**

- **carelife-linebot** … 「報告」と送ったときにリンクを返すサービス。ここに `LINE_CHANNEL_ACCESS_TOKEN` が入っていると、Bot の返信は動きます。
- **carelife-backend** … 報告作成 API と **「LINEに送信する」で Push を送る**サービス。**こちらにも** 同じ `LINE_CHANNEL_ACCESS_TOKEN` を設定する必要があります。

LINE Bot の返信は動いているが「LINEに送信する」だけ届かない場合は、**carelife-linebot ではなく carelife-backend** の環境変数を開き、`LINE_CHANNEL_ACCESS_TOKEN` が入っているか確認してください。

**対処（Cloud Run の場合）**

1. **Google Cloud コンソール** → **Cloud Run** で、一覧から **「carelife-backend」** を選ぶ（carelife-linebot ではない）。
2. **「編集」** → **「変数とシークレット」** を開き、`LINE_CHANNEL_ACCESS_TOKEN` があるか確認する。
3. なければ **「変数を追加」** で、名前 `LINE_CHANNEL_ACCESS_TOKEN`、値に LINE Developers の Channel access token（長期）を貼り付け、**「デプロイ」** で保存する。
4. または **backend/.env** に `LINE_CHANNEL_ACCESS_TOKEN` を入れたうえで `.\scripts\deploy-cloudrun.ps1` を実行すると、carelife-backend にも自動で渡されます。

設定後、もう一度「LINEに送信する」を試してください。

### 原因2：Bot のリンクに userId が付いていない（送信先が特定できない）

報告を送る「送信先」は、**Bot が返したリンクの URL に含まれる userId** で決まります。  
Bot が返すリンクが `https://carelife-frontend-xxx.run.app` のままで **`?userId=Uxxxx...` が付いていない** と、送信先が特定できず「LINEに送信する」が使えません。

**考えられる理由**

1. **line-bot のデプロイが古い**  
   「報告」に反応してリンクを返す **carelife-linebot** のコードが古く、リンクに userId を付与する処理が入っていないことがあります。
2. **ブックマークや直接入力で開いている**  
   必ず「報告」と送ったあと、Bot が返してきたリンクから開く必要があります。

**対処**

- **line-bot を再デプロイする**  
  `.\scripts\deploy-cloudrun.ps1` を実行すると、**carelife-linebot** も含めて最新コードでデプロイされます。  
  再デプロイ後、LINE で「報告」と送り直し、返ってきたリンクの URL に **`?userId=U` で始まるクエリ** が付いているか確認してください。
- そのリンクをタップ（またはコピーしてブラウザで開く）して報告画面を開き、報告作成〜「LINEに送信する」まで試してください。

### 確認のヒント

- 画面上に「LINE送信は現在利用できません。管理者に連絡してください。」と出る → 原因1（**carelife-backend** にトークンなし）の可能性が高いです。
- 「送信先が特定できません。LINEの『報告』などからリンクを開いてください。」と出る → 原因2（リンクに userId なし）です。上記のとおり、Bot が返したリンクから開き直してください。

### 原因3：LINE のアプリ内ブラウザでリンクを開いている（URL の userId が渡っていない）

スマートフォンで LINE のトーク内のリンクをタップすると、**LINE のアプリ内ブラウザ**で開くことがあります。環境によっては、このとき **URL のクエリ（?userId=...）が渡らない** 場合があり、その結果「送信先が特定できません」になったり、送信が失敗したりすることがあります。

**対処**

- リンクを **長押し** し、「ブラウザで開く」「外部ブラウザで開く」などを選んで、**Chrome や Safari などの通常のブラウザ**で開き直してから、報告作成〜「LINEに送信する」まで試してください。
- または、Bot が返したメッセージ内のリンクを **コピー** し、ブラウザのアドレスバーに貼り付けて開いてください。

### 原因4：報告は「Bot との1:1トーク」に届く（グループには届かない）

LINE Messaging API の **Push メッセージ** は、指定した userId の **「Bot とそのユーザーの1:1トーク」** にのみ送信されます。グループトークには投稿されません。

**確認方法**

- 「報告」を送った **グループ** ではなく、LINE のトーク一覧で **この Bot（例：@537echua）との個別チャット** を開いてください。報告文はそこに届いています。
- グループ内で報告を共有したい場合は、1:1で届いた報告をコピーしてグループに貼る、などの運用で対応してください。

---

### 原因1・2・3・4で解決しないとき（実際のエラーを確認する）

1. **「LINEに送信する」を押したあと、画面上に表示されるエラーメッセージ** を確認してください。  
   バックエンドが LINE API から受け取ったエラー内容の一部を表示するようにしているため、表示された文言が原因の手がかりになります。
2. **ブラウザの開発者ツール**（F12）→ **ネットワーク** タブを開き、「LINEに送信する」を押す。  
   `send-to-line` へのリクエストを選び、**ステータスコード**（200 / 400 / 503 など）と **レスポンス本文** を確認する。  
   - 503 → carelife-backend にトークンが無い、または Push API 側のエラー。  
   - 400 → userId 不足や LINE API の 400（ブロック・チャネル不一致など）。レスポンスの `error` に LINE のエラー内容が含まれる場合があります。
3. **Cloud Run** → **carelife-backend** → **「ログ」** で、送信ボタンを押した時刻前後のログを確認する。  
   `[LINE] Push message failed:` が出ていれば、その直後のメッセージで LINE API のエラー内容が分かります。  
   `[LINE] Push message sent successfully` が出ているのに報告が届かない場合は、**リンクを開いた人と、報告を確認している人が同じか**（同じ LINE アカウントか）確認してください。
4. LINE Developers の **Channel access token** が、line-bot と **carelife-backend の両方** で同じチャネルの同じ値になっているか確認する（再発行した場合は両方で更新が必要）。

---

## 6. それでも動かないとき

- LINE Developers の **Channel access token** が、line-bot に渡しているトークンと一致しているか確認する（再発行した場合は line-bot の環境変数を更新する）。
- Cloud Run の場合は、該当サービスの **ログ** で Webhook が届いているか確認する。
- ローカルの場合は、line-bot を起動したターミナルのログで、POST /webhook が来ているか確認する。
