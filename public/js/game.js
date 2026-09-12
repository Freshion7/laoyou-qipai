/**
 * 耙耳朵麻将馆 - 游戏前端核心逻辑 v3.0
 * 横屏布局 + 出牌按钮 + 提示功能
 */

const AVATARS = ['🐼', '🐰', '🐱', '🐶', '🦊', '🐻', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'];
const SUIT_CLASS = { wan: 'tile-wan', tong: 'tile-tong', tiao: 'tile-tiao' };
const SUIT_NAME = { wan: '万', tong: '筒', tiao: '条' };

// 游戏状态
let ws = null;
let mySeat = -1;
let roomId = '';
let roomName = '';
let isCreator = false;
let isAdmin = false;
let currentVariant = null;
let tempVariant = null;
let allVariants = [];
let players = [null, null, null, null];
let myHand = [];
let myMelds = [];
let myMissingSuit = null;
let gameState = 'waiting';
let selectedTile = -1;
let pendingActions = [];
let isMyTurn = false;
let lastDrawnTile = -1;
let hintTiles = [];

// ========== 音频系统 ==========
let audioCtx = null;
let audioEnabled = true;
let bgmPlaying = false;
let bgmOscillator = null;
let bgmGain = null;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.log('Web Audio API not supported');
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 播放音调
function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  if (!audioEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

// 播放和弦
function playChord(frequencies, duration, type = 'sine', volume = 0.2) {
  frequencies.forEach(f => playTone(f, duration, type, volume));
}

// 各种音效
const SFX = {
  // 出牌：清脆的敲击声
  discard: () => {
    playTone(800, 0.08, 'square', 0.15);
    setTimeout(() => playTone(600, 0.06, 'square', 0.1), 30);
  },
  // 摸牌：轻柔的提示音
  draw: () => {
    playTone(523, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.15), 80);
  },
  // 碰：有力的声音
  pung: () => {
    playTone(440, 0.15, 'square', 0.25);
    setTimeout(() => playTone(330, 0.2, 'square', 0.2), 100);
  },
  // 杠：低沉有力
  kong: () => {
    playTone(220, 0.2, 'sawtooth', 0.25);
    setTimeout(() => playTone(165, 0.3, 'sawtooth', 0.2), 120);
    setTimeout(() => playTone(110, 0.25, 'sine', 0.15), 200);
  },
  // 胡牌：喜庆的上升音阶
  win: () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'sine', 0.25), i * 100);
    });
    setTimeout(() => playChord([523, 659, 784], 0.5, 'sine', 0.2), 500);
  },
  // 自摸：更喜庆
  tsumo: () => {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'triangle', 0.3), i * 80);
    });
    setTimeout(() => playChord([523, 659, 784, 1047], 0.6, 'sine', 0.25), 450);
  },
  // 定缺：确认音
  dingque: () => {
    playTone(784, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(1047, 0.15, 'sine', 0.2), 100);
  },
  // 按钮点击
  click: () => {
    playTone(1000, 0.05, 'sine', 0.1);
  },
  // 喝茶：倒茶声
  tea: () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => playTone(300 + Math.random() * 200, 0.05, 'sine', 0.08), i * 60);
    }
  },
  // 表情：可爱的声音
  emote: () => {
    playTone(600 + Math.random() * 400, 0.1, 'sine', 0.15);
  },
  // 等待：轻柔提示
  notify: () => {
    playTone(880, 0.1, 'sine', 0.15);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.1), 100);
  },
  // 错误：低沉的提示
  error: () => {
    playTone(200, 0.2, 'sawtooth', 0.15);
  },
  // 胜利结算
  settle: () => {
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'triangle', 0.2), i * 80);
    });
  },
};

