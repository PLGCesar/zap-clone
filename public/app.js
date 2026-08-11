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
let userData = null;
let authMode = 'login';
let activeChatId = 'geral';
let activeListener = null;
let pendingAvatarBase64 = null;
let botAvatarUrl = 'https://ui-avatars.com/api/?name=Bot&background=00a884&color=fff';

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordTimerInterval = null;
let recordSeconds = 0;

function encryptText(str) {
  if (!str) return '';
  let res = '';
  for (let i = 0; i < str.length; i++) {
    res += String.fromCharCode(str.charCodeAt(i) ^ 0x5A);
  }
  return btoa(unescape(encodeURIComponent(res)));
}

function decryptText(enc) {
  if (!enc) return '';
  try {
    let str = decodeURIComponent(escape(atob(enc)));
    let res = '';
    for (let i = 0; i < str.length; i++) {
      res += String.fromCharCode(str.charCodeAt(i) ^ 0x5A);
    }
    return res;
  } catch (e) {
    return enc;
  }
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function compressImage(file, maxWidth, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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

  const savedBg = localStorage.getItem('zap_bg_theme') || '#0b141a';
  changeBgTheme(savedBg);
  const selectEl = document.getElementById('bgThemeSelect');
  if (selectEl) selectEl.value = savedBg;
});

function changeBgTheme(color) {
  localStorage.setItem('zap_bg_theme', color);
  const box = document.getElementById('messagesBox');
  if (box) box.style.backgroundColor = color;
}

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tabLogin').className = `auth-tab ${mode === 'login' ? 'active' : ''}`;
  document.getElementById('tabRegister').className = `auth-tab ${mode === 'register' ? 'active' : ''}`;
  document.getElementById('authSubmitBtn').innerText = mode === 'login' ? 'Entrar' : 'Criar Conta';
  
  const displayInput = document.getElementById('displayNameInput');
  if (displayInput) displayInput.style.display = mode === 'register' ? 'block' : 'none';

  showNotice('authNotice', '', '');
}

function showNotice(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!text) {
    el.className = 'modal-notice';
    el.style.display = 'none';
  } else {
    el.innerText = text;
    el.className = `modal-notice ${type}`;
    el.style.display = 'block';
  }
}

