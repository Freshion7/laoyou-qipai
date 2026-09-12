/**
 * 老友棋牌 - 大厅逻辑 v2.0
 * 支持账号系统 + 多玩法选择
 */

const AVATARS = ['🐼', '🐰', '🐱', '🐶', '🦊', '🐻', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'];

let currentUser = null;
let selectedVariant = 'sichuan';
let variants = [];
let currentRoomId = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 检查登录状态
  const userStr = localStorage.getItem('paerduo_user');
  if (!userStr) {
    window.location.href = 'login.html';
    return;
  }
  try {
    currentUser = JSON.parse(userStr);
  } catch (e) {
    window.location.href = 'login.html';
    return;
  }

  // 显示用户信息
  document.getElementById('userAvatar').textContent = AVATARS[currentUser.avatar] || '🐼';
  document.getElementById('userNickname').textContent = currentUser.nickname || currentUser.username;
  const stats = currentUser.stats || {};
  document.getElementById('userStats').textContent =
    `对局 ${stats.totalGames || 0} · 胜局 ${stats.totalWins || 0} · 积分 ${stats.totalScore || 0}`;

  // 加载玩法列表
  loadVariants();
});

// 加载玩法列表
async function loadVariants() {
  try {
    const res = await fetch('/api/variants');
    const data = await res.json();
    if (data.success) {
      variants = data.variants;
      renderVariantList();
    }
  } catch (e) {
    console.error('加载玩法列表失败:', e);
  }
}

// 渲染玩法列表
function renderVariantList() {
  const container = document.getElementById('variantList');
  container.innerHTML = '';
  variants.forEach(v => {
    const div = document.createElement('div');
    div.style.cssText = `
      padding:12px;border-radius:10px;cursor:pointer;transition:all 0.2s;
      border:2px solid ${v.id === selectedVariant ? 'var(--primary)' : '#EEE'};
      background:${v.id === selectedVariant ? 'var(--bg-pink)' : 'white'};
    `;
    div.innerHTML = `
      <div style="font-size:24px;text-align:center;">${v.icon}</div>
      <div style="font-size:13px;font-weight:700;text-align:center;margin-top:4px;">${v.name}</div>
      <div style="font-size:11px;color:var(--text-light);text-align:center;">${v.subtitle}</div>
    `;
    div.onclick = () => {
      selectedVariant = v.id;
      renderVariantList();
      showVariantDetail(v);
    };
    container.appendChild(div);
  });
  // 显示默认玩法详情
  const defaultVariant = variants.find(v => v.id === selectedVariant);
  if (defaultVariant) showVariantDetail(defaultVariant);
}

