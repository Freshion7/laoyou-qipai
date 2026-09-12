/**
 * 耙耳朵麻将馆 - 自动重连隧道脚本
 * 监控 localhost.run SSH 隧道，断开后自动秒连
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ADDRESS_FILE = path.join(__dirname, 'current_tunnel_url.txt');
const LOG_FILE = path.join(__dirname, 'tunnel.log');

let currentUrl = '';
let reconnectCount = 0;
let sshProcess = null;

function log(msg) {
  const time = new Date().toLocaleString('zh-CN');
  const line = `[${time}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch (e) {}
}

function saveUrl(url) {
  currentUrl = url;
  try {
    fs.writeFileSync(ADDRESS_FILE, url, 'utf-8');
  } catch (e) {}
}

function startTunnel() {
  log('正在启动 SSH 隧道...');

  // 启动 SSH 隧道
  sshProcess = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:localhost:${PORT}`,
    'nokey@localhost.run'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let buffer = '';

  sshProcess.stdout.on('data', (data) => {
    const text = data.toString();
    buffer += text;
    process.stdout.write(text);

    // 解析隧道地址
    const urlMatch = text.match(/(https:\/\/[a-z0-9]+\.lhr\.life)/);
    if (urlMatch) {
      const url = urlMatch[1];
      if (url !== currentUrl) {
        saveUrl(url);
        log('========================================');
        log('  🎉 隧道连接成功！');
        log(`  🌐 公网地址: ${url}`);
        log('========================================');
      }
    }
  });

  sshProcess.stderr.on('data', (data) => {
    const text = data.toString();
    // SSH 的警告信息输出到 stderr，忽略常见警告
    if (!text.includes('Pseudo-terminal') && !text.includes('Warning')) {
      process.stderr.write(data);
    }
  });

  sshProcess.on('close', (code) => {
    reconnectCount++;
    log(`隧道已断开 (exit code: ${code})，3秒后自动重连... (第${reconnectCount}次重连)`);
    saveUrl('');
    setTimeout(startTunnel, 3000);
  });

  sshProcess.on('error', (err) => {
    log(`SSH 进程错误: ${err.message}`);
  });
}

// 优雅退出
process.on('SIGINT', () => {
  log('收到退出信号，正在关闭隧道...');
  if (sshProcess) {
    sshProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (sshProcess) {
    sshProcess.kill();
  }
  process.exit(0);
});

// 启动
log('耙耳朵麻将馆 - 自动重连隧道启动');
log(`本地端口: ${PORT}`);
log('按 Ctrl+C 停止');
console.log('');
startTunnel();
