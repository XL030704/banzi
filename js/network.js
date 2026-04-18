/**
 * 网络通信模块 - 使用 PubNub 实现实时通信
 *
 * 使用方式：
 * 1. 前往 https://www.pubnub.com/ 注册账号（可用邮箱）
 * 2. 创建一个新的 App
 * 3. 获取 Publish Key 和 Subscribe Key 填入下方配置
 * 4. 在 App 设置中启用 "Storage & Playback"（可选，用于消息历史）
 */

class NetworkManager {
    constructor() {
        this.pubnub = null;
        this.roomId = null;
        this.playerId = null;
        this.playerName = '';
        this.position = -1;
        this.isHost = false;
        this.players = [null, null, null, null];
        this.onMessageCallback = null;
        this.onPlayerJoinCallback = null;
        this.onPlayerLeaveCallback = null;
        this.onConnectionReady = null;
        this.subscribed = false;
        this._joinResolve = null;
        this._joinReject = null;
        this._joinTimeout = null;
    }

    // ============================================
    // PubNub 配置 - 请替换为你自己的密钥
    // ============================================
    getPubNubConfig() {
        return {
            // ⚠️ 重要：请替换为你自己的 PubNub 密钥
            // 1. 前往 https://admin.pubnub.com/ 创建账号
            // 2. 创建一个新的 App
            // 3. 复制 Publish Key 和 Subscribe Key 到下面
            publishKey: 'pub-c-e426e521-32f3-4841-b02e-d943c9afa2f3',    // ← 替换为你的 Publish Key
            subscribeKey: 'sub-c-a1282cea-0d93-4bda-8132-c8892e586960', // ← 替换为你的 Subscribe Key

            // 用户唯一标识
            uuid: this.generateId()
        };
    }

    // 生成随机ID
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    // 生成6位房间号
    generateRoomCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // 初始化 PubNub
    initPubNub() {
        return new Promise((resolve, reject) => {
            const config = this.getPubNubConfig();

            // 检查是否已经配置了密钥
            if (config.publishKey === 'your-publish-key' || config.subscribeKey === 'your-subscribe-key') {
                reject(new Error('请先配置 PubNub 密钥。请前往 https://www.pubnub.com 注册并获取密钥。'));
                return;
            }

            this.playerId = config.uuid;
            let isResolved = false;

            try {
                console.log('正在初始化 PubNub...');
                this.pubnub = new PubNub({
                    publishKey: config.publishKey,
                    subscribeKey: config.subscribeKey,
                    uuid: config.uuid
                });

                // 监听连接状态
                this.pubnub.addListener({
                    status: (event) => {
                        console.log('PubNub status:', event.category);
                        if (event.category === 'PNConnectedCategory' && !isResolved) {
                            isResolved = true;
                            console.log('PubNub 已连接');
                            if (this.onConnectionReady) this.onConnectionReady();
                            resolve(this.playerId);
                        }
                    },
                    message: (event) => {
                        this.handleMessage(event.message, event.publisher);
                    }
                });

                // 先订阅一个测试频道来触发连接
                this.pubnub.subscribe({
                    channels: ['test-connection']
                });

                // 超时处理
                setTimeout(() => {
                    if (!isResolved) {
                        console.log('连接超时，但继续尝试...');
                        // 尝试直接使用，不等待连接确认
                        isResolved = true;
                        resolve(this.playerId);
                    }
                }, 5000);

            } catch (err) {
                reject(new Error('初始化网络组件失败: ' + err.message));
            }
        });
    }

    // 订阅房间频道
    subscribeToRoom(roomId) {
        return new Promise((resolve) => {
            const channel = `banzi-room-${roomId}`;

            this.pubnub.subscribe({
                channels: [channel],
                withPresence: true
            });

            this.subscribed = true;
            resolve();
        });
    }

    // 发布消息到房间
    publish(message) {
        const channel = `banzi-room-${this.roomId}`;
        return this.pubnub.publish({
            channel: channel,
            message: {
                ...message,
                senderId: this.playerId,
                timestamp: Date.now()
            }
        });
    }

