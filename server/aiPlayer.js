/**
 * 耙耳朵麻将馆 - AI人机玩家
 * 模拟真实玩家行为，用于测试和单人游戏
 */

const mahjong = require('./mahjong');

const AI_NAMES = ['小麻将', '川妹子', '耙耳朵', '盖碗茶', '火锅侠', '串串香'];
const AI_AVATARS = [1, 2, 3, 4, 5, 6];

class AIPlayer {
  constructor(seat, name, avatar) {
    this.id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name || AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
    this.avatar = avatar !== undefined ? avatar : AI_AVATARS[Math.floor(Math.random() * AI_AVATARS.length)];
    this.hand = [];
    this.melds = [];
    this.discards = [];
    this.missingSuit = null;
    this.hasWon = false;
    this.score = 0;
    this.totalScore = 0;
    this.isDealer = false;
    this.seat = seat;
    this.ready = true; // AI自动准备
    this.ws = null; // AI没有真实WebSocket
    this.lastAction = null;
    this.winCount = 0;
    this.isAI = true;
    this.room = null; // 引用游戏房间
    this.pendingTile = null;
    this.pendingActions = [];
  }

  // 模拟发送消息给AI（AI接收游戏状态）
  send(type, data) {
    // 延迟处理，模拟人类反应时间
    const delay = this.getReactionDelay(type);
    setTimeout(() => this.handleMessage(type, data), delay);
  }

  getReactionDelay(type) {
    const base = 600 + Math.random() * 800; // 600-1400ms
    switch (type) {
      case 'dingque': return 800 + Math.random() * 1000;
      case 'your_turn': return 1000 + Math.random() * 1500;
      case 'action_available': return 500 + Math.random() * 700;
      case 'tile_drawn': return 300 + Math.random() * 500;
      default: return base;
    }
  }

  handleMessage(type, data) {
    if (!this.room || this.room.destroyed) return;

    switch (type) {
      case 'dingque':
        this.hand = data.hand || this.hand;
        this.aiDingque();
        break;

      case 'your_turn':
        this.hand = data.hand || this.hand;
        this.melds = data.melds || this.melds;
        this.aiDiscard();
        break;

      case 'tile_drawn':
        if (data.hand) this.hand = data.hand;
        else if (data.tile !== undefined) {
          this.hand.push(data.tile);
          this.hand = mahjong.sortHand(this.hand);
        }
        // 检查自摸
        this.checkSelfDraw();
        break;

      case 'action_available':
        this.pendingActions = data.actions || [];
        this.pendingTile = data.tile;
        this.aiAction();
        break;

      case 'state_change':
        break;

      case 'round_settle':
        this.hasWon = false;
        this.hand = [];
        this.melds = [];
        break;
    }
  }

  // AI定缺：选择手牌最少的花色
  aiDingque() {
    const counts = { wan: 0, tong: 0, tiao: 0 };
    this.hand.forEach(t => {
      if (t < 9) counts.wan++;
      else if (t < 18) counts.tong++;
      else counts.tiao++;
    });

    // 选择最少的花色定缺
    let minSuit = 'wan';
    let minCount = counts.wan;
    if (counts.tong < minCount) { minCount = counts.tong; minSuit = 'tong'; }
    if (counts.tiao < minCount) { minCount = counts.tiao; minSuit = 'tiao'; }

    this.missingSuit = minSuit;
    this.room.setMissingSuit(this.id, minSuit);
  }

  // AI出牌决策
  aiDiscard() {
    if (this.hasWon) return;
    if (this.hand.length === 0) return;

    const tile = this.chooseDiscardTile();
    if (tile !== -1) {
      this.room.discardTile(this.id, tile);
    }
  }

  // 选择要打出的牌
  chooseDiscardTile() {
    const suitMap = { wan: [0, 8], tong: [9, 17], tiao: [18, 26] };
    const [missStart, missEnd] = suitMap[this.missingSuit] || [0, 8];

    // 1. 优先打定缺花色的牌
    const missingTiles = this.hand.filter(t => t >= missStart && t <= missEnd);
    if (missingTiles.length > 0) {
      // 打定缺花色中最没用的牌（孤张优先）
      return this.chooseWorstTile(missingTiles);
    }

    // 2. 检查是否听牌，如果听牌就打安全牌
    const tingTiles = this.getTingDiscardTiles();
    if (tingTiles.length > 0) {
      // 打能听牌的牌中最安全的
      return this.chooseSafestTile(tingTiles);
    }

    // 3. 打孤张（没有相邻牌的）
    const isolated = this.getIsolatedTiles();
    if (isolated.length > 0) {
      return this.chooseWorstTile(isolated);
    }

    // 4. 打边张（1和9）
    const edgeTiles = this.hand.filter(t => {
      const num = t % 9;
      return num === 0 || num === 8;
    });
    if (edgeTiles.length > 0) {
      return this.chooseWorstTile(edgeTiles);
    }

    // 5. 随便打一张
    return this.chooseWorstTile(this.hand);
  }

  // 获取能听牌的出牌选择
  getTingDiscardTiles() {
    const result = [];
    for (let i = 0; i < this.hand.length; i++) {
      const testHand = [...this.hand];
      testHand.splice(i, 1);
      if (this.canTing(testHand)) {
        result.push(this.hand[i]);
      }
    }
    return result;
  }

  // 检查是否听牌（差一张胡）
  canTing(hand) {
    const suitMap = { wan: [0, 8], tong: [9, 17], tiao: [18, 26] };
    const [missStart, missEnd] = suitMap[this.missingSuit];
    for (let t = 0; t < 27; t++) {
      if (t >= missStart && t <= missEnd) continue;
      const testHand = [...hand, t];
      if (testHand.length !== 14) continue;
      if (mahjong.canWin(testHand, this.missingSuit, this.melds)) return true;
    }
    return false;
  }