// 背景音乐（简单的循环旋律）
function startBGM() {
  if (!audioEnabled || !audioCtx || bgmPlaying) return;
  bgmPlaying = true;

  // 简单的中国风旋律循环
  const melody = [
    { f: 523, d: 0.4 }, { f: 587, d: 0.4 }, { f: 659, d: 0.4 }, { f: 587, d: 0.4 },
    { f: 523, d: 0.4 }, { f: 494, d: 0.4 }, { f: 523, d: 0.8 },
    { f: 659, d: 0.4 }, { f: 698, d: 0.4 }, { f: 784, d: 0.4 }, { f: 698, d: 0.4 },
    { f: 659, d: 0.4 }, { f: 587, d: 0.4 }, { f: 523, d: 0.8 },
  ];

  let idx = 0;
  function playNext() {
    if (!bgmPlaying || !audioEnabled) return;
    const note = melody[idx % melody.length];
    playTone(note.f, note.d * 0.9, 'sine', 0.06);
    // 低音伴奏
    if (idx % 4 === 0) {
      playTone(note.f / 2, note.d * 2, 'triangle', 0.04);
    }
    idx++;
    setTimeout(playNext, note.d * 1000);
  }
  playNext();
}

function stopBGM() {
  bgmPlaying = false;
}

function toggleAudio() {
  initAudio();
  audioEnabled = !audioEnabled;
  const btn = document.getElementById('audioBtn');
  if (audioEnabled) {
    btn.textContent = '🔊';
    btn.classList.remove('muted');
    startBGM();
    SFX.click();
  } else {
    btn.textContent = '🔇';
    btn.classList.add('muted');
    stopBGM();
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 用户首次交互时启动音频（浏览器策略要求）
  const startAudioOnce = () => {
    initAudio();
    startBGM();
    document.removeEventListener('click', startAudioOnce);
    document.removeEventListener('touchstart', startAudioOnce);
  };
  document.addEventListener('click', startAudioOnce);
  document.addEventListener('touchstart', startAudioOnce);

  const roomData = JSON.parse(sessionStorage.getItem('paerduo_room') || '{}');
  if (!roomData.roomId || !roomData.playerId) {
    window.location.href = 'index.html';
    return;
  }
  roomId = roomData.roomId;
  const displayName = roomData.roomName || '欢乐麻将房';
  document.getElementById('roomInfoDisplay').textContent = `🏠 ${displayName} (${roomId})`;
  document.getElementById('waitingRoomCode').textContent = roomId;
  connectWebSocket(roomData);
});

// WebSocket连接
let connectTimeout = null;
let hasJoined = false;

function connectWebSocket(roomData) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  ws = new WebSocket(wsUrl);
  hasJoined = false;

  connectTimeout = setTimeout(() => {
    if (!hasJoined) {
      clearTimeout(connectTimeout);
      sessionStorage.removeItem('paerduo_room');
      showToast('连接超时，房间可能已不存在');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    }
  }, 10000);

  ws.onopen = () => {
    const userInfo = JSON.parse(localStorage.getItem('paerduo_user') || '{}');
    ws.send(JSON.stringify({
      type: 'join',
      payload: {
        roomId: roomData.roomId,
        playerId: roomData.playerId,
        name: roomData.name,
        avatar: roomData.avatar,
        username: userInfo.username || '',
      },
    }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg.type, msg.data);
  };

  ws.onclose = () => {
    if (hasJoined) {
      showToast('连接已断开，正在重连...');
      setTimeout(() => connectWebSocket(roomData), 3000);
    }
  };
  ws.onerror = () => {};
}

