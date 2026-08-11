const express = require('express');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Lê a senha de 'rootpass' ou 'ROOTPASS' (padrão: root123)
const rawRootPass = process.env.rootpass || process.env.ROOTPASS || 'root123';
const rootHash = crypto.createHash('sha256').update(rawRootPass).digest('hex');

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`
    window.FIREBASE_API_KEY = "${process.env.FIREBASE_API_KEY || ''}";
    window.FIREBASE_AUTH_DOMAIN = "${process.env.FIREBASE_AUTH_DOMAIN || ''}";
    window.FIREBASE_DATABASE_URL = "${process.env.FIREBASE_DATABASE_URL || ''}";
    window.FIREBASE_PROJECT_ID = "${process.env.FIREBASE_PROJECT_ID || ''}";
    window.FIREBASE_STORAGE_BUCKET = "${process.env.FIREBASE_STORAGE_BUCKET || ''}";
    window.FIREBASE_MESSAGING_SENDER_ID = "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}";
    window.FIREBASE_APP_ID = "${process.env.FIREBASE_APP_ID || ''}";
    window.ROOT_HASH = "${rootHash}";
  `);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