// 显示玩法详情
function showVariantDetail(v) {
  const detail = document.getElementById('variantDetail');
  detail.style.display = 'block';
  detail.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;">${v.icon} ${v.name} - ${v.subtitle}</div>
    <div style="color:var(--text-light);margin-bottom:6px;">${v.description}</div>
    <div>📊 牌张: ${v.tileCount}张 | 起和: ${v.minFan > 0 ? v.minFan + '番' : '无限制'} | 封顶: ${v.maxFan}番</div>
    ${v.specialRules && v.specialRules.length > 0 ? `<div style="margin-top:4px;">✨ 特色: ${v.specialRules.join('、')}</div>` : ''}
  `;
}

// 获取玩家信息
function getPlayerInfo() {
  return {
    playerId: currentUser.username,
    name: currentUser.nickname || currentUser.username,
    avatar: currentUser.avatar,
  };
}

// 创建房间
async function createRoom() {
  const info = getPlayerInfo();
  const roomName = document.getElementById('roomNameInput').value.trim();
  try {
    const res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName,
        creatorId: info.playerId,
        variantId: selectedVariant,
      }),
    });
    const data = await res.json();
    if (data.success) {
      currentRoomId = data.roomId;
      // 保存房间信息
      sessionStorage.setItem('paerduo_room', JSON.stringify({
        roomId: data.roomId,
        roomName: data.roomName || roomName,
        variantId: selectedVariant,
        playerId: info.playerId,
        name: info.name,
        avatar: info.avatar,
      }));
      // 直接进入游戏房间
      window.location.href = 'game.html';
    }
  } catch (e) {
    showToast('创建房间失败，请重试');
  }
}

// 加入房间
async function joinRoom() {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code || code.length !== 6) {
    showToast('请输入6位房间号');
    return;
  }
  const info = getPlayerInfo();
  try {
    const res = await fetch(`/api/room/${code}`);
    const data = await res.json();
    if (!data.success) {
      showToast('房间不存在');
      return;
    }
    if (data.room.playerCount >= 4) {
      showToast('房间已满');
      return;
    }
    sessionStorage.setItem('paerduo_room', JSON.stringify({
      roomId: code,
      roomName: data.room.roomName,
      variantId: data.room.variant?.id || 'sichuan',
      playerId: info.playerId,
      name: info.name,
      avatar: info.avatar,
    }));
    window.location.href = 'game.html';
  } catch (e) {
    showToast('加入房间失败');
  }
}

// 进入游戏房间
function enterGameRoom() {
  if (currentRoomId) {
    window.location.href = 'game.html';
  }
}

// 显示房间列表
async function showRooms() {
  const container = document.getElementById('roomList');
  container.style.display = 'block';
  container.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    if (data.success && data.rooms.length > 0) {
      container.innerHTML = data.rooms.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-warm);border-radius:10px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${r.variantIcon || '🀄'} ${r.roomName || '欢乐麻将房'}
            </div>
            <div style="font-size:12px;color:var(--text-light);">
              ${r.variantName || '四川麻将'} · 房间号: ${r.roomId} · ${r.playerCount}/4 人
            </div>
          </div>
          <button class="btn btn-small btn-primary" style="margin-left:8px;flex-shrink:0;" onclick="quickJoin('${r.roomId}')">加入</button>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:16px;">暂无公开房间，创建一个吧~</p>';
    }
  } catch (e) {
    container.innerHTML = '<p style="text-align:center;color:var(--red);">获取房间列表失败</p>';
  }
}

// 快速加入
function quickJoin(roomId) {
  const info = getPlayerInfo();
  sessionStorage.setItem('paerduo_room', JSON.stringify({
    roomId,
    playerId: info.playerId,
    name: info.name,
    avatar: info.avatar,
  }));
  window.location.href = 'game.html';
}

// 退出登录
function logout() {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('paerduo_user');
    window.location.href = 'login.html';
  }
}

// Toast 提示
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ========== 排行榜 ==========
let currentRankTab = 'public';

// 显示排行榜
async function showRankings() {
  document.getElementById('rankingsOverlay').style.display = 'flex';
  // 检查是否管理员，显示内部榜标签
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  if (userInfo.isAdmin) {
    document.getElementById('internalRankTab').style.display = 'block';
  } else {
    document.getElementById('internalRankTab').style.display = 'none';
  }
  await loadRankings();
}

// 关闭排行榜
function closeRankings() {
  document.getElementById('rankingsOverlay').style.display = 'none';
}

// 切换排行榜标签
async function switchRankTab(tab) {
  currentRankTab = tab;
  document.getElementById('publicRankTab').className = tab === 'public' ? 'chat-channel-tab active' : 'chat-channel-tab';
  document.getElementById('internalRankTab').className = tab === 'internal' ? 'chat-channel-tab active' : 'chat-channel-tab';
  await loadRankings();
}

// 加载排行榜
async function loadRankings() {
  const list = document.getElementById('rankingsList');
  list.innerHTML = '<div class="loading-spinner"></div>';

  try {
    let url = '/api/rankings';
    if (currentRankTab === 'internal') {
      const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
      url = `/api/rankings/internal?username=${encodeURIComponent(userInfo.username || '')}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      list.innerHTML = `<p style="text-align:center;color:var(--red);">${data.error || '获取排行榜失败'}</p>`;
      return;
    }

    if (data.rankings.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">暂无排行数据</p>';
      return;
    }

    // 渲染排行榜
    list.innerHTML = data.rankings.map((p, idx) => {
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      const stars = p.rankIndex < 6 ? '★'.repeat(p.stars) + '☆'.repeat(p.maxStars - p.stars) : `${p.rankPoints}积分`;
      const adminBadge = p.isAdmin ? '<span style="background:linear-gradient(135deg,#FF6B9D,#FFB347);color:white;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px;">管理员</span>' : '';
      return `
        <div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #EEE;${idx < 3 ? 'background:linear-gradient(90deg,rgba(255,215,0,0.1),transparent);' : ''}">
          <span style="width:40px;font-size:18px;font-weight:700;text-align:center;">${rankBadge}</span>
          <span style="font-size:24px;margin-right:8px;">${['🐱','🐶','🐰','🐼','🦊','🐨','🐯','🦁','🐮','🐷','🐸','🐵'][p.avatar] || '❓'}</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:var(--text-dark);">
              ${p.nickname}${adminBadge}
            </div>
            <div style="font-size:11px;color:var(--text-light);">
              ${p.rankIcon} ${p.rankName} ${stars}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--text-light);">${p.totalGames}场</div>
            <div style="font-size:11px;color:var(--primary);">胜率${p.winRate}%</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<p style="text-align:center;color:var(--red);">获取排行榜失败</p>';
  }
}

// ========== 个人资料编辑 ==========
let editAvatarIndex = 0;

function showProfileEdit() {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  document.getElementById('editNickname').value = userInfo.nickname || '';
  editAvatarIndex = userInfo.avatar || 0;
  renderAvatarList('editAvatarList', editAvatarIndex, (idx) => {
    editAvatarIndex = idx;
    renderAvatarList('editAvatarList', editAvatarIndex);
  });
  document.getElementById('profileEditOverlay').style.display = 'flex';
}

function closeProfileEdit() {
  document.getElementById('profileEditOverlay').style.display = 'none';
}

async function saveProfile() {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  const nickname = document.getElementById('editNickname').value.trim();
  if (!nickname) {
    showToast('昵称不能为空');
    return;
  }
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: userInfo.username,
        token: userInfo.token,
        nickname,
        avatar: editAvatarIndex,
      }),
    });
    const data = await res.json();
    if (data.success) {
      // 更新本地存储
      userInfo.nickname = data.user.nickname;
      userInfo.avatar = data.user.avatar;
      localStorage.setItem('paerduo_user', JSON.stringify(userInfo));
      // 更新页面显示
      updateUserDisplay();
      closeProfileEdit();
      showToast('资料更新成功');
    } else {
      showToast(data.error || '更新失败');
    }
  } catch (e) {
    showToast('更新失败，请重试');
  }
}

// ========== 好友系统 ==========
let currentFriendTab = 'list';

function showFriends() {
  document.getElementById('friendsOverlay').style.display = 'flex';
  switchFriendTab('list');
}

function closeFriends() {
  document.getElementById('friendsOverlay').style.display = 'none';
}

function switchFriendTab(tab) {
  currentFriendTab = tab;
  document.getElementById('friendListTab').className = tab === 'list' ? 'chat-channel-tab active' : 'chat-channel-tab';
  document.getElementById('friendRequestTab').className = tab === 'request' ? 'chat-channel-tab active' : 'chat-channel-tab';
  document.getElementById('friendSearchTab').className = tab === 'search' ? 'chat-channel-tab active' : 'chat-channel-tab';

  if (tab === 'list') loadFriendList();
  else if (tab === 'request') loadFriendRequests();
  else if (tab === 'search') showFriendSearch();
}

async function loadFriendList() {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  const content = document.getElementById('friendsContent');
  content.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const res = await fetch(`/api/friends?username=${encodeURIComponent(userInfo.username)}`);
    const data = await res.json();
    if (!data.success || data.friends.length === 0) {
      content.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">还没有好友，去添加好友吧！</p>';
      return;
    }
    content.innerHTML = data.friends.map(f => `
      <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #EEE;">
        <span style="font-size:28px;margin-right:10px;">${['🐱','🐶','🐰','🐼','🦊','🐨','🐯','🦁','🐮','🐷','🐸','🐵'][f.avatar] || '❓'}</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${f.nickname} ${f.online ? '<span style="color:#4CAF50;font-size:11px;">● 在线</span>' : '<span style="color:#999;font-size:11px;">○ 离线</span>'}</div>
          <div style="font-size:11px;color:var(--text-light);">${f.rank?.rankIcon || ''} ${f.rank?.rankName || ''}</div>
        </div>
        ${f.online ? `<button class="btn btn-small btn-primary" onclick="inviteFriend('${f.username}')" style="padding:6px 10px;font-size:12px;">邀请</button>` : ''}
        <button class="btn btn-small btn-outline" onclick="removeFriend('${f.username}')" style="padding:6px 10px;font-size:12px;margin-left:6px;">删除</button>
      </div>
    `).join('');
  } catch (e) {
    content.innerHTML = '<p style="text-align:center;color:var(--red);">获取好友列表失败</p>';
  }
}

async function loadFriendRequests() {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  const content = document.getElementById('friendsContent');
  content.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const res = await fetch(`/api/friend-requests?username=${encodeURIComponent(userInfo.username)}`);
    const data = await res.json();
    if (!data.success || data.requests.length === 0) {
      content.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">暂无好友请求</p>';
      return;
    }
    content.innerHTML = data.requests.map(r => `
      <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #EEE;">
        <span style="font-size:28px;margin-right:10px;">${['🐱','🐶','🐰','🐼','🦊','🐨','🐯','🦁','🐮','🐷','🐸','🐵'][r.avatar] || '❓'}</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${r.nickname}</div>
          <div style="font-size:11px;color:var(--text-light);">${r.from}</div>
        </div>
        <button class="btn btn-small btn-green" onclick="acceptFriend('${r.from}')" style="padding:6px 10px;font-size:12px;">接受</button>
        <button class="btn btn-small btn-outline" onclick="rejectFriend('${r.from}')" style="padding:6px 10px;font-size:12px;margin-left:6px;">拒绝</button>
      </div>
    `).join('');
  } catch (e) {
    content.innerHTML = '<p style="text-align:center;color:var(--red);">获取好友请求失败</p>';
  }
}

function showFriendSearch() {
  const content = document.getElementById('friendsContent');
  content.innerHTML = `
    <div style="padding:12px;">
      <div class="input-group" style="margin-bottom:12px;">
        <input type="text" class="input-field" id="friendSearchInput" placeholder="输入用户名或昵称搜索" onkeypress="if(event.key==='Enter')searchFriend()">
      </div>
      <button class="btn btn-primary" onclick="searchFriend()" style="width:100%;">🔍 搜索</button>
      <div id="friendSearchResult" style="margin-top:12px;"></div>
    </div>
  `;
}

async function searchFriend() {
  const keyword = document.getElementById('friendSearchInput').value.trim();
  if (!keyword) {
    showToast('请输入搜索关键词');
    return;
  }
  const resultDiv = document.getElementById('friendSearchResult');
  resultDiv.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const res = await fetch(`/api/search-user?keyword=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    if (!data.success || data.users.length === 0) {
      resultDiv.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">未找到用户</p>';
      return;
    }
    resultDiv.innerHTML = data.users.map(u => `
      <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #EEE;">
        <span style="font-size:28px;margin-right:10px;">${['🐱','🐶','🐰','🐼','🦊','🐨','🐯','🦁','🐮','🐷','🐸','🐵'][u.avatar] || '❓'}</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${u.nickname}</div>
          <div style="font-size:11px;color:var(--text-light);">${u.username} · ${u.rank?.rankIcon || ''} ${u.rank?.rankName || ''}</div>
        </div>
        <button class="btn btn-small btn-primary" onclick="sendFriendRequest('${u.username}')" style="padding:6px 10px;font-size:12px;">添加</button>
      </div>
    `).join('');
  } catch (e) {
    resultDiv.innerHTML = '<p style="text-align:center;color:var(--red);">搜索失败</p>';
  }
}

