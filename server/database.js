/**
 * 数据库抽象层
 * 支持 JSON 文件（本地开发）和 Postgres（生产环境）两种存储方式
 * 通过环境变量 DATABASE_URL 自动切换
 */

const fs = require('fs');
const path = require('path');

let usePostgres = false;
let pgPool = null;

// 数据文件路径
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 初始化数据库
async function initDatabase() {
  // 检查是否配置了 Postgres
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      // 测试连接
      await pgPool.query('SELECT NOW()');
      usePostgres = true;
      console.log('✅ 使用 Postgres 数据库');

      // 创建表
      await createTables();
      return;
    } catch (e) {
      console.error('❌ Postgres 连接失败，回退到 JSON 文件存储:', e.message);
      usePostgres = false;
    }
  }

  // 使用 JSON 文件存储
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
  console.log('💾 使用 JSON 文件存储（本地开发模式）');
  console.log('   提示：配置 DATABASE_URL 环境变量可启用 Postgres 云端数据库');
}

// 创建 Postgres 表
async function createTables() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      salt VARCHAR(100) NOT NULL,
      nickname VARCHAR(100),
      avatar INTEGER DEFAULT 0,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      stats JSONB DEFAULT '{"totalGames":0,"totalWins":0,"totalScore":0}'::jsonb,
      rank JSONB DEFAULT '{"rankIndex":0,"stars":1,"maxStars":3,"rankPoints":0,"winStreak":0,"totalGames":0,"totalWins":0,"winRate":0}'::jsonb,
      friends JSONB DEFAULT '[]'::jsonb,
      friend_requests JSONB DEFAULT '[]'::jsonb
    );
  `);
  console.log('✅ 数据库表已创建');
}

// 读取所有用户
async function getAllUsers() {
  if (usePostgres) {
    const result = await pgPool.query('SELECT * FROM users ORDER BY id');
    return result.rows.map(row => ({
      username: row.username,
      password: row.password,
      salt: row.salt,
      nickname: row.nickname,
      avatar: row.avatar,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
      stats: row.stats,
      rank: row.rank,
      friends: row.friends,
      friendRequests: row.friend_requests,
    }));
  } else {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return data.users;
  }
}

// 保存所有用户
async function saveAllUsers(users) {
  if (usePostgres) {
    // Postgres 模式下通过单独的更新函数操作，这里不做全量保存
    return;
  } else {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
  }
}

// 根据用户名查找用户
async function findUser(username) {
  if (usePostgres) {
    const result = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      username: row.username,
      password: row.password,
      salt: row.salt,
      nickname: row.nickname,
      avatar: row.avatar,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
      stats: row.stats,
      rank: row.rank,
      friends: row.friends,
      friendRequests: row.friend_requests,
    };
  } else {
    const users = await getAllUsers();
    return users.find(u => u.username === username) || null;
  }
}

// 创建新用户
async function createUser(userData) {
  if (usePostgres) {
    await pgPool.query(
      `INSERT INTO users (username, password, salt, nickname, avatar, is_admin, stats, rank, friends, friend_requests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userData.username,
        userData.password,
        userData.salt,
        userData.nickname,
        userData.avatar || 0,
        userData.isAdmin || false,
        userData.stats || { totalGames: 0, totalWins: 0, totalScore: 0 },
        userData.rank || { rankIndex: 0, stars: 1, maxStars: 3, rankPoints: 0, winStreak: 0, totalGames: 0, totalWins: 0, winRate: 0 },
        userData.friends || [],
        userData.friendRequests || [],
      ]
    );
  } else {
    const users = await getAllUsers();
    users.push(userData);
    await saveAllUsers(users);
  }
}

// 更新用户
async function updateUser(username, updates) {
  if (usePostgres) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.nickname !== undefined) {
      fields.push(`nickname = $${idx++}`);
      values.push(updates.nickname);
    }
    if (updates.avatar !== undefined) {
      fields.push(`avatar = $${idx++}`);
      values.push(updates.avatar);
    }
    if (updates.stats !== undefined) {
      fields.push(`stats = $${idx++}`);
      values.push(updates.stats);
    }
    if (updates.rank !== undefined) {
      fields.push(`rank = $${idx++}`);
      values.push(updates.rank);
    }
    if (updates.friends !== undefined) {
      fields.push(`friends = $${idx++}`);
      values.push(updates.friends);
    }
    if (updates.friendRequests !== undefined) {
      fields.push(`friend_requests = $${idx++}`);
      values.push(updates.friendRequests);
    }

    if (fields.length > 0) {
      values.push(username);
      await pgPool.query(`UPDATE users SET ${fields.join(', ')} WHERE username = $${idx}`, values);
    }
  } else {
    const users = await getAllUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates };
      await saveAllUsers(users);
    }
  }
}

// 搜索用户
async function searchUsers(keyword) {
  if (usePostgres) {
    const result = await pgPool.query(
      `SELECT username, nickname, avatar, rank FROM users 
       WHERE username ILIKE $1 OR nickname ILIKE $1 
       ORDER BY (rank->>'rankIndex')::int DESC, (rank->>'rankPoints')::int DESC 
       LIMIT 20`,
      [`%${keyword}%`]
    );
    return result.rows.map(row => ({
      username: row.username,
      nickname: row.nickname,
      avatar: row.avatar,
      rank: row.rank,
    }));
  } else {
    const users = await getAllUsers();
    return users
      .filter(u => u.username.includes(keyword) || (u.nickname && u.nickname.includes(keyword)))
      .sort((a, b) => (b.rank?.rankIndex || 0) - (a.rank?.rankIndex || 0))
      .slice(0, 20)
      .map(u => ({
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        rank: u.rank,
      }));
  }
}

// 获取排行榜
async function getRankings(limit = 100, includeAdmin = true) {
  if (usePostgres) {
    let query = `SELECT username, nickname, avatar, is_admin, rank, stats FROM users `;
    if (!includeAdmin) {
      query += `WHERE is_admin = false `;
    }
    query += `ORDER BY (rank->>'rankIndex')::int DESC, (rank->>'rankPoints')::int DESC, (rank->>'stars')::int DESC 
              LIMIT $1`;
    const result = await pgPool.query(query, [limit]);
    return result.rows.map(row => ({
      username: row.username,
      nickname: row.nickname,
      avatar: row.avatar,
      isAdmin: row.is_admin,
      rank: row.rank,
      stats: row.stats,
    }));
  } else {
    const users = await getAllUsers();
    return users
      .filter(u => includeAdmin || !u.isAdmin)
      .sort((a, b) => {
        const rankDiff = (b.rank?.rankIndex || 0) - (a.rank?.rankIndex || 0);
        if (rankDiff !== 0) return rankDiff;
        const pointsDiff = (b.rank?.rankPoints || 0) - (a.rank?.rankPoints || 0);
        if (pointsDiff !== 0) return pointsDiff;
        return (b.rank?.stars || 0) - (a.rank?.stars || 0);
      })
      .slice(0, limit);
  }
}

module.exports = {
  initDatabase,
  getAllUsers,
  saveAllUsers,
  findUser,
  createUser,
  updateUser,
  searchUsers,
  getRankings,
};
