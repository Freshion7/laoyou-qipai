/**
 * 耙耳朵麻将馆 - 四川麻将核心逻辑引擎
 * 支持：血战到底、定缺、刮风下雨、番数计算
 */

// 牌型定义：万(0-8)、筒(9-17)、条(18-26)
const TILE_TYPES = {
  WAN: 0,   // 万
  TONG: 9,  // 筒
  TIAO: 18, // 条
};

const TILE_NAMES = {
  0: '一万', 1: '二万', 2: '三万', 3: '四万', 4: '五万',
  5: '六万', 6: '七万', 7: '八万', 8: '九万',
  9: '一筒', 10: '二筒', 11: '三筒', 12: '四筒', 13: '五筒',
  14: '六筒', 15: '七筒', 16: '八筒', 17: '九筒',
  18: '一条', 19: '二条', 20: '三条', 21: '四条', 22: '五条',
  23: '六条', 24: '七条', 25: '八条', 26: '九条',
};

const TILE_SHORT = {
  0: '1万', 1: '2万', 2: '3万', 3: '4万', 4: '5万',
  5: '6万', 6: '7万', 7: '8万', 8: '9万',
  9: '1筒', 10: '2筒', 11: '3筒', 12: '4筒', 13: '5筒',
  14: '6筒', 15: '7筒', 16: '8筒', 17: '9筒',
  18: '1条', 19: '2条', 20: '3条', 21: '4条', 22: '5条',
  23: '6条', 24: '7条', 25: '8条', 26: '9条',
};

// 获取牌的花色
function getSuit(tile) {
  if (tile < 9) return 'wan';
  if (tile < 18) return 'tong';
  return 'tiao';
}

// 获取牌的数字 (1-9)
function getNumber(tile) {
  return (tile % 9) + 1;
}

// 创建一副牌（108张，四川麻将无花牌字牌）
function createDeck() {
  const deck = [];
  for (let i = 0; i < 27; i++) {
    for (let j = 0; j < 4; j++) {
      deck.push(i);
    }
  }
  return deck;
}

// 洗牌（Fisher-Yates）
function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 排序手牌
function sortHand(hand) {
  return [...hand].sort((a, b) => a - b);
}

// 统计每种牌的数量
function countTiles(hand) {
  const counts = new Array(27).fill(0);
  for (const t of hand) counts[t]++;
  return counts;
}

// 检查是否可以组成顺子+刻子的胡牌结构（不含将牌）
function canFormMelds(counts) {
  const c = [...counts];
  for (let i = 0; i < 27; i++) {
    if (c[i] === 0) continue;
    // 尝试刻子
    if (c[i] >= 3) {
      c[i] -= 3;
      i--; // 重新检查当前位置
      continue;
    }
    // 尝试顺子（同花色内）
    const suitStart = Math.floor(i / 9) * 9;
    const num = i % 9;
    if (num <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      i--;
      continue;
    }
    return false;
  }
  return true;
}

// 检查基本胡牌（4组面子+1对将）
function isBasicWin(hand) {
  if (hand.length !== 14) return false;
  const counts = countTiles(hand);
  // 尝试每一种可能的将牌
  for (let i = 0; i < 27; i++) {
    if (counts[i] >= 2) {
      const c = [...counts];
      c[i] -= 2;
      if (canFormMelds(c)) return true;
    }
  }
  return false;
}

// 检查七对
function isSevenPairs(hand) {
  if (hand.length !== 14) return false;
  const counts = countTiles(hand);
  let pairCount = 0;
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 2) pairCount++;
    else if (counts[i] === 4) pairCount += 2; // 龙七对中的四张算两对
    else if (counts[i] > 0) return false;
  }
  return pairCount === 7;
}

// 检查是否是龙七对（有四张相同的牌）
function isDragonSevenPairs(hand) {
  if (!isSevenPairs(hand)) return false;
  const counts = countTiles(hand);
  return counts.some(c => c === 4);
}

// 检查是否缺一门
function isMissingSuit(hand, missingSuit) {
  const suitMap = { wan: 0, tong: 9, tiao: 18 };
  const start = suitMap[missingSuit];
  for (let i = start; i < start + 9; i++) {
    if (hand.includes(i)) return false;
  }
  return true;
}

// 检查是否清一色
function isPureSuit(hand) {
  if (hand.length === 0) return false;
  const suit = getSuit(hand[0]);
  return hand.every(t => getSuit(t) === suit);
}

