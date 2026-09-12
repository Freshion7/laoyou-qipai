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

module.exports = {
  register,
  login,
  verifyToken,
  updateStats,
  updateProfile,
  loadUsers,
  isAdmin,
  initAdmin,
};