    // 创建房间
    async createRoom(playerName) {
        this.playerName = playerName;
        this.isHost = true;
        this.roomId = this.generateRoomCode();
        this.position = 0;

        await this.initPubNub();
        await this.subscribeToRoom(this.roomId);

        this.players = [
            { id: this.playerId, name: playerName, position: 0 },
            null, null, null
        ];

        // 广播房间创建消息
        setTimeout(() => {
            this.publish({
                type: 'room_created',
                roomId: this.roomId,
                hostId: this.playerId
            });
        }, 500);

        return this.roomId;
    }

    // 加入房间
    async joinRoom(roomCode, playerName) {
        this.playerName = playerName;
        this.isHost = false;
        this.roomId = roomCode;

        await this.initPubNub();
        await this.subscribeToRoom(this.roomId);

        return new Promise((resolve, reject) => {
            this._joinResolve = resolve;
            this._joinReject = reject;

            // 发送加入请求
            this.publish({
                type: 'join_request',
                playerId: this.playerId,
                playerName: playerName
            });

            // 超时处理
            this._joinTimeout = setTimeout(() => {
                if (this._joinReject) {
                    const rej = this._joinReject;
                    this._joinResolve = null;
                    this._joinReject = null;
                    this._joinTimeout = null;
                    rej(new Error('连接超时，请检查房间号是否正确'));
                }
            }, 10000);
        });
    }

    // 完成加入房间的 Promise
    _finishJoin(resolved, payloadOrError) {
        if (this._joinTimeout) {
            clearTimeout(this._joinTimeout);
            this._joinTimeout = null;
        }
        const resolve = this._joinResolve;
        const reject = this._joinReject;
        this._joinResolve = null;
        this._joinReject = null;
        if (resolved && resolve) resolve(payloadOrError);
        else if (!resolved && reject) reject(payloadOrError);
    }

    // 处理收到的消息
    handleMessage(data, publisherId) {
        // 忽略自己的消息
        if (data.senderId === this.playerId) return;

        console.log('Received message:', data, 'from:', publisherId);

        switch (data.type) {
            case 'join_request':
                if (this.isHost) {
                    this.handleJoinRequest(data);
                }
                break;

            case 'room_info':
                if (!this.isHost && data.targetPlayerId === this.playerId) {
                    this.position = data.yourPosition;
                    this.players = data.players;
                    this._finishJoin(true, {
                        roomId: this.roomId,
                        players: this.players,
                        yourPosition: this.position
                    });
                    if (this.onMessageCallback) {
                        this.onMessageCallback(data);
                    }
                }
                break;

            case 'player_joined':
                if (!this.isHost) {
                    this.players[data.position] = {
                        id: data.playerId,
                        name: data.playerName,
                        position: data.position
                    };
                    if (this.onPlayerJoinCallback) {
                        this.onPlayerJoinCallback(data.position, data.playerName);
                    }
                }
                break;

            case 'join_rejected':
                if (!this.isHost && data.targetPlayerId === this.playerId) {
                    this._finishJoin(false, new Error(data.reason || '房间已满，加入被拒绝'));
                }
                break;

            case 'player_leave':
                this.handlePlayerLeave(data.playerId);
                break;

            case 'game_start':
            case 'sync_state':
            case 'game_action':
            case 'baopai_decision':
            case 'baopai_approved':
            case 'phase_change':
            case 'new_round_started':
            case 'new_game_started':
            case 'start_prepare':
            case 'player_tuoguan':
            case 'reconnect_request':
            case 'reconnect_info':
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                break;
        }
    }

    // 处理加入请求（房主）
    handleJoinRequest(data) {
        const position = this.findEmptyPosition();

        if (position === -1) {
            this.publish({
                type: 'join_rejected',
                targetPlayerId: data.playerId,
                reason: '房间已满'
            });
            return;
        }

        // 添加玩家
        this.players[position] = {
            id: data.playerId,
            name: data.playerName,
            position: position
        };

        // 通知新玩家
        setTimeout(() => {
            this.publish({
                type: 'room_info',
                targetPlayerId: data.playerId,
                roomId: this.roomId,
                players: this.players,
                yourPosition: position
            });
        }, 100);

        // 广播给所有玩家
        setTimeout(() => {
            this.publish({
                type: 'player_joined',
                playerId: data.playerId,
                playerName: data.playerName,
                position: position
            });
        }, 200);

        if (this.onPlayerJoinCallback) {
            this.onPlayerJoinCallback(position, data.playerName);
        }
    }