async function handleAuth() {
  const username = document.getElementById('usernameInput')?.value.trim();
  const displayName = document.getElementById('displayNameInput')?.value.trim();
  const password = document.getElementById('passwordInput')?.value.trim();

  if (!username || !password) return showNotice('authNotice', 'Preencha usuário e senha!', 'error');

  const passwordHash = await hashPassword(password);

  // ROOT LOGIN (SEM SOBRESCREVER A FOTO)
  if (username === 'root') {
    if (passwordHash === window.ROOT_HASH) {
      db.ref('users/root').get().then((snap) => {
        if (!snap.exists()) {
          db.ref('users/root').set({
            username: 'root',
            displayName: 'Root Admin 👑',
            phone: '+00 00 00000-0000',
            avatar: 'https://ui-avatars.com/api/?name=Root&background=ea4335&color=fff',
            isAdmin: true
          });
        }
      });
      localStorage.setItem('zap_user', 'root');
      currentUser = 'root';
      initApp();
    } else {
      showNotice('authNotice', 'Senha incorreta do usuário root!', 'error');
    }
    return;
  }

  const userRef = db.ref('users/' + username);

  if (authMode === 'register') {
    userRef.get().then((snapshot) => {
      if (snapshot.exists()) {
        showNotice('authNotice', 'Usuário já existe! Tente outro.', 'error');
      } else {
        const randomNum = Math.floor(100000000 + Math.random() * 900000000);
        const autoPhone = `+55 11 9${randomNum}`;
        const finalDisplayName = displayName || username;

        const newUser = {
          username: username,
          displayName: finalDisplayName,
          passwordHash: passwordHash,
          phone: autoPhone,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(finalDisplayName)}&background=00a884&color=fff`,
          createdAt: Date.now()
        };

        userRef.set(newUser).then(() => {
          localStorage.setItem('zap_user', username);
          currentUser = username;
          initApp();
        });
      }
    });
  } else {
    userRef.get().then((snapshot) => {
      if (!snapshot.exists()) {
        showNotice('authNotice', 'Usuário não encontrado!', 'error');
      } else {
        const val = snapshot.val();
        if (val.passwordHash === passwordHash) {
          localStorage.setItem('zap_user', username);
          currentUser = username;
          initApp();
        } else {
          showNotice('authNotice', 'Senha incorreta!', 'error');
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
  
  if (currentUser === 'root') {
    document.getElementById('adminBadge').style.display = 'inline-block';
    document.getElementById('adminDangerZone').style.display = 'block';
    document.getElementById('rootBotAvatarSection').style.display = 'block';
  }

  db.ref('bot_settings/avatar').on('value', (snap) => {
    if (snap.exists()) {
      botAvatarUrl = snap.val();
      const botAvatarEl = document.getElementById('botContactAvatar');
      if (botAvatarEl) botAvatarEl.src = botAvatarUrl;
    }
  });

  db.ref('users/' + currentUser).on('value', (snapshot) => {
    userData = snapshot.val();
    if (userData) {
      const shownName = userData.displayName || userData.username;
      document.getElementById('myAccountName').innerText = shownName;
      const avatarUrl = userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(shownName)}&background=00a884&color=fff`;
      document.getElementById('myHeaderAvatar').src = avatarUrl;
      document.getElementById('settingsAvatarPreview').src = avatarUrl;
      document.getElementById('settingsUsername').value = userData.username;
      document.getElementById('settingsDisplayName').value = shownName;
      document.getElementById('settingsPhone').value = userData.phone || '';
    }
  });

  loadMyPrivateContacts();
  openChat('geral', 'Grupo Geral', 'group', '');
}

function changeBotAvatarByRoot(event) {
  if (currentUser !== 'root') return;
  const file = event.target.files[0];
  if (file) {
    compressImage(file, 200, (base64) => {
      db.ref('bot_settings/avatar').set(base64).then(() => {
        showNotice('settingsNotice', 'Foto do Bot Server atualizada!', 'success');
      });
    });
  }
}

function loadMyPrivateContacts() {
  db.ref('my_contacts/' + currentUser).on('value', (snapshot) => {
    const container = document.getElementById('privateContactsList');
    if (!container) return;
    container.innerHTML = '';

    snapshot.forEach((child) => {
      const contactName = child.key;
      db.ref('users/' + contactName).get().then((uSnap) => {
        if (uSnap.exists()) {
          const uData = uSnap.val();
          const shownName = uData.displayName || uData.username;
          const avatarUrl = uData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(shownName)}&background=00a884&color=fff`;
          const deleteBtnHtml = currentUser === 'root' ? `
            <button class="delete-user-btn" title="Apagar Conta" onclick="event.stopPropagation(); deleteAccount('${uData.username}')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>` : '';

          container.innerHTML += `
            <div class="contact-item contact-entry" data-name="${shownName.toLowerCase()} ${uData.username.toLowerCase()}" onclick="openChat('private_${getPrivateChatId(currentUser, uData.username)}', '${shownName}', 'user', '${avatarUrl}')">
              <img class="contact-avatar-img" src="${avatarUrl}">
              <div class="contact-info">
                <div class="name">${shownName}</div>
                <div class="sub">@${uData.username} • ${uData.phone || ''}</div>
              </div>
              ${deleteBtnHtml}
            </div>
          `;
        }
      });
    });
  });
}

