/**
 * UI 交互模块
 */

// 全局游戏状态
let gameState = null;
let selectedCards = [];
let myPosition = -1;
let isHost = false;

// 出牌音效（基于 Web Audio API，无需外部文件）
let _audioCtx = null;
function playCardSound() {
    try {
        if (!_audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            _audioCtx = new AudioCtx();
        }
        const ctx = _audioCtx;
        const now = ctx.currentTime;

        // 模拟欢乐斗地主出牌声："嗖"一下滑出 + 轻微"啪"的落点
        // 核心：带通滤波的白噪声，频率从高到低快速扫过 => 类似纸牌划过的摩擦声
        const duration = 0.11;
        const sr = ctx.sampleRate;
        const bufSize = Math.floor(sr * duration);
        const noiseBuf = ctx.createBuffer(1, bufSize, sr);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;

        // 带通滤波，频率从 4500Hz 快速扫到 900Hz，形成 "whoosh" 效果
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(4500, now);
        bp.frequency.exponentialRampToValueAtTime(900, now + duration);

        // 高通进一步去掉低频闷响
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 600;

        // 包络：快速起音 + 平滑衰减
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.008);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(bp);
        bp.connect(hp);
        hp.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + duration);

        // 尾部轻微"嗒"一下落点（低频短脉冲）
        const clickDelay = 0.055;
        const clickDur = 0.03;
        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();
        click.type = 'sine';
        click.frequency.setValueAtTime(220, now + clickDelay);
        click.frequency.exponentialRampToValueAtTime(90, now + clickDelay + clickDur);
        clickGain.gain.setValueAtTime(0.0001, now + clickDelay);
        clickGain.gain.linearRampToValueAtTime(0.12, now + clickDelay + 0.003);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + clickDelay + clickDur);
        click.connect(clickGain).connect(ctx.destination);
        click.start(now + clickDelay);
        click.stop(now + clickDelay + clickDur);
    } catch (e) {
        // 忽略音效错误，不影响游戏
    }
}

// DOM 元素
const pages = {
    home: document.getElementById('home-page'),
    room: document.getElementById('room-page'),
    game: document.getElementById('game-page')
};

// 显示页面
function showPage(pageName) {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    pages[pageName].classList.add('active');
}

// 显示提示
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// 更新房间显示
function updateRoomDisplay() {
    const roomCode = document.getElementById('room-code-display');
    const seats = document.querySelectorAll('.seat');
    const btnStart = document.getElementById('btn-start-game');
    const btnAddRobot = document.getElementById('btn-add-robot');

    if (network.roomId) {
        roomCode.textContent = network.roomId;
    }

    // 更新座位
    for (let i = 0; i < 4; i++) {
        const seat = seats[i];
        const player = network.players[i];

        seat.classList.remove('occupied', 'me', 'robot');

        if (player) {
            seat.classList.add('occupied');
            if (i === network.position) seat.classList.add('me');
            if (player.isRobot) seat.classList.add('robot');

            seat.querySelector('.seat-name').textContent = player.name;
            seat.querySelector('.seat-status').textContent = player.isRobot ? '🤖 机器人' : (i === 0 ? '房主' : '已加入');
            seat.querySelector('.seat-avatar').textContent = player.isRobot ? '🤖' : player.name.charAt(0).toUpperCase();
        } else {
            seat.querySelector('.seat-name').textContent = '空位';
            seat.querySelector('.seat-status').textContent = '等待中';
            seat.querySelector('.seat-avatar').textContent = '?';
        }
    }

    // 显示/隐藏按钮
    const playerCount = network.players.filter(p => p && !p.isRobot).length;
    const robotCount = network.players.filter(p => p && p.isRobot).length;
    const totalCount = playerCount + robotCount;

    if (network.position === 0 || network.position === -1) {
        // 房主或单机模式
        btnStart.classList.remove('hidden');
        btnAddRobot.classList.remove('hidden');
        // 至少1人就可以开始，会自动添加机器人
        btnStart.disabled = playerCount < 1;

        // 更新提示
        const robotInfo = document.getElementById('robot-info');
        if (totalCount < 4) {
            robotInfo.textContent = `当前${totalCount}/4人，点击"添加机器人"或"开始游戏"自动补足`;
        } else {
            robotInfo.textContent = '人数已满，可以开始游戏';
        }
    } else {
        btnStart.classList.add('hidden');
        btnAddRobot.classList.add('hidden');
    }
}

// 更新游戏界面
function updateGameDisplay() {
    if (!gameState) return;

    // 更新房间号和底分
    document.getElementById('game-room-code').textContent = network.roomId || '------';
    document.getElementById('base-score').textContent = gameState.baseScore;

    // 更新翻倍显示
    const multiplierDisplay = document.getElementById('multiplier-display');
    if (gameState.multiplier > 1) {
        multiplierDisplay.textContent = `×${gameState.multiplier}`;
    } else {
        multiplierDisplay.textContent = '';
    }

    // 更新喊牌显示
    const calledCardDisplay = document.getElementById('called-card-display');
    if (gameState.calledCard) {
        calledCardDisplay.textContent = `喊牌: ${SUIT_SYMBOLS[gameState.calledCard.suit]}${gameState.calledCard.rank}`;
        calledCardDisplay.classList.remove('hidden');
    } else if (gameState.baopaiPlayer !== -1) {
        calledCardDisplay.textContent = '包牌局 (1v3)';
        calledCardDisplay.classList.remove('hidden');
    } else {
        calledCardDisplay.classList.add('hidden');
    }

    // 更新其他玩家信息
    updatePlayerInfo(1, (network.position + 1) % 4);
    updatePlayerInfo(2, (network.position + 2) % 4);
    updatePlayerInfo(3, (network.position + 3) % 4);

    // 更新我的信息
    document.getElementById('my-name').textContent = network.playerName || '我';
    document.getElementById('my-card-count').textContent = `${gameState.hands[network.position].length}张`;

    // 更新黑桃7标识
    const mySpade7Badge = document.getElementById('spade7-badge');
    if (gameState.spade7Holder === network.position) {
        mySpade7Badge.classList.remove('hidden');
    } else {
        mySpade7Badge.classList.add('hidden');
    }

    // 更新被喊牌标识（如果已经被打出）
    updateCalledCardIndicators();

    // 更新手牌显示
    updateMyHand();

    // 更新桌面牌区
    updatePlayedCards();

    // 更新回合指示
    updateTurnIndicator();

    // 更新按钮状态
    updateActionButtons();

    // 如果是包牌阶段，确保弹窗显示
    if (gameState.phase === 'baopai' && !document.getElementById('baopai-modal').classList.contains('hidden')) {
        // 已经在显示了
    }
}

