/**
 * 耙耳朵麻将馆 - 用户数据存储
 * JSON文件持久化，简单密码加密
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// 管理员账号配置
const ADMIN_ACCOUNT = {
  username: '1906873198@qq.com',
  password: '1906873198@qq.com',
  nickname: '管理员',
  avatar: 0,
  isAdmin: true,
};

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化管理员账号（启动时自动创建）
function initAdmin() {
  const users = loadUsers();
  if (!users[ADMIN_ACCOUNT.username]) {
    const salt = generateSalt();
    users[ADMIN_ACCOUNT.username] = {
      username: ADMIN_ACCOUNT.username,
      passwordHash: hashPassword(ADMIN_ACCOUNT.password, salt),
      salt,
      nickname: ADMIN_ACCOUNT.nickname,
      avatar: ADMIN_ACCOUNT.avatar,
      isAdmin: true,
      createdAt: Date.now(),
      totalGames: 0,
      totalWins: 0,
      totalScore: 0,
      bestFan: 0,
    };
    saveUsers(users);
    console.log('[管理员] 账号已创建:', ADMIN_ACCOUNT.username);
  } else if (!users[ADMIN_ACCOUNT.username].isAdmin) {
    users[ADMIN_ACCOUNT.username].isAdmin = true;
    saveUsers(users);
  }
}

// 启动时初始化管理员
initAdmin();

// 简单密码哈希（MD5+盐，够用了）
function hashPassword(password, salt) {
  return crypto.createHash('md5').update(password + salt + 'paerduo_mahjong_2026').digest('hex');
}

// 生成随机盐
function generateSalt() {
  return crypto.randomBytes(8).toString('hex');
}

// ========== 段位系统 ==========
const RANKS = [
  { name: '青铜', icon: '🥉', stars: 3, color: '#CD7F32' },
  { name: '白银', icon: '🥈', stars: 3, color: '#C0C0C0' },
  { name: '黄金', icon: '🥇', stars: 4, color: '#FFD700' },
  { name: '铂金', icon: '💎', stars: 4, color: '#00CED1' },
  { name: '钻石', icon: '💠', stars: 5, color: '#4169E1' },
  { name: '星耀', icon: '⭐', stars: 5, color: '#9370DB' },
  { name: '王者', icon: '👑', stars: 999, color: '#FF4500' },
];

// 初始化段位（青铜3星）
function initRank() {
  return {
    rankIndex: 0,      // 青铜
    stars: 3,          // 3星
    rankPoints: 0,     // 王者积分
    totalGames: 0,
    totalWins: 0,
    winStreak: 0,      // 连胜
  };
}

// 更新段位（赢了加星，输了减星）
// 新规则：赢的一方加双倍（基础2星），败的一方减一倍（1星），MVP额外加一倍（1星）
function updateRank(userRank, isWin, fan = 1, isMVP = false) {
  if (!userRank) userRank = initRank();

  userRank.totalGames++;

  if (isWin) {
    userRank.totalWins++;
    userRank.winStreak++;

    // 计算加星数：基础2星（双倍）+ 番数加成 + MVP加成 + 连胜加成
    let addStars = 2; // 赢的一方加双倍
    if (fan >= 3) addStars = 3; // 高番额外加星
    if (fan >= 5) addStars = 4;
    if (isMVP) addStars += 1; // MVP多加一倍
    // 3连胜额外加1星
    if (userRank.winStreak >= 3 && userRank.rankIndex < 6) addStars += 1;
    addStars = Math.min(addStars, 5); // 最多5星

    // 王者段位只加积分
    if (userRank.rankIndex >= 6) {
      userRank.rankPoints += addStars * 10;
      return userRank;
    }

    // 加星
    userRank.stars += addStars;
    const currentRank = RANKS[userRank.rankIndex];

    // 检查是否升级
    while (userRank.stars > currentRank.stars && userRank.rankIndex < 6) {
      userRank.stars -= currentRank.stars;
      userRank.rankIndex++;
      // 升级后如果还有多余的星，继续检查
    }

    // 如果刚好满星，不升级（需要再赢一局）
    if (userRank.stars === currentRank.stars + 1) {
      userRank.stars = currentRank.stars;
    }
  } else {
    userRank.winStreak = 0;

    // 败的一方减一倍（1星）
    let loseStars = 1;

    // 王者段位减积分
    if (userRank.rankIndex >= 6) {
      userRank.rankPoints = Math.max(0, userRank.rankPoints - loseStars * 10);
      return userRank;
    }

    // 减星
    userRank.stars -= loseStars;

    // 检查是否降级
    if (userRank.stars < 0 && userRank.rankIndex > 0) {
      userRank.rankIndex--;
      const prevRank = RANKS[userRank.rankIndex];
      userRank.stars = prevRank.stars - 1; // 降到上一段位的最低星-1
      if (userRank.stars < 0) userRank.stars = 0;
    } else if (userRank.stars < 0) {
      userRank.stars = 0; // 青铜不会降到负星
    }
  }

  return userRank;
}

// 获取段位信息
function getRankInfo(userRank) {
  if (!userRank) userRank = initRank();
  const rank = RANKS[Math.min(userRank.rankIndex, RANKS.length - 1)];
  return {
    rankIndex: userRank.rankIndex,
    rankName: rank.name,
    rankIcon: rank.icon,
    rankColor: rank.color,
    stars: userRank.stars,
    maxStars: rank.stars,
    rankPoints: userRank.rankPoints || 0,
    totalGames: userRank.totalGames || 0,
    totalWins: userRank.totalWins || 0,
    winRate: userRank.totalGames > 0 ? Math.round((userRank.totalWins / userRank.totalGames) * 100) : 0,
    winStreak: userRank.winStreak || 0,
  };
}

// 读取所有用户
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('读取用户数据失败:', e.message);
  }
  return {};
}

// 保存所有用户
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存用户数据失败:', e.message);
    return false;
  }
}

// 注册用户
function register(username, password, nickname, avatar) {
  const users = loadUsers();

  // 验证
  if (!username || username.length < 2 || username.length > 20) {
    return { success: false, error: '用户名长度需在2-20个字符之间' };
  }
  if (!password || password.length < 4 || password.length > 32) {
    return { success: false, error: '密码长度需在4-32个字符之间' };
  }
  if (users[username]) {
    return { success: false, error: '用户名已被注册' };
  }

  const salt = generateSalt();
  const user = {
    username,
    passwordHash: hashPassword(password, salt),
    salt,
    nickname: nickname || username,
    avatar: avatar !== undefined ? avatar : Math.floor(Math.random() * 12),
    createdAt: Date.now(),
    totalGames: 0,
    totalWins: 0,
    totalScore: 0,
    bestFan: 0,
    rank: initRank(), // 段位系统
    friends: [], // 好友列表
    friendRequests: [], // 收到的好友请求
  };

  users[username] = user;
  saveUsers(users);

  return {
    success: true,
    user: {
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      totalGames: user.totalGames,
      totalWins: user.totalWins,
      totalScore: user.totalScore,
      bestFan: user.bestFan,
    },
  };
}

// 登录
function login(username, password) {
  const users = loadUsers();
  const user = users[username];

  if (!user) {
    return { success: false, error: '用户不存在' };
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, error: '密码错误' };
  }

  // 生成登录token（简单版：用户名+时间戳的哈希）
  const token = crypto.createHash('md5').update(username + Date.now() + 'paerduo_token').digest('hex');

  return {
    success: true,
    token,
    user: {
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      isAdmin: user.isAdmin || false,
      totalGames: user.totalGames,
      totalWins: user.totalWins,
      totalScore: user.totalScore,
      bestFan: user.bestFan,
      rank: getRankInfo(user.rank),
    },
  };
}

// 验证token（简化版，实际应该存token列表）
function verifyToken(username, token) {
  if (!username || !token) return false;
  // 简单验证：token是32位hex
  return /^[a-f0-9]{32}$/.test(token);
}

// 检查是否管理员
function isAdmin(username) {
  const users = loadUsers();
  return users[username]?.isAdmin || false;
}

// 更新用户段位
function updateUserRank(username, isWin, fan, isMVP = false) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return null;

  if (!user.rank) user.rank = initRank();
  user.rank = updateRank(user.rank, isWin, fan, isMVP);

  // 同时更新总统计
  user.totalGames = user.rank.totalGames;
  user.totalWins = user.rank.totalWins;

  saveUsers(users);
  return getRankInfo(user.rank);
}

// 获取用户段位
function getUserRank(username) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return getRankInfo(null);
  return getRankInfo(user.rank);
}

// 获取排行榜
// includeAdmin: 是否包含管理员（内部排行榜用）
// limit: 返回数量
function getRankings(includeAdmin = false, limit = 100) {
  const users = loadUsers();
  let userList = Object.values(users);

  // 公开排行榜排除管理员
  if (!includeAdmin) {
    userList = userList.filter(u => !u.isAdmin);
  }

  // 按段位排序：段位索引高的在前，同段位按星级/积分排序
  userList.sort((a, b) => {
    const rankA = a.rank || initRank();
    const rankB = b.rank || initRank();

    // 先比较段位索引
    if (rankA.rankIndex !== rankB.rankIndex) {
      return rankB.rankIndex - rankA.rankIndex;
    }

    // 王者段位按积分排序
    if (rankA.rankIndex >= 6) {
      return (rankB.rankPoints || 0) - (rankA.rankPoints || 0);
    }

    // 其他段位按星级排序
    if (rankA.stars !== rankB.stars) {
      return rankB.stars - rankA.stars;
    }

    // 同星按胜率排序
    const winRateA = rankA.totalGames > 0 ? rankA.totalWins / rankA.totalGames : 0;
    const winRateB = rankB.totalGames > 0 ? rankB.totalWins / rankB.totalGames : 0;
    return winRateB - winRateA;
  });

  return userList.slice(0, limit).map((u, idx) => {
    const rank = getRankInfo(u.rank);
    return {
      rank: idx + 1,
      username: u.username,
      nickname: u.nickname || u.username,
      avatar: u.avatar || 0,
      isAdmin: u.isAdmin || false,
      ...rank,
    };
  });
}

// 更新用户统计
function updateStats(username, stats) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return false;

  if (stats.totalGames !== undefined) user.totalGames += stats.totalGames;
  if (stats.totalWins !== undefined) user.totalWins += stats.totalWins;
  if (stats.totalScore !== undefined) user.totalScore += stats.totalScore;
  if (stats.bestFan !== undefined && stats.bestFan > user.bestFan) user.bestFan = stats.bestFan;

  saveUsers(users);
  return true;
}

// 修改用户信息
function updateProfile(username, updates) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return { success: false, error: '用户不存在' };

  if (updates.nickname) user.nickname = updates.nickname.slice(0, 20);
  if (updates.avatar !== undefined) user.avatar = parseInt(updates.avatar) % 12;
  if (updates.password) {
    const salt = generateSalt();
    user.salt = salt;
    user.passwordHash = hashPassword(updates.password, salt);
  }

  saveUsers(users);
  return {
    success: true,
    user: {
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      totalGames: user.totalGames,
      totalWins: user.totalWins,
      totalScore: user.totalScore,
      bestFan: user.bestFan,
    },
  };
}

// ========== 好友系统 ==========

// 发送好友请求
function sendFriendRequest(fromUsername, toUsername) {
  const users = loadUsers();
  if (!users[fromUsername] || !users[toUsername]) {
    return { success: false, error: '用户不存在' };
  }
  if (fromUsername === toUsername) {
    return { success: false, error: '不能添加自己为好友' };
  }
  // 检查是否已经是好友
  if (users[fromUsername].friends?.includes(toUsername)) {
    return { success: false, error: '已经是好友了' };
  }
  // 检查是否已经发送过请求
  if (users[toUsername].friendRequests?.some(r => r.from === fromUsername)) {
    return { success: false, error: '已发送过好友请求' };
  }

  if (!users[toUsername].friendRequests) users[toUsername].friendRequests = [];
  users[toUsername].friendRequests.push({
    from: fromUsername,
    nickname: users[fromUsername].nickname,
    avatar: users[fromUsername].avatar,
    time: Date.now(),
  });

  saveUsers(users);
  return { success: true, message: '好友请求已发送' };
}

// 接受好友请求
function acceptFriendRequest(username, fromUsername) {
  const users = loadUsers();
  if (!users[username] || !users[fromUsername]) {
    return { success: false, error: '用户不存在' };
  }

  // 移除请求
  users[username].friendRequests = (users[username].friendRequests || []).filter(r => r.from !== fromUsername);

  // 互相添加为好友
  if (!users[username].friends) users[username].friends = [];
  if (!users[fromUsername].friends) users[fromUsername].friends = [];

  if (!users[username].friends.includes(fromUsername)) {
    users[username].friends.push(fromUsername);
  }
  if (!users[fromUsername].friends.includes(username)) {
    users[fromUsername].friends.push(username);
  }

  saveUsers(users);
  return { success: true, message: '已添加好友' };
}

// 拒绝好友请求
function rejectFriendRequest(username, fromUsername) {
  const users = loadUsers();
  if (!users[username]) return { success: false, error: '用户不存在' };

  users[username].friendRequests = (users[username].friendRequests || []).filter(r => r.from !== fromUsername);
  saveUsers(users);
  return { success: true, message: '已拒绝好友请求' };
}

// 删除好友
function removeFriend(username, friendUsername) {
  const users = loadUsers();
  if (!users[username] || !users[friendUsername]) {
    return { success: false, error: '用户不存在' };
  }

  users[username].friends = (users[username].friends || []).filter(f => f !== friendUsername);
  users[friendUsername].friends = (users[friendUsername].friends || []).filter(f => f !== username);

  saveUsers(users);
  return { success: true, message: '已删除好友' };
}

// 获取好友列表（包含在线状态，需要传入在线用户集合）
function getFriends(username, onlineUsers = new Set()) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return [];

  return (user.friends || []).map(friendUsername => {
    const friend = users[friendUsername];
    if (!friend) return null;
    return {
      username: friendUsername,
      nickname: friend.nickname,
      avatar: friend.avatar,
      online: onlineUsers.has(friendUsername),
      rank: getRankInfo(friend.rank),
    };
  }).filter(Boolean);
}

// 获取好友请求列表
function getFriendRequests(username) {
  const users = loadUsers();
  const user = users[username];
  if (!user) return [];
  return user.friendRequests || [];
}

module.exports = {
  register,
  login,
  verifyToken,
  updateStats,
  updateProfile,
  loadUsers,
  isAdmin,
  initAdmin,
  updateUserRank,
  getUserRank,
  getRankInfo,
  getRankings,
  RANKS,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getFriendRequests,
};