async function sendFriendRequest(toUsername) {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  try {
    const res = await fetch('/api/friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInfo.username, token: userInfo.token, toUsername }),
    });
    const data = await res.json();
    showToast(data.success ? '好友请求已发送' : (data.error || '发送失败'));
  } catch (e) {
    showToast('发送失败');
  }
}

async function acceptFriend(fromUsername) {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  try {
    const res = await fetch('/api/friend-accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInfo.username, token: userInfo.token, fromUsername }),
    });
    const data = await res.json();
    showToast(data.success ? '已添加好友' : (data.error || '操作失败'));
    if (data.success) loadFriendRequests();
  } catch (e) {
    showToast('操作失败');
  }
}

async function rejectFriend(fromUsername) {
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  try {
    const res = await fetch('/api/friend-reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInfo.username, token: userInfo.token, fromUsername }),
    });
    const data = await res.json();
    showToast(data.success ? '已拒绝' : (data.error || '操作失败'));
    if (data.success) loadFriendRequests();
  } catch (e) {
    showToast('操作失败');
  }
}

async function removeFriend(friendUsername) {
  if (!confirm('确定要删除这个好友吗？')) return;
  const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
  try {
    const res = await fetch('/api/friend-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInfo.username, token: userInfo.token, friendUsername }),
    });
    const data = await res.json();
    showToast(data.success ? '已删除好友' : (data.error || '操作失败'));
    if (data.success) loadFriendList();
  } catch (e) {
    showToast('操作失败');
  }
}

// ========== 分享功能 ==========
function shareGame() {
  const shareUrl = window.location.origin;
  const shareText = `🎮 快来玩【老友棋牌】！多玩法Q版联机麻将，支持语音聊天和好友系统！\n${shareUrl}`;

  if (navigator.share) {
    navigator.share({
      title: '老友棋牌',
      text: shareText,
      url: shareUrl,
    }).catch(() => {});
  } else {
    // 复制到剪贴板
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('分享链接已复制到剪贴板');
    }).catch(() => {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('分享链接已复制到剪贴板');
    });
  }
}

// 邀请好友进房间（在游戏页面中使用）
function inviteFriend(friendUsername) {
  // 这个函数在游戏页面中会被重写，这里只是占位
  showToast('请在游戏房间中邀请好友');
}
