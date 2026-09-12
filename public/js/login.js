/**
 * 耙耳朵麻将馆 - 登录注册逻辑
 */

const AVATARS = ['🐼', '🐰', '🐱', '🐶', '🦊', '🐻', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'];
let selectedAvatar = 0;

document.addEventListener('DOMContentLoaded', () => {
  initAvatars();
  // 检查是否已登录
  const userInfo = localStorage.getItem('paerduo_user');
  if (userInfo) {
    try {
      const user = JSON.parse(userInfo);
      if (user.token) {
        // 已登录，直接跳大厅
        window.location.href = 'index.html';
      }
    } catch (e) {}
  }
});

function initAvatars() {
  const container = document.getElementById('regAvatarList');
  if (!container) return;
  container.innerHTML = '';
  AVATARS.forEach((avatar, idx) => {
    const div = document.createElement('div');
    div.style.cssText = `
      width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:26px;cursor:pointer;transition:all 0.2s;border:3px solid transparent;
      background:var(--bg-warm);
    `;
    div.textContent = avatar;
    div.onclick = () => {
      selectedAvatar = idx;
      updateAvatarSelection();
    };
    container.appendChild(div);
  });
  updateAvatarSelection();
}

function updateAvatarSelection() {
  const container = document.getElementById('regAvatarList');
  if (!container) return;
  const items = container.children;
  for (let i = 0; i < items.length; i++) {
    if (i === selectedAvatar) {
      items[i].style.borderColor = 'var(--primary)';
      items[i].style.background = 'var(--bg-pink)';
      items[i].style.transform = 'scale(1.1)';
    } else {
      items[i].style.borderColor = 'transparent';
      items[i].style.background = 'var(--bg-warm)';
      items[i].style.transform = 'scale(1)';
    }
  }
}

function showRegister() {
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'block';
}

function showLogin() {
  document.getElementById('loginCard').style.display = 'block';
  document.getElementById('registerCard').style.display = 'none';
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username) { showToast('请输入用户名'); return; }
  if (!password) { showToast('请输入密码'); return; }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('paerduo_user', JSON.stringify({
        username: data.user.username,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        token: data.token,
        isAdmin: data.user.isAdmin || false,
        stats: {
          totalGames: data.user.totalGames,
          totalWins: data.user.totalWins,
          totalScore: data.user.totalScore,
          bestFan: data.user.bestFan,
        },
      }));
      showToast('登录成功！');
      setTimeout(() => { window.location.href = 'index.html'; }, 500);
    } else {
      showToast(data.error || '登录失败');
    }
  } catch (e) {
    showToast('网络错误，请重试');
  }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const nickname = document.getElementById('regNickname').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!username || username.length < 2) { showToast('用户名至少2个字符'); return; }
  if (!password || password.length < 4) { showToast('密码至少4个字符'); return; }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname: nickname || username, avatar: selectedAvatar }),
    });
    const data = await res.json();
    if (data.success) {
      // 注册成功后自动登录
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const loginData = await loginRes.json();
      if (loginData.success) {
        localStorage.setItem('paerduo_user', JSON.stringify({
          username: loginData.user.username,
          nickname: loginData.user.nickname,
          avatar: loginData.user.avatar,
          token: loginData.token,
          isAdmin: loginData.user.isAdmin || false,
          stats: {
            totalGames: loginData.user.totalGames,
            totalWins: loginData.user.totalWins,
            totalScore: loginData.user.totalScore,
            bestFan: loginData.user.bestFan,
          },
        }));
      }
      showToast('注册成功！');
      setTimeout(() => { window.location.href = 'index.html'; }, 500);
    } else {
      showToast(data.error || '注册失败');
    }
  } catch (e) {
    showToast('网络错误，请重试');
  }
}

// 游客登录
function guestLogin() {
  const guestId = 'guest_' + Math.random().toString(36).substr(2, 8);
  localStorage.setItem('paerduo_user', JSON.stringify({
    username: guestId,
    nickname: '游客' + Math.floor(Math.random() * 1000),
    avatar: Math.floor(Math.random() * 12),
    token: 'guest',
    isGuest: true,
  }));
  showToast('游客模式进入');
  setTimeout(() => { window.location.href = 'index.html'; }, 300);
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// 回车登录
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('loginCard').style.display !== 'none') {
      doLogin();
    } else {
      doRegister();
    }
  }
});