function deleteAccount(targetUsername) {
  if (currentUser !== 'root') return;
  if (confirm(`Tem certeza que deseja apagar permanentemente a conta de ${targetUsername}?`)) {
    db.ref('users/' + targetUsername).remove();
    db.ref('my_contacts/' + targetUsername).remove();
    db.ref('my_contacts/' + currentUser + '/' + targetUsername).remove();
  }
}

function wipeAllSystemData() {
  if (currentUser !== 'root') return;
  if (confirm('🚨 ATENÇÃO: Isso irá apagar TODAS as mensagens, chats e usuários do banco de dados! Deseja continuar?')) {
    db.ref('chats').remove();
    db.ref('chats_bot').remove();
    db.ref('my_contacts').remove();
    db.ref('users').remove().then(() => {
      db.ref('users/root').set({
        username: 'root',
        displayName: 'Root Admin 👑',
        phone: '+00 00 00000-0000',
        avatar: 'https://ui-avatars.com/api/?name=Root&background=ea4335&color=fff',
        isAdmin: true
      });
      location.reload();
    });
  }
}

function getPrivateChatId(user1, user2) {
  return [user1, user2].sort().join('_');
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.remove('hidden');
  showNotice('settingsNotice', '', '');
  showNotice('addContactNotice', '', '');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

function previewProfilePhoto(event) {
  const file = event.target.files[0];
  if (file) {
    compressImage(file, 200, (base64) => {
      pendingAvatarBase64 = base64;
      document.getElementById('settingsAvatarPreview').src = base64;
    });
  }
}

function saveSettings() {
  const phone = document.getElementById('settingsPhone')?.value.trim();
  const displayName = document.getElementById('settingsDisplayName')?.value.trim();
  const updates = {};
  if (phone) updates.phone = phone;
  if (displayName) updates.displayName = displayName;
  if (pendingAvatarBase64) updates.avatar = pendingAvatarBase64;

  db.ref('users/' + currentUser).update(updates).then(() => {
    showNotice('settingsNotice', 'Perfil atualizado com sucesso!', 'success');
    setTimeout(() => closeModal('settingsModal'), 1000);
  });
}

function addContact() {
  const input = document.getElementById('addContactInput')?.value.trim();
  if (!input) return showNotice('addContactNotice', 'Digite um usuário ou telefone!', 'error');
  if (input === currentUser) return showNotice('addContactNotice', 'Você não pode adicionar a si mesmo!', 'error');

  db.ref('users').get().then((snapshot) => {
    let foundUsername = null;

    snapshot.forEach((child) => {
      const u = child.val();
      if (u.username === input || u.phone === input) {
        foundUsername = u.username;
      }
    });

    if (foundUsername) {
      db.ref(`my_contacts/${currentUser}/${foundUsername}`).set(true);
      db.ref(`my_contacts/${foundUsername}/${currentUser}`).set(true);
      showNotice('addContactNotice', `Contato adicionado com sucesso!`, 'success');
      setTimeout(() => {
        closeModal('addContactModal');
        document.getElementById('addContactInput').value = '';
      }, 1000);
    } else {
      showNotice('addContactNotice', 'Contato não encontrado!', 'error');
    }
  });
}

function filterContacts() {
  const query = document.getElementById('searchContactsInput')?.value.toLowerCase() || '';
  const entries = document.querySelectorAll('.contact-entry');
  entries.forEach(entry => {
    const name = entry.getAttribute('data-name') || '';
    if (name.includes(query)) {
      entry.style.display = 'flex';
    } else {
      entry.style.display = 'none';
    }
  });
}

function openChat(chatId, title, avatarType, avatarUrl) {
  activeChatId = chatId;
  document.getElementById('activeChatTitle').innerText = title;
  
  const avatarImg = document.getElementById('activeChatAvatar');
  if (avatarUrl) {
    avatarImg.src = avatarUrl;
  } else if (avatarType === 'bot') {
    avatarImg.src = botAvatarUrl;
  } else {
    avatarImg.src = 'https://ui-avatars.com/api/?name=Geral&background=007a65&color=fff';
  }

  document.getElementById('contactsPanel').classList.add('hidden');
  document.getElementById('chatPanel').classList.remove('hidden');

  const box = document.getElementById('messagesBox');
  box.innerHTML = `
    <div class="encryption-banner">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
      <span>As mensagens são protegidas com criptografia de ponta a ponta.</span>
    </div>
  `;

  if (activeListener) activeListener.off();

  const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
  activeListener = db.ref(chatPath);

  activeListener.on('child_added', (snapshot) => {
    const msg = snapshot.val();
    const isMe = msg.author === currentUser;
    const decryptedText = decryptText(msg.text);
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${isMe ? 'sent' : 'received'}`;

    let contentHtml = '';
    if (msg.image) {
      const decryptedImg = decryptText(msg.image);
      contentHtml += `<img class="msg-img" src="${decryptedImg}">`;
    }
    if (msg.audio) {
      const decryptedAudio = decryptText(msg.audio);
      contentHtml += `<audio class="msg-audio" controls src="${decryptedAudio}"></audio>`;
    }
    if (decryptedText) {
      contentHtml += `<div>${decryptedText}</div>`;
    }

    const checkSvg = `
      <svg viewBox="0 0 16 11" width="16" height="11" fill="currentColor">
        <path d="M11.05 0L4.7 6.35 1.95 3.6 0 5.55l4.7 4.7 8.3-8.3z"/>
        <path d="M15.05 0L8.7 6.35 7.4 5.05 6 6.45l2.7 2.7 8.3-8.3z"/>
      </svg>`;

    const authorNameToShow = msg.authorDisplayName || msg.author;

    msgDiv.innerHTML = `
      ${!isMe ? `<span class="author">${authorNameToShow}</span>` : ''}
      ${contentHtml}
      <div class="msg-footer">
        <span class="time">${timeStr}</span>
        ${isMe ? `<span class="checks">${checkSvg}</span>` : ''}
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

async function toggleAudioRecording() {
  const micBtn = document.getElementById('micBtn');
  const statusEl = document.getElementById('recordingStatus');

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          dispatchMessage('', null, base64Audio);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('recording');
      statusEl.style.display = 'flex';
      
      recordSeconds = 0;
      recordTimerInterval = setInterval(() => {
        recordSeconds++;
        const mins = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
        const secs = String(recordSeconds % 60).padStart(2, '0');
        document.getElementById('recordTimer').innerText = `${mins}:${secs}`;
      }, 1000);

    } catch (err) {
      alert("Microfone indisponível ou permissão negada!");
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    statusEl.style.display = 'none';
    clearInterval(recordTimerInterval);
  }
}

function sendMessage() {
  const textInput = document.getElementById('messageText');
  const rawText = textInput?.value.trim() || '';

  if (rawText !== '') {
    dispatchMessage(rawText, null, null);
    textInput.value = '';
  }
}

function sendPhotoInChat(event) {
  const file = event.target.files[0];
  if (file) {
    compressImage(file, 600, (base64Img) => {
      dispatchMessage('', base64Img, null);
    });
  }
}

function dispatchMessage(text, imageBase64, audioBase64) {
  const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
  const chatRef = db.ref(chatPath);

  const shownAuthorName = userData?.displayName || currentUser;

  const payload = {
    author: currentUser,
    authorDisplayName: shownAuthorName,
    text: encryptText(text),
    timestamp: Date.now()
  };

  if (imageBase64) payload.image = encryptText(imageBase64);
  if (audioBase64) payload.audio = encryptText(audioBase64);

  chatRef.push(payload).then(() => {
    if (activeChatId === 'server') {
      setTimeout(() => {
        chatRef.push({
          author: 'Server 🤖',
          authorDisplayName: 'Server Bot 🤖',
          text: encryptText('Pong 🏓'),
          timestamp: Date.now()
        });
      }, 500);
    }
  });
}