// 消息处理
function handleMessage(type, data) {
  switch (type) {
    case 'joined':
      hasJoined = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      mySeat = data.seat;
      roomId = data.roomId;
      roomName = data.roomName || '欢乐麻将房';
      isCreator = data.isCreator || false;
      isAdmin = data.isAdmin || false;
      currentVariant = data.variant || null;
      players = data.players.map(p => p || null);
      const vt = currentVariant ? `${currentVariant.icon} ${currentVariant.name}` : '🀄 四川麻将';
      document.getElementById('roomInfoDisplay').textContent = `🏠 ${roomName} (${roomId})`;
      document.getElementById('variantDisplay').textContent = vt;
      document.title = `${roomName} - 耙耳朵麻将馆`;
      if (isCreator) document.getElementById('destroyRoomBtn').style.display = 'flex';
      // 管理员显示添加AI按钮
      if (isAdmin) {
        document.getElementById('addAiBtn').style.display = 'flex';
      }
      loadVariants();
      updateWaitingList();
      updatePlayerInfos();
      if (data.state === 'dingque' || data.state === 'playing') {
        gameState = data.state;
        document.getElementById('waitingOverlay').style.display = 'none';
      }
      SFX.notify();
      break;

    case 'player_joined':
      players[data.player.seat] = data.player;
      updateWaitingList();
      updatePlayerInfos();
      break;

    case 'player_offline':
      if (players[data.seat]) { players[data.seat].offline = true; updatePlayerInfos(); }
      showToast('玩家掉线了');
      break;

    case 'room_full':
      document.getElementById('readyBtn').style.display = 'block';
      document.getElementById('waitingTip').textContent = '人齐啦！点击准备开始游戏';
      break;

    case 'player_ready':
      if (players[data.seat]) { players[data.seat].ready = true; updateWaitingList(); }
      break;

    case 'dingque':
      gameState = 'dingque';
      myHand = data.hand;
      myMelds = [];
      document.getElementById('waitingOverlay').style.display = 'none';
      document.getElementById('dingqueOverlay').style.display = 'flex';
      renderMyHand();
      SFX.dingque();
      break;

    case 'dingque_confirm':
      myMissingSuit = data.suit;
      document.getElementById('dingqueOverlay').style.display = 'none';
      document.getElementById('missingSuitDisplay').textContent = `缺${SUIT_NAME[data.suit]}`;
      showToast(`定缺：${SUIT_NAME[data.suit]}`);
      SFX.click();
      break;

    case 'state_change':
      gameState = data.state;
      break;

    case 'your_turn':
      isMyTurn = true;
      myHand = data.hand || myHand;
      myMelds = data.melds || myMelds;
      document.getElementById('wallTiles').textContent = data.wallTiles;
      selectedTile = -1;
      hintTiles = [];
      renderMyHand();
      renderMelds();
      highlightActivePlayer(mySeat);
      document.getElementById('gameStatus').textContent = '轮到你出牌';
      SFX.draw();
      break;

    case 'turn_change':
      isMyTurn = false;
      selectedTile = -1;
      hideDiscardBtn();
      highlightActivePlayer(data.seat);
      document.getElementById('gameStatus').textContent = `${getPlayerName(data.seat)} 出牌中...`;
      break;

    case 'tile_drawn':
      if (data.hand) myHand = data.hand;
      else if (data.tile !== undefined) {
        myHand.push(data.tile);
        myHand.sort((a, b) => a - b);
      }
      lastDrawnTile = data.tile;
      renderMyHand();
      if (data.isKongDraw) showToast('杠后补牌');
      SFX.draw();
      break;

    case 'tile_discarded':
      selectedTile = -1;
      hideDiscardBtn();
      addDiscardTile(data.tile, data.fromSeat);
      updatePlayerHandCount(data.fromSeat, data.handCount);
      if (data.fromSeat !== mySeat) SFX.discard();
      break;

    case 'tile_pung':
      showToast(`${getPlayerName(data.seat)} 碰了！`);
      if (players[data.seat]) players[data.seat].melds = data.melds;
      if (data.seat === mySeat) { myMelds = data.melds; renderMelds(); }
      renderOtherMelds(data.seat, data.melds);
      SFX.pung();
      break;

    case 'tile_kong':
      const kn = { mingkong: '明杠', bugang: '补杠', ankong: '暗杠' };
      showToast(`${getPlayerName(data.seat)} ${kn[data.kongType] || '杠'}！`);
      if (players[data.seat]) players[data.seat].melds = data.melds;
      if (data.seat === mySeat) { myMelds = data.melds; renderMelds(); }
      renderOtherMelds(data.seat, data.melds);
      SFX.kong();
      break;

    case 'action_available':
      pendingActions = data.actions || [];
      showActionButtons(data);
      break;

    case 'player_win':
      showWinEffect(data);
      if (data.seat === mySeat) { myHand = data.hand; myMelds = data.melds; renderMyHand(); renderMelds(); }
      if (players[data.seat]) { players[data.seat].hasWon = true; players[data.seat].score = data.score; }
      updatePlayerInfos();
      if (data.winType === 'tsumo') SFX.tsumo();
      else SFX.win();
      break;

    case 'round_settle':
      showSettle(data);
      SFX.settle();
      break;

    case 'chat':
      showChatBubble(data.seat, data.message);
      SFX.emote();
      break;

    case 'emote':
      showEmoteAnimation(data.seat, data.emote);
      SFX.emote();
      break;

    case 'tea_action':
      showTeaAnimation(data.fromSeat, data.targetSeat);
      SFX.tea();
      break;

    case 'room_destroyed':
      alert(`房间「${data.roomName || ''}」已被房主解散，即将返回大厅。`);
      sessionStorage.removeItem('paerduo_room');
      window.location.href = 'index.html';
      break;

    case 'variant_changed':
      currentVariant = data.variant;
      const vtx = data.variant ? `${data.variant.icon} ${data.variant.name}` : '🀄 四川麻将';
      document.getElementById('variantDisplay').textContent = vtx;
      showToast(`玩法已切换为：${data.variant.name}`);
      break;

    case 'error':
      showToast(data.message || '出错了');
      break;

    case 'pong':
      break;
  }
}