    // 处理玩家离开
    handlePlayerLeave(playerId) {
        for (let i = 0; i < 4; i++) {
            if (this.players[i] && this.players[i].id === playerId) {
                this.players[i] = null;
                if (this.onPlayerLeaveCallback) {
                    this.onPlayerLeaveCallback(i);
                }
                break;
            }
        }
    }

    // 查找空位置
    findEmptyPosition() {
        for (let i = 0; i < 4; i++) {
            if (!this.players[i]) return i;
        }
        return -1;
    }

    // 发送消息给指定Peer（PubNub中通过channel广播）
    sendToPeer(peerId, data) {
        this.publish(data);
    }

    // 广播消息
    broadcast(data, excludePeerId = null) {
        if (excludePeerId === this.playerId) return;
        this.publish(data);
    }

    // 发送游戏动作
    sendGameAction(action, payload) {
        const data = {
            type: 'game_action',
            action,
            payload,
            from: this.position,
            timestamp: Date.now()
        };

        this.broadcast(data);
    }

    // 房主广播游戏状态
    broadcastGameState(gameState) {
        if (!this.isHost) return;

        this.broadcast({
            type: 'sync_state',
            state: gameState
        });
    }

    // 离开房间
    leaveRoom() {
        if (this.pubnub && this.roomId) {
            // 通知其他玩家
            this.publish({
                type: 'player_leave',
                playerId: this.playerId
            });

            // 取消订阅
            this.pubnub.unsubscribe({
                channels: [`banzi-room-${this.roomId}`]
            });
        }

        this.roomId = null;
        this.position = -1;
        this.isHost = false;
        this.players = [null, null, null, null];
        this.subscribed = false;
    }

    // 获取当前房间玩家数
    getPlayerCount() {
        return this.players.filter(p => p !== null).length;
    }

    // 检查是否可以开始游戏
    canStartGame() {
        return this.getPlayerCount() >= 1;
    }

    // 获取真实玩家数（不含机器人）
    getRealPlayerCount() {
        return this.players.filter(p => p && !p.isRobot).length;
    }

    // 获取机器人数量
    getRobotCount() {
        return this.players.filter(p => p && p.isRobot).length;
    }
}

// 创建全局网络管理器实例
const network = new NetworkManager();

// 加载 PubNub 库
function loadPubNub() {
    return new Promise((resolve, reject) => {
        if (window.PubNub) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.pubnub.com/sdk/javascript/pubnub.4.37.0.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PubNub'));
        document.head.appendChild(script);
    });
}

// 为了兼容性，保留旧函数名
function loadPusher() {
    return loadPubNub();
}

// 模拟网络（单人测试模式）
class MockNetwork {
    constructor() {
        this.roomId = 'TEST01';
        this.position = 0;
        this.isHost = true;
        this.playerName = '玩家1';
        this.players = [
            { id: 'p0', name: '玩家1', position: 0 },
            null, null, null
        ];
        this.onMessageCallback = null;
        this.onPlayerJoinCallback = null;
        this.onConnectionReady = null;
    }

    async createRoom(playerName) {
        this.playerName = playerName;
        this.players[0] = { id: 'p0', name: playerName, position: 0 };
        if (this.onConnectionReady) this.onConnectionReady();
        return this.roomId;
    }

    async joinRoom(roomCode, playerName) {
        this.playerName = playerName;
        if (this.onConnectionReady) this.onConnectionReady();
        return { roomId: roomCode, players: this.players, yourPosition: 1 };
    }

    broadcast(data) {
        // 模拟模式不发送
    }

    sendGameAction(action, payload) {
        // 模拟模式不发送
    }

    leaveRoom() {
        this.players = [null, null, null, null];
    }

    getPlayerCount() {
        return this.players.filter(p => p !== null).length;
    }

    canStartGame() {
        return this.getPlayerCount() >= 1;
    }

    getRealPlayerCount() {
        return this.players.filter(p => p !== null && !p.isRobot).length;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.NetworkManager = NetworkManager;
    window.loadPubNub = loadPubNub;
    window.loadPusher = loadPusher;
    window.network = network;
    window.MockNetwork = MockNetwork;
}
