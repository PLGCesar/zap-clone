const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY,
  authDomain: window.FIREBASE_AUTH_DOMAIN,
  databaseURL: window.FIREBASE_DATABASE_URL,
  projectId: window.FIREBASE_PROJECT_ID,
  storageBucket: window.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID,
  appId: window.FIREBASE_APP_ID
};

Object.keys(firebaseConfig).forEach(key => {
  if (!firebaseConfig[key]) delete firebaseConfig[key];
});

if (Object.keys(firebaseConfig).length > 0) {
  firebase.initializeApp(firebaseConfig);
} else {
  alert("⚠️ Erro: As variáveis de ambiente do Firebase não foram configuradas no Render!");
}

const db = firebase.database();
const messagesRef = db.ref('mensagens');

function sendMessage() {
  const authorInput = document.getElementById('username');
  const textInput = document.getElementById('messageText');

  const author = authorInput?.value.trim() || 'Anônimo';
  const text = textInput?.value.trim() || '';

  if (text !== '') {
    messagesRef.push({
      author: author,
      text: text,
      timestamp: Date.now()
    }).then(() => {
      if (textInput) textInput.value = '';
    }).catch((err) => {
      alert("Erro ao enviar mensagem: " + err.message);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('messageText');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
});

messagesRef.on('child_added', (snapshot) => {
  const msg = snapshot.val();
  const box = document.getElementById('messagesBox');
  const currentUsername = document.getElementById('username')?.value.trim() || 'Anônimo';

  if (box) {
    const isMe = msg.author === currentUsername;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
    msgDiv.innerHTML = `<span class="author">${msg.author}</span><div>${msg.text}</div>`;
    
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
  }
});