// ========== 渲染函数 ==========

function renderMyHand() {
  const container = document.getElementById('hand0');
  container.innerHTML = '';
  myHand.forEach((tile, idx) => {
    const el = createTileElement(tile, idx === selectedTile, hintTiles.includes(idx));
    el.onclick = () => onTileClick(idx);
    container.appendChild(el);
  });
}

function createTileElement(tile, selected = false, hint = false) {
  const suit = getSuit(tile);
  const num = getNumber(tile);
  const el = document.createElement('div');
  el.className = `mahjong-tile ${SUIT_CLASS[suit]} ${selected ? 'selected' : ''} ${hint ? 'hint-tile' : ''}`;
  el.innerHTML = `<span class="tile-number">${num}</span><span class="tile-suit">${SUIT_NAME[suit]}</span>`;
  return el;
}

function createSmallTile(tile) {
  const suit = getSuit(tile);
  const num = getNumber(tile);
  const el = document.createElement('div');
  el.className = `discard-tile ${SUIT_CLASS[suit]}`;
  el.innerHTML = `<span class="tile-number">${num}</span><span class="tile-suit">${SUIT_NAME[suit]}</span>`;
  return el;
}

function renderMelds() {
  const container = document.getElementById('melds0');
  container.innerHTML = '';
  myMelds.forEach(meld => {
    const group = document.createElement('div');
    group.className = 'meld-group';
    meld.tiles.forEach(t => group.appendChild(createTileElement(t, false, false)));
    container.appendChild(group);
  });
}

function renderOtherMelds(seat, melds) {
  const container = document.getElementById(`melds${seat}`);
  if (!container) return;
  container.innerHTML = '';
  melds.forEach(meld => {
    const group = document.createElement('div');
    group.className = 'meld-group';
    meld.tiles.forEach(t => group.appendChild(createTileElement(t, false, false)));
    container.appendChild(group);
  });
}

function addDiscardTile(tile, fromSeat) {
  const area = document.getElementById('discardArea');
  const el = createSmallTile(tile);
  area.appendChild(el);
  while (area.children.length > 50) area.removeChild(area.firstChild);
}

function renderOtherHand(seat, count) {
  const container = document.getElementById(`hand${seat}`);
  if (!container) return;
  container.innerHTML = '';
  const displayCount = Math.min(count, 13);
  for (let i = 0; i < displayCount; i++) {
    const back = document.createElement('div');
    back.className = 'tile-back';
    back.textContent = '🀫';
    container.appendChild(back);
  }
}

