/**
 * 老友棋牌 - 游戏前端核心逻辑 v3.0
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

// 语音播报
let voiceEnabled = true;
let speechSynthesis = null;

// 本地音乐
let localMusicList = [];
let currentMusicIndex = -1;
let musicAudio = null;

// WebRTC 语音聊天
let micEnabled = false;
let speakerEnabled = true;
let localStream = null;
let peerConnections = {};  // { seat: RTCPeerConnection }
let remoteAudioElements = {};  // { seat: HTMLAudioElement }
let webrtcReady = false;

// ========== 音频系统 ==========
let audioCtx = null;
let audioEnabled = true;
let bgmPlaying = false;
let bgmOscillator = null;
let bgmGain = null;

// 本地音频文件缓存
const localAudio = {};
const audioFiles = {
  bgm: 'bgm.mp3',
  discard: 'discard.mp3',
  draw: 'draw.mp3',
  pung: 'pung.mp3',
  kong: 'kong.mp3',
  win: 'win.mp3',
  tsumo: 'tsumo.mp3',
  dingque: 'dingque.mp3',
  click: 'click.mp3',
  tea: 'tea.mp3',
  emote: 'emote.mp3',
  settle: 'settle.mp3',
  notify: 'notify.mp3',
};
let bgmAudio = null;

// 预加载本地音频文件
function preloadLocalAudio() {
  for (const [key, filename] of Object.entries(audioFiles)) {
    const audio = new Audio(`audio/${filename}`);
    audio.preload = 'auto';
    audio.volume = key === 'bgm' ? 0.4 : 0.7;
    localAudio[key] = audio;

    // 检测文件是否存在
    audio.addEventListener('error', () => {
      localAudio[key] = null; // 文件不存在，标记为null
    });
  }
}

// 播放本地音频文件
function playLocalAudio(key, loop = false) {
  if (!audioEnabled) return false;
  const audio = localAudio[key];
  if (!audio) return false; // 文件不存在

  try {
    audio.currentTime = 0;
    audio.loop = loop;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // 播放失败（可能是浏览器自动播放限制）
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

// 停止本地音频
function stopLocalAudio(key) {
  const audio = localAudio[key];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

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
  // 预加载本地音频文件
  if (Object.keys(localAudio).length === 0) {
    preloadLocalAudio();
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

// 各种音效（优先使用本地音频文件，不存在则用Web Audio合成）
const SFX = {
  // 出牌：清脆的敲击声
  discard: () => {
    if (playLocalAudio('discard')) return;
    playTone(800, 0.08, 'square', 0.15);
    setTimeout(() => playTone(600, 0.06, 'square', 0.1), 30);
  },
  // 摸牌：轻柔的提示音
  draw: () => {
    if (playLocalAudio('draw')) return;
    playTone(523, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.15), 80);
  },
  // 碰：有力的声音
  pung: () => {
    if (playLocalAudio('pung')) return;
    playTone(440, 0.15, 'square', 0.25);
    setTimeout(() => playTone(330, 0.2, 'square', 0.2), 100);
  },
  // 杠：低沉有力
  kong: () => {
    if (playLocalAudio('kong')) return;
    playTone(220, 0.2, 'sawtooth', 0.25);
    setTimeout(() => playTone(165, 0.3, 'sawtooth', 0.2), 120);
    setTimeout(() => playTone(110, 0.25, 'sine', 0.15), 200);
  },
  // 胡牌：喜庆的上升音阶
  win: () => {
    if (playLocalAudio('win')) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'sine', 0.25), i * 100);
    });
    setTimeout(() => playChord([523, 659, 784], 0.5, 'sine', 0.2), 500);
  },
  // 自摸：更喜庆
  tsumo: () => {
    if (playLocalAudio('tsumo')) return;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'triangle', 0.3), i * 80);
    });
    setTimeout(() => playChord([523, 659, 784, 1047], 0.6, 'sine', 0.25), 450);
  },
  // 定缺：确认音
  dingque: () => {
    if (playLocalAudio('dingque')) return;
    playTone(784, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(1047, 0.15, 'sine', 0.2), 100);
  },
  // 按钮点击
  click: () => {
    if (playLocalAudio('click')) return;
    playTone(1000, 0.05, 'sine', 0.1);
  },
  // 喝茶：倒茶声
  tea: () => {
    if (playLocalAudio('tea')) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => playTone(300 + Math.random() * 200, 0.05, 'sine', 0.08), i * 60);
    }
  },
  // 表情：可爱的声音
  emote: () => {
    if (playLocalAudio('emote')) return;
    playTone(600 + Math.random() * 400, 0.1, 'sine', 0.15);
  },
  // 等待：轻柔提示
  notify: () => {
    if (playLocalAudio('notify')) return;
    playTone(880, 0.1, 'sine', 0.15);
    setTimeout(() => playTone(1100, 0.15, 'sine', 0.1), 100);
  },
  // 错误：低沉的提示
  error: () => {
    playTone(200, 0.2, 'sawtooth', 0.15);
  },
  // 胜利结算
  settle: () => {
    if (playLocalAudio('settle')) return;
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.15, 'triangle', 0.2), i * 80);
    });
  },
};

// 背景音乐（优先使用本地音频文件，不存在则用Web Audio合成旋律）
function startBGM() {
  if (!audioEnabled || bgmPlaying) return;

  // 优先尝试播放本地背景音乐文件
  if (localAudio.bgm) {
    try {
      localAudio.bgm.loop = true;
      localAudio.bgm.volume = 0.4;
      const playPromise = localAudio.bgm.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          bgmPlaying = true;
        }).catch(() => {
          // 播放失败，用合成旋律
          startSynthBGM();
        });
      } else {
        bgmPlaying = true;
      }
      return;
    } catch (e) {
      // 出错，用合成旋律
    }
  }

  // 用 Web Audio 合成旋律
  startSynthBGM();
}

function startSynthBGM() {
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
  // 停止本地背景音乐
  if (localAudio.bgm) {
    localAudio.bgm.pause();
    localAudio.bgm.currentTime = 0;
  }
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
      document.title = `${roomName} - 老友棋牌`;
      // 等待界面显示房间名称和房间码
      document.getElementById('waitingRoomName').textContent = roomName;
      document.getElementById('waitingRoomCode').textContent = roomId;
      if (isCreator) document.getElementById('destroyRoomBtn').style.display = 'flex';
      // 所有玩家都显示添加AI按钮
      document.getElementById('addAiBtn').style.display = 'flex';
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

    case 'dice_roll':
      showDiceRoll(data);
      break;

    case 'webrtc_signal':
      handleSignalingMessage(data);
      break;

    case 'state_change':
      gameState = data.state;
      if (data.state === 'rolling') {
        document.getElementById('waitingOverlay').style.display = 'none';
      }
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
      speakText(`${getPlayerName(data.seat)}碰`);
      break;

    case 'tile_kong':
      const kn = { mingkong: '明杠', bugang: '补杠', ankong: '暗杠' };
      showToast(`${getPlayerName(data.seat)} ${kn[data.kongType] || '杠'}！`);
      if (players[data.seat]) players[data.seat].melds = data.melds;
      if (data.seat === mySeat) { myMelds = data.melds; renderMelds(); }
      renderOtherMelds(data.seat, data.melds);
      SFX.kong();
      speakText(`${getPlayerName(data.seat)}${kn[data.kongType] || '杠'}`);
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
      if (data.winType === 'tsumo') {
        SFX.tsumo();
        speakText(`${getPlayerName(data.seat)}自摸，${data.fan}番`);
      } else {
        SFX.win();
        speakText(`${getPlayerName(data.seat)}胡了，${data.fan}番`);
      }
      break;

    case 'round_settle':
      showSettle(data);
      SFX.settle();
      break;

    case 'chat':
      showChatBubble(data.seat, data.message);
      SFX.emote();
      // 语音播报其他玩家的消息
      if (data.seat !== mySeat) {
        speakText(`${getPlayerName(data.seat)}说：${data.message}`);
      }
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
      const rankIcon = p.rank ? p.rank.rankIcon : '';
      const rankName = p.rank ? p.rank.rankName : '';
      const rankStars = p.rank ? '★'.repeat(p.rank.stars) : '';
      el.innerHTML = `
        <span class="player-avatar">${AVATARS[p.avatar] || '❓'}</span>
        <span class="player-name">${p.name}${p.offline ? '(离线)' : ''}</span>
        ${rankIcon ? `<span class="player-rank" title="${rankName} ${rankStars}">${rankIcon}</span>` : ''}
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

// 添加AI人机玩家（所有玩家可用）
function addAIPlayer() {
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
  // 语音播报自己发送的短语
  speakText(text);
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
      !e.target.closest('.tool-btn') && !e.target.closest('.music-panel')) {
    document.getElementById('emotePanel').style.display = 'none';
    document.getElementById('phrasePanel').style.display = 'none';
    document.getElementById('musicPanel').style.display = 'none';
  }
});

// ========== 掷骰子动画 ==========
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function showDiceRoll(data) {
  const overlay = document.getElementById('diceOverlay');
  const dice1 = document.getElementById('dice1');
  const dice2 = document.getElementById('dice2');
  const face1 = document.getElementById('diceFace1');
  const face2 = document.getElementById('diceFace2');
  const result = document.getElementById('diceResult');
  const dealer = document.getElementById('diceDealer');

  overlay.style.display = 'flex';
  dice1.classList.remove('stopped');
  dice2.classList.remove('stopped');
  result.textContent = '掷骰中...';
  dealer.textContent = '';

  // 骰子滚动动画
  let rollCount = 0;
  const rollInterval = setInterval(() => {
    face1.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    face2.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
    rollCount++;
    if (rollCount >= 15) {
      clearInterval(rollInterval);
      // 显示最终结果
      dice1.classList.add('stopped');
      dice2.classList.add('stopped');
      face1.textContent = DICE_FACES[data.dice1 - 1];
      face2.textContent = DICE_FACES[data.dice2 - 1];
      result.textContent = `${data.dice1} + ${data.dice2} = ${data.diceSum} 点`;
      dealer.textContent = `${getPlayerName(data.dealerSeat)} 坐庄`;

      // 语音播报
      speakText(`${data.dice1}点，${data.dice2}点，一共${data.diceSum}点`);

      // 2秒后关闭弹窗
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 2000);
    }
  }, 80);
}

// ========== 语音播报 ==========
function initSpeech() {
  if ('speechSynthesis' in window) {
    speechSynthesis = window.speechSynthesis;
  }
}

function speakText(text) {
  if (!voiceEnabled || !speechSynthesis) return;
  try {
    speechSynthesis.cancel(); // 停止当前播报
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    // 尝试选择中文语音
    const voices = speechSynthesis.getVoices();
    const chineseVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }

    speechSynthesis.speak(utterance);
  } catch (e) {
    console.log('语音播报失败:', e);
  }
}

function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById('voiceBtn');
  if (voiceEnabled) {
    btn.textContent = '🔊';
    btn.classList.remove('voice-off');
    showToast('语音播报已开启');
    speakText('语音播报已开启');
  } else {
    btn.textContent = '🔇';
    btn.classList.add('voice-off');
    showToast('语音播报已关闭');
    if (speechSynthesis) speechSynthesis.cancel();
  }
}

// ========== 本地音乐播放 ==========
function handleMusicFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    if (file.type.startsWith('audio/')) {
      const url = URL.createObjectURL(file);
      localMusicList.push({
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: url,
        file: file,
      });
    }
  }

  renderMusicList();
  showToast(`已添加 ${files.length} 首音乐`);

  // 如果还没有播放音乐，自动播放第一首
  if (currentMusicIndex === -1 && localMusicList.length > 0) {
    playMusic(0);
  }
}

function renderMusicList() {
  const list = document.getElementById('musicList');
  if (localMusicList.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;color:#999;padding:20px;font-size:13px;">
        还没有添加音乐<br>点击上方按钮选择本地音乐文件
      </div>
    `;
    return;
  }

  list.innerHTML = localMusicList.map((music, idx) => `
    <div class="music-item ${idx === currentMusicIndex ? 'playing' : ''}" onclick="playMusic(${idx})">
      <span class="music-index">${idx + 1}</span>
      <span class="music-name">${music.name}</span>
      <span class="music-play-icon">${idx === currentMusicIndex ? '▶️' : '🎵'}</span>
    </div>
  `).join('');
}

function playMusic(index) {
  if (index < 0 || index >= localMusicList.length) return;

  // 停止当前音乐
  if (musicAudio) {
    musicAudio.pause();
    musicAudio = null;
  }

  // 停止合成背景音乐
  stopBGM();

  currentMusicIndex = index;
  const music = localMusicList[index];

  musicAudio = new Audio(music.url);
  musicAudio.loop = true;
  musicAudio.volume = 0.5;

  musicAudio.play().then(() => {
    // 显示正在播放
    const nowPlaying = document.getElementById('musicNowPlaying');
    const playingName = document.getElementById('musicPlayingName');
    nowPlaying.style.display = 'flex';
    playingName.textContent = music.name;
    renderMusicList();
  }).catch((e) => {
    console.log('音乐播放失败:', e);
    showToast('音乐播放失败，请选择其他文件');
  });

  // 播放结束后自动下一首（虽然loop=true不会结束，但保留这个逻辑）
  musicAudio.onended = () => {
    const nextIndex = (currentMusicIndex + 1) % localMusicList.length;
    playMusic(nextIndex);
  };
}

function toggleMusicPanel() {
  const panel = document.getElementById('musicPanel');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    renderMusicList();
  }
}

// 初始化语音
initSpeech();

// ========== WebRTC 语音聊天 ==========

// 初始化 WebRTC（获取麦克风权限）
async function initWebRTC() {
  if (webrtcReady) return true;

  try {
    // 获取麦克风音频流
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    // 默认静音（关麦状态）
    localStream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });

    webrtcReady = true;
    console.log('WebRTC 初始化成功，麦克风已就绪');
    return true;
  } catch (e) {
    console.error('获取麦克风失败:', e);
    showToast('无法访问麦克风，请检查权限设置');
    return false;
  }
}

// 开麦/关麦
async function toggleMic() {
  if (!webrtcReady) {
    const success = await initWebRTC();
    if (!success) return;
  }

  micEnabled = !micEnabled;
  const btn = document.getElementById('micBtn');
  const status = document.getElementById('voiceStatus');

  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = micEnabled;
    });
  }

  if (micEnabled) {
    btn.className = 'voice-btn mic-on';
    btn.textContent = '🎙️';
    status.textContent = '麦克风已开启';
    showToast('🎙️ 开麦成功，大家可以听到你说话了');
    // 开始连接到其他玩家
    connectToAllPlayers();
  } else {
    btn.className = 'voice-btn mic-off';
    btn.textContent = '🎤';
    status.textContent = '麦克风已关闭';
    showToast('麦克风已关闭');
  }
}

// 扬声器开/关
function toggleSpeaker() {
  speakerEnabled = !speakerEnabled;
  const btn = document.getElementById('speakerBtn');
  const status = document.getElementById('voiceStatus');

  // 控制所有远程音频
  for (const seat in remoteAudioElements) {
    remoteAudioElements[seat].muted = !speakerEnabled;
  }

  if (speakerEnabled) {
    btn.className = 'voice-btn speaker-on';
    btn.textContent = '🔊';
    status.textContent = micEnabled ? '语音聊天中' : '扬声器已开启';
  } else {
    btn.className = 'voice-btn speaker-off';
    btn.textContent = '🔇';
    status.textContent = '扬声器已关闭';
  }
}

// 创建 PeerConnection
function createPeerConnection(targetSeat) {
  if (peerConnections[targetSeat]) return peerConnections[targetSeat];

  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  const pc = new RTCPeerConnection(config);
  peerConnections[targetSeat] = pc;

  // 添加本地音频流
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // 接收远程音频流
  pc.ontrack = (event) => {
    if (!remoteAudioElements[targetSeat]) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.muted = !speakerEnabled;
      document.body.appendChild(audio);
      remoteAudioElements[targetSeat] = audio;
    }
    remoteAudioElements[targetSeat].srcObject = event.streams[0];
    console.log(`收到玩家 ${targetSeat} 的音频流`);
  };

  // ICE candidate
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignalingMessage(targetSeat, {
        type: 'ice_candidate',
        candidate: event.candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`与玩家 ${targetSeat} 连接状态: ${pc.connectionState}`);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      delete peerConnections[targetSeat];
    }
  };

  return pc;
}

// 连接到所有玩家
async function connectToAllPlayers() {
  if (!webrtcReady || !micEnabled) return;

  for (let i = 0; i < 4; i++) {
    if (i === mySeat) continue;
    if (!players[i]) continue;
    if (peerConnections[i]) continue;

    try {
      const pc = createPeerConnection(i);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignalingMessage(i, {
        type: 'offer',
        sdp: offer.sdp,
      });

      console.log(`向玩家 ${i} 发送 offer`);
    } catch (e) {
      console.error(`连接玩家 ${i} 失败:`, e);
    }
  }
}

// 处理信令消息
async function handleSignalingMessage(data) {
  const fromSeat = data.fromSeat;
  const signal = data.signal;

  if (!webrtcReady) {
    // 如果还没初始化，先初始化（但不开麦）
    await initWebRTC();
  }

  const pc = createPeerConnection(fromSeat);

  try {
    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: signal.sdp,
      }));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignalingMessage(fromSeat, {
        type: 'answer',
        sdp: answer.sdp,
      });

      console.log(`收到玩家 ${fromSeat} 的 offer，已回复 answer`);
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: signal.sdp,
      }));
      console.log(`收到玩家 ${fromSeat} 的 answer`);
    } else if (signal.type === 'ice_candidate') {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (e) {
    console.error('处理信令消息失败:', e);
  }
}

// 发送信令消息
function sendSignalingMessage(targetSeat, signal) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'webrtc_signal',
    payload: {
      targetSeat,
      signal,
    },
  }));
}
