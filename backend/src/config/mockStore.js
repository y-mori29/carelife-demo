// In-memory store for MVP when GCP is not configured (MOCK_MODE=1)
const facilities = [
  { id: 'f1', name: 'デモ用ケアセンター', type: '介護付き有料老人ホーム' },
  { id: 'f2', name: 'グループホームほしぞら', type: 'グループホーム' }
];

const patients = [
  { id: 'p1', facilityId: 'f1', name: '山田 太郎', roomNumber: '101' },
  { id: 'p2', facilityId: 'f1', name: '鈴木 花子', roomNumber: '102' },
  { id: 'p3', facilityId: 'f1', name: '佐藤 健太', roomNumber: '103' }
];

const recordings = new Map();
const encounters = new Map();

function getFacilities() {
  return [...facilities];
}

function getPatients(facilityId) {
  if (!facilityId) return [...patients];
  return patients.filter(p => p.facilityId === facilityId);
}

function getPatientById(id) {
  return patients.find(p => p.id === id);
}

function saveRecording(id, data) {
  recordings.set(id, { ...data, id, updatedAt: new Date().toISOString() });
  return recordings.get(id);
}

function getRecording(id) {
  return recordings.get(id);
}

function saveEncounter(id, data) {
  encounters.set(id, { ...data, id, updatedAt: new Date().toISOString() });
  return encounters.get(id);
}

function getEncounter(id) {
  return encounters.get(id);
}

module.exports = {
  getFacilities,
  getPatients,
  getPatientById,
  saveRecording,
  getRecording,
  saveEncounter,
  getEncounter
};