  // 获取孤张（没有相邻牌的）
  getIsolatedTiles() {
    return this.hand.filter(t => {
      const num = t % 9;
      const suitStart = Math.floor(t / 9) * 9;
      // 检查是否有相邻牌
      const hasLeft = num > 0 && this.hand.includes(suitStart + num - 1);
      const hasRight = num < 8 && this.hand.includes(suitStart + num + 1);
      const hasSame = this.hand.filter(x => x === t).length > 1;
      return !hasLeft && !hasRight && !hasSame;
    });
  }

  // 从候选中选最"差"的牌（价值最低）
  chooseWorstTile(tiles) {
    if (tiles.length === 0) return -1;
    // 评分：边张低分，中间高分；孤张低分
    let worst = tiles[0];
    let worstScore = Infinity;
    for (const t of tiles) {
      const num = t % 9;
      let score = 0;
      // 边张价值低
      if (num === 0 || num === 8) score += 10;
      else if (num === 1 || num === 7) score += 5;
      // 检查相邻牌数量
      const suitStart = Math.floor(t / 9) * 9;
      let neighbors = 0;
      if (num > 0 && this.hand.includes(suitStart + num - 1)) neighbors++;
      if (num < 8 && this.hand.includes(suitStart + num + 1)) neighbors++;
      if (num > 1 && this.hand.includes(suitStart + num - 2)) neighbors++;
      if (num < 7 && this.hand.includes(suitStart + num + 2)) neighbors++;
      score -= neighbors * 3;
      // 对子价值高
      const sameCount = this.hand.filter(x => x === t).length;
      score -= sameCount * 5;

      if (score < worstScore) {
        worstScore = score;
        worst = t;
      }
    }
    return worst;
  }

  // 选最安全的牌（不容易点炮的）
  chooseSafestTile(tiles) {
    // 简化：选出现次数最多的牌（更安全）
    const counts = {};
    this.room.discardPool.forEach(d => {
      counts[d.tile] = (counts[d.tile] || 0) + 1;
    });
    let safest = tiles[0];
    let safestCount = -1;
    for (const t of tiles) {
      const c = counts[t] || 0;
      if (c > safestCount) {
        safestCount = c;
        safest = t;
      }
    }
    return safest;
  }

  // AI操作决策（碰/杠/胡）
  aiAction() {
    if (this.pendingActions.length === 0) return;

    const hasWin = this.pendingActions.some(a => a.action === 'win');
    const hasKong = this.pendingActions.some(a => a.action === 'kong');
    const hasPung = this.pendingActions.some(a => a.action === 'pung');

    // 1. 优先胡牌
    if (hasWin) {
      const winAction = this.pendingActions.find(a => a.action === 'win');
      this.room.handleAction(this.id, 'win', winAction.tile);
      return;
    }

    // 2. 杠牌（有杠就杠，但检查杠了是否还能听牌）
    if (hasKong) {
      const kongAction = this.pendingActions.find(a => a.action === 'kong');
      // 简单策略：明杠就杠
      if (this.shouldKong(kongAction.tile)) {
        this.room.handleAction(this.id, 'kong', kongAction.tile, 'mingkong');
        return;
      }
    }

    // 3. 碰牌（简单策略：有碰就碰，除非碰了会破坏好牌型）
    if (hasPung) {
      const pungAction = this.pendingActions.find(a => a.action === 'pung');
      if (this.shouldPung(pungAction.tile)) {
        this.room.handleAction(this.id, 'pung', pungAction.tile);
        return;
      }
    }

    // 4. 过
    this.room.handleAction(this.id, 'pass');
  }

  // 是否应该杠
  shouldKong(tile) {
    // 简单策略：总是杠（四川麻将刮风下雨有收益）
    return true;
  }

  // 是否应该碰
  shouldPung(tile) {
    // 检查碰了之后是否会破坏听牌
    const testHand = this.hand.filter(t => t !== tile);
    // 移除两张相同的牌（碰需要两张）
    let removed = 0;
    const afterPung = [];
    for (const t of this.hand) {
      if (t === tile && removed < 2) { removed++; continue; }
      afterPung.push(t);
    }
    // 碰了之后牌数减少2，需要再摸一张才能胡
    // 简单策略：如果当前牌型不错就碰
    const pairs = this.countPairs(this.hand);
    return pairs <= 3; // 对子不多就碰
  }

  countPairs(hand) {
    const counts = {};
    hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    return Object.values(counts).filter(c => c >= 2).length;
  }

  // 检查自摸
  checkSelfDraw() {
    if (this.hasWon) return;
    if (this.hand.length !== 14) return;
    if (mahjong.canWin(this.hand, this.missingSuit, this.melds)) {
      // 自摸胡牌
      this.room.handleSelfDrawWin(this.id);
    } else {
      // 检查暗杠
      this.checkAnKong();
    }
  }

  // 检查暗杠
  checkAnKong() {
    const counts = {};
    this.hand.forEach(t => counts[t] = (counts[t] || 0) + 1);
    for (const [tile, count] of Object.entries(counts)) {
      if (count >= 4) {
        // 有暗杠机会，简单策略：暗杠
        const t = parseInt(tile);
        // 检查暗杠后是否还能听牌（简化：总是暗杠）
        this.room.handleAnKong(this.id, t);
        return;
      }
    }
  }
}

module.exports = { AIPlayer, AI_NAMES, AI_AVATARS };
