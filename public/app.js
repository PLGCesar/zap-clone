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

let selectedMsgData = null;
let activeReplyData = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordTimerInterval = null;
let recordSeconds = 0;

function censorPhone(phone) {
  if (!phone) return 'Telefone não informado';
  if (phone.length < 8) return '****';
  const prefix = phone.slice(0, 6);
  const lastFour = phone.slice(-4);
  return `${prefix} *****-${lastFour}`;
}

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

  if (username === 'root') {
    if (passwordHash === window.ROOT_HASH) {
      db.ref('users/root').get().then((snap) => {
        if (!snap.exists()) {
          db.ref('users/root').set({
            username: 'root',
            displayName: 'Root Admin 👑',
            phone: '+00 00 00000-0000',
            avatar: 'https://ui-avatars.com/api/?name=Root&background=ea4335&color=fff',
            isAdmin: true,
            filePermission: true
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
          filePermission: false,
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

function openAdminUsersModal() {
  if (currentUser !== 'root') return;
  openModal('adminUsersModal');
  
  const container = document.getElementById('adminUsersListContainer');
  if (!container) return;
  container.innerHTML = '<p style="font-size:13px; color:#8696a0; text-align:center;">Carregando usuários...</p>';

  db.ref('users').get().then((snapshot) => {
    container.innerHTML = '';
    snapshot.forEach((child) => {
      const u = child.val();
      const shownName = u.displayName || u.username;
      const avatarUrl = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(shownName)}&background=00a884&color=fff`;
      const censored = censorPhone(u.phone);
      const isFilePermActive = u.filePermission ? true : false;

      container.innerHTML += `
        <div class="admin-user-item">
          <img class="admin-user-avatar" src="${avatarUrl}">
          <div class="admin-user-info">
            <div class="disp-name">${shownName}</div>
            <div class="user-name">@${u.username}</div>
            <div class="user-phone">📞 ${censored}</div>
            ${u.username !== 'root' ? `
              <button class="file-perm-btn ${isFilePermActive ? 'active' : ''}" onclick="toggleFilePermission('${u.username}', ${!isFilePermActive})">
                📁 ${isFilePermActive ? 'Permissão de Arquivo: Ativa ✓' : 'Conceder Permissão de Arquivo'}
              </button>` : ''}
          </div>
          ${u.username !== 'root' ? `
            <button class="delete-user-btn" title="Apagar Conta" onclick="deleteAccount('${u.username}')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>` : ''}
        </div>
      `;
    });
  });
}

function toggleFilePermission(targetUsername, status) {
  if (currentUser !== 'root') return;
  db.ref('users/' + targetUsername).update({ filePermission: status }).then(() => {
    openAdminUsersModal();
  });
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
                <div class="sub">@${uData.username} • ${censorPhone(uData.phone)}</div>
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
    db.ref('my_contacts/' + currentUser + '/' + targetUsername).remove().then(() => {
      openAdminUsersModal();
    });
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
        isAdmin: true,
        filePermission: true
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

// MENU DE AÇÕES DA MENSAGEM (2 CLIQUES / 2 TOQUES)
function openMsgActions(ds) {
  selectedMsgData = ds;
  const isMe = ds.isMe === 'true';
  const body = document.getElementById('msgActionsBody');
  if (!body) return;

  if (isMe) {
    body.innerHTML = `
      <button class="modal-btn danger" onclick="deleteMsgForEveryone()">🚫 Apagar para Todos</button>
      <button class="modal-btn secondary" onclick="deleteMsgForMe()">👁️ Apagar para Mim</button>
      ${ds.hasText === 'true' ? `<button class="modal-btn secondary" onclick="editMsgText()">✏️ Editar Mensagem</button>` : ''}
    `;
  } else {
    body.innerHTML = `
      <button class="modal-btn" onclick="setupReplyToMsg()">↩️ Responder</button>
      <button class="modal-btn secondary" onclick="openForwardModal()">↗️ Encaminhar Mensagem</button>
    `;
  }

  openModal('msgActionsModal');
}

function deleteMsgForEveryone() {
  if (!selectedMsgData) return;
  db.ref(`${selectedMsgData.chatPath}/${selectedMsgData.key}`).update({
    text: encryptText('🚫 Esta mensagem foi apagada'),
    image: null,
    audio: null,
    file: null,
    deleted: true
  }).then(() => closeModal('msgActionsModal'));
}

function deleteMsgForMe() {
  if (!selectedMsgData) return;
  db.ref(`hidden_msgs/${currentUser}/${selectedMsgData.key}`).set(true).then(() => {
    const el = document.getElementById('msg_' + selectedMsgData.key);
    if (el) el.remove();
    closeModal('msgActionsModal');
  });
}

function editMsgText() {
  if (!selectedMsgData) return;
  const currentDecrypted = decryptText(selectedMsgData.text);
  const newText = prompt("Edite sua mensagem:", currentDecrypted);
  if (newText !== null && newText.trim() !== '') {
    db.ref(`${selectedMsgData.chatPath}/${selectedMsgData.key}`).update({
      text: encryptText(newText.trim()),
      edited: true
    }).then(() => closeModal('msgActionsModal'));
  }
}

function setupReplyToMsg() {
  if (!selectedMsgData) return;
  const decryptedText = decryptText(selectedMsgData.text) || (selectedMsgData.hasImage === 'true' ? '📷 Foto' : selectedMsgData.hasAudio === 'true' ? '🎙️ Áudio' : '📄 Documento');
  
  activeReplyData = {
    key: selectedMsgData.key,
    author: selectedMsgData.author,
    text: decryptedText
  };

  document.getElementById('replyAuthorText').innerText = `Respondendo a ${selectedMsgData.author}`;
  document.getElementById('replyMessageText').innerText = decryptedText;
  document.getElementById('replyPreviewBanner').style.display = 'flex';
  
  closeModal('msgActionsModal');
  document.getElementById('messageText')?.focus();
}

function cancelReply() {
  activeReplyData = null;
  document.getElementById('replyPreviewBanner').style.display = 'none';
}

function openForwardModal() {
  if (!selectedMsgData) return;
  closeModal('msgActionsModal');
  openModal('forwardModal');

  const container = document.getElementById('forwardContactsList');
  if (!container) return;
  container.innerHTML = '<p style="font-size:13px; color:#8696a0; text-align:center;">Carregando contatos...</p>';

  db.ref('my_contacts/' + currentUser).get().then((snap) => {
    container.innerHTML = `
      <div class="contact-item" onclick="forwardToTarget('geral', 'Grupo Geral')">
        <div class="avatar group">👥</div>
        <div class="contact-info"><div class="name">Grupo Geral</div></div>
      </div>
    `;

    snap.forEach((child) => {
      const contactName = child.key;
      db.ref('users/' + contactName).get().then((uSnap) => {
        if (uSnap.exists()) {
          const u = uSnap.val();
          const shownName = u.displayName || u.username;
          container.innerHTML += `
            <div class="contact-item" onclick="forwardToTarget('private_${getPrivateChatId(currentUser, u.username)}', '${shownName}')">
              <div class="avatar">${shownName[0].toUpperCase()}</div>
              <div class="contact-info"><div class="name">${shownName}</div></div>
            </div>
          `;
        }
      });
    });
  });
}

function forwardToTarget(targetChatId, targetTitle) {
  if (!selectedMsgData) return;
  const targetPath = targetChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${targetChatId}`;
  
  const payload = {
    author: currentUser,
    authorDisplayName: userData?.displayName || currentUser,
    text: selectedMsgData.text || '',
    image: selectedMsgData.image || null,
    audio: selectedMsgData.audio || null,
    file: selectedMsgData.file ? JSON.parse(selectedMsgData.file) : null,
    timestamp: Date.now()
  };

  db.ref(targetPath).push(payload).then(() => {
    closeModal('forwardModal');
    alert(`Mensagem encaminhada para ${targetTitle}!`);
  });
}

// PLAYER DE ÁUDIO
function toggleVoicePlay(audioId, btn) {
  const audio = document.getElementById(audioId);
  if (!audio) return;

  document.querySelectorAll('audio').forEach(a => {
    if (a.id !== audioId) {
      a.pause();
      a.currentTime = 0;
    }
  });

  const playIcon = btn.querySelector('.play-icon');
  const pauseIcon = btn.querySelector('.pause-icon');

  if (audio.paused) {
    audio.play();
    playIcon?.classList.add('hidden');
    pauseIcon?.classList.remove('hidden');
  } else {
    audio.pause();
    playIcon?.classList.remove('hidden');
    pauseIcon?.classList.add('hidden');
  }
}

function updateVoiceProgress(audioId, seekId, durId) {
  const audio = document.getElementById(audioId);
  const seek = document.getElementById(seekId);
  const dur = document.getElementById(durId);

  if (audio && seek && audio.duration) {
    const pct = (audio.currentTime / audio.duration) * 100;
    seek.value = pct;
    if (dur) dur.innerText = formatAudioTime(audio.currentTime);
  }
}

function seekVoice(audioId, pct) {
  const audio = document.getElementById(audioId);
  if (audio && audio.duration) {
    audio.currentTime = (pct / 100) * audio.duration;
  }
}

function initVoiceMeta(audioId, durId) {
  const audio = document.getElementById(audioId);
  const dur = document.getElementById(durId);
  if (audio && dur && audio.duration && !isNaN(audio.duration)) {
    dur.innerText = formatAudioTime(audio.duration);
  }
}

function resetVoicePlayer(audioId, seekId, durId) {
  const audio = document.getElementById(audioId);
  const seek = document.getElementById(seekId);
  const dur = document.getElementById(durId);

  if (seek) seek.value = 0;
  if (audio && dur) dur.innerText = formatAudioTime(audio.duration || 0);

  const btn = audio?.closest('.voice-msg-player')?.querySelector('.voice-play-btn');
  if (btn) {
    btn.querySelector('.play-icon')?.classList.remove('hidden');
    btn.querySelector('.pause-icon')?.classList.add('hidden');
  }
}

function formatAudioTime(secs) {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function openChat(chatId, title, avatarType, avatarUrl) {
  activeChatId = chatId;
  document.getElementById('activeChatTitle').innerText = title;
  cancelReply();
  
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

  // Escutar mensagens escondidas pelo "Apagar para mim"
  let hiddenMsgsMap = {};
  db.ref(`hidden_msgs/${currentUser}`).get().then((hSnap) => {
    if (hSnap.exists()) hiddenMsgsMap = hSnap.val();
  });

  activeListener.on('child_added', (snapshot) => {
    const msgKey = snapshot.key;
    if (hiddenMsgsMap[msgKey]) return; // Ignora mensagem apagada para mim

    const msg = snapshot.val();
    const isMe = msg.author === currentUser;
    const decryptedText = decryptText(msg.text);
    const date = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgDiv = document.createElement('div');
    msgDiv.id = 'msg_' + msgKey;
    msgDiv.className = `msg ${isMe ? 'sent' : 'received'}`;

    // DATASET PARA AÇÕES DE 2 CLIQUES / TOUCH
    msgDiv.dataset.key = msgKey;
    msgDiv.dataset.isMe = isMe;
    msgDiv.dataset.text = msg.text || '';
    msgDiv.dataset.author = msg.authorDisplayName || msg.author;
    msgDiv.dataset.hasText = decryptedText ? 'true' : 'false';
    msgDiv.dataset.hasImage = msg.image ? 'true' : 'false';
    msgDiv.dataset.hasAudio = msg.audio ? 'true' : 'false';
    msgDiv.dataset.chatPath = chatPath;
    if (msg.file) msgDiv.dataset.file = JSON.stringify(msg.file);

    // GATILHO DE DUPLO CLIQUE / DUPLO TOQUE NO CELULAR
    msgDiv.ondblclick = function() { openMsgActions(this.dataset); };
    let lastTap = 0;
    msgDiv.addEventListener('touchend', function(e) {
      const now = new Date().getTime();
      const diff = now - lastTap;
      if (diff < 300 && diff > 0) {
        openMsgActions(this.dataset);
        e.preventDefault();
      }
      lastTap = now;
    });

    let contentHtml = '';

    // CITAÇÃO DE RESPOSTA
    if (msg.replyTo) {
      contentHtml += `
        <div class="quoted-msg-box">
          <div class="quoted-msg-author">${msg.replyTo.author}</div>
          <div>${msg.replyTo.text}</div>
        </div>
      `;
    }
    
    if (msg.image) {
      const decryptedImg = decryptText(msg.image);
      contentHtml += `<img class="msg-img" src="${decryptedImg}">`;
    }
    
    if (msg.file) {
      const decryptedName = decryptText(msg.file.name);
      const decryptedSize = decryptText(msg.file.size);
      const decryptedData = decryptText(msg.file.data);

      contentHtml += `
        <div class="file-doc-box">
          <div class="file-doc-icon">📄</div>
          <div class="file-doc-info">
            <div class="file-doc-name">${decryptedName}</div>
            <div class="file-doc-size">${decryptedSize}</div>
          </div>
          <a class="file-doc-download" href="${decryptedData}" download="${decryptedName}" target="_blank" title="Baixar Arquivo">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </a>
        </div>
      `;
    }

    if (msg.audio) {
      const decryptedAudio = decryptText(msg.audio);
      const uniqueAudId = 'aud_' + Math.random().toString(36).substr(2, 9);
      const seekId = 'seek_' + uniqueAudId;
      const durId = 'dur_' + uniqueAudId;

      contentHtml += `
        <div class="voice-msg-player">
          <button class="voice-play-btn" onclick="toggleVoicePlay('${uniqueAudId}', this)">
            <svg class="play-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <svg class="pause-icon hidden" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <div class="voice-progress-container">
            <input type="range" class="voice-seeker" id="${seekId}" value="0" min="0" max="100" oninput="seekVoice('${uniqueAudId}', this.value)">
            <div class="voice-meta">
              <span class="voice-duration" id="${durId}">0:00</span>
            </div>
          </div>
          <audio id="${uniqueAudId}" src="${decryptedAudio}" preload="metadata" onloadedmetadata="initVoiceMeta('${uniqueAudId}', '${durId}')" ontimeupdate="updateVoiceProgress('${uniqueAudId}', '${seekId}', '${durId}')" onended="resetVoicePlayer('${uniqueAudId}', '${seekId}', '${durId}')"></audio>
        </div>
      `;
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
        ${msg.edited ? '<span class="edited-tag">(editada)</span>' : ''}
        <span class="time">${timeStr}</span>
        ${isMe ? `<span class="checks">${checkSvg}</span>` : ''}
      </div>
    `;

    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
  });

  // Atualizar mensagens alteradas (como edição ou apagar)
  activeListener.on('child_changed', (snapshot) => {
    const el = document.getElementById('msg_' + snapshot.key);
    if (el) {
      openChat(activeChatId, document.getElementById('activeChatTitle').innerText, '', '');
    }
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
          dispatchMessage('', null, base64Audio, null);
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

function sendFileInChat(event) {
  const file = event.target.files[0];
  if (!file) return;

  const isExempt = (currentUser === 'root' || userData?.filePermission === true);

  if (!isExempt && file.size > 500 * 1024) {
    alert("⚠️ Arquivo muito grande! O limite para usuários padrão é 500KB.");
    event.target.value = '';
    return;
  }

  const lastFileTime = parseInt(localStorage.getItem('last_file_send_time') || '0', 10);
  const now = Date.now();
  const threeMinutes = 3 * 60 * 1000;

  if (!isExempt && (now - lastFileTime < threeMinutes)) {
    const remainingSecs = Math.ceil((threeMinutes - (now - lastFileTime)) / 1000);
    const mins = Math.floor(remainingSecs / 60);
    const secs = remainingSecs % 60;
    alert(`⏱️ Aguarde ${mins}m ${secs}s para enviar outro arquivo.`);
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const fileBase64 = e.target.result;
    dispatchMessage('', null, null, {
      name: file.name,
      size: formatBytes(file.size),
      data: fileBase64
    });

    if (!isExempt) {
      localStorage.setItem('last_file_send_time', now.toString());
    }
    event.target.value = '';
  };
  reader.readAsDataURL(file);
}

function sendMessage() {
  const textInput = document.getElementById('messageText');
  const rawText = textInput?.value.trim() || '';

  if (rawText !== '') {
    dispatchMessage(rawText, null, null, null);
    textInput.value = '';
  }
}

function sendPhotoInChat(event) {
  const file = event.target.files[0];
  if (file) {
    compressImage(file, 600, (base64Img) => {
      dispatchMessage('', base64Img, null, null);
    });
  }
}

function dispatchMessage(text, imageBase64, audioBase64, fileObj) {
  const chatPath = activeChatId === 'server' ? `chats_bot/${currentUser}` : `chats/${activeChatId}`;
  const chatRef = db.ref(chatPath);

  const shownAuthorName = userData?.displayName || currentUser;

  const payload = {
    author: currentUser,
    authorDisplayName: shownAuthorName,
    text: encryptText(text),
    timestamp: Date.now()
  };

  if (activeReplyData) {
    payload.replyTo = activeReplyData;
  }

  if (imageBase64) payload.image = encryptText(imageBase64);
  if (audioBase64) payload.audio = encryptText(audioBase64);
  if (fileObj) {
    payload.file = {
      name: encryptText(fileObj.name),
      size: encryptText(fileObj.size),
      data: encryptText(fileObj.data)
    };
  }

  chatRef.push(payload).then(() => {
    cancelReply();
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
