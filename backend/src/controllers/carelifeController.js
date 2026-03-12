const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const supplementQuestions = require('../data/supplementQuestions');
const MOCK = process.env.MOCK_MODE === '1' || process.env.MOCK_MODE === 'true';
const store = MOCK ? require('../config/mockStore') : null;
const { bucket } = require('../config/gcs');
const { execFFmpeg } = require('../utils/mediaUtils');

// --- Facilities (MVP: mock only) ---
exports.listFacilities = (req, res) => {
  try {
    if (MOCK && store) {
      const list = store.getFacilities();
      return res.json({ ok: true, facilities: list });
    }
    // TODO: Firestore when not mock
    res.json({ ok: true, facilities: store ? store.getFacilities() : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- Patients ---
exports.listPatients = (req, res) => {
  try {
    const { facilityId } = req.query;
    if (MOCK && store) {
      const list = store.getPatients(facilityId || null);
      return res.json({ ok: true, patients: list });
    }
    res.json({ ok: true, patients: store ? store.getPatients(facilityId) : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- Supplement questions ---
exports.getSupplementQuestions = (req, res) => {
  res.json({ ok: true, questions: supplementQuestions });
};

// --- Create encounter (start session) ---
// v02: patientLastName, patientFirstName で患者を特定（patientId は省略可）
exports.createEncounter = (req, res) => {
  try {
    const body = req.body || {};
    const { patientId, patientLastName, patientFirstName, facilityId, recordedByName, hospitalName, department, doctorName } = body;
    const lastName = String(patientLastName || '').trim();
    const firstName = String(patientFirstName || '').trim();
    const name = [lastName, firstName].filter(Boolean).join(' ') || '利用者';
    const id = patientId || (lastName || firstName ? `input_${lastName}_${firstName}` : uuidv4());
    const encounterId = uuidv4();
    const payload = {
      patientId: id,
      patientLastName: lastName || null,
      patientFirstName: firstName || null,
      patientName: name,
      facilityId: facilityId || null,
      recordedByName: recordedByName || '担当者',
      hospitalName: hospitalName || null,
      department: department || null,
      doctorName: doctorName || null,
      status: 'OPEN',
      createdAt: new Date().toISOString()
    };
    if (MOCK && store) {
      store.saveEncounter(encounterId, payload);
      return res.status(201).json({ encounterId, patientId: id, patientName: name });
    }
    res.status(201).json({ encounterId, patientId: id, patientName: name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- Sign upload (GCS signed URL or mock) ---
exports.signUpload = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      recordingId: existingId,
      seq,
      contentType,
      patientId,
      facilityId,
      recordedByName,
      encounterId
    } = body;

    const recordingId = existingId || uuidv4();
    const sequence = seq || 1;

    if (MOCK && store) {
      store.saveRecording(recordingId, {
        status: 'UPLOADING',
        patientId: patientId || null,
        facilityId: facilityId || null,
        recordedByName: recordedByName || null,
        encounterId: encounterId || null,
        lastChunkSeq: sequence
      });
      return res.json({
        recordingId,
        uploadUrl: `https://mock-upload.local/${recordingId}/${sequence}`,
        seq: sequence
      });
    }
    // TODO: real GCS signed URL
    res.json({ recordingId, uploadUrl: `https://mock.local/${recordingId}`, seq: sequence });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- Generate mock 通院報告 text（マークダウンなし・今日の日付）---
function buildMockReport(patientName, recordedByName, supplementAnswers, opts = {}) {
  const a = supplementAnswers || {};
  const qs = supplementQuestions;
  const hospitalName = opts.hospitalName || '〇〇病院';
  const department = opts.department || '精神科';
  const doctorName = opts.doctorName || '〇〇医師';
  const now = new Date();
  const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  const lines = [
    '■ 通院報告',
    '',
    `利用者名：${patientName || '〇〇'}様`,
    `受診日：${todayStr}`,
    `受診先：${hospitalName}${department ? ' ' + department : ''}`,
    `担当医：${doctorName}`,
    '',
    '【診察内容】',
    '本日の診察では、睡眠状態や施設内での生活状況について確認が行われました。',
    '',
    '【ご本人の様子】',
    a[qs[2]?.id] || '特になし。',
    '',
    '【待機中・道中の様子】',
    a[qs[0]?.id] || '特になし。',
    a[qs[1]?.id] ? `待ち時間：${a[qs[1].id]}` : '',
    '',
    '【補足・申し送り事項】',
    a[qs[3]?.id] || '特になし。',
    '',
    '【処方箋・送迎対応】',
    a[qs[4]?.id] || '特になし。',
    '',
    '【次回予約】',
    '未定',
    '',
    `担当：${recordedByName || '―'}`
  ];
  return lines.filter(Boolean).join('\n');
}

// --- 実音声パイプライン: アップロード音声 → WAV変換 → GCS → STT → Gemini 要約 ---
async function runSttAndReport(recordingId, audioPath, meta = {}) {
  const { patientName, recordedByName, hospitalName, department, doctorName, supplementAnswers = {} } = meta;
  const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName || !bucket) throw new Error('GCS_BUCKET が設定されていません');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が設定されていません');

  const tmpDir = os.tmpdir();
  const rawPath = path.join(tmpDir, `carelife_${recordingId}.raw`);
  const wavPath = path.join(tmpDir, `carelife_${recordingId}.wav`);

  try {
    // 1. 入力音声を 16kHz mono WAV に変換（webm/mp4 等対応）
    await execFFmpeg([
      '-i', audioPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      '-y', wavPath
    ]);

    // 2. GCS に WAV をアップロード
    const wavGcsPath = `audio/${recordingId}.wav`;
    await bucket.upload(wavPath, { destination: wavGcsPath, contentType: 'audio/wav' });
    const gcsUri = `gs://${bucketName}/${wavGcsPath}`;

    // 3. Speech-to-Text V2 (chirp_3, asia-northeast1)
    const { SpeechClient } = require('@google-cloud/speech').v2;
    const speechClient = new SpeechClient({ apiEndpoint: 'asia-northeast1-speech.googleapis.com' });
    const location = 'asia-northeast1';
    const recognizer = `projects/${projectId}/locations/${location}/recognizers/_`;
    const [operation] = await speechClient.batchRecognize({
      recognizer,
      config: {
        autoDecodingConfig: {},
        model: 'chirp_3',
        languageCodes: ['ja-JP'],
        features: {
          enableAutomaticPunctuation: true,
          diarizationConfig: { minSpeakerCount: 1, maxSpeakerCount: 4 }
        }
      },
      files: [{ uri: gcsUri }],
      recognitionOutputConfig: { inlineResponseConfig: {} }
    });
    const [sttResponse] = await operation.promise();

    let transcript = '';
    const results = sttResponse.results || {};
    const fileResult = results[gcsUri] || results[Object.keys(results)[0]];
    if (fileResult) {
      const tr = fileResult.inlineResult?.transcript || fileResult.transcript;
      const resultsArray = tr?.results || [];
      if (resultsArray.length > 0) {
        const words = [];
        resultsArray.forEach(r => {
          const alt = r.alternatives?.[0];
          if (alt?.words) words.push(...alt.words);
        });
        if (words.length > 0) {
          let curSp = '', curSen = '';
          for (const w of words) {
            const label = (w.speakerLabel || '1').replace('speaker:', '話者');
            const sp = label.startsWith('話者') ? label : `話者${label}`;
            if (sp !== curSp) {
              if (curSen.trim()) transcript += `\n${curSp}: ${curSen.trim()}`;
              curSp = sp;
              curSen = '';
            }
            curSen += w.word;
          }
          if (curSen.trim()) transcript += `\n${curSp}: ${curSen.trim()}`;
          transcript = transcript.trim();
        } else {
          transcript = resultsArray.map(r => r.alternatives?.[0]?.transcript).filter(Boolean).join('\n');
        }
      }
    }
    if (!transcript) transcript = '（文字起こし結果が空でした）';

    // 4. Gemini で通院報告要約（モデル: gemini-3.1-flash-lite-preview）
    let reportText;
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
      const supplementText = Object.entries(supplementAnswers)
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      const now = new Date();
      const todayStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
      const prompt = `あなたは介護施設の通院報告をまとめるAIです。
以下の「診察のやり取りの文字起こし」と「担当者による補足」を踏まえ、簡潔な通院報告文（日本語）を1つ作成してください。

【重要な出力ルール】
・マークダウン記号（#、##、#### など）は一切使わないでください。編集しやすいよう、普通の文章だけにしてください。
・見出しは「■」や「【】」で区切る程度にし、改行で読みやすくしてください。
・受診日は必ず「${todayStr}」を使ってください（今日の日付です）。
・利用者名・受診先・診察内容・ご本人の様子・申し送り・担当者名などを含めてください。
補足が空の場合は文字起こしのみで構成してください。

【文字起こし】
${transcript}

【補足】
${supplementText || '（なし）'}

【メタ情報（報告に反映）】
利用者名: ${patientName || '―'}
担当者: ${recordedByName || '―'}
病院・診療科: ${[hospitalName, department].filter(Boolean).join(' ') || '―'}
担当医: ${doctorName || '―'}
今日の日付: ${todayStr}

上記を踏まえた通院報告文のみを、マークダウンなしの平文で出力してください。`;
      const result = await model.generateContent(prompt);
      reportText = (result.response?.text?.() || '').trim() || '（要約の生成に失敗しました）';
      // 編集画面で読みやすくするため、マークダウン記号を除去（# で始まる見出しのみ平文に）
      reportText = reportText.replace(/^#{1,6}\s*/gm, '').trim();
    } catch (geminiErr) {
      console.error('[Carelife] Gemini API error:', geminiErr.message || geminiErr);
      throw new Error(`要約の生成に失敗しました（Gemini API）: ${geminiErr.message || String(geminiErr)}`);
    }

    return { transcript, reportText };
  } finally {
    try {
      await fs.unlink(audioPath).catch(() => {});
      await fs.unlink(wavPath).catch(() => {});
      await fs.unlink(rawPath).catch(() => {});
    } catch (_) {}
  }
}

// --- Finalize recording & generate report (mock: immediate; real: STT+Gemini) ---
exports.finalizeRecording = async (req, res) => {
  try {
    const { recordingId } = req.params;
    const body = req.body || {};
    let supplementAnswers = body.supplementAnswers;
    if (typeof supplementAnswers === 'string') {
      try { supplementAnswers = JSON.parse(supplementAnswers); } catch (_) { supplementAnswers = {}; }
    }
    const {
      encounterId,
      patientId,
      patientName,
      patientLastName,
      patientFirstName,
      recordedByName,
      hospitalName,
      department,
      doctorName
    } = body;
    const pName = patientName || (patientLastName || patientFirstName ? [patientLastName, patientFirstName].filter(Boolean).join(' ') : null) || '利用者';

    if (MOCK && store && !req.file) {
      const rec = store.getRecording(recordingId);
      const encId = encounterId || rec?.encounterId;
      const enc = encId ? store.getEncounter(encId) : null;
      const staffName = recordedByName || rec?.recordedByName || (enc?.recordedByName) || '担当者';
      const reportOpts = {
        hospitalName: hospitalName || enc?.hospitalName,
        department: department || enc?.department,
        doctorName: doctorName || enc?.doctorName
      };
      const reportText = buildMockReport(pName, staffName, supplementAnswers || {}, reportOpts);
      if (encId) {
        store.saveEncounter(encId, {
          patientId: patientId || enc?.patientId,
          status: 'COMPLETED',
          reportText,
          supplementAnswers: supplementAnswers || {},
          recordedByName: staffName,
          completedAt: new Date().toISOString()
        });
      }
      return res.json({
        ok: true,
        status: 'COMPLETED',
        encounterId: encId || recordingId,
        reportText,
        transcript: '(モックのため文字起こしはありません)',
        message: '通院報告を作成しました。'
      });
    }

    // 実音声あり: 一時ファイルに書き出し → STT + Gemini で文字起こし・要約
    if (req.file && (req.file.buffer || req.file.path)) {
      const meta = {
        patientName: pName,
        recordedByName: recordedByName || '担当者',
        hospitalName: hospitalName || null,
        department: department || null,
        doctorName: doctorName || null,
        supplementAnswers: supplementAnswers || {}
      };
      let tmpPath = req.file.path;
      if (req.file.buffer) {
        tmpPath = path.join(os.tmpdir(), `carelife_upload_${recordingId}_${Date.now()}`);
        await fs.writeFile(tmpPath, req.file.buffer);
      }
      const { transcript, reportText } = await runSttAndReport(recordingId, tmpPath, meta);
      return res.json({
        ok: true,
        status: 'COMPLETED',
        encounterId: encounterId || recordingId,
        transcript,
        reportText,
        message: '通院報告を作成しました。'
      });
    }

    if (!MOCK) {
      return res.status(400).json({
        error: '音声ファイルが必要です。フロントで録音したうえで「報告を作成する」を押してください。'
      });
    }

    res.status(202).json({ ok: true, status: 'PROCESSING', encounterId: encounterId || recordingId });
  } catch (e) {
    console.error('Finalize error:', e);
    res.status(500).json({ error: e.message });
  }
};

// --- Get report by encounterId (for polling when real async) ---
exports.getReport = (req, res) => {
  try {
    const { encounterId } = req.params;
    if (MOCK && store) {
      const enc = store.getEncounter(encounterId);
      if (!enc) return res.status(404).json({ error: 'Report not found' });
      return res.json({ ok: true, reportText: enc.reportText, status: enc.status });
    }
    res.status(404).json({ error: 'Not implemented' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- Send report to LINE (Push Message) ---
const LINE_MESSAGE_MAX_LENGTH = 5000;

exports.sendReportToLine = async (req, res) => {
  try {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token || !token.trim()) {
      return res.status(503).json({
        error: 'LINE送信は現在利用できません。管理者に連絡してください。'
      });
    }
    const { reportText, userId } = req.body || {};
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({
        error: '送信先が特定できません。LINEの「報告」などからリンクを開いてください。'
      });
    }
    const text = typeof reportText === 'string' ? reportText.trim() : '';
    if (!text) {
      return res.status(400).json({ error: '報告文が空です。' });
    }
    const body = text.length <= LINE_MESSAGE_MAX_LENGTH
      ? text
      : text.slice(0, LINE_MESSAGE_MAX_LENGTH - 20) + '\n\n...(長いため省略)';
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: userId.trim(),
        messages: [{ type: 'text', text: body }]
      })
    });
    const errBody = await response.text();
    if (!response.ok) {
      let lineMessage = '';
      try {
        const errJson = JSON.parse(errBody);
        lineMessage = errJson.message || errJson.details?.[0]?.message || '';
      } catch (_) {}
      console.error('[LINE] Push message failed:', response.status, errBody);
      if (response.status === 401) {
        return res.status(503).json({ error: 'LINE送信の設定に問題があります。トークンを確認してください。' });
      }
      if (response.status === 403) {
        const hint = lineMessage || 'Botがブロックされている、または友だちに追加されていない可能性があります。';
        return res.status(400).json({
          error: 'LINEへの送信に失敗しました。' + hint
        });
      }
      if (response.status === 400) {
        const hint = lineMessage || '送信先の指定に問題がある可能性があります。LINEの「報告」から返ってきたリンクをそのまま開き直してください。';
        return res.status(400).json({ error: 'LINEへの送信に失敗しました。' + hint });
      }
      return res.status(502).json({
        error: 'LINEへの送信に失敗しました。しばらくしてからお試しください。' + (lineMessage ? ' (' + lineMessage + ')' : '')
      });
    }
    console.log('[LINE] Push message sent successfully (to userId, length=' + body.length + ' chars)');
    return res.json({ ok: true, message: 'LINEに送信しました。' });
  } catch (e) {
    console.error('sendReportToLine error:', e);
    res.status(500).json({ error: e.message || '送信に失敗しました。' });
  }
};
