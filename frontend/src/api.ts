const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

export async function getFacilities() {
  const res = await fetch(`${API_BASE}/api/facilities`);
  if (!res.ok) throw new Error('施設一覧の取得に失敗しました');
  const data = await res.json();
  return data.facilities || [];
}

export async function getPatients(facilityId?: string) {
  const url = facilityId
    ? `${API_BASE}/api/patients?facilityId=${encodeURIComponent(facilityId)}`
    : `${API_BASE}/api/patients`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('患者一覧の取得に失敗しました');
  const data = await res.json();
  return data.patients || [];
}

export async function getSupplementQuestions() {
  const res = await fetch(`${API_BASE}/api/carelife/supplement-questions`);
  if (!res.ok) throw new Error('質問一覧の取得に失敗しました');
  const data = await res.json();
  return data.questions || [];
}

export async function createEncounter(body: {
  patientLastName?: string;
  patientFirstName?: string;
  facilityId?: string;
  recordedByName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
}) {
  const res = await fetch(`${API_BASE}/api/encounters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  const errMsg = (data as { error?: string }).error || '記録の開始に失敗しました';
  if (!res.ok) {
    if (/patientId.*required/i.test(errMsg)) {
      throw new Error('接続先のAPIが通院報告用ではありません。carelife のバックエンド（このフォルダ内の backend）を起動し、MOCK_MODE=1 で実行してください。');
    }
    throw new Error(errMsg);
  }
  return data;
}

export async function signUpload(body: {
  recordingId?: string;
  seq?: number;
  contentType?: string;
  patientId?: string;
  facilityId?: string;
  recordedByName?: string;
  encounterId?: string;
}) {
  const res = await fetch(`${API_BASE}/api/recordings/sign-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('アップロード準備に失敗しました');
  return res.json();
}

export async function finalizeRecording(
  recordingId: string,
  body: {
    supplementAnswers?: Record<string, string>;
    encounterId?: string;
    patientId?: string;
    patientName?: string;
    patientLastName?: string;
    patientFirstName?: string;
    recordedByName?: string;
    hospitalName?: string;
    department?: string;
    doctorName?: string;
  },
  audioBlob?: Blob | null
) {
  if (audioBlob && audioBlob.size > 0) {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('supplementAnswers', JSON.stringify(body.supplementAnswers || {}));
    if (body.encounterId) form.append('encounterId', body.encounterId);
    if (body.patientId) form.append('patientId', body.patientId);
    if (body.patientName) form.append('patientName', body.patientName);
    if (body.patientLastName) form.append('patientLastName', body.patientLastName);
    if (body.patientFirstName) form.append('patientFirstName', body.patientFirstName);
    if (body.recordedByName) form.append('recordedByName', body.recordedByName);
    if (body.hospitalName) form.append('hospitalName', body.hospitalName);
    if (body.department) form.append('department', body.department);
    if (body.doctorName) form.append('doctorName', body.doctorName);
    const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/finalize`, {
      method: 'POST',
      body: form
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '報告の生成に失敗しました');
    return data as { ok: boolean; reportText?: string; transcript?: string; encounterId?: string };
  }
  const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || '報告の生成に失敗しました');
  return data as { ok: boolean; reportText?: string; transcript?: string; encounterId?: string };
}

/** 報告文を LINE に Push 送信する（LINE からリンクを開いたときの userId が必要） */
export async function sendReportToLine(reportText: string, userId: string) {
  const url = `${API_BASE}/api/carelife/send-to-line`;
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Carelife] send-to-line を呼び出し中:', url, 'reportText length:', reportText?.length, 'userId length:', userId?.length);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportText, userId })
  });
  const data = await res.json().catch(() => ({}));
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Carelife] send-to-line 応答:', res.status, data);
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'LINEへの送信に失敗しました');
  }
  return data as { ok: boolean; message?: string };
}