// 更新玩家信息
function updatePlayerInfo(elementIndex, playerIndex) {
    const playerElements = [
        null,
        document.querySelector('.player-left'),
        document.querySelector('.player-top'),
        document.querySelector('.player-right')
    ];

    const el = playerElements[elementIndex];
    if (!el) return;

    const player = network.players[playerIndex];
    const infoEl = el.querySelector('.player-info');

    // 同步 data-player 属性
    el.dataset.player = playerIndex;

    if (player) {
        el.querySelector('.player-name').textContent = player.name;
        el.querySelector('.player-cards').textContent = `${gameState.hands[playerIndex].length}张`;
        el.querySelector('.player-avatar').textContent = player.name.charAt(0).toUpperCase();

        // 高亮当前玩家头像
        const isMyTurn = gameState.phase === 'playing' && gameState.currentPlayer === playerIndex;
        if (isMyTurn) {
            infoEl.classList.add('active');
        } else {
            infoEl.classList.remove('active');
        }

        // 时钟徽章（轮到该玩家出牌时显示）
        const clockEl = el.querySelector('.turn-clock');
        if (clockEl) {
            clockEl.classList.toggle('hidden', !isMyTurn);
        }

        // 黑桃7标识
        const spade7Indicator = el.querySelector('.spade7-indicator');
        if (spade7Indicator) {
            spade7Indicator.classList.toggle('hidden', gameState.spade7Holder !== playerIndex);
        }

        // 托管标识
        const tuoguanBadge = el.querySelector('.tuoguan-badge');
        if (tuoguanBadge) {
            tuoguanBadge.classList.toggle('hidden', !player.isTuoguan);
        }
    }
}

