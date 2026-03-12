const express = require('express');
const router = express.Router();

const carelifeRoutes = require('./carelifeRoutes');

router.use('/', carelifeRoutes);

router.get('/test', (req, res) => {
  res.json({ message: 'API is working' });
});

module.exports = router;
