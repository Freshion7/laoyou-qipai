/**
 * 耙耳朵麻将馆 - 主服务器
 * Express + WebSocket 实时联机
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { GameRoom, Player } = require('./server/game');
const userStore = require('./server/userStore');
const { getVariantList, getVariant } = require('./server/variants');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 房间管理
const rooms = new Map(); // roomId -> GameRoom
const playerRooms = new Map(); // playerId -> roomId

// 生成房间号
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ========== 用户API ==========

// 注册
app.post('/api/register', (req, res) => {
  const { username, password, nickname, avatar } = req.body || {};
  const result = userStore.register(username, password, nickname, avatar);
  res.json(result);
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = userStore.login(username, password);
  res.json(result);
});

// 修改资料
app.post('/api/profile', (req, res) => {
  const { username, token, nickname, avatar, password } = req.body || {};
  if (!userStore.verifyToken(username, token)) {
    return res.json({ success: false, error: '登录已过期，请重新登录' });
  }
  const result = userStore.updateProfile(username, { nickname, avatar, password });
  res.json(result);
});

// ========== 玩法API ==========

// 获取所有玩法列表
app.get('/api/variants', (req, res) => {
  res.json({ success: true, variants: getVariantList() });
});

// 获取单个玩法详情
app.get('/api/variants/:id', (req, res) => {
  const variant = getVariant(req.params.id);
  if (!variant) {
    return res.status(404).json({ success: false, error: '玩法不存在' });
  }
  res.json({ success: true, variant });
});

// ========== 房间API ==========

// 创建房间
app.post('/api/create-room', (req, res) => {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId));

  const roomName = (req.body?.roomName || '').trim().slice(0, 20) || '欢乐麻将房';
  const creatorId = req.body?.creatorId || '';
  const variantId = req.body?.variantId || 'sichuan';
  const variant = getVariant(variantId);
  const room = new GameRoom(roomId, roomName, creatorId, variant);
  rooms.set(roomId, room);
  res.json({ success: true, roomId, roomName, variantId: variant.id, variantName: variant.name });
});

// 房间信息
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ success: false, error: '房间不存在' });
  }
  res.json({ success: true, room: room.getRoomInfo() });
});

// 房间列表
app.get('/api/rooms', (req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if ((room.state === 'waiting' || room.state === 'ready') && !room.destroyed) {
      list.push({
        roomId: id,
        roomName: room.roomName,
        variantId: room.variant?.id || 'sichuan',
        variantName: room.variant?.name || '四川麻将',
        variantIcon: room.variant?.icon || '🀄',
        playerCount: room.players.length,
        state: room.state,
      });
    }
  }
  res.json({ success: true, rooms: list });
});

// WebSocket 连接处理
wss.on('connection', (ws, req) => {
  let currentPlayer = null;
  let currentRoom = null;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    const { type, payload } = data;

    switch (type) {
      case 'join': {
        const { roomId, playerId, name, avatar, username } = payload;
        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', data: { message: '房间不存在' } }));
          return;
        }
        if (room.players.length >= 4) {
          ws.send(JSON.stringify({ type: 'error', data: { message: '房间已满' } }));
          return;
        }

        // 检查是否管理员
        const isAdmin = username ? userStore.isAdmin(username) : false;

        // 检查是否重连
        let player = room.players.find(p => p.id === playerId);
        if (!player) {
          player = new Player(playerId, name, avatar);
          player.ws = ws;
          player.isAdmin = isAdmin;
          room.addPlayer(player);
        } else {
          player.ws = ws; // 更新连接
          player.isAdmin = isAdmin;
        }

        currentPlayer = player;
        currentRoom = room;
        playerRooms.set(playerId, roomId);

        // 发送加入成功
        player.send('joined', {
          seat: player.seat,
          roomId,
          roomName: room.roomName,
          isCreator: room.creatorId === playerId,
          isAdmin: isAdmin,
          creatorId: room.creatorId,
          variant: room.variant ? {
            id: room.variant.id,
            name: room.variant.name,
            subtitle: room.variant.subtitle,
            icon: room.variant.icon,
            description: room.variant.description,
            tileCount: room.variant.tileCount,
            minFan: room.variant.minFan,
            maxFan: room.variant.maxFan,
            canChow: room.variant.canChow,
            specialRules: room.variant.specialRules,
          } : null,
          players: room.players.map(p => ({
            id: p.id, name: p.name, avatar: p.avatar, seat: p.seat,
            ready: p.ready, totalScore: p.totalScore, isDealer: p.isDealer,
          })),
          state: room.state,
        });

        // 广播玩家加入
        room.broadcast('player_joined', {
          player: {
            id: player.id, name: player.name, avatar: player.avatar,
            seat: player.seat, ready: player.ready,
          },
        }, player.seat);

        // 如果房间满了，通知可以开始
        if (room.players.length === 4) {
          room.broadcast('room_full', {});
        }
        break;
      }

      case 'ready': {
        if (!currentPlayer || !currentRoom) return;
        currentPlayer.ready = true;
        currentRoom.broadcast('player_ready', { seat: currentPlayer.seat });

        // 检查是否所有人都准备
        const allReady = currentRoom.players.every(p => p.ready);
        if (allReady && currentRoom.players.length === 4) {
          currentRoom.startRound();
        }
        break;
      }

      case 'dingque': {
        if (!currentPlayer || !currentRoom) return;
        const { suit } = payload;
        currentRoom.setMissingSuit(currentPlayer.id, suit);
        break;
      }

      case 'discard': {
        if (!currentPlayer || !currentRoom) return;
        const { tile } = payload;
        currentRoom.discardTile(currentPlayer.id, tile);
        break;
      }

      case 'action': {
        if (!currentPlayer || !currentRoom) return;
        const { action, tile, kongType } = payload;
        currentRoom.handleAction(currentPlayer.id, action, tile, kongType);
        break;
      }

      case 'self_draw_win': {
        if (!currentPlayer || !currentRoom) return;
        currentRoom.selfDrawWin(currentPlayer.id);
        break;
      }

      case 'ankong': {
        if (!currentPlayer || !currentRoom) return;
        const { tile } = payload;
        if (currentRoom.currentPlayer === currentPlayer.seat) {
          currentRoom.playerKong(currentPlayer, tile, 'ankong');
        }
        break;
      }

      case 'next_round': {
        if (!currentPlayer || !currentRoom) return;
        currentPlayer.ready = true;
        const allReady = currentRoom.players.every(p => p.ready);
        if (allReady) {
          currentRoom.nextRound();
        } else {
          currentRoom.broadcast('player_ready', { seat: currentPlayer.seat });
        }
        break;
      }

      case 'chat': {
        if (!currentPlayer || !currentRoom) return;
        const { message, type: chatType } = payload;
        currentRoom.broadcast('chat', {
          seat: currentPlayer.seat,
          name: currentPlayer.name,
          message,
          chatType: chatType || 'text',
        });
        break;
      }

      case 'emote': {
        if (!currentPlayer || !currentRoom) return;
        const { emote } = payload;
        currentRoom.broadcast('emote', {
          seat: currentPlayer.seat,
          emote,
        });
        break;
      }

      case 'tea': {
        if (!currentPlayer || !currentRoom) return;
        const { targetSeat } = payload;
        currentRoom.broadcast('tea_action', {
          fromSeat: currentPlayer.seat,
          targetSeat: targetSeat !== undefined ? targetSeat : -1,
        });
        break;
      }

      case 'destroy_room': {
        if (!currentPlayer || !currentRoom) return;
        // 只有房主可以解散房间
        if (currentRoom.creatorId !== currentPlayer.id) {
          currentPlayer.send('error', { message: '只有房主可以解散房间' });
          return;
        }
        if (currentRoom.destroyed) return;
        // 解散房间
        currentRoom.destroy();
        // 从房间列表移除
        rooms.delete(currentRoom.roomId);
        break;
      }

      case 'add_ai': {
        if (!currentPlayer || !currentRoom) return;
        // 只有管理员可以添加AI
        if (!currentPlayer.isAdmin) {
          currentPlayer.send('error', { message: '只有管理员可以添加人机玩家' });
          return;
        }
        if (currentRoom.players.length >= 4) {
          currentPlayer.send('error', { message: '房间已满，无法添加人机' });
          return;
        }
        if (currentRoom.state !== 'waiting' && currentRoom.state !== 'ready') {
          currentPlayer.send('error', { message: '游戏进行中无法添加人机' });
          return;
        }

        // 添加AI玩家
        const aiNames = ['小麻将', '川妹子', '耙耳朵', '盖碗茶'];
        const aiAvatars = [1, 2, 3, 4];
        const idx = currentRoom.players.length;
        const ai = currentRoom.addAIPlayer(aiNames[idx % aiNames.length], aiAvatars[idx % aiAvatars.length]);

        if (ai) {
          currentPlayer.send('error', { message: `已添加人机：${ai.name}` });
        }
        break;
      }

      case 'change_variant': {
        if (!currentPlayer || !currentRoom) return;
        // 只有房主可以修改玩法
        if (currentRoom.creatorId !== currentPlayer.id) {
          currentPlayer.send('error', { message: '只有房主可以修改玩法' });
          return;
        }
        // 只能在等待阶段修改
        if (currentRoom.state !== 'waiting' && currentRoom.state !== 'ready') {
          currentPlayer.send('error', { message: '游戏开始后不能修改玩法' });
          return;
        }
        const { variantId } = payload;
        const variant = getVariant(variantId);
        if (!variant) {
          currentPlayer.send('error', { message: '玩法不存在' });
          return;
        }
        currentRoom.variant = variant;
        // 广播玩法变更
        currentRoom.broadcast('variant_changed', {
          variant: {
            id: variant.id,
            name: variant.name,
            subtitle: variant.subtitle,
            icon: variant.icon,
            description: variant.description,
            tileCount: variant.tileCount,
            minFan: variant.minFan,
            maxFan: variant.maxFan,
            canChow: variant.canChow,
            specialRules: variant.specialRules,
          },
        });
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentPlayer && currentRoom) {
      currentPlayer.ws = null;
      // 不立即移除，等待重连
      currentRoom.broadcast('player_offline', { seat: currentPlayer.seat });
    }
  });

  ws.on('error', () => {});
});

// 清理空房间（每5分钟）
setInterval(() => {
  for (const [id, room] of rooms) {
    const hasActive = room.players.some(p => p.ws && p.ws.readyState === 1);
    if (!hasActive && Date.now() - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🀄 耙耳朵麻将馆服务器已启动`);
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
});
