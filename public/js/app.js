/**
 * 耙耳朵麻将馆 - 大厅逻辑 v2.0
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
      document.getElementById('createdRoomCode').textContent = data.roomId;
      const variant = variants.find(v => v.id === selectedVariant);
      document.getElementById('createdVariant').textContent =
        `${variant ? variant.icon + ' ' + variant.name + ' - ' + variant.subtitle : ''}`;
      document.getElementById('roomCreatedOverlay').style.display = 'flex';
      // 保存房间信息
      sessionStorage.setItem('paerduo_room', JSON.stringify({
        roomId: data.roomId,
        roomName: data.roomName || roomName,
        variantId: selectedVariant,
        playerId: info.playerId,
        name: info.name,
        avatar: info.avatar,
      }));
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