function updatePlayerInfos() {
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const el = document.getElementById(`playerInfo${i}`);
    if (!el) continue;
    if (p) {
      el.innerHTML = `
        <span class="player-avatar">${AVATARS[p.avatar] || '❓'}</span>
        <span class="player-name">${p.name}${p.offline ? '(离线)' : ''}</span>
        <span class="player-score">${p.totalScore !== undefined ? (p.totalScore >= 0 ? '+' : '') + p.totalScore : ''}</span>
        ${p.hasWon ? '<span style="color:var(--gold);font-size:12px;">👑</span>' : ''}
      `;
    } else {
      el.innerHTML = `<span class="player-avatar">❓</span><span class="player-name">等待中</span>`;
    }
  }
}

function updateWaitingList() {
  const container = document.getElementById('waitingPlayerList');
  container.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const slot = document.createElement('div');
    slot.className = `waiting-player ${p ? 'filled' : ''}`;
    if (p) {
      slot.innerHTML = `
        <div class="avatar">${AVATARS[p.avatar] || '❓'}</div>
        <div class="name">${p.name}</div>
        <div class="status">${p.ready ? '✅ 已准备' : '等待准备'}</div>
      `;
    } else {
      slot.innerHTML = `<div class="avatar">➕</div><div class="name" style="color:#CCC;">虚位以待</div>`;
    }
    container.appendChild(slot);
  }
}

function highlightActivePlayer(seat) {
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`playerInfo${i}`);
    if (el) el.classList.toggle('active', i === seat);
  }
}

function updatePlayerHandCount(seat, count) {
  renderOtherHand(seat, count);
}

// ========== 交互处理 ==========

function onTileClick(idx) {
  if (!isMyTurn && pendingActions.length === 0) return;
  if (selectedTile === idx) {
    if (isMyTurn) confirmDiscard();
    return;
  }
  selectedTile = idx;
  hintTiles = [];
  renderMyHand();
  // 显示出牌按钮
  if (isMyTurn) {
    document.getElementById('discardBtn').style.display = 'flex';
  }
}

function confirmDiscard() {
  if (selectedTile === -1 || !isMyTurn) return;
  const tile = myHand[selectedTile];
  ws.send(JSON.stringify({ type: 'discard', payload: { tile } }));
  selectedTile = -1;
  isMyTurn = false;
  hideDiscardBtn();
}

function hideDiscardBtn() {
  document.getElementById('discardBtn').style.display = 'none';
}

function chooseDingque(suit) {
  ws.send(JSON.stringify({ type: 'dingque', payload: { suit } }));
}

function playerReady() {
  ws.send(JSON.stringify({ type: 'ready', payload: {} }));
  document.getElementById('readyBtn').style.display = 'none';
  document.getElementById('waitingTip').textContent = '已准备，等待其他玩家...';
}

function showActionButtons(data) {
  const actions = data.actions || [];
  const hasWin = actions.some(a => a.action === 'win');
  const hasPung = actions.some(a => a.action === 'pung');
  const hasKong = actions.some(a => a.action === 'kong');
  const group = document.getElementById('actionGroup');
  group.style.display = 'flex';

  document.getElementById('winBtn').style.display = hasWin ? 'flex' : 'none';
  document.getElementById('pungBtn').style.display = hasPung ? 'flex' : 'none';
  document.getElementById('kongBtn').style.display = hasKong ? 'flex' : 'none';

  // 隐藏出牌和提示按钮
  document.getElementById('discardBtn').style.display = 'none';
  document.getElementById('hintBtn').style.display = 'none';
}

