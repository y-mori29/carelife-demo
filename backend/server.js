const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8081;

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const routes = require('./src/routes/index');
app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Carelife 通院報告支援 API',
    version: '1.0.0-mvp'
  });
});

app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
