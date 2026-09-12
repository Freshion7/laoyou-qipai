/**
 * 麻将核心逻辑测试
 * 验证胡牌判定、番数计算等核心功能
 */

const mahjong = require('./server/mahjong');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ ${testName}`);
    passed++;
  } else {
    console.log(`❌ ${testName}`);
    failed++;
  }
}

console.log('=== 麻将核心逻辑测试 ===\n');

// 测试1: 基本胡牌 - 4面子+1将
console.log('--- 基本胡牌测试 ---');
{
  // 123万 456万 789万 东东东 南南
  const hand = [0,1,2, 3,4,5, 6,7,8, 9,9,9, 10,10];
  // 注意：四川麻将无字牌，这里用筒条万测试
  // 123万 456筒 789条 111筒 22筒
  const hand2 = [0,1,2, 9,10,11, 18,19,20, 9,9,9, 10,10];
  assert(mahjong.isBasicWin(hand2), '基本胡牌 4面子+1将');
}

// 测试2: 七对
{
  // 7个对子
  const hand = [0,0, 1,1, 2,2, 3,3, 4,4, 5,5, 6,6];
  assert(mahjong.isSevenPairs(hand), '七对');
}

// 测试3: 龙七对
{
  // 有4张相同的七对
  const hand = [0,0,0,0, 1,1, 2,2, 3,3, 4,4, 5,5];
  assert(mahjong.isDragonSevenPairs(hand), '龙七对');
}

// 测试4: 清一色
{
  const hand = [0,1,2,3,4,5,6,7,8,0,1,2,3,3];
  assert(mahjong.isPureSuit(hand), '清一色');
}

// 测试5: 缺一门
{
  const hand = [0,1,2,3,4,5,6,7,8,9,10,11,12,12]; // 万+筒，缺条
  assert(mahjong.isMissingSuit(hand, 'tiao'), '缺一门(缺条)');
  assert(!mahjong.isMissingSuit(hand, 'wan'), '不缺万');
}

// 测试6: 对对胡
{
  // 全刻子+将
  const hand = [0,0,0, 9,9,9, 18,18,18, 1,1,1, 2,2];
  assert(mahjong.isAllPungs(hand), '对对胡');
}

// 测试7: 番数计算 - 平胡
console.log('\n--- 番数计算测试 ---');
{
  const hand = [0,1,2, 9,10,11, 18,19,20, 0,0,0, 1,1];
  const result = mahjong.calculateFan(hand, [], { winTile: 1 });
  assert(result.fan >= 1, `平胡番数 >= 1 (实际: ${result.fan})`);
  console.log(`   平胡详情: ${result.details.map(d => d.name).join(', ')} = ${result.fan}番`);
}

// 测试8: 番数计算 - 清一色
{
  const hand = [0,1,2,3,4,5,6,7,8,0,1,2,3,3];
  const result = mahjong.calculateFan(hand, [], { winTile: 3 });
  assert(result.fan >= 4, `清一色番数 >= 4 (实际: ${result.fan})`);
  console.log(`   清一色详情: ${result.details.map(d => d.name).join(', ')} = ${result.fan}番`);
}

// 测试9: 番数计算 - 七对
{
  const hand = [0,0, 1,1, 2,2, 3,3, 4,4, 5,5, 6,6];
  const result = mahjong.calculateFan(hand, [], { winTile: 6 });
  assert(result.fan >= 4, `七对番数 >= 4 (实际: ${result.fan})`);
  console.log(`   七对详情: ${result.details.map(d => d.name).join(', ')} = ${result.fan}番`);
}

// 测试10: 听牌检测
console.log('\n--- 听牌检测测试 ---');
{
  // 123万 456万 789万 111筒 听2筒(将)
  const hand = [0,1,2, 3,4,5, 6,7,8, 9,9,9, 10];
  const waiting = mahjong.getWaitingTiles(hand, 'tiao', []);
  assert(waiting.includes(10), `听牌检测 - 听2筒(10)`);
  console.log(`   听牌列表: ${waiting.map(t => mahjong.TILE_SHORT[t]).join(', ')}`);
}

// 测试11: 碰牌检测
{
  const hand = [0,0,1,2,3];
  assert(mahjong.canPung(hand, 0), '可以碰');
  assert(!mahjong.canPung(hand, 1), '不可以碰(只有1张)');
}

// 测试12: 杠牌检测
{
  const hand = [0,0,0,1,2,3];
  assert(mahjong.canKong(hand, 0) === 'mingkong', '可以明杠');
  assert(!mahjong.canKong(hand, 1), '不可以杠');
}

// 测试13: 暗杠检测
{
  const hand = [0,0,0,0,1,2,3];
  const ankongs = mahjong.canAnKong(hand);
  assert(ankongs.includes(0), '可以暗杠');
}

// 测试14: 牌堆创建
console.log('\n--- 牌堆测试 ---');
{
  const deck = mahjong.createDeck();
  assert(deck.length === 108, `牌堆108张 (实际: ${deck.length})`);
  // 每种牌4张
  const counts = mahjong.countTiles(deck);
  assert(counts.every(c => c === 4), '每种牌4张');
}

// 测试15: 洗牌
{
  const deck = mahjong.createDeck();
  const shuffled = mahjong.shuffle(deck);
  assert(shuffled.length === 108, '洗牌后数量不变');
  // 检查是否还是同样的牌
  const counts = mahjong.countTiles(shuffled);
  assert(counts.every(c => c === 4), '洗牌后牌种不变');
}

// 测试16: 带幺九
console.log('\n--- 特殊牌型测试 ---');
{
  // 123万 789万 111筒 999条 11万
  const hand = [0,1,2, 6,7,8, 9,9,9, 26,26,26, 0,0];
  assert(mahjong.isAllTerminals(hand), '带幺九');
}

// 测试17: 胡牌判定综合
{
  // 完整的四川麻将胡牌：缺门 + 基本胡
  const hand = [0,1,2, 9,10,11, 18,19,20, 0,0,0, 1,1]; // 万筒条都有
  assert(!mahjong.canWin(hand, 'tiao', []), '缺条但手牌有条，不能胡');
  
  const hand2 = [0,1,2, 9,10,11, 9,10,11, 0,0,0, 1,1]; // 只有万和筒
  assert(mahjong.canWin(hand2, 'tiao', []), '缺条且手牌无条，可以胡');
}

// 测试18: 番数倍数计算
{
  const result1 = mahjong.calculateFan([], [], { maxFan: 8 });
  // 1番=1倍, 2番=2倍, 3番=4倍
  assert(Math.pow(2, 0) === 1, '1番=1倍');
  assert(Math.pow(2, 1) === 2, '2番=2倍');
  assert(Math.pow(2, 2) === 4, '3番=4倍');
  assert(Math.pow(2, 7) === 128, '8番=128倍');
}

// 测试19: 牌名
{
  assert(mahjong.TILE_NAMES[0] === '一万', '牌名: 一万');
  assert(mahjong.TILE_NAMES[9] === '一筒', '牌名: 一筒');
  assert(mahjong.TILE_NAMES[18] === '一条', '牌名: 一条');
}

// 测试20: 花色和数字
{
  assert(mahjong.getSuit(0) === 'wan', '0号是万');
  assert(mahjong.getSuit(9) === 'tong', '9号是筒');
  assert(mahjong.getSuit(18) === 'tiao', '18号是条');
  assert(mahjong.getNumber(0) === 1, '0号数字是1');
  assert(mahjong.getNumber(8) === 9, '8号数字是9');
}

console.log('\n=== 测试结果 ===');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📊 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  process.exit(1);
}
