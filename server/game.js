/**
 * 耙耳朵麻将馆 - 游戏房间管理
 * 四川麻将血战到底
 */

const mahjong = require('./mahjong');
const { getVariant } = require('./variants');
const { AIPlayer } = require('./aiPlayer');

const GAME_STATE = {
  WAITING: 'waiting',     // 等待玩家
  READY: 'ready',         // 准备中
  DINGQUE: 'dingque',     // 定缺阶段
  PLAYING: 'playing',     // 打牌中
  SETTLE: 'settle',       // 结算
  GAME_OVER: 'gameover',  // 游戏结束
};

class Player {
  constructor(id, name, avatar) {
    this.id = id;
    this.name = name || '匿名玩家';
    this.avatar = avatar || Math.floor(Math.random() * 8);
    this.hand = [];           // 手牌
    this.melds = [];          // 碰/杠的牌组 [{tiles, type, fromPlayer}]
    this.discards = [];       // 打出的牌
    this.missingSuit = null;  // 定缺的花色
    this.hasWon = false;      // 是否已胡牌（血战中）
    this.score = 0;           // 本局得分
    this.totalScore = 0;      // 总积分
    this.isDealer = false;    // 是否庄家
    this.seat = -1;           // 座位号 0-3
    this.ready = false;       // 是否准备
    this.ws = null;           // WebSocket连接
    this.lastAction = null;   // 最后操作
    this.winCount = 0;        // 胡牌次数
  }

  send(type, data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }
}

class GameRoom {
  constructor(roomId, roomName = '', creatorId = '', variant = null) {
    this.roomId = roomId;
    this.roomName = roomName || '欢乐麻将房'; // 房间名
    this.creatorId = creatorId;               // 房主ID
    this.variant = variant || getVariant('sichuan'); // 玩法配置
    this.players = [];          // 4个座位
    this.deck = [];             // 牌堆
    this.discardPool = [];      // 所有打出的牌（用于显示）
    this.currentPlayer = 0;     // 当前出牌玩家座位号
    this.state = GAME_STATE.WAITING;
    this.dealerSeat = 0;        // 庄家座位
    this.round = 1;             // 局数
    this.lastDiscard = null;    // 最后打出的牌 {tile, fromSeat}
    this.pendingActions = [];   // 待处理的操作（碰/杠/胡）
    this.wallTiles = 0;         // 剩余牌数
    this.baseScore = 10;        // 底分
    this.maxFan = 8;            // 封顶番数
    this.winners = [];          // 本局胡牌者
    this.gameLog = [];          // 游戏日志
    this.createdAt = Date.now();
    this.destroyed = false;     // 是否已解散
  }

  // 解散房间
  destroy() {
    this.destroyed = true;
    // 通知所有玩家房间已解散
    for (const p of this.players) {
      p.send('room_destroyed', {
        roomId: this.roomId,
        roomName: this.roomName,
      });
    }
  }

  // 添加玩家
  addPlayer(player) {
    if (this.players.length >= 4) return null;
    const seat = this.players.length;
    player.seat = seat;
    this.players.push(player);
    if (this.players.length === 4) {
      this.state = GAME_STATE.READY;
    }
    return seat;
  }

