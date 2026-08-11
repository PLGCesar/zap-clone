const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY,
  authDomain: window.FIREBASE_AUTH_DOMAIN,
  databaseURL: window.FIREBASE_DATABASE_URL,
  projectId: window.FIREBASE_PROJECT_ID,
  storageBucket: window.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID,
  appId: window.FIREBASE_APP_ID
};

Object.keys(firebaseConfig).forEach(key => { if (!firebaseConfig[key]) delete firebaseConfig[key]; });

if (Object.keys(firebaseConfig).length > 0) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();

let currentUser = localStorage.getItem('zap_user') || null;
let activeChatId = 'geral';
let activeListener = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (currentUser) {
    initApp();
  } else {
    document.getElementById('authScreen').style.display = 'flex';
  }

  document.getElementById('messageText')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});

// Registrar ou Fazer Login
function registerOrLogin() {
  const username = document.getElementById('usernameInput')?.value.trim();
  if (!username) return alert('Digite um nome de usuário!');

  // Salva o usuário no Firebase
  db.ref('users/' + username).set({
    username: username,
    createdAt: Date.now()
  }).then(() => {
    localStorage.setItem('zap_user', username);
    currentUser = username;
    document.getElementById('authScreen').style.display = 'none';
    initApp();
  });
}

function logout() {
  localStorage.removeItem('zap_user');
  location.reload();
}

function initApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('myAccountName').innerText = currentUser;
  loadUsers();
  openChat('geral', 'Grupo Geral', 'group');
}

// Carregar lista de outros usuários cadastrados
function loadUsers() {
  db.ref('users').on('value', (snapshot) => {
    const usersContainer = document.getElementById('dynamicUsers');
    if (!usersContainer) return;
    usersContainer.innerHTML = '';

    snapshot.forEach((child) => {
      const user = child.val();
      if (user.username !== currentUser) {
        usersContainer.innerHTML += `
          <div class="contact-item" onclick="openChat('user_${user.username}', '${user.username}', 'user')">
            <div class="avatar">${user.username[0].toUpperCase()}</div>
            <div class="contact-info">
              <div class="name">${user.username}</div>
              <div class="sub">Toque para conversar</div>
            </div>
          </div>
        `;
      }
    });
  });
}

// Abrir uma conversa
function openChat(chatId, title, avatarType) {
  activeChatId = chatId;
  document.getElementById('activeChatTitle').innerText = title;
  
  const avatarEl = document.getElementById('activeAvatar');
  if (avatarType === 'bot') avatarEl.innerText = '🤖';
  else if (avatarType === 'group') avatarEl.innerText = '👥';
  else avatarEl.innerText = title[0].toUpperCase();

  // No mobile, alterna as telas
  document.getElementById('contactsPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.remove('hidden');

  // Limpa mensagens anteriores
  const box = document.getElementById('messagesBox');
  box.innerHTML = '';

  // Remove escuta anterior se houver
  if (activeListener) activeListener.off();

  // Escuta novas mensagens do chat ativo
  const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
  activeListener = db.ref(chatPath);
  
  activeListener.on('child_added', (snapshot) => {
    const msg = snapshot.val();
    const isMe = msg.author === currentUser;
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${isMe ? 'sent' : 'received'}`;
    msgDiv.innerHTML = `<span class="author">${msg.author}</span><div>${msg.text}</div>`;
    
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
  });
}

function closeChat() {
  document.getElementById('chatPanel').classList.add('hidden');
  document.getElementById('contactsPanel').classList.remove('hidden');
}

// Enviar Mensagem (E Lógica do Bot Server)
function sendMessage() {
  const textInput = document.getElementById('messageText');
  const text = textInput?.value.trim() || '';

  if (text !== '') {
    const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
    const chatRef = db.ref(chatPath);

    // Envia mensagem do usuário
    chatRef.push({
      author: currentUser,
      text: text,
      timestamp: Date.now()
    }).then(() => {
      textInput.value = '';

      // 🤖 LÓGICA DO BOT SERVER
      if (activeChatId === 'server') {
        setTimeout(() => {
          chatRef.push({
            author: 'Server 🤖',
            text: 'Pong 🏓',
            timestamp: Date.now()
          });
        }, 600);
      }
    });
  }
}
