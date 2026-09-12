# 🎵 耙耳朵麻将馆 - 音频文件说明

## 目录位置
将音频文件放在 `public/audio/` 目录下。

## 支持的格式
- MP3（推荐，兼容性最好）
- WAV
- OGG

## 需要的音频文件

### 背景音乐
| 文件名 | 用途 | 建议时长 |
|--------|------|----------|
| `bgm.mp3` | 游戏背景音乐（循环播放） | 2-5分钟 |

### 游戏音效
| 文件名 | 用途 | 建议时长 |
|--------|------|----------|
| `discard.mp3` | 出牌音效 | 0.3-0.5秒 |
| `draw.mp3` | 摸牌/轮到自己音效 | 0.3-0.5秒 |
| `pung.mp3` | 碰牌音效 | 0.5-1秒 |
| `kong.mp3` | 杠牌音效 | 0.5-1秒 |
| `win.mp3` | 点炮胡音效 | 1-2秒 |
| `tsumo.mp3` | 自摸音效 | 1-2秒 |
| `dingque.mp3` | 定缺确认音效 | 0.5秒 |
| `click.mp3` | 按钮点击音效 | 0.1-0.2秒 |
| `tea.mp3` | 倒茶音效 | 1-2秒 |
| `emote.mp3` | 表情/方言音效 | 0.5秒 |
| `settle.mp3` | 结算音效 | 2-3秒 |
| `notify.mp3` | 通知提示音效 | 0.5秒 |

## 使用方法

### 方法一：自己下载音乐
1. 从酷狗音乐或其他平台下载你喜欢的音乐
2. 重命名为上面表格中的文件名
3. 放到 `public/audio/` 目录下
4. 重启服务器即可生效

### 方法二：免费无版权音乐下载
推荐网站（免费可商用）：
- **Pixabay Music**: https://pixabay.com/music/
- **Free Music Archive**: https://freemusicarchive.org/
- **Incompetech**: https://incompetech.com/
- **Mixkit**: https://mixkit.co/free-stock-music/
- **YouTube Audio Library**: https://studio.youtube.com/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ/music

搜索关键词建议：
- 背景音乐："chinese traditional", "mahjong", "casino", "relaxing", "jazzy"
- 音效："card flip", "game sound", "click", "win", "success"

## 注意事项
1. 如果某个音频文件不存在，游戏会自动使用 Web Audio API 合成的替代音效
2. 背景音乐建议使用纯音乐，不要有人声，避免干扰游戏
3. 音效文件尽量短，避免重叠
4. 文件大小建议控制在 5MB 以内，加快加载速度
5. 四川麻将风格建议选择中国风、川剧、轻松愉快的音乐

## 音频加载优先级
1. 优先加载 `public/audio/` 目录下的本地音频文件
2. 如果文件不存在，自动使用 Web Audio API 合成的音效
3. 两种方式可以混合使用（比如只放背景音乐，音效用合成的）
