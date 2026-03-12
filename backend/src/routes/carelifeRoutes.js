const express = require('express');
const multer = require('multer');
const controller = require('../controllers/carelifeController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/facilities', controller.listFacilities);
router.get('/patients', controller.listPatients);
router.get('/carelife/supplement-questions', controller.getSupplementQuestions);

router.post('/encounters', controller.createEncounter);
router.post('/recordings/sign-upload', controller.signUpload);
router.post('/recordings/:recordingId/finalize', upload.single('audio'), controller.finalizeRecording);

router.get('/carelife/reports/:encounterId', controller.getReport);
router.post('/carelife/send-to-line', controller.sendReportToLine);

module.exports = router;
