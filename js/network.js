/**
 * 网络通信模块 - 使用 PeerJS 实现 P2P 通信
 */

class NetworkManager {
    constructor() {
        this.peer = null;
        this.connections = []; // 与其他玩家的连接
        this.roomId = null;
        this.playerId = null;
        this.playerName = '';
        this.position = -1; // 玩家在房间中的位置
        this.isHost = false;
        this.players = []; // [null, null, null, null] 每个位置的玩家信息
        this.onMessageCallback = null;
        this.onPlayerJoinCallback = null;
        this.onPlayerLeaveCallback = null;
        this.onConnectionReady = null;
    }

    // 生成随机ID
    generateId() {
        return Math.random().toString(36).substring(2, 10);
    }

    // 生成6位房间号
    generateRoomCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // 初始化 Peer
    initPeer(customId = null) {
        return new Promise((resolve, reject) => {
            this.playerId = customId || this.generateId();

            // 使用多个可用的 PeerJS 服务器
            const peerOptions = {
                host: '0.peerjs.com',
                port: 443,
                secure: true,
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            };

            console.log('Connecting to PeerJS with ID:', this.playerId);
            this.peer = new Peer(this.playerId, peerOptions);

            // 连接超时处理
            const timeout = setTimeout(() => {
                reject(new Error('连接服务器超时，请检查网络'));
            }, 15000);

            this.peer.on('open', (id) => {
                clearTimeout(timeout);
                console.log('Peer connected with ID:', id);
                this.playerId = id;
                if (this.onConnectionReady) this.onConnectionReady();
                resolve(id);
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Peer error:', err);
                reject(err);
            });

            // 监听其他玩家的连接
            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });
        });
    }

    // 处理传入的连接
    handleIncomingConnection(conn) {
        console.log('Incoming connection from:', conn.peer);

        conn.on('open', () => {
            this.connections.push(conn);

            // 如果是房主，发送房间信息给新玩家
            if (this.isHost) {
                this.sendToPeer(conn.peer, {
                    type: 'room_info',
                    roomId: this.roomId,
                    players: this.players,
                    yourPosition: this.findEmptyPosition()
                });
            }
        });

        conn.on('data', (data) => {
            this.handleMessage(data, conn.peer);
        });

        conn.on('close', () => {
            this.removeConnection(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.removeConnection(conn.peer);
        });
    }

    // 查找空位置
    findEmptyPosition() {
        for (let i = 0; i < 4; i++) {
            if (!this.players[i]) return i;
        }
        return -1;
    }

    // 移除连接
    removeConnection(peerId) {
        const index = this.connections.findIndex(c => c.peer === peerId);
        if (index !== -1) {
            this.connections.splice(index, 1);
        }

        // 更新玩家列表
        for (let i = 0; i < 4; i++) {
            if (this.players[i] && this.players[i].id === peerId) {
                this.players[i] = null;
                if (this.onPlayerLeaveCallback) {
                    this.onPlayerLeaveCallback(i);
                }
                break;
            }
        }
    }

    // 创建房间
    async createRoom(playerName) {
        this.playerName = playerName;
        this.isHost = true;
        this.roomId = this.generateRoomCode();
        this.position = 0;

        await this.initPeer(this.roomId + '_host');

        this.players = [
            { id: this.playerId, name: playerName, position: 0 },
            null, null, null
        ];

        return this.roomId;
    }

    // 加入房间
    async joinRoom(roomCode, playerName) {
        this.playerName = playerName;
        this.isHost = false;
        this.roomId = roomCode;

        await this.initPeer();

        // 连接到房主
        const hostId = roomCode + '_host';
        return new Promise((resolve, reject) => {
            const conn = this.peer.connect(hostId, {
                reliable: true,
                serialization: 'json'
            });

            conn.on('open', () => {
                this.connections.push(conn);

                // 发送加入请求
                this.sendToPeer(hostId, {
                    type: 'join_request',
                    playerId: this.playerId,
                    playerName: playerName
                });
            });

            conn.on('data', (data) => {
                if (data.type === 'room_info') {
                    this.position = data.yourPosition;
                    this.players = data.players;
                    this.players[this.position] = {
                        id: this.playerId,
                        name: playerName,
                        position: this.position
                    };

                    // 连接到其他玩家
                    this.connectToOtherPlayers();
                    resolve(data);
                } else if (data.type === 'join_rejected') {
                    reject(new Error(data.reason || '房间已满'));
                } else {
                    this.handleMessage(data, conn.peer);
                }
            });

            conn.on('error', (err) => {
                reject(err);
            });

            // 超时处理
            setTimeout(() => {
                if (this.position === -1) {
                    reject(new Error('连接超时，请检查房间号'));
                }
            }, 10000);
        });
    }

    // 连接到其他玩家
    connectToOtherPlayers() {
        for (const player of this.players) {
            if (player && player.id !== this.playerId) {
                this.connectToPeer(player.id);
            }
        }
    }

    // 连接到指定Peer
    connectToPeer(peerId) {
        if (this.connections.some(c => c.peer === peerId)) return;

        const conn = this.peer.connect(peerId, {
            reliable: true,
            serialization: 'json'
        });

        conn.on('open', () => {
            console.log('Connected to:', peerId);
            this.connections.push(conn);
        });

        conn.on('data', (data) => {
            this.handleMessage(data, peerId);
        });

        conn.on('close', () => {
            this.removeConnection(peerId);
        });

        conn.on('error', (err) => {
            console.error('Connection error to', peerId, ':', err);
            this.removeConnection(peerId);
        });
    }

    // 处理消息
    handleMessage(data, fromPeerId) {
        console.log('Received message:', data, 'from:', fromPeerId);

        switch (data.type) {
            case 'join_request':
                if (this.isHost) {
                    this.handleJoinRequest(data);
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

            case 'game_start':
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                break;

            case 'game_action':
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                break;

            case 'sync_state':
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
                break;

            default:
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
        }
    }

    // 处理加入请求（房主）
    handleJoinRequest(data) {
        const position = this.findEmptyPosition();

        if (position === -1) {
            this.sendToPeer(data.playerId, {
                type: 'join_rejected',
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
        this.sendToPeer(data.playerId, {
            type: 'room_info',
            roomId: this.roomId,
            players: this.players,
            yourPosition: position
        });

        // 广播给所有玩家
        this.broadcast({
            type: 'player_joined',
            playerId: data.playerId,
            playerName: data.playerName,
            position: position
        }, data.playerId);

        if (this.onPlayerJoinCallback) {
            this.onPlayerJoinCallback(position, data.playerName);
        }
    }

    // 发送消息给指定Peer
    sendToPeer(peerId, data) {
        const conn = this.connections.find(c => c.peer === peerId);
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    // 广播消息
    broadcast(data, excludePeerId = null) {
        for (const conn of this.connections) {
            if (conn.open && conn.peer !== excludePeerId) {
                conn.send(data);
            }
        }
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

        if (this.isHost) {
            this.broadcast(data);
        } else {
            // 发送给房主，由房主广播
            const hostConn = this.connections.find(c => c.peer === this.roomId + '_host');
            if (hostConn) {
                hostConn.send(data);
            }
        }
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
        for (const conn of this.connections) {
            conn.close();
        }
        this.connections = [];

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.roomId = null;
        this.position = -1;
        this.isHost = false;
        this.players = [];
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

// 加载 PeerJS 库
function loadPeerJS() {
    return new Promise((resolve, reject) => {
        if (window.Peer) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PeerJS'));
        document.head.appendChild(script);
    });
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.NetworkManager = NetworkManager;
    window.loadPeerJS = loadPeerJS;
    window.network = network;
    window.MockNetwork = MockNetwork;
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
