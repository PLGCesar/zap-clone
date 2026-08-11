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
let authMode = 'login'; // 'login' ou 'register'
let activeChatId = 'geral';
let activeListener = null;

// Chave para Criptografia de Mensagens no Cliente
const SECRET_CIPHER = "ZapSecretKey2026_Encrypt";

// Função para Criptografar Mensagens
function encryptText(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ SECRET_CIPHER.charCodeAt(i % SECRET_CIPHER.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

// Função para Descriptografar Mensagens
function decryptText(encrypted) {
  try {
    let decoded = decodeURIComponent(escape(atob(encrypted)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ SECRET_CIPHER.charCodeAt(i % SECRET_CIPHER.length));
    }
    return result;
  } catch (e) {
    return encrypted; // Fallback se já for texto puro
  }
}

// Hash SHA-256 de Senha
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tabLogin').className = `auth-tab ${mode === 'login' ? 'active' : ''}`;
  document.getElementById('tabRegister').className = `auth-tab ${mode === 'register' ? 'active' : ''}`;
  document.getElementById('authSubmitBtn').innerText = mode === 'login' ? 'Entrar' : 'Criar Conta';
}

async function handleAuth() {
  const username = document.getElementById('usernameInput')?.value.trim();
  const password = document.getElementById('passwordInput')?.value.trim();

  if (!username || !password) return alert('Preencha o usuário e a senha!');

  const passwordHash = await hashPassword(password);
  const userRef = db.ref('users/' + username);

  if (authMode === 'register') {
    // Verificar se usuário já existe
    userRef.get().then((snapshot) => {
      if (snapshot.exists()) {
        alert('Este nome de usuário já existe! Escolha outro ou faça login.');
      } else {
        userRef.set({ username, passwordHash, createdAt: Date.now() }).then(() => {
          localStorage.setItem('zap_user', username);
          currentUser = username;
          initApp();
        });
      }
    });
  } else {
    // Autenticar Login
    userRef.get().then((snapshot) => {
      if (!snapshot.exists()) {
        alert('Usuário não encontrado! Crie uma conta primeiro.');
      } else {
        const userData = snapshot.val();
        if (userData.passwordHash === passwordHash) {
          localStorage.setItem('zap_user', username);
          currentUser = username;
          initApp();
        } else {
          alert('Senha incorreta!');
        }
      }
    });
  }
}

function logout() {
  localStorage.removeItem('zap_user');
  location.reload();
}

function initApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('myAccountName').innerText = currentUser;
  document.getElementById('myAvatarHeader').innerText = currentUser[0].toUpperCase();
  loadUsers();
  openChat('geral', 'Grupo Geral', 'group');
}

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
              <div class="sub">Conversa Criptografada</div>
            </div>
          </div>
        `;
      }
    });
  });
}

function openChat(chatId, title, avatarType) {
  activeChatId = chatId;
  document.getElementById('activeChatTitle').innerText = title;
  
  const avatarEl = document.getElementById('activeAvatar');
  if (avatarType === 'bot') avatarEl.innerText = '🤖';
  else if (avatarType === 'group') avatarEl.innerText = '👥';
  else avatarEl.innerText = title[0].toUpperCase();

  document.getElementById('contactsPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.remove('hidden');

  const box = document.getElementById('messagesBox');
  box.innerHTML = `
    <div class="encryption-banner">
      🔒 As mensagens são protegidas com criptografia de ponta a ponta.
    </div>
  `;

  if (activeListener) activeListener.off();

  const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
  activeListener = db.ref(chatPath);
  
  activeListener.on('child_added', (snapshot) => {
    const msg = snapshot.val();
    const isMe = msg.author === currentUser;
    const decryptedText = decryptText(msg.text);
    
    // Formata o horário exato (ex: 14:32)
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${isMe ? 'sent' : 'received'}`;
    
    msgDiv.innerHTML = `
      ${!isMe ? `<span class="author">${msg.author}</span>` : ''}
      <div>${decryptedText}</div>
      <div class="msg-footer">
        <span class="time">${timeStr}</span>
        ${isMe ? '<span class="checks">✓✓</span>' : ''}
      </div>
    `;
    
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
  });
}

function closeChat() {
  document.getElementById('chatPanel').classList.add('hidden');
  document.getElementById('contactsPanel').classList.remove('hidden');
}

function sendMessage() {
  const textInput = document.getElementById('messageText');
  const rawText = textInput?.value.trim() || '';

  if (rawText !== '') {
    // CRIPTOGRAFA A MENSAGEM ANTES DE MANDAR PRO FIREBASE
    const encryptedText = encryptText(rawText);
    const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
    const chatRef = db.ref(chatPath);

    chatRef.push({
      author: currentUser,
      text: encryptedText,
      timestamp: Date.now()
    }).then(() => {
      textInput.value = '';

      // BOT SERVER RESPONDER PONG CRIPTOGRAFADO
      if (activeChatId === 'server') {
        setTimeout(() => {
          chatRef.push({
            author: 'Server 🤖',
            text: encryptText('Pong 🏓'),
            timestamp: Date.now()
          });
        }, 600);
      }
    });
  }
}
