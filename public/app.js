// Pega do env/window ou usa valores padrão
const getEnv = (key) => (typeof process !== 'undefined' && process.env?.[key]) || window?.[key] || null;

const envVars = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  databaseURL: getEnv('FIREBASE_DATABASE_URL'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID')
};

const firebaseConfig = Object.fromEntries(
  Object.entries(envVars).filter(([_, val]) => val !== null && val !== undefined && val !== '')
);

if (Object.keys(firebaseConfig).length > 0) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const messagesRef = db.ref('mensagens');

function sendMessage() {
  const author = document.getElementById('username')?.value.trim() || 'Anônimo';
  const text = document.getElementById('messageText')?.value.trim() || '';

  if (text !== '') {
    messagesRef.push({ author, text, timestamp: Date.now() });
    document.getElementById('messageText').value = '';
  }
}

messagesRef.on('child_added', (snapshot) => {
  const msg = snapshot.val();
  const box = document.getElementById('box');
  if (box) {
    box.innerHTML += `<div style="margin-bottom:8px;"><b>${msg.author}:</b> ${msg.text}</div>`;
    box.scrollTop = box.scrollHeight;
  }
});
