// Função auxiliar pra buscar do environment (process.env ou window)
const getEnv = (key) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  if (typeof window !== 'undefined' && window[key]) {
    return window[key];
  }
  return null;
};

// Mapeia todas as variáveis possíveis
const envVars = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  databaseURL: getEnv('FIREBASE_DATABASE_URL'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID')
};

// IGNORA o que for nulo, indefinido ou texto vazio
const firebaseConfig = Object.fromEntries(
  Object.entries(envVars).filter(([_, val]) => val !== null && val !== undefined && val !== '')
);

// Inicializa o Firebase com o que sobrou
if (Object.keys(firebaseConfig).length > 0) {
  firebase.initializeApp(firebaseConfig);
} else {
  console.warn("⚠️ Nenhuma variável de ambiente encontrada.");
}

const db = firebase.database();
const messagesRef = db.ref('mensagens');

// Enviar mensagem
function sendMessage() {
  const authorEl = document.getElementById('username');
  const textEl = document.getElementById('messageText');

  const author = (authorEl && authorEl.value.trim()) || 'Anônimo';
  const text = (textEl && textEl.value.trim()) || '';

  if (text !== '') {
    messagesRef.push({ author, text, timestamp: Date.now() });
    if (textEl) textEl.value = '';
  }
}

// Receber mensagens em tempo real
messagesRef.on('child_added', (snapshot) => {
  const msg = snapshot.val();
  const box = document.getElementById('messagesBox');
  if (box) {
    box.innerHTML += `<div style="margin-bottom: 8px;"><b>${msg.author}:</b> ${msg.text}</div>`;
    box.scrollTop = box.scrollHeight;
  }
});
