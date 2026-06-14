# SENTINEL · 网络哨兵

Swiss Modern 风格全网关键词监测面板。多领域关键词匹配，AI 简报生成。

## 技术栈
- 前端：纯 HTML/CSS/JS，Swiss Modern 设计（12 列 Grid · 红黑白 · 非对称 · 大字距）
- 后端：Node.js + sql.js (WASM)
- AI 摘要：SiliconFlow DeepSeek-V3（不可用时自动 mock）

## 功能
- 7 大领域 37 个关键词，自动抓取 + 匹配 + 红点标记
- 多源聚合：Hacker News / V2EX / 少数派 / GitHub / 知乎 / 微博 / B站
- AI 趋势简报：每 6 小时自动生成，支持历史归档
- 纯 Swiss Modern：无圆角无阴影，只有红黑白 + 网格系统
- 默认只显示"值得看"的内容，过滤无关信息

## 启动
```
npm install
node server.js
```
打开 http://localhost:9091