// 检查是否对对胡（全是刻子+将，没有顺子）
function isAllPungs(hand, melds = []) {
  // melds: 已碰/杠的牌组 [{tiles: [...], type: 'pung'|'kong'}]
  const counts = countTiles(hand);
  // 检查手牌部分
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 0) continue;
    if (counts[i] === 2) continue; // 将牌
    if (counts[i] === 3) continue; // 刻子
    if (counts[i] === 1 || counts[i] === 4) {
      // 1张无法组成刻子（除非是顺子的一部分，但对对胡不允许顺子）
      // 4张可以是暗杠
      if (counts[i] !== 4) return false;
    }
  }
  // 检查已碰/杠的牌组
  for (const m of melds) {
    // 碰和杠都是刻子类，OK
  }
  // 更严格的检查：手牌中不能有顺子结构
  // 验证所有非将牌的组都是刻子
  let pairFound = false;
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 0) continue;
    if (counts[i] === 2) {
      if (pairFound) return false; // 只能有一对将
      pairFound = true;
    } else if (counts[i] === 3 || counts[i] === 4) {
      continue;
    } else {
      return false;
    }
  }
  return true;
}

// 检查是否带幺九（所有面子都含1或9）
function isAllTerminals(hand, melds = []) {
  const counts = countTiles(hand);
  // 检查将牌必须是幺九
  let pairTile = -1;
  for (let i = 0; i < 27; i++) {
    if (counts[i] >= 2) {
      const num = getNumber(i);
      if (num === 1 || num === 9) {
        pairTile = i;
        break;
      }
    }
  }
  if (pairTile === -1) return false;

  const c = [...counts];
  c[pairTile] -= 2;

  // 检查剩余牌能否组成含幺九的面子
  for (let i = 0; i < 27; i++) {
    if (c[i] === 0) continue;
    const num = getNumber(i);
    // 刻子必须是幺九
    if (c[i] >= 3 && (num === 1 || num === 9)) {
      c[i] -= 3;
      i--;
      continue;
    }
    // 顺子必须含幺九（123 或 789）
    if (num === 1 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      i--;
      continue;
    }
    if (num === 7 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      i--;
      continue;
    }
    return false;
  }
  return true;
}

// 检查是否金钩钓（只剩单张牌，其余全是杠/碰）
function isGoldenHook(hand, melds = []) {
  // 手牌只剩1张单钓，且有4组碰/杠
  const kongPungCount = melds.filter(m => m.type === 'pung' || m.type === 'kong').length;
  return hand.length === 1 && kongPungCount === 4;
}