function doAction(action) {
  const data = pendingActions[0] || {};
  if (action === 'pass') {
    ws.send(JSON.stringify({ type: 'action', payload: { action: 'pass' } }));
  } else if (action === 'win') {
    if (data.isSelfDraw) {
      ws.send(JSON.stringify({ type: 'self_draw_win', payload: {} }));
    } else {
      ws.send(JSON.stringify({ type: 'action', payload: { action: 'win', tile: data.tile } }));
    }
  } else if (action === 'pung') {
    ws.send(JSON.stringify({ type: 'action', payload: { action: 'pung', tile: data.tile } }));
  } else if (action === 'kong') {
    ws.send(JSON.stringify({ type: 'action', payload: { action: 'kong', tile: data.tile, kongType: 'mingkong' } }));
  }
  document.getElementById('actionGroup').style.display = 'none';
  document.getElementById('hintBtn').style.display = 'flex';
  if (isMyTurn) document.getElementById('discardBtn').style.display = 'flex';
}

// 提示功能
function showHint() {
  if (!isMyTurn) {
    showToast('还没轮到你出牌');
    return;
  }
  // 简单提示：高亮可以打的牌（这里简化为高亮所有牌，实际应该计算听牌）
  // 计算听牌：尝试打出每张牌，看是否听牌
  hintTiles = [];
  const suitMap = { wan: [0, 8], tong: [9, 17], tiao: [18, 26] };
  const [missStart, missEnd] = suitMap[myMissingSuit] || [0, 8];

  for (let i = 0; i < myHand.length; i++) {
    // 跳过缺的花色
    if (myHand[i] >= missStart && myHand[i] <= missEnd) continue;
    // 尝试打出这张牌，看剩余牌是否听牌
    const testHand = [...myHand];
    testHand.splice(i, 1);
    if (canTing(testHand, myMissingSuit, myMelds)) {
      hintTiles.push(i);
    }
  }

  if (hintTiles.length > 0) {
    showToast(`💡 有 ${hintTiles.length} 张牌可以打（听牌）`);
  } else {
    showToast('💡 当前没有听牌，建议打孤张');
    // 高亮所有非缺花色的牌
    for (let i = 0; i < myHand.length; i++) {
      if (!(myHand[i] >= missStart && myHand[i] <= missEnd)) {
        hintTiles.push(i);
      }
    }
  }
  renderMyHand();
  // 3秒后取消高亮
  setTimeout(() => { hintTiles = []; renderMyHand(); }, 3000);
}

// 简单听牌检测（是否差一张胡）
function canTing(hand, missingSuit, melds) {
  const suitMap = { wan: [0, 8], tong: [9, 17], tiao: [18, 26] };
  const [missStart, missEnd] = suitMap[missingSuit];
  // 尝试加每一张牌看能否胡
  for (let t = 0; t < 27; t++) {
    if (t >= missStart && t <= missEnd) continue;
    const testHand = [...hand, t];
    if (testHand.length !== 14) continue;
    if (isBasicWinLocal(testHand) || isSevenPairsLocal(testHand)) return true;
  }
  return false;
}

function isBasicWinLocal(hand) {
  if (hand.length !== 14) return false;
  const counts = new Array(27).fill(0);
  hand.forEach(t => counts[t]++);
  for (let i = 0; i < 27; i++) {
    if (counts[i] >= 2) {
      const c = [...counts];
      c[i] -= 2;
      if (canFormMeldsLocal(c)) return true;
    }
  }
  return false;
}

function canFormMeldsLocal(counts) {
  const c = [...counts];
  for (let i = 0; i < 27; i++) {
    if (c[i] === 0) continue;
    if (c[i] >= 3) { c[i] -= 3; i--; continue; }
    const num = i % 9;
    if (num <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; i--; continue;
    }
    return false;
  }
  return true;
}

function isSevenPairsLocal(hand) {
  if (hand.length !== 14) return false;
  const counts = new Array(27).fill(0);
  hand.forEach(t => counts[t]++);
  let pairs = 0;
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] === 4) pairs += 2;
    else if (counts[i] > 0) return false;
  }
  return pairs === 7;
}

function nextRound() {
  document.getElementById('settleOverlay').style.display = 'none';
  ws.send(JSON.stringify({ type: 'next_round', payload: {} }));
  myHand = []; myMelds = []; selectedTile = -1; hintTiles = [];
  document.getElementById('discardArea').innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`melds${i}`);
    if (el) el.innerHTML = '';
  }
  document.getElementById('hintBtn').style.display = 'flex';
}