// 更新我的手牌显示
function updateMyHand() {
    const handEl = document.getElementById('my-hand');
    handEl.innerHTML = '';

    // 复制并反转手牌（从小到大排序，小的在左边）
    const myHand = [...gameState.hands[network.position]].reverse();

    for (const card of myHand) {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.suit}`;
        cardEl.dataset.suit = card.suit;
        cardEl.dataset.rank = card.rank;
        cardEl.dataset.value = card.value;

        cardEl.innerHTML = `
            <div class="card-rank">${card.rank}</div>
            <div class="card-suit">${SUIT_SYMBOLS[card.suit]}</div>
        `;

        cardEl.addEventListener('click', () => toggleCardSelection(card, cardEl));
        handEl.appendChild(cardEl);
    }
}

// 切换牌选择
function toggleCardSelection(card, cardEl) {
    const index = selectedCards.findIndex(c =>
        c.suit === card.suit && c.rank === card.rank
    );

    if (index === -1) {
        selectedCards.push(card);
        cardEl.classList.add('selected');
    } else {
        selectedCards.splice(index, 1);
        cardEl.classList.remove('selected');
    }

    updateActionButtons();
}

// 更新桌面牌区
function updatePlayedCards() {
    const area = document.getElementById('played-cards-area');
    area.innerHTML = '';

    // 显示当前回合出的牌
    for (const play of gameState.currentRoundCards) {
        const playEl = document.createElement('div');
        playEl.className = 'play-group';
        playEl.style.cssText = 'display: flex; flex-direction: column; align-items: center; margin: 3px; padding: 4px 6px; background: rgba(0,0,0,0.2); border-radius: 6px;';

        // 获取玩家名称
        const player = network.players[play.player];
        const playerName = player ? player.name : `玩家${play.player + 1}`;

        // 创建玩家名称标签
        const nameEl = document.createElement('div');
        nameEl.className = 'play-group-label';
        nameEl.textContent = playerName;
        nameEl.style.cssText = 'color: #ffd700; font-size: 11px; margin-bottom: 3px; font-weight: bold; line-height: 1;';
        playEl.appendChild(nameEl);

        // 创建牌组容器
        const cardsEl = document.createElement('div');
        cardsEl.style.cssText = 'display: flex;';

        // 桌面上的牌也按从小到大显示，叠放显示（只露出左侧数字/花色）
        const sortedCards = [...play.cards].sort((a, b) => a.value - b.value);
        for (let i = 0; i < sortedCards.length; i++) {
            const card = sortedCards[i];
            const cardEl = document.createElement('div');
            cardEl.className = `card ${card.suit}`;
            // 第一张正常显示，后续每张向左压盖，只露出左上角数字+花色（约 22px）
            const overlap = i === 0 ? '0' : 'calc(var(--card-width) * -1 + 22px)';
            cardEl.style.cssText = `width: var(--card-width); height: var(--card-height); margin-left: ${overlap}; position: relative; z-index: ${i};`;
            cardEl.innerHTML = `
                <div class="card-rank">${card.rank}</div>
                <div class="card-suit">${SUIT_SYMBOLS[card.suit]}</div>
            `;
            cardsEl.appendChild(cardEl);
        }
        playEl.appendChild(cardsEl);

        area.appendChild(playEl);
    }
}

// 更新回合指示
// 记录上一次是谁的回合，用于检测切换并播放语音
let _lastTurnPlayer = -1;

function updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    const myClockEl = document.getElementById('my-turn-clock');

    if (gameState.phase === 'baopai') {
        indicator.textContent = '🎲 包牌阶段';
        if (myClockEl) myClockEl.classList.add('hidden');
    } else if (gameState.phase === 'calling') {
        if (gameState.spade7Holder === network.position) {
            indicator.textContent = '📢 请喊牌选择队友';
        } else {
            indicator.textContent = '🃏 喊牌中...';
        }
        if (myClockEl) myClockEl.classList.add('hidden');
    } else if (gameState.phase === 'playing') {
        const isMyTurn = gameState.currentPlayer === network.position;
        if (isMyTurn) {
            indicator.textContent = '⏰ 轮到你出牌！';
            if (myClockEl) myClockEl.classList.remove('hidden');
            // 刚切换到我的回合时播放语音（每回合仅播一次）
            if (_lastTurnPlayer !== network.position && window.GameAudio) {
                GameAudio.playYourTurn();
            }
        } else {
            const player = network.players[gameState.currentPlayer];
            indicator.textContent = `${player ? player.name : '玩家'} 出牌中`;
            if (myClockEl) myClockEl.classList.add('hidden');
            // 回合换人，重置语音防抖
            if (window.GameAudio) GameAudio.resetYourTurn();
        }
        _lastTurnPlayer = gameState.currentPlayer;
    } else {
        indicator.textContent = '游戏结束';
        if (myClockEl) myClockEl.classList.add('hidden');
    }
}

// 更新操作按钮
function updateActionButtons() {
    const btnPlay = document.getElementById('btn-play-cards');
    const btnPass = document.getElementById('btn-pass');

    if (!gameState || !btnPlay || !btnPass) return;

    const isMyTurn = gameState.currentPlayer === network.position;
    const hasSelected = selectedCards.length > 0;

    console.log('updateActionButtons:', { isMyTurn, hasSelected, currentPlayer: gameState.currentPlayer, myPosition: network.position, selectedCardsCount: selectedCards.length });

    // 检查是否可以出牌
    let canPlay = false;
    if (isMyTurn && hasSelected) {
        // 检查选中的牌是否构成有效牌型
        const currentHandType = analyzeHand(selectedCards);
        console.log('analyzeHand result:', currentHandType, 'selectedCards:', selectedCards);

        if (!currentHandType) {
            canPlay = false;
            console.log('canPlay = false: currentHandType is null');
        } else {
            const lastHand = gameState.currentRoundCards.length > 0
                ? analyzeHand(gameState.currentRoundCards[gameState.currentRoundCards.length - 1].cards)
                : null;

            console.log('lastHand:', lastHand, 'currentRoundCards:', gameState.currentRoundCards);

            if (!lastHand) {
                // 新的一轮开始，可以出任意有效牌型（第一轮也不强制黑桃7）
                canPlay = true;
                console.log('canPlay = true: new round');
            } else {
                // 需要压牌
                canPlay = window.compareHands(lastHand, currentHandType);
                console.log('canPlay from compareHands:', canPlay);
            }
        }
    }

    console.log('Final canPlay:', canPlay);
    btnPlay.disabled = !canPlay;

    // 是否可以不要
    const canPass = isMyTurn &&
                    gameState.currentRoundCards.length > 0 &&
                    gameState.currentRoundCards[gameState.currentRoundCards.length - 1].player !== network.position;
    btnPass.disabled = !canPass;
}

// 显示喊牌弹窗
function showCallCardModal() {
    const modal = document.getElementById('call-card-modal');
    const suitGroup = document.getElementById('call-suit');
    const rankGroup = document.getElementById('call-rank');
    const errorEl = document.getElementById('call-error');

    modal.classList.remove('hidden');
    errorEl.textContent = '';

    const myHand = gameState.hands[network.position];
    const hasFourTwos = countTwos(myHand) === 4;

    // 构造点数按钮：默认只能喊 2；当持有全部 4 张 2 时，只能喊 A
    const rankOptions = hasFourTwos ? ['A'] : ['2'];
    rankGroup.innerHTML = rankOptions
        .map(r => `<button type="button" class="option-btn" data-value="${r}">${r}</button>`)
        .join('');

    // 当前选择（默认第一项）
    let selectedSuit = 'spade';
    let selectedRank = rankOptions[0];

    // 为按钮组绑定点击事件：点击即选中，清除同组其它选中态
    function bindGroup(groupEl, onSelect) {
        const btns = groupEl.querySelectorAll('.option-btn');
        btns.forEach(b => {
            b.onclick = () => {
                btns.forEach(x => x.classList.remove('selected'));
                b.classList.add('selected');
                onSelect(b.dataset.value);
                validateCall();
            };
        });
        // 默认选中第一个
        if (btns.length > 0) {
            btns[0].classList.add('selected');
        }
    }

    bindGroup(suitGroup, v => { selectedSuit = v; });
    bindGroup(rankGroup, v => { selectedRank = v; });

    function validateCall() {
        if (hasCard(myHand, selectedSuit, selectedRank)) {
            errorEl.textContent = `你不能喊自己有的牌（${SUIT_SYMBOLS[selectedSuit]}${selectedRank}）`;
            return false;
        }
        errorEl.textContent = '';
        return true;
    }

    validateCall();

    document.getElementById('btn-confirm-call').onclick = () => {
        if (validateCall()) {
            modal.classList.add('hidden');
            network.sendGameAction('call_card', { suit: selectedSuit, rank: selectedRank });
            handleCallCard(network.position, selectedSuit, selectedRank);
        }
    };
}

// 处理喊牌
function handleCallCard(playerIndex, suit, rank) {
    gameState.calledCard = { suit, rank };

    // 确定队伍
    const result = determineTeams(gameState.hands, gameState.spade7Holder, suit, rank);
    gameState.teams = result.teams;

    showToast(`${network.players[playerIndex]?.name || '玩家'} 喊了 ${SUIT_SYMBOLS[suit]}${rank}`);

    // 开始游戏
    gameState.phase = 'playing';
    gameState.currentPlayer = gameState.spade7Holder;

    updateGameDisplay();

    // 如果黑桃7持有者是机器人，触发它出牌
    if (gameState.robots[gameState.spade7Holder]) {
        setTimeout(() => robotPlay(gameState.spade7Holder), 1000);
    }
}

// 显示收牌提示
function showCollectModal(playerIndex, cardCount) {
    const modal = document.getElementById('collect-modal');
    const player = network.players[playerIndex];

    document.getElementById('collect-player').textContent = player ? player.name : '玩家';
    document.getElementById('collect-count').textContent = cardCount;

    modal.classList.remove('hidden');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 1500);
}

// 显示结算弹窗
function showResultModal(result) {
    const modal = document.getElementById('result-modal');
    const content = document.getElementById('result-content');

    // 累加分数到总分
    gameState.roundCount++;
    for (let i = 0; i < 4; i++) {
        gameState.totalScores[i] += result.scores[i];
    }

    // 保存本局历史
    gameState.roundHistory.push({
        round: gameState.roundCount,
        scores: [...result.scores],
        finishOrder: [...result.finishOrder],
        teams: [...gameState.teams],
        baopaiPlayer: gameState.baopaiPlayer,
        isDoubleWin: result.isDoubleWin
    });

    // 保存分数到本地存储
    saveScoreHistory(result);

    // 构建结果显示
    let html = `
        <div class="round-info">第 ${gameState.roundCount} 局</div>
        <div class="result-section">
            <h4>出完顺序</h4>
            <div class="finish-order">
    `;

    for (let i = 0; i < result.finishOrder.length; i++) {
        const playerIdx = result.finishOrder[i];
        const player = network.players[playerIdx];
        html += `<span class="rank-${i}">${i + 1}. ${player ? player.name : '玩家' + (playerIdx + 1)}</span> `;
    }

    html += '</div></div>';

    // 队伍收牌
    html += `
        <div class="result-section">
            <h4>收牌统计</h4>
            <table class="result-table">
                <tr>
                    <th>队伍</th>
                    <th>玩家</th>
                    <th>收牌数</th>
                </tr>
    `;

    for (let i = 0; i < 4; i++) {
        const player = network.players[i];
        const team = gameState.teams[i];
        html += `
            <tr>
                <td>${team === 0 ? 'A队' : 'B队'}</td>
                <td>${player ? player.name : '玩家' + (i + 1)}</td>
                <td>${gameState.collectedCards[i].length}</td>
            </tr>
        `;
    }

    html += '</table></div>';

    // 翻倍信息
    if (result.multiplierReasons.length > 0) {
        html += `
            <div class="multiplier-info">
                <strong>翻倍:</strong> ${result.multiplierReasons.join(' + ')}
                <br>最终倍数: ×${result.multiplier}
            </div>
        `;
    }

    // 分数变化 - 显示本局得分和累计得分
    html += `
        <div class="result-section">
            <h4>分数结算</h4>
            <table class="result-table">
                <tr>
                    <th>玩家</th>
                    <th>本局得分</th>
                    <th>累计得分</th>
                </tr>
    `;

    for (let i = 0; i < 4; i++) {
        const player = network.players[i];
        const score = result.scores[i];
        const totalScore = gameState.totalScores[i];
        const scoreClass = score > 0 ? 'winner' : (score < 0 ? 'loser' : '');
        const totalClass = totalScore > 0 ? 'winner' : (totalScore < 0 ? 'loser' : '');
        html += `
            <tr>
                <td>${player ? player.name : '玩家' + (i + 1)}</td>
                <td class="${scoreClass}">${score > 0 ? '+' : ''}${score}</td>
                <td class="${totalClass}">${totalScore > 0 ? '+' : ''}${totalScore}</td>
            </tr>
        `;
    }

    html += '</table></div>';

    content.innerHTML = html;
    modal.classList.remove('hidden');

    // 根据是否房主显示不同按钮
    const btnPlay = document.getElementById('btn-play-again');
    const btnReady = document.getElementById('btn-ready-next');
    const btnNewGame = document.getElementById('btn-new-game');
    const readyStatus = document.getElementById('ready-status');
    if (network.isHost) {
        btnPlay.classList.remove('hidden');
        btnReady.classList.add('hidden');
        btnNewGame.classList.remove('hidden');
        if (readyStatus) readyStatus.classList.add('hidden');
    } else {
        btnPlay.classList.add('hidden');
        btnReady.classList.remove('hidden');
        btnReady.disabled = true; // 等待房主发起才能点准备
        btnReady.textContent = '等待房主...';
        btnNewGame.classList.add('hidden');
    }
}

// 保存分数历史
function saveScoreHistory(result) {
    let history = JSON.parse(localStorage.getItem('banzi_scores') || '{}');

    for (let i = 0; i < 4; i++) {
        const player = network.players[i];
        if (player) {
            if (!history[player.name]) {
                history[player.name] = 0;
            }
            history[player.name] += result.scores[i];
        }
    }

    localStorage.setItem('banzi_scores', JSON.stringify(history));
}

// 显示分数历史
function showHistoryModal() {
    const modal = document.getElementById('history-modal');
    const content = document.getElementById('history-content');

    const history = JSON.parse(localStorage.getItem('banzi_scores') || '{}');

    let html = '<table class="result-table"><tr><th>玩家</th><th>累计分数</th></tr>';

    const sorted = Object.entries(history).sort((a, b) => b[1] - a[1]);
    for (const [name, score] of sorted) {
        const scoreClass = score > 0 ? 'winner' : (score < 0 ? 'loser' : '');
        html += `<tr><td>${name}</td><td class="${scoreClass}">${score > 0 ? '+' : ''}${score}</td></tr>`;
    }

    html += '</table>';

    if (sorted.length === 0) {
        html = '<p>暂无记录</p>';
    }

    content.innerHTML = html;
    modal.classList.remove('hidden');
}

// 出牌
function playCards() {
    if (selectedCards.length === 0) return;

    const lastHand = gameState.currentRoundCards.length > 0
        ? analyzeHand(gameState.currentRoundCards[gameState.currentRoundCards.length - 1].cards)
        : null;

    // 检查牌型
    const handType = analyzeHand(selectedCards);
    if (!handType) {
        showToast('无效的牌型');
        return;
    }

    // 检查是否可以出牌（新一轮或压牌）
    if (lastHand) {
        // 需要压牌
        if (!window.compareHands(lastHand, handType)) {
            showToast('无法压制上家的牌');
            return;
        }
    }
    // 第一轮：黑桃7持有者先出牌，但不要求必须出黑桃7

    // 发送出牌消息（深拷贝）— 同时生成音效随机种子，让 4 个客户端听到同一段语音
    const audioSeed = Math.random();
    network.sendGameAction('play_cards', { cards: [...selectedCards], audioSeed });
    handlePlayCards(network.position, [...selectedCards], audioSeed);

    // 清空选择
    selectedCards = [];
    updateMyHand();
    updateActionButtons();
}

// 处理出牌
function handlePlayCards(playerIndex, cards, audioSeed) {
    // 播放出牌音效（带语音：单张/对子按点数；炸弹族统一炸弹；顺子统一顺子；
    // 压牌时在「点数语音 / 管上 / 大你」三者中随机；audioSeed 由出牌方广播，
    // 保证 4 个客户端听到同一段语音）
    const _isPressing = gameState.currentRoundCards.length > 0;
    const _ht = analyzeHand(cards);
    if (window.GameAudio) {
        GameAudio.playPlay(_ht, _isPressing, audioSeed);
    } else {
        playCardSound();
    }

    // 从手牌中移除
    const hand = gameState.hands[playerIndex];
    for (const card of cards) {
        const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (idx !== -1) hand.splice(idx, 1);
    }

    // 出完后剩 1 / 2 张时报数（延迟一点，等出牌语音播完）
    if (window.GameAudio && (hand.length === 1 || hand.length === 2)) {
        const _remain = hand.length;
        setTimeout(() => GameAudio.playRemaining(_remain), 900);
    }

    // 添加到当前回合（深拷贝，避免引用被修改）
    gameState.currentRoundCards.push({ player: playerIndex, cards: [...cards] });

    // 重要：有人压牌了，清空之前的pass记录，重新开始询问
    // 只有刚出牌的这个人不需要被询问，其他所有人都要重新询问
    gameState.roundPassedPlayers = [playerIndex];

    // 检查炸弹翻倍
    const handType = analyzeHand(cards);
    if (handType.type === HAND_TYPES.FOUR || handType.type === HAND_TYPES.CHAIN_THREE) {
        gameState.multiplier *= 2;
        const reason = handType.type === HAND_TYPES.FOUR ? '四张炸弹×2' : '连三炸弹×2';
        gameState.multiplierReasons.push(reason);
        showToast(`炸弹! ${reason}`);
    }

    // 检查是否出了被喊的那张牌
    if (gameState.calledCard && gameState.phase === 'playing') {
        const calledCard = gameState.calledCard;
        const playedCalledCard = cards.some(c => c.suit === calledCard.suit && c.rank === calledCard.rank);

        if (playedCalledCard && !gameState.calledCardRevealed) {
            // 记录被喊的牌已被打出
            gameState.calledCardRevealed = true;
            gameState.calledCardPlayer = playerIndex;

            // 延迟提示，让出牌动画先完成
            setTimeout(() => {
                const playerName = network.players[playerIndex]?.name || '玩家' + (playerIndex + 1);
                const cardSymbol = SUIT_SYMBOLS[calledCard.suit];
                showToast(`💡 ${playerName} 出了被喊的牌 ${cardSymbol}${calledCard.rank}！`, 3000);
            }, 500);

            // 更新显示被喊牌标识
            updateCalledCardIndicators();
        }
    }

    // 检查玩家是否出完
    if (hand.length === 0 && !gameState.finishOrder.includes(playerIndex)) {
        gameState.finishOrder.push(playerIndex);
        showToast(`${network.players[playerIndex].name} 出完牌了!`);

        // 包牌局：只要有人出完，游戏立即结束
        if (gameState.baopaiPlayer !== -1) {
            // 将剩余未出完的人按当前顺序加入 finishOrder
            for (let i = 0; i < 4; i++) {
                if (!gameState.finishOrder.includes(i)) {
                    gameState.finishOrder.push(i);
                }
            }
            endGame();
            return;
        }

        // 检查游戏是否结束（正常局：某一队两人都出完）
        const playerTeam = gameState.teams[playerIndex];
        const teamFinished = gameState.finishOrder.filter(p => gameState.teams[p] === playerTeam);
        if (teamFinished.length >= 2) {
            // 同一队两人都已出完，游戏结束
            // 将剩余两人加入finishOrder
            for (let i = 0; i < 4; i++) {
                if (!gameState.finishOrder.includes(i)) {
                    gameState.finishOrder.push(i);
                }
            }
            endGame();
            return;
        }
    }

    // 轮到下家（逆时针），跳过已出完牌的玩家
    let nextPlayer = (playerIndex + 3) % 4;
    while (gameState.hands[nextPlayer].length === 0) {
        nextPlayer = (nextPlayer + 3) % 4;
    }
    gameState.currentPlayer = nextPlayer;

    updateGameDisplay();

    // 如果轮到机器人，触发机器人出牌
    if (gameState.robots[nextPlayer]) {
        setTimeout(() => robotPlay(nextPlayer), 1000);
    }
}

// 不要
function pass() {
    if (gameState.currentPlayer !== network.position) return;
    if (gameState.currentRoundCards.length === 0) return;

    const audioSeed = Math.random();
    network.sendGameAction('pass', { audioSeed });
    handlePass(network.position, audioSeed);
}

// 处理不要
function handlePass(playerIndex, audioSeed) {
    // 不要 / 要不起 - 随机播放一个（用 audioSeed 让所有客户端听到同一句）
    if (window.GameAudio) GameAudio.playPass(audioSeed);

    // 记录这个玩家已经pass
    if (!gameState.roundPassedPlayers.includes(playerIndex)) {
        gameState.roundPassedPlayers.push(playerIndex);
    }

    // 找到下一个还有牌的玩家（逆时针），跳过已出完牌的玩家
    let nextPlayer = (playerIndex + 3) % 4;
    while (gameState.hands[nextPlayer].length === 0) {
        nextPlayer = (nextPlayer + 3) % 4;
    }

    // 一轮结束的条件：从最后出牌的人开始，按逆时针顺序，其他所有人都已pass
    // 或者说：只剩下最后出牌的人还没pass（其他人都pass了）
    const lastPlay = gameState.currentRoundCards[gameState.currentRoundCards.length - 1];
    const lastPlayer = lastPlay ? lastPlay.player : -1;

    // 统计从最后出牌的人开始，逆时针方向，还有多少人有牌但没pass
    let playersWithCardsButNotPassed = 0;
    for (let i = 0; i < 4; i++) {
        // 跳过已经出完牌的玩家
        if (gameState.hands[i].length === 0) continue;

        // 如果这个人不是最后出牌的人，且还没有pass，说明回合还没结束
        if (i !== lastPlayer && !gameState.roundPassedPlayers.includes(i)) {
            playersWithCardsButNotPassed++;
        }
    }

    // 如果除了最后出牌的人之外，其他所有人都已经pass了，回合结束
    const shouldEndRound = lastPlayer !== -1 && playersWithCardsButNotPassed === 0;

    if (shouldEndRound) {
        // 一轮结束，最后出牌的人收牌
        // 清空pass记录
        gameState.roundPassedPlayers = [];
        endRound(lastPlayer);
    } else {
        gameState.currentPlayer = nextPlayer;
        updateGameDisplay();

        // 如果轮到机器人，触发机器人出牌
        if (gameState.robots[nextPlayer]) {
            setTimeout(() => robotPlay(nextPlayer), 1000);
        }
    }
}

// 结束一轮
function endRound(winnerIndex) {
    // 统计这轮的所有牌
    let totalCards = 0;
    for (const play of gameState.currentRoundCards) {
        totalCards += play.cards.length;
        gameState.collectedCards[winnerIndex].push(...play.cards);
        // 记录到已出牌列表（用于判断是否是游戏第一轮）
        gameState.playedCards.push(...play.cards);
    }

    showCollectModal(winnerIndex, totalCards);

    // 清空当前回合
    gameState.currentRoundCards = [];
    gameState.roundPassedPlayers = [];
    gameState.lastWinner = winnerIndex;

    // 赢家获得下一轮出牌权
    // 如果赢家已经出完牌，则轮到他的下家（逆时针），跳过已出完牌的玩家
    let nextPlayer = winnerIndex;
    if (gameState.hands[winnerIndex].length === 0) {
        nextPlayer = (winnerIndex + 3) % 4;
        // 跳过已出完牌的玩家
        while (gameState.hands[nextPlayer].length === 0) {
            nextPlayer = (nextPlayer + 3) % 4;
        }
    }
    gameState.currentPlayer = nextPlayer;

    // 检查游戏是否结束
    if (gameState.finishOrder.length >= 3) {
        // 第四个人自动结束
        for (let i = 0; i < 4; i++) {
            if (!gameState.finishOrder.includes(i)) {
                gameState.finishOrder.push(i);
                break;
            }
        }

        endGame();
        return;
    }

    // 更新界面
    updateGameDisplay();

    // 如果轮到机器人，触发机器人出牌
    if (gameState.robots[gameState.currentPlayer]) {
        setTimeout(() => robotPlay(gameState.currentPlayer), 1500);
    }
}

// 结束游戏
function endGame() {
    gameState.phase = 'ended';

    const result = calculateFinalResult(gameState);
    showResultModal(result);
}

// ==================== 包牌阶段 ====================

// 显示包牌弹窗
function showBaopaiModal() {
    // 如果包牌阶段已结束则不再显示
    if (gameState.phase !== 'baopai') return;

    const modal = document.getElementById('baopai-modal');
    const msg = document.getElementById('baopai-message');

    msg.innerHTML = `<p>是否决定<strong>包牌</strong>？</p>`;
    modal.classList.remove('hidden');

    // 确认包牌
    document.getElementById('btn-confirm-baopai').onclick = () => {
        modal.classList.add('hidden');
        network.sendGameAction('baopai_decision', { decision: true });
        handleBaopaiDecision(network.position, true);
    };

    // 不包牌
    document.getElementById('btn-cancel-baopai').onclick = () => {
        modal.classList.add('hidden');
        network.sendGameAction('baopai_decision', { decision: false });
        handleBaopaiDecision(network.position, false);
    };
}

// 处理包牌决定
function handleBaopaiDecision(playerIndex, decision) {
    // 避免重复处理同一玩家的决定
    if (gameState.baopaiDecisions[playerIndex] !== null) {
        return;
    }

    gameState.baopaiDecisions[playerIndex] = decision;

    if (decision) {
        gameState.baopaiOrder.push(playerIndex);
        showToast(`${network.players[playerIndex]?.name || '玩家'} 申请包牌！`);
    }

    console.log(`Player ${playerIndex} decided: ${decision}`);
    console.log('Current decisions:', gameState.baopaiDecisions);

    // 检查是否所有玩家都已决定
    checkBaopaiPhaseComplete();
}

// 检查包牌阶段是否完成
function checkBaopaiPhaseComplete() {
    if (gameState.phase !== 'baopai') return;

    // 机器人立即决定
    for (let i = 0; i < 4; i++) {
        if (gameState.robots[i] && gameState.baopaiDecisions[i] === null) {
            const decision = gameState.robots[i].decideBaopai(gameState.hands[i]);
            gameState.baopaiDecisions[i] = decision;
            if (decision) {
                gameState.baopaiOrder.push(i);
                showToast(`${gameState.robots[i].name} 申请包牌！`);
            }
        }
    }

    // 检查是否所有人都已决定
    const allDecided = gameState.baopaiDecisions.every(d => d !== null);

    // 兜底：机器人都决定了但自己还没，重新弹窗
    if (!allDecided) {
        const myDecision = gameState.baopaiDecisions[network.position];
        if (myDecision === null && !gameState.robots[network.position]) {
            const modal = document.getElementById('baopai-modal');
            if (modal && modal.classList.contains('hidden')) {
                showBaopaiModal();
            }
        }
        return;
    }

    if (allDecided) {

        // 判断是否有人包牌
        const baopaiPlayers = gameState.baopaiDecisions
            .map((d, i) => d ? i : -1)
            .filter(i => i !== -1);

        if (baopaiPlayers.length > 0) {
            // 有人包牌，按优先级选择（离黑桃7持有者最近的）
            let selectedBaopai = baopaiPlayers[0];

            if (gameState.spade7Holder !== -1) {
                // 按逆时针顺序排序（黑桃7持有者逆时针方向，越近越优先）
                const sortedByPriority = baopaiPlayers.map(pos => {
                    // 计算逆时针距离：从黑桃7持有者逆时针到该玩家的距离
                    const distance = (gameState.spade7Holder - pos + 4) % 4;
                    return { pos, distance };
                }).sort((a, b) => a.distance - b.distance);

                selectedBaopai = sortedByPriority[0].pos;
            }

            // 设置包牌
            gameState.baopaiPlayer = selectedBaopai;
            gameState.teams = [1, 1, 1, 1];
            gameState.teams[selectedBaopai] = 0;
            gameState.multiplier *= 2;
            gameState.multiplierReasons.push('包牌×2');

            showToast(`${network.players[selectedBaopai]?.name || '玩家'} 包牌成功！1 VS 3`);

            // 直接进入游戏
            gameState.phase = 'playing';
            gameState.currentPlayer = selectedBaopai; // 包牌者先出
            updateGameDisplay();

            // 如果是机器人先出
            if (gameState.robots[selectedBaopai]) {
                setTimeout(() => robotPlay(selectedBaopai), 1000);
            }

            // 房主广播包牌成功
            if (network.isHost) {
                network.broadcast({
                    type: 'baopai_approved',
                    player: selectedBaopai,
                    teams: gameState.teams,
                    multiplier: gameState.multiplier,
                    multiplierReasons: gameState.multiplierReasons
                });
            }
        } else {
            // 无人包牌，进入喊牌阶段
            gameState.phase = 'calling';
            gameState.currentPlayer = gameState.spade7Holder;
            showToast('无人包牌，进入喊牌阶段');
            updateGameDisplay();

            // 显示喊牌弹窗
            if (gameState.spade7Holder === network.position) {
                setTimeout(() => showCallCardModal(), 500);
            }

            // 如果是机器人喊牌
            if (gameState.robots[gameState.spade7Holder]) {
                setTimeout(() => robotCallCard(gameState.spade7Holder), 1500);
            }

            // 房主广播状态转换
            if (network.isHost) {
                network.broadcast({
                    type: 'phase_change',
                    phase: 'calling',
                    spade7Holder: gameState.spade7Holder
                });
            }
        }
    }
}

// ==================== 机器人AI操作 ====================

// 机器人喊牌
function robotCallCard(robotIndex) {
    const robot = gameState.robots[robotIndex];
    if (!robot) return;

    const hand = gameState.hands[robotIndex];
    const hasFourTwos = countTwos(hand) === 4;

    // 找一个自己没有的2或A
    const rank = hasFourTwos ? 'A' : '2';
    const suits = ['spade', 'heart', 'club', 'diamond'];

    // 随机选择一个自己没有的花色
    let selectedSuit = null;
    for (const suit of suits) {
        if (!hasCard(hand, suit, rank)) {
            selectedSuit = suit;
            break;
        }
    }

    // 如果没有（理论上不可能），选第一个
    if (!selectedSuit) {
        selectedSuit = 'heart';
    }

    // 执行喊牌
    handleCallCard(robotIndex, selectedSuit, rank);
    network.sendGameAction('call_card', { suit: selectedSuit, rank });
}

// 机器人出牌
function robotPlay(robotIndex) {
    const robot = gameState.robots[robotIndex];
    if (!robot) return;

    const hand = gameState.hands[robotIndex];
    const isMyTurn = gameState.currentPlayer === robotIndex;

    if (!isMyTurn) return;

    const lastHand = gameState.currentRoundCards.length > 0
        ? analyzeHand(gameState.currentRoundCards[gameState.currentRoundCards.length - 1].cards)
        : null;

    const isFirstPlay = gameState.currentRoundCards.length === 0 && gameState.playedCards.length === 0;

    // 选择要出的牌
    const selectedCards = robot.selectCards(hand, lastHand, isFirstPlay);

    if (selectedCards && selectedCards.length > 0) {
        // 出牌（深拷贝）
        const cardsToPlay = [...selectedCards];
        setTimeout(() => {
            const audioSeed = Math.random();
            network.sendGameAction('play_cards', { cards: cardsToPlay, audioSeed });
            handlePlayCards(robotIndex, cardsToPlay, audioSeed);
        }, 1000);
    } else {
        // 不要
        setTimeout(() => {
            const audioSeed = Math.random();
            network.sendGameAction('pass', { audioSeed });
            handlePass(robotIndex, audioSeed);
        }, 1000);
    }
}

// 检查是否需要机器人行动
function checkRobotTurn() {
    if (gameState.phase !== 'playing') return;

    const currentPlayer = gameState.currentPlayer;
    if (gameState.robots[currentPlayer]) {
        robotPlay(currentPlayer);
    }
}

// ==================== 修改后的初始化游戏 ====================

function initGame(initialState = null, robots = []) {
    gameState = new GameState();
    gameState.robots = robots || [];

    if (initialState) {
        // 从主机同步状态
        Object.assign(gameState, initialState);
    } else {
        // 创建新游戏
        gameState.players = [...network.players];
        gameState.deck = shuffle(createDeck());
        gameState.hands = dealCards(gameState.deck);
        gameState.spade7Holder = findSpade7Holder(gameState.hands);
        gameState.phase = 'baopai'; // 先进入包牌阶段
        gameState.currentPlayer = -1; // 包牌阶段没有当前玩家

        // 广播游戏开始
        network.broadcastGameState({
            deck: [],
            hands: gameState.hands,
            spade7Holder: gameState.spade7Holder,
            phase: 'baopai',
            currentPlayer: -1,
            robots: robots.map((r, i) => r ? { position: i, difficulty: r.difficulty } : null)
        });
    }

    showPage('game');
    updateGameDisplay();

    // 保存会话（断线重连用）
    if (typeof saveSession === 'function') saveSession();

    // 显示包牌弹窗
    showBaopaiModal();

    // 让机器人立即做出包牌决定
    for (let i = 0; i < 4; i++) {
        if (gameState.robots[i] && gameState.baopaiDecisions[i] === null) {
            const decision = gameState.robots[i].decideBaopai(gameState.hands[i]);
            gameState.baopaiDecisions[i] = decision;
            if (decision) {
                gameState.baopaiOrder.push(i);
                showToast(`${gameState.robots[i].name} 申请包牌！`);
            }
        }
    }

    // 检查是否只有人类玩家未决定，如果是，立即检查阶段完成
    checkBaopaiPhaseComplete();
}

// 准备状态追踪（房主端）
let _readyPlayers = new Set();

// 再来一局（房主点击）
function playAgain() {
    const realPlayers = typeof network.getRealPlayerCount === 'function' ? network.getRealPlayerCount() : 1;
    if (!network.isHost) {
        showToast('只有房主可以开始下一局，请等待房主');
        return;
    }

    // 如果只有1个真人玩家（全机器人），直接开始
    if (realPlayers <= 1) {
        _doStartNextRound();
        return;
    }

    // 多人时：通知其他玩家显示"准备"按钮；房主自己等待
    _readyPlayers = new Set();
    _readyPlayers.add(network.position); // 房主算已准备
    network.broadcast({ type: 'start_prepare' });

    // 更新房主结算弹窗 UI
    document.getElementById('btn-play-again').classList.add('hidden');
    const statusEl = document.getElementById('ready-status');
    statusEl.classList.remove('hidden');
    _updateReadyStatus();
}

function _updateReadyStatus() {
    const statusEl = document.getElementById('ready-status');
    if (!statusEl) return;
    const realCount = network.players.filter(p => p && !p.isRobot).length;
    statusEl.textContent = `等待其他玩家准备... (${_readyPlayers.size}/${realCount})`;
}

// 其他玩家点"准备"
function readyForNext() {
    network.sendGameAction('player_ready', {});
    document.getElementById('btn-ready-next').disabled = true;
    document.getElementById('btn-ready-next').textContent = '已准备';
}

// 新对局（重置所有积分重新开始）
function startNewGame() {
    if (!network.isHost) { showToast('只有房主可以开启新对局'); return; }
    document.getElementById('result-modal').classList.add('hidden');
    network.broadcast({ type: 'new_game_started' });
    if (gameState) {
        gameState.totalScores = [0, 0, 0, 0];
        gameState.roundCount = 0;
        gameState.roundHistory = [];
        gameState.resetForNewRound();
    }
    startNewRound();
}

// 实际执行开始下一局
function _doStartNextRound() {
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('ready-status').classList.add('hidden');
    document.getElementById('btn-play-again').classList.remove('hidden');
    document.getElementById('btn-ready-next').textContent = '准备';
    document.getElementById('btn-ready-next').disabled = false;
    _readyPlayers = new Set();

    network.broadcast({ type: 'new_round_started' });
    if (gameState) gameState.resetForNewRound();
    startNewRound();
}

// 离开游戏（让机器人接管）
function leaveGame() {
    if (!confirm('确认离开？你的位置将由机器人接管。')) return;
    network.broadcast({
        type: 'player_tuoguan',
        position: network.position,
        playerName: network.playerName
    });
    clearSession();
    network.leaveRoom();
    showPage('home');
}

// 开始新一轮
function startNewRound() {
    // 生成并洗牌
    const deck = shuffle(createDeck());

    // 发牌
    gameState.hands = dealCards(deck);

    // 找到黑桃7持有者
    gameState.spade7Holder = findSpade7Holder(gameState.hands);

    // 设置当前玩家（黑桃7持有者）
    gameState.currentPlayer = gameState.spade7Holder;

    // 进入包牌阶段
    gameState.phase = 'baopai';
    gameState.baopaiDecisions = [null, null, null, null];
    gameState.baopaiOrder = [];

    // 更新界面
    updateGameDisplay();

    // 显示包牌选择弹窗（所有人类玩家都需决定是否包牌，不只是黑桃7持有者）
    if (!gameState.robots[network.position]) {
        setTimeout(() => showBaopaiModal(), 500);
    }

    // 机器人立即决定
    for (let i = 0; i < 4; i++) {
        if (gameState.robots[i]) {
            setTimeout(() => {
                const decision = gameState.robots[i].decideBaopai(gameState.hands[i]);
                gameState.baopaiDecisions[i] = decision;
                if (decision) {
                    gameState.baopaiOrder.push(i);
                    showToast(`${gameState.robots[i].name} 申请包牌！`);
                }
            }, 1000 + i * 200);
        }
    }

    // 检查是否只有人类玩家未决定，如果是，立即检查阶段完成
    setTimeout(() => checkBaopaiPhaseComplete(), 2000);

    // 房主广播新一轮状态给其他玩家
    if (network.isHost) {
        network.broadcastGameState({
            deck: [],
            hands: gameState.hands,
            spade7Holder: gameState.spade7Holder,
            phase: 'baopai',
            currentPlayer: gameState.currentPlayer,
            robots: gameState.robots.map((r, i) => r ? { position: i, difficulty: r.difficulty } : null),
            totalScores: gameState.totalScores,
            roundCount: gameState.roundCount,
            roundHistory: gameState.roundHistory,
            baopaiDecisions: gameState.baopaiDecisions,
            baopaiOrder: gameState.baopaiOrder,
            baopaiCountdown: gameState.baopaiCountdown,
            multiplier: gameState.multiplier,
            multiplierReasons: gameState.multiplierReasons
        });
    }

    showToast('第 ' + gameState.roundCount + ' 局开始！');
}

// 结束游戏，显示最终结算
function showFinalGameResult() {
    // 隐藏本局结算弹窗
    document.getElementById('result-modal').classList.add('hidden');

    // 显示最终结算
    showFinalResult();
}

// 处理包牌请求（占位，避免未定义错误）
function handleBaopaiRequest(fromPlayer) {
    console.log('收到包牌请求 from:', fromPlayer);
}

// 显示最终结算弹窗
function showFinalResult() {
    const modal = document.getElementById('final-result-modal');
    const content = document.getElementById('final-result-content');

    // 构建最终结果显示
    let html = `
        <div class="result-section">
            <h4>共进行 ${gameState.roundCount} 局</h4>
        </div>
    `;

    // 每局历史
    html += `
        <div class="result-section">
            <h4>每局得分</h4>
            <table class="result-table">
                <tr>
                    <th>局数</th>
    `;

    for (let i = 0; i < 4; i++) {
        const player = network.players[i];
        html += `<th>${player ? player.name : '玩家' + (i + 1)}</th>`;
    }

    html += '</tr>';

    for (const round of gameState.roundHistory) {
        html += `<tr><td>第${round.round}局</td>`;
        for (let i = 0; i < 4; i++) {
            const score = round.scores[i];
            const scoreClass = score > 0 ? 'winner' : (score < 0 ? 'loser' : '');
            html += `<td class="${scoreClass}">${score > 0 ? '+' : ''}${score}</td>`;
        }
        html += '</tr>';
    }

    // 添加总计行
    html += `<tr style="border-top: 2px solid #ffd700; font-weight: bold;"><td>总计</td>`;
    for (let i = 0; i < 4; i++) {
        const totalScore = gameState.totalScores[i];
        const scoreClass = totalScore > 0 ? 'winner' : (totalScore < 0 ? 'loser' : '');
        html += `<td class="${scoreClass}">${totalScore > 0 ? '+' : ''}${totalScore}</td>`;
    }
    html += '</tr>';

    html += '</table></div>';

    // 最终排名
    const playerScores = gameState.totalScores.map((score, idx) => ({
        idx,
        score,
        name: network.players[idx] ? network.players[idx].name : '玩家' + (idx + 1)
    })).sort((a, b) => b.score - a.score);

    html += `
        <div class="result-section">
            <h4>🏆 最终排名</h4>
            <table class="result-table">
                <tr>
                    <th>排名</th>
                    <th>玩家</th>
                    <th>累计得分</th>
                </tr>
    `;

    for (let i = 0; i < playerScores.length; i++) {
        const p = playerScores[i];
        const scoreClass = p.score > 0 ? 'winner' : (p.score < 0 ? 'loser' : '');
        const rankEmoji = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '4️⃣'));
        html += `
            <tr>
                <td>${rankEmoji}</td>
                <td>${p.name}</td>
                <td class="${scoreClass}">${p.score > 0 ? '+' : ''}${p.score}</td>
            </tr>
        `;
    }

    html += '</table></div>';

    content.innerHTML = html;
    modal.classList.remove('hidden');
}

// 获取玩家位置类名（根据绝对位置）
function getPlayerPositionClass(playerIndex) {
    const myPos = network.position;
    const diff = (playerIndex - myPos + 4) % 4;
    if (diff === 0) return 'my-hand-area';
    if (diff === 1) return 'right';
    if (diff === 2) return 'top';
    if (diff === 3) return 'left';
    return '';
}

// 更新被喊牌标识显示
function updateCalledCardIndicators() {
    if (!gameState.calledCardRevealed || gameState.calledCardPlayer === -1) {
        // 隐藏所有被喊牌标识
        document.querySelectorAll('.called-card-indicator').forEach(el => el.classList.add('hidden'));
        document.getElementById('called-card-badge').classList.add('hidden');
        return;
    }

    const calledCard = gameState.calledCard;
    const cardText = SUIT_SYMBOLS[calledCard.suit] + calledCard.rank;

    // 先隐藏所有被喊牌标识
    document.querySelectorAll('.called-card-indicator').forEach(el => el.classList.add('hidden'));
    document.getElementById('called-card-badge').classList.add('hidden');

    // 显示在被喊牌玩家的位置
    const calledPlayer = gameState.calledCardPlayer;

    if (calledPlayer === network.position) {
        // 自己的标识
        const myBadge = document.getElementById('called-card-badge');
        myBadge.textContent = cardText;
        myBadge.classList.remove('hidden');
    } else {
        // 其他玩家的标识 - 通过 data-player 属性查找
        const playerEl = document.querySelector(`.player-top[data-player="${calledPlayer}"], .player-left[data-player="${calledPlayer}"], .player-right[data-player="${calledPlayer}"]`);
        if (playerEl) {
            const indicator = playerEl.querySelector('.called-card-indicator');
            if (indicator) {
                indicator.textContent = cardText;
                indicator.classList.remove('hidden');
            }
        }
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.gameState = gameState;
    window.selectedCards = selectedCards;
    window.showPage = showPage;
    window.showToast = showToast;
    window.updateRoomDisplay = updateRoomDisplay;
    window.updateGameDisplay = updateGameDisplay;
    window.showCallCardModal = showCallCardModal;
    window.handleCallCard = handleCallCard;
    window.showCollectModal = showCollectModal;
    window.showResultModal = showResultModal;
    window.playCards = playCards;
    window.handlePlayCards = handlePlayCards;
    window.pass = pass;
    window.handlePass = handlePass;
    window.initGame = initGame;
    window.handleBaopaiRequest = handleBaopaiRequest;
    window.showBaopaiModal = showBaopaiModal;
    window.handleBaopaiDecision = handleBaopaiDecision;
    window.robotPlay = robotPlay;
    window.robotCallCard = robotCallCard;
    window.showHistoryModal = showHistoryModal;
    window.playAgain = playAgain;
    window.readyForNext = readyForNext;
    window.startNewGame = startNewGame;
    window._doStartNextRound = _doStartNextRound;
    window._readyPlayers = _readyPlayers;
    window._updateReadyStatus = _updateReadyStatus;
    window.leaveGame = leaveGame;
    window.showFinalGameResult = showFinalGameResult;
    window.showFinalResult = showFinalResult;
    window.startNewRound = startNewRound;
    window.updateCalledCardIndicators = updateCalledCardIndicators;
}

// ==================== 会话持久化 ====================

function saveSession() {
    try {
        localStorage.setItem('banzi_session', JSON.stringify({
            roomId: network.roomId,
            playerName: network.playerName,
            position: network.position,
            isHost: network.isHost,
            playerId: network.playerId
        }));
    } catch (e) {}
}

function clearSession() {
    localStorage.removeItem('banzi_session');
}

function loadSession() {
    try { return JSON.parse(localStorage.getItem('banzi_session')); }
    catch { return null; }
}

window.saveSession = saveSession;
window.clearSession = clearSession;
window.loadSession = loadSession;
