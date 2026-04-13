/**
 * 贵州板子 - 主入口
 */

// 等待DOM加载
document.addEventListener('DOMContentLoaded', async () => {
    // 加载Pusher
    try {
        await loadPusher();
        console.log('Pusher loaded');
        showToast('网络组件加载成功');
    } catch (err) {
        console.error('Failed to load Pusher:', err);
        showToast('网络组件加载失败，请检查网络后刷新重试');
    }

    // 绑定首页按钮事件
    bindHomeEvents();

    // 绑定房间页按钮事件
    bindRoomEvents();

    // 绑定游戏页按钮事件
    bindGameEvents();

    // 设置网络回调
    setupNetworkCallbacks();

    // 页面加载完成后显示提示
    console.log('贵州板子游戏已加载完成');
});

// 绑定首页事件
function bindHomeEvents() {
    const btnCreate = document.getElementById('btn-create-room');
    const btnJoin = document.getElementById('btn-join-room');
    const btnRules = document.getElementById('btn-rules');
    const joinPanel = document.getElementById('join-room-panel');
    const btnConfirmJoin = document.getElementById('btn-confirm-join');
    const btnCancelJoin = document.getElementById('btn-cancel-join');

    // 检查网络组件是否已加载
    function isNetworkReady() {
        return typeof window.PubNub !== 'undefined' && window.PubNub;
    }

    // 创建房间
    btnCreate.addEventListener('click', async () => {
        // 检查 Pusher 是否加载完成
        if (!isNetworkReady()) {
            showToast('网络组件正在加载，请稍后再试');
            return;
        }

        const name = prompt('请输入您的昵称：')?.trim();
        if (!name) return;

        showToast('正在创建房间，请稍候...');

        try {
            const roomCode = await network.createRoom(name);
            showToast(`房间创建成功: ${roomCode}`);
            showPage('room');
            updateRoomDisplay();
        } catch (err) {
            console.error('创建房间错误:', err);
            let errorMsg = err.message || '未知错误';
            if (errorMsg.includes('配置')) {
                errorMsg = '请先配置 Pusher key（查看 network.js 第 30 行）';
            } else if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                errorMsg = '连接服务器超时，请检查网络后重试';
            } else if (errorMsg.includes('unavailable')) {
                errorMsg = '网络服务不可用，请稍后重试';
            } else if (errorMsg.includes('network')) {
                errorMsg = '网络连接失败，请检查网络设置';
            }
            showToast('创建房间失败: ' + errorMsg);
        }
    });

    // 显示加入房间面板
    btnJoin.addEventListener('click', () => {
        joinPanel.classList.remove('hidden');
    });

    // 取消加入
    btnCancelJoin.addEventListener('click', () => {
        joinPanel.classList.add('hidden');
        document.getElementById('room-code-input').value = '';
        document.getElementById('player-name-input').value = '';
    });

    // 确认加入
    btnConfirmJoin.addEventListener('click', async () => {
        // 检查 Pusher 是否加载完成
        if (!isNetworkReady()) {
            showToast('网络组件正在加载，请稍后再试');
            return;
        }

        const roomCode = document.getElementById('room-code-input').value.trim();
        const playerName = document.getElementById('player-name-input').value.trim();

        if (!roomCode || roomCode.length !== 6) {
            showToast('请输入6位房间号');
            return;
        }
        if (!playerName) {
            showToast('请输入昵称');
            return;
        }

        showToast('正在加入房间，请稍候...');

        try {
            await network.joinRoom(roomCode, playerName);
            showToast('加入成功');
            joinPanel.classList.add('hidden');
            showPage('room');
            updateRoomDisplay();
        } catch (err) {
            console.error('加入房间错误:', err);
            let errorMsg = err.message || '未知错误';
            if (errorMsg.includes('配置')) {
                errorMsg = '请先配置 Pusher key（查看 network.js 第 30 行）';
            } else if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                errorMsg = '连接服务器超时，请检查网络后重试';
            } else if (errorMsg.includes('unavailable')) {
                errorMsg = '网络服务不可用，请稍后重试';
            } else if (errorMsg.includes('Failed')) {
                errorMsg = '无法连接到房主，请检查房间号';
            }
            showToast('加入失败: ' + errorMsg);
        }
    });

    // 规则说明
    btnRules.addEventListener('click', () => {
        document.getElementById('rules-modal').classList.remove('hidden');
    });

    // 关闭规则
    document.getElementById('btn-close-rules').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.add('hidden');
    });

    // 点击弹窗外部关闭
    document.getElementById('rules-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('rules-modal').classList.add('hidden');
        }
    });
}

// 房间中的机器人
let roomRobots = [];