function leaveRoom() {
  if (confirm('确定要离开房间吗？')) {
    if (ws) ws.close();
    sessionStorage.removeItem('paerduo_room');
    window.location.href = 'index.html';
  }
}

// 添加AI人机玩家（管理员功能）
function addAIPlayer() {
  if (!isAdmin) {
    showToast('只有管理员可以添加人机玩家');
    return;
  }
  SFX.click();
  ws.send(JSON.stringify({ type: 'add_ai', payload: {} }));
}

function destroyRoom() {
  if (!isCreator) { showToast('只有房主可以解散房间'); return; }
  if (!confirm(`确定要解散房间「${roomName}」吗？所有玩家将被踢出。`)) return;
  ws.send(JSON.stringify({ type: 'destroy_room', payload: {} }));
  setTimeout(() => { sessionStorage.removeItem('paerduo_room'); window.location.href = 'index.html'; }, 500);
}

// ========== 互动 ==========
function toggleEmotePanel() {
  const p = document.getElementById('emotePanel');
  document.getElementById('phrasePanel').style.display = 'none';
  p.style.display = p.style.display === 'none' ? 'grid' : 'none';
}
function togglePhrasePanel() {
  const p = document.getElementById('phrasePanel');
  document.getElementById('emotePanel').style.display = 'none';
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
function sendEmote(emote) {
  ws.send(JSON.stringify({ type: 'emote', payload: { emote } }));
  document.getElementById('emotePanel').style.display = 'none';
}
function sendPhrase(text) {
  ws.send(JSON.stringify({ type: 'chat', payload: { message: text, type: 'phrase' } }));
  document.getElementById('phrasePanel').style.display = 'none';
}
function serveTea() {
  ws.send(JSON.stringify({ type: 'tea', payload: {} }));
  showToast('你给大家倒了一杯盖碗茶 🍵');
}

function showChatBubble(seat, message) {
  const area = document.getElementById(`playerSlot${seat}`);
  if (!area) return;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = message;
  bubble.style.bottom = '80px';
  bubble.style.left = '50%';
  bubble.style.transform = 'translateX(-50%)';
  area.appendChild(bubble);
  setTimeout(() => bubble.remove(), 3000);
}

function showEmoteAnimation(seat, emote) {
  const area = document.getElementById(`playerSlot${seat}`);
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'emote-animation';
  el.textContent = emote;
  el.style.bottom = '70px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  area.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function showTeaAnimation(fromSeat) {
  const area = document.getElementById(`playerSlot${fromSeat}`);
  if (!area) return;
  const tea = document.createElement('div');
  tea.className = 'tea-animation';
  tea.textContent = '🍵';
  tea.style.bottom = '60px';
  tea.style.left = '50%';
  tea.style.transform = 'translateX(-50%)';
  area.appendChild(tea);
  setTimeout(() => tea.remove(), 2000);
  if (fromSeat !== mySeat) showToast(`${getPlayerName(fromSeat)} 请大家喝茶 🍵`);
}

function showWinEffect(data) {
  const el = document.getElementById('winEffect');
  el.textContent = data.winType === 'tsumo' ? '🀄 自摸！' : '🀄 胡了！';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
  setTimeout(() => {
    showToast(`${getPlayerName(data.seat)} ${data.winType === 'tsumo' ? '自摸' : '点炮胡'} ${data.fan}番(${data.multiplier}倍)！`);
  }, 500);
}

function showSettle(data) {
  gameState = 'settle';
  document.getElementById('settleTitle').textContent = `第${data.round}局 · ${data.reason}`;
  const container = document.getElementById('settlePlayers');
  container.innerHTML = '';
  data.players.forEach(p => {
    const div = document.createElement('div');
    div.className = `settle-player ${p.hasWon ? 'winner' : ''}`;
    div.innerHTML = `
      <span class="avatar">${AVATARS[players[p.seat]?.avatar || 0] || '❓'}</span>
      <div class="info">
        <div class="name">${p.name}${p.hasWon ? ' 👑' : ''}</div>
        <div class="detail">${p.hasWon ? '胡牌' : (p.isWaiting ? '听牌' : '未听牌')}${p.missingSuit ? ` · 缺${SUIT_NAME[p.missingSuit]}` : ''}</div>
      </div>
      <span class="score ${p.score >= 0 ? 'positive' : 'negative'}">${p.score >= 0 ? '+' : ''}${p.score}</span>
    `;
    container.appendChild(div);
  });
  document.getElementById('settleOverlay').style.display = 'flex';
}

// ========== 玩法选择 ==========
async function loadVariants() {
  try {
    const res = await fetch('/api/variants');
    const data = await res.json();
    if (data.success) allVariants = data.variants;
  } catch (e) {}
}

function showVariantPanel() {
  if (!allVariants || allVariants.length === 0) { showToast('玩法列表加载中'); return; }
  const container = document.getElementById('variantSelectList');
  container.innerHTML = '';
  tempVariant = currentVariant?.id || 'sichuan';
  allVariants.forEach(v => {
    const div = document.createElement('div');
    const sel = v.id === tempVariant;
    div.className = `variant-item ${sel ? 'selected' : ''}`;
    div.innerHTML = `
      <div class="icon">${v.icon}</div>
      <div class="info">
        <div class="name">${v.name} <span style="font-weight:400;font-size:11px;color:var(--text-light);">- ${v.subtitle}</span></div>
        <div class="sub">${v.tileCount}张 · 起和${v.minFan > 0 ? v.minFan + '番' : '无限制'} · 封顶${v.maxFan}番</div>
      </div>
      ${sel ? '<div style="color:var(--primary);font-size:18px;">✓</div>' : ''}
    `;
    div.onclick = () => { tempVariant = v.id; showVariantPanel(); showVariantDetail(v); };
    container.appendChild(div);
  });
  const current = allVariants.find(v => v.id === tempVariant);
  if (current) showVariantDetail(current);
  const canChange = isCreator && (gameState === 'waiting' || gameState === 'ready');
  document.getElementById('confirmVariantBtn').style.display = canChange ? 'flex' : 'none';
  document.getElementById('variantTip').textContent = canChange ? '选择玩法后点击确认修改' : (isCreator ? '游戏开始后不能修改玩法' : '仅房主可修改玩法');
  document.getElementById('variantOverlay').style.display = 'flex';
}

function showVariantDetail(v) {
  const detail = document.getElementById('variantSelectDetail');
  detail.style.display = 'block';
  detail.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;">${v.icon} ${v.name} - ${v.subtitle}</div>
    <div style="color:var(--text-light);margin-bottom:6px;">${v.description}</div>
    ${v.specialRules && v.specialRules.length > 0 ? `<div>✨ 特色: ${v.specialRules.join('、')}</div>` : ''}
  `;
}

function hideVariantPanel() {
  document.getElementById('variantOverlay').style.display = 'none';
}

function confirmVariant() {
  if (!tempVariant) return;
  ws.send(JSON.stringify({ type: 'change_variant', payload: { variantId: tempVariant } }));
  hideVariantPanel();
}

function showRules() {
  document.getElementById('rulesOverlay').style.display = 'flex';
}
function hideRules() {
  document.getElementById('rulesOverlay').style.display = 'none';
}

// ========== 工具函数 ==========
function getSuit(tile) {
  if (tile < 9) return 'wan';
  if (tile < 18) return 'tong';
  return 'tiao';
}
function getNumber(tile) { return (tile % 9) + 1; }
function getPlayerName(seat) { return players[seat]?.name || '玩家'; }

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// 点击空白关闭面板
document.addEventListener('click', (e) => {
  if (!e.target.closest('.emote-panel') && !e.target.closest('.phrase-panel') &&
      !e.target.closest('.tool-btn')) {
    document.getElementById('emotePanel').style.display = 'none';
    document.getElementById('phrasePanel').style.display = 'none';
  }
});
