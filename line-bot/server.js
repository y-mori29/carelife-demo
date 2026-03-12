/**
 * Carelife 通院報告 — LINE Bot (MVP)
 * 環境変数 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が設定されている場合のみ
 * メッセージに応答し、報告作成用のリンクを返します。
 * 未設定の場合は Webhook に 200 を返すだけ（LINE の検証用）。
 */
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// LINE からは body をそのまま検証するため raw
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// 報告作成用フロントエンドのURL（環境変数で上書き可能）
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Carelife LINE Bot (MVP)' });
});

app.post('/webhook', (req, res) => {
  res.status(200).send('OK');

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    console.log('[LINE] Credentials not set. Skip reply.');
    return;
  }

  const events = req.body?.events || [];
  for (const ev of events) {
    const replyToken = ev.replyToken;
    let triggerReport = false;
    // 1:1 / グループ / ルームいずれも source.userId で送信者を取得（必須：この値がないと「LINEに送信する」の宛先が決まらない）
    const userId = (ev.source && ev.source.userId) ? String(ev.source.userId).trim() : '';

    // テキストメッセージ:「報告」「通院」「はじめる」「スタート」で報告作成リンクを返す
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = (ev.message.text || '').trim();
      if (/報告|通院|はじめる|スタート/.test(text)) triggerReport = true;
    }

    // リッチメニューのポストバック: data が "report" または "action=report" のときも同じく報告リンクを返す
    if (ev.type === 'postback' && ev.postback?.data) {
      const data = (ev.postback.data || '').trim().toLowerCase();
      if (data === 'report' || data === 'action=report') triggerReport = true;
    }

    if (triggerReport) {
      const sep = FRONTEND_URL.indexOf('?') >= 0 ? '&' : '?';
      const reportUrl = userId
        ? FRONTEND_URL + sep + 'userId=' + encodeURIComponent(userId)
        : FRONTEND_URL;
      if (!userId) {
        console.warn('[LINE] report link: userId is empty. source=', JSON.stringify(ev.source));
      } else {
        console.log('[LINE] report link with userId (length=' + userId.length + ')');
      }
      const message = {
        type: 'text',
        text: `通院報告を作成します。\n下のリンクからはじめてください。\n\n${reportUrl}`
      };
      fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ replyToken, messages: [message] })
      }).then(r => r.ok ? null : r.text()).then(t => t && console.error('[LINE] Reply error:', t));
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LINE Bot server running on port ${PORT}`);
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.log('LINE_CHANNEL_ACCESS_TOKEN not set. Bot will not reply to messages.');
  }
});