// 绑定房间页事件
function bindRoomEvents() {
    const btnStart = document.getElementById('btn-start-game');
    const btnAddRobot = document.getElementById('btn-add-robot');
    const btnLeave = document.getElementById('btn-leave-room');
    const btnCopy = document.getElementById('btn-copy-code');

    // 复制房间号
    btnCopy.addEventListener('click', () => {
        const code = document.getElementById('room-code-display').textContent;
        navigator.clipboard.writeText(code).then(() => {
            showToast('房间号已复制');
        }).catch(() => {
            showToast('复制失败');
        });
    });

    // 添加机器人
    btnAddRobot.addEventListener('click', () => {
        const emptyPos = findEmptyPositionWithRobots();
        if (emptyPos === -1) {
            showToast('房间已满');
            return;
        }

        const difficulties = ['easy', 'normal', 'hard'];
        const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
        const robot = new RobotPlayer(emptyPos, difficulty);

        roomRobots.push(robot);
        network.players[emptyPos] = {
            id: `robot_${emptyPos}`,
            name: robot.name,
            position: emptyPos,
            isRobot: true
        };

        updateRoomDisplay();
        showToast(`机器人${emptyPos + 1}已加入`);
    });

    // 开始游戏
    btnStart.addEventListener('click', () => {
        const playerCount = network.players.filter(p => p !== null).length;
        if (playerCount < 1) {
            showToast('至少需要1名玩家');
            return;
        }

        // 自动添加机器人补足4人
        while (roomRobots.length + playerCount < 4) {
            const emptyPos = findEmptyPositionWithRobots();
            if (emptyPos === -1) break;

            const difficulty = 'normal';
            const robot = new RobotPlayer(emptyPos, difficulty);
            roomRobots.push(robot);
            network.players[emptyPos] = {
                id: `robot_${emptyPos}`,
                name: robot.name,
                position: emptyPos,
                isRobot: true
            };
        }

        // 将roomRobots转换为按位置索引的数组
        const robotsByPosition = [null, null, null, null];
        for (const robot of roomRobots) {
            if (robot && robot.position >= 0 && robot.position < 4) {
                robotsByPosition[robot.position] = robot;
            }
        }

        // 发送游戏开始消息（包含机器人信息）
        network.broadcast({
            type: 'game_start',
            from: network.position,
            robots: robotsByPosition.map(r => r ? { position: r.position, difficulty: r.difficulty } : null)
        });

        initGame(null, robotsByPosition);
    });

    // 离开房间
    btnLeave.addEventListener('click', () => {
        if (confirm('确定要离开房间吗？')) {
            network.leaveRoom();
            roomRobots = [];
            showPage('home');
        }
    });

    // 点击弹窗外部关闭
    document.getElementById('baopai-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('baopai-modal').classList.add('hidden');
        }
    });
}

// 查找空位置（考虑机器人）
function findEmptyPositionWithRobots() {
    for (let i = 0; i < 4; i++) {
        if (!network.players[i]) return i;
    }
    return -1;
}

// 绑定游戏页事件
function bindGameEvents() {
    const btnPlay = document.getElementById('btn-play-cards');
    const btnPass = document.getElementById('btn-pass');
    const btnRules = document.getElementById('btn-game-rules');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnEndGame = document.getElementById('btn-end-game');
    const btnBackLobbyFinal = document.getElementById('btn-back-lobby-final');
    const btnViewHistory = document.getElementById('btn-view-history');
    const btnCloseHistory = document.getElementById('btn-close-history');

    // 出牌
    btnPlay.addEventListener('click', playCards);

    // 不要
    btnPass.addEventListener('click', pass);

    // 游戏规则
    btnRules.addEventListener('click', () => {
        document.getElementById('rules-modal').classList.remove('hidden');
    });

    // 再来一局
    btnPlayAgain.addEventListener('click', () => {
        if (typeof playAgain === 'function') {
            playAgain();
        }
    });

    // 结束游戏
    btnEndGame.addEventListener('click', () => {
        if (typeof showFinalGameResult === 'function') {
            showFinalGameResult();
        }
    });

    // 最终结算 - 返回大厅
    btnBackLobbyFinal.addEventListener('click', () => {
        document.getElementById('final-result-modal').classList.add('hidden');
        network.leaveRoom();
        showPage('home');
    });

    // 查看分数记录
    btnViewHistory.addEventListener('click', () => {
        document.getElementById('final-result-modal').classList.add('hidden');
        showHistoryModal();
    });

    // 关闭历史记录
    btnCloseHistory.addEventListener('click', () => {
        document.getElementById('history-modal').classList.add('hidden');
    });

    // 点击弹窗外部关闭
    document.getElementById('history-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('history-modal').classList.add('hidden');
        }
    });
}

// 设置网络回调
function setupNetworkCallbacks() {
    // 连接就绪
    network.onConnectionReady = () => {
        console.log('Network ready');
    };

    // 玩家加入
    network.onPlayerJoinCallback = (position, name) => {
        updateRoomDisplay();
        showToast(`${name} 加入了房间`);
    };

    // 玩家离开
    network.onPlayerLeaveCallback = (position) => {
        updateRoomDisplay();
    };

    // 接收消息
    network.onMessageCallback = (data) => {
        handleNetworkMessage(data);
    };
}

