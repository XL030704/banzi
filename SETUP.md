# 🚀 远程联机配置指南

## 概述

游戏已改用 **PubNub** 实现实时联机，无需后端服务器，纯前端即可工作。

## 注册 PubNub（2分钟完成）

### 1. 创建账号
1. 前往 [https://www.pubnub.com/](https://www.pubnub.com/)
2. 点击 "Sign Up" 或 "Get Started"
3. 使用**邮箱注册**（不需要 Google 账号）
4. 验证邮箱并登录

### 2. 创建应用
1. 登录后进入 Dashboard
2. 点击 "Create New App"
3. 输入应用名称（如：BanziGame）
4. 点击 "Create"

### 3. 获取密钥
1. 点击你创建的应用
2. 找到 "My First Keyset" 或创建新的 Keyset
3. 复制以下两个密钥：
   - **Publish Key** (以 `pub-c-` 开头)
   - **Subscribe Key** (以 `sub-c-` 开头)

### 4. 配置游戏
打开 `js/network.js`，找到第 34-35 行：

```javascript
publishKey: 'your-publish-key',    // ← 替换为你的 Publish Key
subscribeKey: 'your-subscribe-key', // ← 替换为你的 Subscribe Key
```

将密钥填入对应位置即可。

---

## 📋 免费额度说明

PubNub 免费版（Free Tier）包含：
- **每月 200 万条消息**（4人打牌完全够用）
- **每天 1000 个并发用户**（远超需求）
- **无限设备连接数**

### 使用估算
按每局游戏 500 条消息计算：
- 每月可玩：**4000 局**
- 每天可玩：**133 局**

完全满足需求！

---

## 🎮 如何使用

### 部署到 GitHub Pages

1. 确保密钥已配置到 `js/network.js`
2. 推送代码到 GitHub
3. 在 GitHub 仓库设置中启用 Pages
4. 访问你的游戏网址

### 邀请朋友

1. 你访问游戏网址，点击"创建房间"
2. 获得6位房间号（如：123456）
3. 将房间号发给朋友
4. 朋友访问同一网址，点击"加入房间"，输入房间号
5. 4人到齐后开始游戏！

---

## 🔧 常见问题

### Q: 提示"请先配置 PubNub 密钥"
A: 请按照上方步骤，将密钥填入 `js/network.js` 第34-35行

### Q: 连接超时
A:
- 检查网络连接
- 确认密钥正确复制（不要有多余空格）
- 刷新页面重试

### Q: 朋友无法加入
A:
- 确认房间号输入正确
- 确保所有人都使用相同的密钥配置
- 检查 PubNub Dashboard 中的 App 状态

### Q: 游戏中断线
A:
- PubNub 会自动重连
- 如果长时间断开，可能需要刷新页面重新加入房间

---

## 🔒 安全性说明

- 密钥保存在前端代码中，对于免费小游戏是可接受的
- 如果担心滥用，可以在 PubNub Dashboard 中：
  - 设置每秒消息限制（Rate Limiting）
  - 启用 UUID 白名单（Advanced Features）

---

## 📞 需要帮助？

- PubNub 文档：[https://www.pubnub.com/docs/](https://www.pubnub.com/docs/)
- 游戏问题：查看 GitHub Issues 或联系开发者

---

**完成配置后，你就可以和朋友远程联机玩贵州板子了！🎴**