// 计算番数
function calculateFan(hand, melds = [], options = {}) {
  let fan = 0;
  let fanDetails = [];

  // 基础：平胡 1番
  if (isBasicWin(hand) || isSevenPairs(hand)) {
    fan = 1;
    fanDetails.push({ name: '平胡', fan: 1 });
  }

  // 对对胡 2番
  if (isAllPungs(hand, melds)) {
    fan += 1;
    fanDetails.push({ name: '对对胡', fan: 1 });
  }

  // 清一色 4番 (在平胡基础上+3)
  if (isPureSuit(hand)) {
    fan += 3;
    fanDetails.push({ name: '清一色', fan: 3 });
  }

  // 七对 4番 (替换平胡)
  if (isSevenPairs(hand) && !isDragonSevenPairs(hand)) {
    fan = 4;
    fanDetails = [{ name: '七对', fan: 4 }];
    if (isPureSuit(hand)) {
      fan += 2;
      fanDetails.push({ name: '清七对', fan: 2 });
    }
  }

  // 龙七对 8番
  if (isDragonSevenPairs(hand)) {
    fan = 5; // 龙七对算5番
    fanDetails = [{ name: '龙七对', fan: 5 }];
    if (isPureSuit(hand)) {
      fan += 2;
      fanDetails.push({ name: '清龙七对', fan: 2 });
    }
  }

  // 带幺九 4番
  if (isAllTerminals(hand, melds) && !isPureSuit(hand)) {
    fan = Math.max(fan, 4);
    fanDetails.push({ name: '带幺九', fan: 4 });
  }

  // 清对（清一色+对对胡）额外加番
  if (isPureSuit(hand) && isAllPungs(hand, melds)) {
    fan = Math.max(fan, 5);
    fanDetails.push({ name: '清对', fan: 1 });
  }

  // 将对（258对对胡）
  const isJiangDui = isAllPungs(hand, melds) && hand.every(t => {
    const n = getNumber(t);
    return n === 2 || n === 5 || n === 8;
  });
  if (isJiangDui) {
    fan = Math.max(fan, 5);
    fanDetails.push({ name: '将对', fan: 5 });
  }

  // 杠上花
  if (options.isKongFlower) {
    fan += 1;
    fanDetails.push({ name: '杠上花', fan: 1 });
  }

  // 杠上炮
  if (options.isKongShot) {
    fan += 1;
    fanDetails.push({ name: '杠上炮', fan: 1 });
  }

  // 抢杠胡
  if (options.isRobKong) {
    fan += 1;
    fanDetails.push({ name: '抢杠胡', fan: 1 });
  }

  // 海底捞月
  if (options.isLastTile) {
    fan += 1;
    fanDetails.push({ name: '海底捞月', fan: 1 });
  }

  // 天胡
  if (options.isHeavenlyWin) {
    fan += 3;
    fanDetails.push({ name: '天胡', fan: 3 });
  }

  // 地胡
  if (options.isEarthlyWin) {
    fan += 2;
    fanDetails.push({ name: '地胡', fan: 2 });
  }

  // 门清（没有碰/杠）
  if (melds.length === 0 && !options.isRon) {
    fan += 1;
    fanDetails.push({ name: '门清', fan: 1 });
  }

  // 中张（胡2-8的牌）
  if (options.winTile !== undefined) {
    const n = getNumber(options.winTile);
    if (n >= 2 && n <= 8) {
      fan += 1;
      fanDetails.push({ name: '中张', fan: 1 });
    } else {
      fanDetails.push({ name: '幺九', fan: 0 });
    }
  }

  // 根（每有一个四张相同加1番）
  const counts = countTiles(hand);
  let roots = 0;
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 4) roots++;
  }
  for (const m of melds) {
    if (m.type === 'kong') roots++;
  }
  if (roots > 0) {
    fan += roots;
    fanDetails.push({ name: `根x${roots}`, fan: roots });
  }

  // 封顶 8番
  const maxFan = options.maxFan || 8;
  const finalFan = Math.min(fan, maxFan);

  return {
    fan: finalFan,
    baseFan: fan,
    details: fanDetails,
    multiplier: Math.pow(2, finalFan - 1), // 1番=1倍, 2番=2倍, 3番=4倍...
  };
}

// 检查是否可以胡牌
function canWin(hand, missingSuit, melds = [], options = {}) {
  // 必须缺一门
  if (!isMissingSuit(hand, missingSuit)) return false;
  // 基本胡或七对
  return isBasicWin(hand) || isSevenPairs(hand);
}

// 检查听牌（返回可以胡的牌列表）
function getWaitingTiles(hand, missingSuit, melds = []) {
  const waiting = [];
  // 过滤掉缺的花色
  const suitMap = { wan: [0, 8], tong: [9, 17], tiao: [18, 26] };
  const [missStart, missEnd] = suitMap[missingSuit];

  for (let t = 0; t < 27; t++) {
    if (t >= missStart && t <= missEnd) continue;
    const testHand = [...hand, t];
    if (canWin(testHand, missingSuit, melds)) {
      waiting.push(t);
    }
  }
  return waiting;
}

// 检查是否可以碰
function canPung(hand, tile) {
  return hand.filter(t => t === tile).length >= 2;
}

// 检查是否可以杠
function canKong(hand, tile, melds = []) {
  // 明杠：手中有3张
  if (hand.filter(t => t === tile).length >= 3) return 'mingkong';
  // 补杠：之前碰过这张牌，现在摸到第4张
  for (const m of melds) {
    if (m.type === 'pung' && m.tiles[0] === tile) return 'bugang';
  }
  return null;
}

// 检查是否可以暗杠
function canAnKong(hand) {
  const counts = countTiles(hand);
  const result = [];
  for (let i = 0; i < 27; i++) {
    if (counts[i] === 4) result.push(i);
  }
  return result;
}

module.exports = {
  TILE_TYPES,
  TILE_NAMES,
  TILE_SHORT,
  getSuit,
  getNumber,
  createDeck,
  shuffle,
  sortHand,
  countTiles,
  isBasicWin,
  isSevenPairs,
  isDragonSevenPairs,
  isMissingSuit,
  isPureSuit,
  isAllPungs,
  isAllTerminals,
  isGoldenHook,
  calculateFan,
  canWin,
  getWaitingTiles,
  canPung,
  canKong,
  canAnKong,
};