// 处理网络消息
function handleNetworkMessage(data) {
    switch (data.type) {
        case 'game_start':
            if (!network.isHost) {
                // 非主机：准备机器人数据，等待 sync_state 来初始化游戏
                let robotsArray = [null, null, null, null];
                if (data.robots) {
                    robotsArray = data.robots.map(r => r ? new RobotPlayer(r.position, r.difficulty) : null);
                }
                // 临时存储机器人，等 sync_state 时使用
                window.pendingRobots = robotsArray;
                showToast('游戏开始，等待同步...');
            }
            break;

        case 'sync_state':
            if (!network.isHost && data.state) {
                // 同步游戏状态
                if (!gameState) {
                    gameState = new GameState();
                }
                Object.assign(gameState, data.state);

                // 使用暂存的机器人数据或从状态重建
                if (window.pendingRobots) {
                    gameState.robots = window.pendingRobots;
                    window.pendingRobots = null;
                } else if (data.state.robots) {
                    gameState.robots = data.state.robots.map(r =>
                        r ? new RobotPlayer(r.position, r.difficulty) : null
                    );
                }

                // 显示游戏页面
                showPage('game');

                // 如果处于包牌阶段，显示包牌弹窗
                if (gameState.phase === 'baopai') {
                    showBaopaiModal();
                }

                // 更新界面
                updateGameDisplay();

                // 如果当前轮到机器人出牌，触发它
                if (gameState.phase === 'playing' && gameState.robots[gameState.currentPlayer]) {
                    setTimeout(() => robotPlay(gameState.currentPlayer), 1000);
                }
            }
            break;

        case 'game_action':
            handleGameAction(data.action, data.payload, data.from);
            break;

        case 'baopai_decision':
            // 同步包牌决定
            handleBaopaiDecision(data.from, data.payload.decision);
            break;

        case 'baopai_approved':
            gameState.baopaiPlayer = data.player;
            gameState.teams = data.teams || [1, 1, 1, 1];
            gameState.teams[data.player] = 0;
            gameState.multiplier = data.multiplier || 2;
            gameState.multiplierReasons = data.multiplierReasons || ['包牌×2'];
            gameState.phase = 'playing';
            gameState.currentPlayer = data.player;
            showToast(`${network.players[data.player]?.name || '玩家'} 包牌成功！1 VS 3`);
            updateGameDisplay();
            break;

        case 'phase_change':
            // 处理阶段转换（包牌->喊牌）
            if (data.phase === 'calling') {
                gameState.phase = 'calling';
                gameState.spade7Holder = data.spade7Holder;
                gameState.currentPlayer = data.spade7Holder;
                showToast('无人包牌，进入喊牌阶段');
                updateGameDisplay();

                // 如果自己是黑桃7持有者，显示喊牌弹窗
                if (gameState.spade7Holder === network.position) {
                    setTimeout(() => showCallCardModal(), 500);
                }
            }
            break;
    }
}

// 处理游戏动作
function handleGameAction(action, payload, from) {
    if (from === network.position) return; // 忽略自己的动作

    switch (action) {
        case 'call_card':
            handleCallCard(from, payload.suit, payload.rank);
            break;

        case 'play_cards':
            handlePlayCards(from, payload.cards);
            // 延迟检查是否需要机器人行动
            setTimeout(() => {
                if (window.gameState && window.gameState.phase === 'playing' &&
                    window.gameState.robots && window.gameState.robots[window.gameState.currentPlayer]) {
                    window.robotPlay(window.gameState.currentPlayer);
                }
            }, 500);
            break;

        case 'pass':
            handlePass(from);
            // 延迟检查是否需要机器人行动
            setTimeout(() => {
                if (window.gameState && window.gameState.phase === 'playing' &&
                    window.gameState.robots && window.gameState.robots[window.gameState.currentPlayer]) {
                    window.robotPlay(window.gameState.currentPlayer);
                }
            }, 500);
            break;

        case 'baopai_request':
            if (window.handleBaopaiRequest) {
                window.handleBaopaiRequest(from);
            }
            break;
    }
}

// 测试模式（单人开发测试）
function enableTestMode() {
    window.network = new MockNetwork();
    // 重置房间机器人数组
    roomRobots = [];

    // 添加3个机器人到网络玩家列表
    for (let i = 1; i <= 3; i++) {
        const robot = new RobotPlayer(i, 'normal');
        roomRobots.push(robot);
        network.players[i] = {
            id: `robot_${i}`,
            name: robot.name,
            position: i,
            isRobot: true
        };
    }

    updateRoomDisplay();
    showToast('测试模式已启用（带3个机器人）按 Ctrl+T 切换');
}

// 快捷键
document.addEventListener('keydown', (e) => {
    // Ctrl+T 开启测试模式
    if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        enableTestMode();
    }
});
