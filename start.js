/**
 * 耙耳朵麻将馆 - 一键启动脚本
 * 同时启动游戏服务器 + 公网隧道（localtunnel）
 * 支持自动重连，地址变化时显示新地址
 */

const { spawn } = require('child_process');
const localtunnel = require('localtunnel');

let serverProcess = null;
let tunnel = null;
let tunnelRetries = 0;
const MAX_RETRIES = 10;

console.log('🀄 耙耳朵麻将馆 - 一键启动');
console.log('=' .repeat(50));

// 1. 启动游戏服务器
function startServer() {
  console.log('\n📦 启动游戏服务器...');
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('❌ 服务器启动失败:', err.message);
  });

  serverProcess.on('exit', (code) => {
    console.log(`⚠️  服务器退出 (code: ${code})`);
  });
}

// 2. 启动公网隧道
async function startTunnel() {
  try {
    console.log('\n🌐 正在连接公网隧道...');
    tunnel = await localtunnel({
      port: 3000,
      subdomain: undefined, // 随机子域名
    });

    tunnelRetries = 0;

    console.log('\n' + '='.repeat(50));
    console.log('✅ 公网地址已就绪！');
    console.log('');
    console.log('   🌐 公网地址: ' + tunnel.url);
    console.log('');
    console.log('   把这个地址发给朋友，任何网络都能联机玩！');
    console.log('   (手机/电脑浏览器打开即可)');
    console.log('='.repeat(50) + '\n');

    tunnel.on('close', () => {
      console.log('⚠️  隧道连接关闭，正在重连...');
      reconnectTunnel();
    });

    tunnel.on('error', (err) => {
      console.error('❌ 隧道错误:', err.message);
      reconnectTunnel();
    });

  } catch (err) {
    console.error('❌ 隧道连接失败:', err.message);
    reconnectTunnel();
  }
}

// 3. 自动重连
function reconnectTunnel() {
  if (tunnelRetries >= MAX_RETRIES) {
    console.log('❌ 重连次数过多，请检查网络后重启脚本');
    return;
  }
  tunnelRetries++;
  const delay = Math.min(3000 * tunnelRetries, 15000);
  console.log(`   ${delay / 1000}秒后第 ${tunnelRetries} 次重连...`);
  setTimeout(() => {
    if (tunnel) {
      try { tunnel.close(); } catch (e) {}
    }
    startTunnel();
  }, delay);
}

// 4. 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭...');
  if (tunnel) {
    try { tunnel.close(); } catch (e) {}
  }
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});

// 启动
startServer();

// 等服务器启动后再连隧道
setTimeout(() => {
  startTunnel();
}, 2000);