  // 移除玩家
  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      // 重新分配座位
      this.players.forEach((p, i) => p.seat = i);
      if (this.players.length < 4) {
        this.state = GAME_STATE.WAITING;
      }
    }
  }

  // 获取玩家
  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  // 广播消息
  broadcast(type, data, excludeSeat = -1) {
    for (const p of this.players) {
      if (p.seat !== excludeSeat) {
        p.send(type, data);
      }
    }
  }

  // 开始新一局
  startRound() {
    // 重置状态
    this.deck = mahjong.shuffle(mahjong.createDeck());
    this.discardPool = [];
    this.winners = [];
    this.pendingActions = [];
    this.lastDiscard = null;
    this.gameLog = [];

    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.discards = [];
      p.missingSuit = null;
      p.hasWon = false;
      p.score = 0;
      p.ready = false;
      p.lastAction = null;
    }

    // 发牌：庄家14张，闲家13张
    for (let i = 0; i < 13; i++) {
      for (let s = 0; s < 4; s++) {
        this.players[s].hand.push(this.deck.pop());
      }
    }
    // 庄家多摸一张
    this.players[this.dealerSeat].hand.push(this.deck.pop());

    // 排序手牌
    for (const p of this.players) {
      p.hand = mahjong.sortHand(p.hand);
    }

    this.wallTiles = this.deck.length;
    this.currentPlayer = this.dealerSeat;
    this.state = GAME_STATE.DINGQUE;

    // 通知定缺
    for (const p of this.players) {
      p.send('dingque', {
        hand: p.hand,
        seat: p.seat,
        dealerSeat: this.dealerSeat,
      });
    }
    this.broadcast('state_change', { state: this.state });
  }

  // 定缺
  setMissingSuit(playerId, suit) {
    const player = this.getPlayer(playerId);
    if (!player || this.state !== GAME_STATE.DINGQUE) return false;
    if (!['wan', 'tong', 'tiao'].includes(suit)) return false;

    player.missingSuit = suit;
    player.send('dingque_confirm', { suit });

    // 检查是否所有人都定缺完成
    const allDone = this.players.every(p => p.missingSuit !== null);
    if (allDone) {
      this.state = GAME_STATE.PLAYING;
      this.broadcast('state_change', { state: this.state });
      // 通知庄家出牌
      this.notifyPlayerTurn();
    }
    return true;
  }

  // 通知轮到某人出牌
  notifyPlayerTurn() {
    const player = this.players[this.currentPlayer];
    if (player.hasWon) {
      // 已胡牌的玩家跳过，继续下一家
      this.nextTurn();
      return;
    }
    player.send('your_turn', {
      hand: player.hand,
      melds: player.melds,
      wallTiles: this.wallTiles,
    });
    this.broadcast('turn_change', { seat: this.currentPlayer }, this.currentPlayer);
  }

  // 摸牌
  drawTile() {
    if (this.deck.length === 0) {
      this.endRound('流局');
      return null;
    }
    const tile = this.deck.pop();
    this.wallTiles = this.deck.length;
    return tile;
  }

  // 玩家出牌
  discardTile(playerId, tile) {
    const player = this.getPlayer(playerId);
    if (!player || player.seat !== this.currentPlayer) return false;
    if (this.state !== GAME_STATE.PLAYING) return false;
    if (player.hasWon) return false;

    // 从手牌移除
    const idx = player.hand.indexOf(tile);
    if (idx === -1) return false;
    player.hand.splice(idx, 1);
    player.hand = mahjong.sortHand(player.hand);
    player.discards.push(tile);
    this.discardPool.push({ tile, seat: player.seat });
    this.lastDiscard = { tile, fromSeat: player.seat };
    player.lastAction = 'discard';

    // 广播出牌
    this.broadcast('tile_discarded', {
      tile,
      fromSeat: player.seat,
      handCount: player.hand.length,
    });

    // 检查其他玩家是否可以碰/杠/胡
    this.checkActions(tile, player.seat);
    return true;
  }

  // 检查碰/杠/胡机会
  checkActions(tile, fromSeat) {
    const actions = [];
    for (let s = 0; s < 4; s++) {
      if (s === fromSeat) continue;
      const p = this.players[s];
      if (p.hasWon) continue;

      // 检查胡
      const testHand = [...p.hand, tile];
      if (mahjong.canWin(testHand, p.missingSuit, p.melds)) {
        actions.push({ seat: s, action: 'win', tile });
      }
      // 检查碰
      if (mahjong.canPung(p.hand, tile)) {
        actions.push({ seat: s, action: 'pung', tile });
      }
      // 检查明杠
      if (p.hand.filter(t => t === tile).length >= 3) {
        actions.push({ seat: s, action: 'kong', tile, kongType: 'mingkong' });
      }
    }

    if (actions.length > 0) {
      this.pendingActions = actions;
      // 通知有操作机会的玩家
      for (const a of actions) {
        const p = this.players[a.seat];
        const available = actions.filter(x => x.seat === a.seat);
        p.send('action_available', {
          actions: available,
          tile,
          fromSeat,
        });
      }
      // 设置超时自动跳过
      setTimeout(() => {
        if (this.pendingActions.length > 0) {
          this.resolvePendingAction(null);
        }
      }, 15000);
    } else {
      // 无人操作，下一家摸牌
      this.nextTurn();
    }
  }

  // 处理玩家操作响应
  handleAction(playerId, action, tile, kongType) {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // 查找是否在待处理列表中
    const pending = this.pendingActions.find(
      a => a.seat === player.seat && a.action === action
    );
    if (!pending && action !== 'pass') return false;

    if (action === 'pass') {
      // 移除该玩家的所有待处理操作
      this.pendingActions = this.pendingActions.filter(a => a.seat !== player.seat);
      if (this.pendingActions.length === 0) {
        this.nextTurn();
      }
      return true;
    }

    this.resolvePendingAction({ seat: player.seat, action, tile, kongType });
    return true;
  }

  // 解析待处理操作（优先级：胡 > 杠 > 碰）
  resolvePendingAction(chosen) {
    if (!chosen) {
      // 超时，全部跳过
      this.pendingActions = [];
      this.nextTurn();
      return;
    }

    const { seat, action, tile, kongType } = chosen;
    const player = this.players[seat];
    this.pendingActions = [];

    if (action === 'win') {
      this.playerWin(player, tile, 'ron'); // 点炮
    } else if (action === 'pung') {
      this.playerPung(player, tile);
    } else if (action === 'kong') {
      this.playerKong(player, tile, kongType || 'mingkong');
    }
  }

  // 碰牌
  playerPung(player, tile) {
    // 从手牌移除2张
    for (let i = 0; i < 2; i++) {
      const idx = player.hand.indexOf(tile);
      if (idx !== -1) player.hand.splice(idx, 1);
    }
    player.melds.push({
      tiles: [tile, tile, tile],
      type: 'pung',
      fromSeat: this.lastDiscard.fromSeat,
    });
    player.hand = mahjong.sortHand(player.hand);
    player.lastAction = 'pung';

    // 从最后出牌者的弃牌中移除
    const fromPlayer = this.players[this.lastDiscard.fromSeat];
    const dIdx = fromPlayer.discards.indexOf(tile);
    if (dIdx !== -1) fromPlayer.discards.splice(dIdx, 1);

    this.broadcast('tile_pung', {
      seat: player.seat,
      tile,
      fromSeat: this.lastDiscard.fromSeat,
      melds: player.melds,
    });

    // 碰牌后轮到碰牌者出牌
    this.currentPlayer = player.seat;
    this.notifyPlayerTurn();
  }

  // 杠牌
  playerKong(player, tile, kongType) {
    if (kongType === 'mingkong') {
      // 明杠：手中3张+别人打出1张
      for (let i = 0; i < 3; i++) {
        const idx = player.hand.indexOf(tile);
        if (idx !== -1) player.hand.splice(idx, 1);
      }
      player.melds.push({
        tiles: [tile, tile, tile, tile],
        type: 'kong',
        kongType: 'mingkong',
        fromSeat: this.lastDiscard.fromSeat,
      });
      // 刮风：明杠收点杠者分
      this.kongScore(player, this.players[this.lastDiscard.fromSeat], 'mingkong');
    } else if (kongType === 'bugang') {
      // 补杠：碰了之后摸到第4张
      const idx = player.hand.indexOf(tile);
      if (idx !== -1) player.hand.splice(idx, 1);
      // 找到对应的碰
      const meldIdx = player.melds.findIndex(
        m => m.type === 'pung' && m.tiles[0] === tile
      );
      if (meldIdx !== -1) {
        player.melds[meldIdx] = {
          tiles: [tile, tile, tile, tile],
          type: 'kong',
          kongType: 'bugang',
          fromSeat: player.melds[meldIdx].fromSeat,
        };
      }
      this.kongScore(player, null, 'bugang');
    } else if (kongType === 'ankong') {
      // 暗杠：手中4张
      for (let i = 0; i < 4; i++) {
        const idx = player.hand.indexOf(tile);
        if (idx !== -1) player.hand.splice(idx, 1);
      }
      player.melds.push({
        tiles: [tile, tile, tile, tile],
        type: 'kong',
        kongType: 'ankong',
        fromSeat: -1,
      });
      // 下雨：暗杠收所有人分
      this.kongScore(player, null, 'ankong');
    }

    player.hand = mahjong.sortHand(player.hand);
    player.lastAction = 'kong';

    this.broadcast('tile_kong', {
      seat: player.seat,
      tile,
      kongType,
      melds: player.melds,
    });

    // 杠牌后补牌
    const newTile = this.drawTile();
    if (newTile !== null) {
      player.hand.push(newTile);
      player.hand = mahjong.sortHand(player.hand);
      player.send('tile_drawn', { tile: newTile, isKongDraw: true });

      // 检查杠上花
      if (mahjong.canWin(player.hand, player.missingSuit, player.melds)) {
        player.send('action_available', {
          actions: [{ seat: player.seat, action: 'win', tile: newTile }],
          tile: newTile,
          isKongFlower: true,
        });
      } else {
        // 杠后出牌
        this.currentPlayer = player.seat;
        this.notifyPlayerTurn();
      }
    }
  }

  // 杠牌计分（刮风下雨）
  kongScore(player, fromPlayer, kongType) {
    const score = this.baseScore; // 底分
    if (kongType === 'mingkong') {
      // 明杠：点杠者出
      if (fromPlayer) {
        player.score += score;
        fromPlayer.score -= score;
        this.gameLog.push(`${player.name} 明杠，${fromPlayer.name} 支付 ${score} 分`);
      }
    } else if (kongType === 'ankong') {
      // 暗杠：所有人出
      for (const p of this.players) {
        if (p.seat !== player.seat && !p.hasWon) {
          p.score -= score;
          player.score += score;
        }
      }
      this.gameLog.push(`${player.name} 暗杠，每人支付 ${score} 分`);
    }
    // 补杠不立即计分，胡牌时算根
  }

  // 玩家自摸（摸牌后胡）
  selfDrawWin(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.seat !== this.currentPlayer) return false;
    if (!mahjong.canWin(player.hand, player.missingSuit, player.melds)) return false;

    this.playerWin(player, player.hand[player.hand.length - 1], 'tsumo');
    return true;
  }

  // 玩家胡牌
  playerWin(player, winTile, winType) {
    player.hasWon = true;
    player.winCount++;
    this.winners.push({ seat: player.seat, winTile, winType });

    // 计算番数
    const fanResult = mahjong.calculateFan(player.hand, player.melds, {
      winTile,
      isRon: winType === 'ron',
      isKongFlower: player.lastAction === 'kong',
      isLastTile: this.wallTiles === 0,
      maxFan: this.maxFan,
    });

    const winScore = this.baseScore * fanResult.multiplier;

    if (winType === 'ron') {
      // 点炮：点炮者出
      const fromPlayer = this.players[this.lastDiscard.fromSeat];
      player.score += winScore;
      fromPlayer.score -= winScore;
      this.gameLog.push(
        `${player.name} 点炮胡 ${fanResult.fan}番(${fanResult.multiplier}倍)，${fromPlayer.name} 支付 ${winScore} 分`
      );
    } else {
      // 自摸：所有人出
      for (const p of this.players) {
        if (p.seat !== player.seat && !p.hasWon) {
          p.score -= winScore;
          player.score += winScore;
        }
      }
      this.gameLog.push(
        `${player.name} 自摸 ${fanResult.fan}番(${fanResult.multiplier}倍)，每人支付 ${winScore} 分`
      );
    }

    // 广播胡牌
    this.broadcast('player_win', {
      seat: player.seat,
      winTile,
      winType,
      fan: fanResult.fan,
      multiplier: fanResult.multiplier,
      fanDetails: fanResult.details,
      hand: player.hand,
      melds: player.melds,
      score: player.score,
    });

    // 血战到底：检查是否继续
    const activePlayers = this.players.filter(p => !p.hasWon);
    if (activePlayers.length <= 1 || this.deck.length === 0) {
      // 只剩1人或牌堆空，结束本局
      setTimeout(() => this.endRound('正常结束'), 2000);
    } else {
      // 继续游戏，下一家
      setTimeout(() => {
        this.lastDiscard = null;
        this.nextTurn();
      }, 2000);
    }
  }

  // 下一家
  nextTurn() {
    if (this.state !== GAME_STATE.PLAYING) return;

    // 找到下一个未胡牌的玩家
    let next = (this.currentPlayer + 1) % 4;
    let attempts = 0;
    while (this.players[next].hasWon && attempts < 4) {
      next = (next + 1) % 4;
      attempts++;
    }

    if (this.players[next].hasWon) {
      this.endRound('全部胡牌');
      return;
    }

    this.currentPlayer = next;

    // 摸牌
    const tile = this.drawTile();
    if (tile === null) return;

    const player = this.players[next];
    player.hand.push(tile);
    player.hand = mahjong.sortHand(player.hand);
    player.lastAction = 'draw';

    player.send('tile_drawn', { tile, hand: player.hand });

    // 检查自摸
    if (mahjong.canWin(player.hand, player.missingSuit, player.melds)) {
      player.send('action_available', {
        actions: [{ seat: player.seat, action: 'win', tile, isSelfDraw: true }],
        tile,
        isSelfDraw: true,
      });
    } else {
      this.notifyPlayerTurn();
    }
  }

  // 结束本局
  endRound(reason) {
    this.state = GAME_STATE.SETTLE;

    // 查叫：未胡牌的玩家如果听牌，未听牌的要赔
    const notWon = this.players.filter(p => !p.hasWon);
    for (const p of notWon) {
      const waiting = mahjong.getWaitingTiles(p.hand, p.missingSuit, p.melds);
      p.isWaiting = waiting.length > 0;
      p.waitingTiles = waiting;
    }

    // 结算
    const settleInfo = this.players.map(p => ({
      seat: p.seat,
      name: p.name,
      score: p.score,
      hasWon: p.hasWon,
      isWaiting: p.isWaiting || false,
      hand: p.hand,
      melds: p.melds,
      missingSuit: p.missingSuit,
    }));

    // 累计总分
    for (const p of this.players) {
      p.totalScore += p.score;
    }

    this.broadcast('round_settle', {
      reason,
      players: settleInfo,
      round: this.round,
    });

    this.state = GAME_STATE.READY;
  }

  // 下一局
  nextRound() {
    this.round++;
    // 庄家轮换：上局第一个胡牌的人当庄，否则轮换
    if (this.winners.length > 0) {
      this.dealerSeat = this.winners[0].seat;
    } else {
      this.dealerSeat = (this.dealerSeat + 1) % 4;
    }
    this.players[this.dealerSeat].isDealer = true;
    for (const p of this.players) {
      if (p.seat !== this.dealerSeat) p.isDealer = false;
    }
    this.startRound();
  }

  // 添加AI玩家
  addAIPlayer(name, avatar) {
    if (this.players.length >= 4) return null;
    const seat = this.players.length;
    const ai = new AIPlayer(seat, name, avatar);
    ai.room = this;
    ai.ready = true;
    this.players.push(ai);

    // 广播玩家加入
    this.broadcast('player_joined', {
      player: {
        id: ai.id,
        name: ai.name,
        avatar: ai.avatar,
        seat: ai.seat,
        ready: true,
        isAI: true,
      },
    });

    // 如果人齐了，通知可以开始
    if (this.players.length === 4) {
      this.state = GAME_STATE.READY;
      this.broadcast('room_full', {});
    }

    return ai;
  }

  // AI暗杠
  handleAnKong(playerId, tile) {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    if (player.hand.filter(t => t === tile).length < 4) return false;

    this.playerKong(player, tile, 'ankong');
    return true;
  }

  // AI自摸胡牌
  handleSelfDrawWin(playerId) {
    return this.selfDrawWin(playerId);
  }

  // 获取房间信息（不含敏感数据）
  getRoomInfo() {
    return {
      roomId: this.roomId,
      roomName: this.roomName,
      creatorId: this.creatorId,
      state: this.state,
      playerCount: this.players.length,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seat: p.seat,
        ready: p.ready,
        totalScore: p.totalScore,
        isDealer: p.isDealer,
        hasWon: p.hasWon,
      })),
      round: this.round,
      wallTiles: this.wallTiles,
    };
  }
}

module.exports = { GameRoom, Player, GAME_STATE, AIPlayer };
