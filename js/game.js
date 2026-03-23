/**
 * 贵州板子游戏核心逻辑
 */

// 牌型定义
const CARD_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const CARD_SUITS = ['spade', 'heart', 'club', 'diamond'];
const SUIT_SYMBOLS = {
    spade: '♠',
    heart: '♥',
    club: '♣',
    diamond: '♦'
};

// 牌型类型
const HAND_TYPES = {
    SINGLE: 'single',           // 单张
    PAIR: 'pair',               // 对子
    STRAIGHT: 'straight',       // 顺子
    THREE: 'three',             // 三张炸弹
    FOUR: 'four',               // 四张炸弹
    ROLLING: 'rolling',         // 滚龙（连续对子）
    CHAIN_THREE: 'chainThree'   // 连三炸弹
};

// 游戏状态
class GameState {
    constructor() {
        this.players = [];           // 玩家列表
        this.currentPlayer = 0;      // 当前出牌玩家索引
        this.deck = [];              // 牌堆
        this.hands = [[], [], [], []]; // 每个玩家的手牌
        this.playedCards = [];       // 桌面上已出的牌
        this.collectedCards = [[], [], [], []]; // 每个玩家收的牌
        // 游戏阶段: waiting, dealing, baopai, calling, playing, ended
        // waiting - 等待中
        // dealing - 发牌中
        // baopai - 包牌阶段（发牌后先问是否包牌）
        // calling - 喊牌阶段（无人包牌则黑桃7持有者喊牌）
        // playing - 出牌阶段
        // ended - 游戏结束
        this.phase = 'waiting';
        this.teams = [-1, -1, -1, -1]; // 队伍分配，0或1表示队伍
        this.spade7Holder = -1;      // 黑桃7持有者索引
        this.calledCard = null;      // 被喊的牌
        this.calledCardRevealed = false; // 被喊的牌是否已被打出
        this.calledCardPlayer = -1;  // 谁打出了被喊的牌
        this.baopaiPlayer = -1;      // 包牌玩家索引，-1表示无
        this.baopaiDecisions = [null, null, null, null]; // 包牌决定: null=未决定, true=包牌, false=不包
        this.baopaiOrder = [];       // 申请包牌的顺序（用于判断优先级）
        this.baseScore = 1;          // 底分
        this.multiplier = 1;         // 翻倍数
        this.multiplierReasons = []; // 翻倍原因
        this.lastWinner = -1;        // 上轮收牌者
        this.finishOrder = [];       // 出完牌的顺序
        this.currentRoundCards = []; // 当前回合出的所有牌
        this.roundPassedPlayers = []; // 当前回合已pass的玩家
        this.robots = [];            // 机器人列表 [null, robot2, null, robot3] 这样的格式
        this.baopaiCountdown = 10;   // 包牌倒计时（秒）
        this.baopaiTimer = null;     // 包牌倒计时定时器

        // 多局累计数据
        this.totalScores = [0, 0, 0, 0]; // 累计分数
        this.roundCount = 0;             // 已进行的局数
        this.roundHistory = [];          // 每局历史记录
    }

    // 重置游戏状态（用于再来一局）
    resetForNewRound() {
        this.hands = [[], [], [], []];
        this.currentPlayer = -1;
        this.playedCards = [];
        this.collectedCards = [[], [], [], []];
        this.phase = 'waiting';
        this.teams = [-1, -1, -1, -1];
        this.spade7Holder = -1;
        this.calledCard = null;
        this.calledCardRevealed = false;
        this.calledCardPlayer = -1;
        this.baopaiPlayer = -1;
        this.baopaiDecisions = [null, null, null, null];
        this.baopaiOrder = [];
        this.baseScore = 1;
        this.multiplier = 1;
        this.multiplierReasons = [];
        this.lastWinner = -1;
        this.finishOrder = [];
        this.currentRoundCards = [];
        this.roundPassedPlayers = [];
        this.baopaiCountdown = 10;
        this.baopaiTimer = null;
    }
}

// 创建一副牌
function createDeck() {
    const deck = [];
    for (const suit of CARD_SUITS) {
        for (const rank of CARD_RANKS) {
            deck.push({ suit, rank, value: CARD_RANKS.indexOf(rank) });
        }
    }
    return deck;
}

// 洗牌
function shuffle(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 发牌
function dealCards(deck, numPlayers = 4) {
    const hands = Array(numPlayers).fill(null).map(() => []);
    const cardsPerPlayer = Math.floor(deck.length / numPlayers);

    for (let i = 0; i < cardsPerPlayer * numPlayers; i++) {
        hands[i % numPlayers].push(deck[i]);
    }

    // 对每个人的手牌排序
    for (let i = 0; i < numPlayers; i++) {
        hands[i].sort((a, b) => {
            if (a.value !== b.value) return b.value - a.value;
            return CARD_SUITS.indexOf(b.suit) - CARD_SUITS.indexOf(a.suit);
        });
    }

    return hands;
}

// 查找黑桃7持有者
function findSpade7Holder(hands) {
    for (let i = 0; i < hands.length; i++) {
        if (hands[i].some(card => card.suit === 'spade' && card.rank === '7')) {
            return i;
        }
    }
    return -1;
}

// 检查玩家是否有某张牌
function hasCard(hand, suit, rank) {
    return hand.some(card => card.suit === suit && card.rank === rank);
}

// 获取玩家的2的数量
function countTwos(hand) {
    return hand.filter(card => card.rank === '2').length;
}

// 分析牌型
function analyzeHand(cards) {
    if (!cards || cards.length === 0) return null;

    // 确保牌有value属性（防御性处理）
    for (const card of cards) {
        if (card.value === undefined || card.value === null) {
            card.value = CARD_RANKS.indexOf(card.rank);
        }
    }

    // 按点数分组
    const groups = {};
    for (const card of cards) {
        if (!groups[card.value]) groups[card.value] = [];
        groups[card.value].push(card);
    }

    const values = Object.keys(groups).map(Number).sort((a, b) => a - b);
    const counts = values.map(v => groups[v].length);

    // 单张
    if (cards.length === 1) {
        return { type: HAND_TYPES.SINGLE, value: cards[0].value, cards };
    }

    // 对子
    if (cards.length === 2 && counts[0] === 2) {
        return { type: HAND_TYPES.PAIR, value: values[0], cards };
    }

    // 三张
    if (cards.length === 3 && counts[0] === 3) {
        return { type: HAND_TYPES.THREE, value: values[0], cards };
    }

    // 四张炸弹
    if (cards.length === 4 && counts[0] === 4) {
        return { type: HAND_TYPES.FOUR, value: values[0], cards };
    }

    // 顺子（至少3张连续单牌）
    if (cards.length >= 3 && counts.every(c => c === 1) && isConsecutive(values)) {
        return { type: HAND_TYPES.STRAIGHT, value: values[values.length - 1], length: cards.length, cards };
    }

    // 滚龙（至少3组连续对子）
    if (counts.length >= 3 && counts.every(c => c === 2) && isConsecutive(values)) {
        return { type: HAND_TYPES.ROLLING, value: values[values.length - 1], length: counts.length, cards };
    }

    // 连三炸弹（至少3组连续三张）
    if (counts.length >= 3 && counts.every(c => c === 3) && isConsecutive(values)) {
        return { type: HAND_TYPES.CHAIN_THREE, value: values[values.length - 1], length: counts.length, cards };
    }

    return null;
}

// 检查数组是否连续
function isConsecutive(arr) {
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] - arr[i - 1] !== 1) return false;
    }
    return true;
}

// 比较两个牌型的大小
function compareHands(hand1, hand2) {
    if (!hand1) return true; // 没有上一手牌，可以出任意牌
    if (!hand2) return false;

    // 牌型等级：普通牌型 < 三张炸弹 < 滚龙 < 四张炸弹 < 连三炸弹
    const typeOrder = [
        HAND_TYPES.SINGLE,
        HAND_TYPES.PAIR,
        HAND_TYPES.STRAIGHT,
        HAND_TYPES.THREE,
        HAND_TYPES.ROLLING,
        HAND_TYPES.FOUR,
        HAND_TYPES.CHAIN_THREE
    ];

    const type1Index = typeOrder.indexOf(hand1.type);
    const type2Index = typeOrder.indexOf(hand2.type);

    // 炸弹比普通牌型大（三张、滚龙、四张、连三都是炸弹）
    const isBomb1 = hand1.type === HAND_TYPES.THREE ||
                    hand1.type === HAND_TYPES.ROLLING ||
                    hand1.type === HAND_TYPES.FOUR ||
                    hand1.type === HAND_TYPES.CHAIN_THREE;
    const isBomb2 = hand2.type === HAND_TYPES.THREE ||
                    hand2.type === HAND_TYPES.ROLLING ||
                    hand2.type === HAND_TYPES.FOUR ||
                    hand2.type === HAND_TYPES.CHAIN_THREE;

    // 普通牌型只能压相同类型
    if (!isBomb1 && !isBomb2) {
        if (hand1.type !== hand2.type) return false;
        if (hand1.length && hand2.length && hand1.length !== hand2.length) return false;
        return hand2.value > hand1.value;
    }

    // 炸弹之间比较
    if (isBomb1 && isBomb2) {
        if (type2Index !== type1Index) return type2Index > type1Index;
        return hand2.value > hand1.value;
    }

    // 炸弹压普通牌型
    if (!isBomb1 && isBomb2) return true;

    return false;
}

// 检查选择的牌是否可以出
function canPlay(selectedCards, lastHand) {
    if (!selectedCards || selectedCards.length === 0) return false;

    const currentHand = analyzeHand(selectedCards);
    if (!currentHand) return false;

    // 如果没有上一手，必须是单张（第一轮黑桃7先出）
    if (!lastHand) {
        // 第一轮必须有黑桃7
        // 这里在调用处检查
        return true;
    }

    return compareHands(lastHand, currentHand);
}

// 计算翻倍
function calculateMultiplier(handType, reasons) {
    let multiplier = 1;
    const list = [];

    if (handType === HAND_TYPES.FOUR) {
        multiplier *= 2;
        list.push('四张炸弹×2');
    } else if (handType === HAND_TYPES.CHAIN_THREE) {
        multiplier *= 2;
        list.push('连三炸弹×2');
    }

    return { multiplier, list };
}

// 确定队友
function determineTeams(hands, spade7Holder, calledSuit, calledRank) {
    const teams = [-1, -1, -1, -1];
    teams[spade7Holder] = 0;

    let teammate = -1;
    for (let i = 0; i < hands.length; i++) {
        if (i !== spade7Holder && hasCard(hands[i], calledSuit, calledRank)) {
            teammate = i;
            teams[i] = 0;
            break;
        }
    }

    // 其他两人为另一队
    for (let i = 0; i < 4; i++) {
        if (teams[i] === -1) teams[i] = 1;
    }

    return { teams, teammate };
}

// 判断游戏是否结束
function isGameOver(finishOrder) {
    return finishOrder.length >= 4;
}

// 计算最终结果
function calculateFinalResult(gameState) {
    const { teams, collectedCards, finishOrder, baopaiPlayer, baseScore, multiplier, multiplierReasons } = gameState;

    const result = {
        finishOrder,
        team0Cards: 0,
        team1Cards: 0,
        team0Players: [],
        team1Players: [],
        scores: [0, 0, 0, 0],
        multiplier,
        multiplierReasons: [...multiplierReasons],
        isBaopai: baopaiPlayer !== -1,
        isDoubleWin: false
    };

    // 统计队伍玩家
    for (let i = 0; i < 4; i++) {
        if (teams[i] === 0) result.team0Players.push(i);
        else result.team1Players.push(i);
    }

    // 包牌局结算
    if (baopaiPlayer !== -1) {
        const baopaiTeam = teams[baopaiPlayer];
        const baopaiFinishPos = finishOrder.indexOf(baopaiPlayer);

        // 包牌者第一个出完则赢
        if (baopaiFinishPos === 0) {
            // 包牌者赢，其他三人输
            for (let i = 0; i < 4; i++) {
                if (i === baopaiPlayer) {
                    result.scores[i] = baseScore * multiplier * 3;
                } else {
                    result.scores[i] = -baseScore * multiplier;
                }
            }
        } else {
            // 包牌者输，其他三人赢
            for (let i = 0; i < 4; i++) {
                if (i === baopaiPlayer) {
                    result.scores[i] = -baseScore * multiplier * 3;
                } else {
                    result.scores[i] = baseScore * multiplier;
                }
            }
        }

        return result;
    }

    // 正常2v2结算
    // 计算收牌数
    const firstPlayer = finishOrder[0];
    const fourthPlayer = finishOrder[3];

    for (let i = 0; i < 4; i++) {
        // 第4名的牌归第1名
        if (i === fourthPlayer) continue;

        if (teams[i] === 0) {
            result.team0Cards += collectedCards[i].length;
        } else {
            result.team1Cards += collectedCards[i].length;
        }
    }

    // 第4名的牌给第1名
    if (fourthPlayer !== undefined) {
        if (teams[fourthPlayer] === teams[firstPlayer]) {
            // 同队，牌计入
            if (teams[firstPlayer] === 0) {
                result.team0Cards += collectedCards[fourthPlayer].length;
            } else {
                result.team1Cards += collectedCards[fourthPlayer].length;
            }
        }
        // 不同队则作废
    }

    // 判断双出
    const team0Finish = finishOrder.filter(p => teams[p] === 0).sort((a, b) => finishOrder.indexOf(a) - finishOrder.indexOf(b));
    const team1Finish = finishOrder.filter(p => teams[p] === 1).sort((a, b) => finishOrder.indexOf(a) - finishOrder.indexOf(b));

    if (team0Finish.length === 2 && team1Finish.length === 2) {
        if (finishOrder.indexOf(team0Finish[0]) < finishOrder.indexOf(team1Finish[0]) &&
            finishOrder.indexOf(team0Finish[1]) < finishOrder.indexOf(team1Finish[0])) {
            result.isDoubleWin = true;
            result.multiplier *= 2;
            result.multiplierReasons.push('双出×2');
        } else if (finishOrder.indexOf(team1Finish[0]) < finishOrder.indexOf(team0Finish[0]) &&
                   finishOrder.indexOf(team1Finish[1]) < finishOrder.indexOf(team0Finish[0])) {
            result.isDoubleWin = true;
            result.multiplier *= 2;
            result.multiplierReasons.push('双出×2');
        }
    }

    // 计算输赢
    let winnerTeam = result.team0Cards > result.team1Cards ? 0 : 1;

    for (let i = 0; i < 4; i++) {
        if (teams[i] === winnerTeam) {
            result.scores[i] = baseScore * result.multiplier;
        } else {
            result.scores[i] = -baseScore * result.multiplier;
        }
    }

    return result;
}

// 生成扑克牌HTML
function createCardHTML(card, selectable = false) {
    const suitClass = card.suit;
    const suitSymbol = SUIT_SYMBOLS[card.suit];
    const rank = card.rank;

    return `<div class="card ${suitClass} ${selectable ? 'selectable' : ''}" data-suit="${card.suit}" data-rank="${card.rank}" data-value="${card.value}">
        <div class="card-rank">${rank}</div>
        <div class="card-suit">${suitSymbol}</div>
    </div>`;
}

// 生成牌背HTML
function createCardBackHTML() {
    return '<div class="card back"></div>';
}

// ==================== 机器人AI ====================

// 机器人玩家类
class RobotPlayer {
    constructor(position, difficulty = 'normal') {
        this.position = position;
        this.name = `机器人${position + 1}`;
        this.difficulty = difficulty; // easy, normal, hard
        this.isRobot = true;
    }

    // 决定是否包牌
    decideBaopai(hand) {
        // 根据手牌质量决定是否包牌
        const score = this.evaluateHand(hand);

        // 简单难度：随机决定
        if (this.difficulty === 'easy') {
            return Math.random() > 0.7 && score > 60;
        }

        // 普通难度：手牌分大于70且有一定概率
        if (this.difficulty === 'normal') {
            return score > 70 && Math.random() > 0.5;
        }

        // 困难难度：手牌分大于60就大概率包牌
        if (this.difficulty === 'hard') {
            return score > 60 && Math.random() > 0.3;
        }

        return false;
    }

    // 评估手牌分数（0-100）
    evaluateHand(hand) {
        let score = 0;

        // 统计炸弹数量
        const groups = {};
        for (const card of hand) {
            if (!groups[card.value]) groups[card.value] = [];
            groups[card.value].push(card);
        }

        let fourCount = 0;
        let threeCount = 0;
        let chainThreePotential = 0;
        const values = Object.keys(groups).map(Number).sort((a, b) => a - b);

        for (const v of values) {
            if (groups[v].length === 4) fourCount++;
            if (groups[v].length === 3) threeCount++;
        }

        // 检查连三炸弹潜力
        for (let i = 0; i < values.length - 2; i++) {
            if (groups[values[i]].length >= 3 &&
                groups[values[i + 1]]?.length >= 3 &&
                groups[values[i + 2]]?.length >= 3 &&
                values[i + 1] === values[i] + 1 &&
                values[i + 2] === values[i] + 2) {
                chainThreePotential++;
            }
        }

        // 高分牌（2和A）数量
        const highCards = hand.filter(c => c.value >= 11).length;

        // 计算分数
        score += fourCount * 25;          // 每个四张炸弹+25分
        score += chainThreePotential * 30; // 连三炸弹潜力+30分
        score += threeCount * 10;          // 每个三张+10分
        score += highCards * 5;            // 每张高分牌+5分

        // 有大牌加分
        const hasSpade7 = hand.some(c => c.suit === 'spade' && c.rank === '7');
        if (hasSpade7) score += 15;

        return Math.min(100, score);
    }

    // 选择要出的牌
    selectCards(hand, lastHand, isFirstPlay) {
        // 第一轮必须出黑桃7
        if (isFirstPlay) {
            const spade7 = hand.find(c => c.suit === 'spade' && c.rank === '7');
            if (spade7) return [spade7];
        }

        // 如果没人出过牌，可以选择任意牌型
        if (!lastHand) {
            return this.selectOpeningMove(hand);
        }

        // 需要压牌
        return this.selectCounterMove(hand, lastHand);
    }

    // 选择开局牌（上一轮自己收牌或新的一轮）
    selectOpeningMove(hand) {
        const groups = this.groupByValue(hand);
        const values = Object.keys(groups).map(Number).sort((a, b) => a - b);

        // 策略：优先出小牌或能回收的牌

        // 1. 尝试出顺子（连续单牌）
        const straight = this.findBestStraight(hand);
        if (straight && straight.length >= 3) {
            // 如果顺子不大，就出顺子
            if (straight[straight.length - 1].value < 10) {
                return straight;
            }
        }

        // 2. 出小单张
        const smallestCard = hand[hand.length - 1]; // 手牌已按从大到小排序
        if (smallestCard.value <= 5) {
            return [smallestCard];
        }

        // 3. 出小对子
        const pairs = values.filter(v => groups[v].length === 2);
        if (pairs.length > 0) {
            const smallestPair = groups[pairs[pairs.length - 1]];
            if (smallestPair[0].value <= 7) {
                return smallestPair;
            }
        }

        // 4. 出最小的牌
        return [hand[hand.length - 1]];
    }

    // 选择压牌
    selectCounterMove(hand, lastHand) {
        // 根据难度决定是否压牌
        if (this.difficulty === 'easy' && Math.random() > 0.6) {
            return null; // 40%概率不压
        }

        const possibleMoves = this.findAllPossibleMoves(hand, lastHand);

        if (possibleMoves.length === 0) return null;

        // 简单难度：随机选择
        if (this.difficulty === 'easy') {
            return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }

        // 普通/困难难度：选择最经济的压法
        // 优先用接近的牌压，保留大牌
        possibleMoves.sort((a, b) => {
            const maxA = Math.max(...a.map(c => c.value));
            const maxB = Math.max(...b.map(c => c.value));
            return maxA - maxB;
        });

        // 如果最小的能压的牌也不大，就出
        const smallestMove = possibleMoves[0];
        const maxValue = Math.max(...smallestMove.map(c => c.value));

        if (maxValue <= 10) {
            return smallestMove;
        }

        // 否则有一定概率不出，保留大牌
        if (this.difficulty === 'normal' && Math.random() > 0.7) {
            return null;
        }

        return smallestMove;
    }

    // 按点数分组
    groupByValue(hand) {
        const groups = {};
        for (const card of hand) {
            if (!groups[card.value]) groups[card.value] = [];
            groups[card.value].push(card);
        }
        return groups;
    }

    // 找最佳顺子
    findBestStraight(hand) {
        const singles = hand.filter((c, i, arr) =>
            arr.filter(x => x.value === c.value).length === 1
        );

        if (singles.length < 3) return null;

        // 找最长的连续序列
        singles.sort((a, b) => a.value - b.value);

        let longest = [];
        let current = [singles[0]];

        for (let i = 1; i < singles.length; i++) {
            if (singles[i].value === singles[i - 1].value + 1) {
                current.push(singles[i]);
            } else {
                if (current.length > longest.length) {
                    longest = [...current];
                }
                current = [singles[i]];
            }
        }

        if (current.length > longest.length) {
            longest = current;
        }

        return longest.length >= 3 ? longest : null;
    }

    // 找所有可以出的牌组合
    findAllPossibleMoves(hand, lastHand) {
        const moves = [];
        const groups = this.groupByValue(hand);
        const values = Object.keys(groups).map(Number);

        switch (lastHand.type) {
            case HAND_TYPES.SINGLE:
                // 找所有比它大的单张
                for (const v of values) {
                    if (v > lastHand.value) {
                        moves.push([groups[v][0]]);
                    }
                }
                break;

            case HAND_TYPES.PAIR:
                // 找所有比它大的对子
                for (const v of values) {
                    if (v > lastHand.value && groups[v].length >= 2) {
                        moves.push(groups[v].slice(0, 2));
                    }
                }
                break;

            case HAND_TYPES.STRAIGHT:
                // 找所有能压的顺子
                moves.push(...this.findStraights(hand, lastHand));
                break;

            case HAND_TYPES.THREE:
                // 三张炸弹可以压任何普通牌型
                for (const v of values) {
                    if (groups[v].length === 3) {
                        moves.push(groups[v]);
                    }
                }
                break;

            case HAND_TYPES.FOUR:
                // 四张炸弹压四张炸弹
                for (const v of values) {
                    if (v > lastHand.value && groups[v].length === 4) {
                        moves.push(groups[v]);
                    }
                }
                break;
        }

        // 炸弹可以压任何普通牌型
        if (lastHand.type !== HAND_TYPES.FOUR &&
            lastHand.type !== HAND_TYPES.CHAIN_THREE) {
            // 添加所有炸弹选项
            for (const v of values) {
                if (groups[v].length === 4) {
                    moves.push(groups[v]);
                }
                if (groups[v].length === 3) {
                    moves.push(groups[v]);
                }
            }

            // 添加连三炸弹
            moves.push(...this.findChainThrees(hand));
        }

        return moves;
    }

    // 找所有顺子
    findStraights(hand, targetHand) {
        const straights = [];
        const length = targetHand.length;
        const minValue = targetHand.value - length + 1;

        // 获取所有单张牌
        const groups = this.groupByValue(hand);
        const availableValues = Object.keys(groups)
            .map(Number)
            .filter(v => v > minValue);

        // 找所有可能的顺子
        for (let start = 0; start <= availableValues.length - length; start++) {
            const seq = availableValues.slice(start, start + length);
            if (this.isConsecutiveSeq(seq) && seq[seq.length - 1] > targetHand.value) {
                const cards = seq.map(v => groups[v][0]);
                straights.push(cards);
            }
        }

        return straights;
    }

    // 检查是否连续
    isConsecutiveSeq(arr) {
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] - arr[i - 1] !== 1) return false;
        }
        return true;
    }

    // 找所有连三炸弹
    findChainThrees(hand) {
        const chains = [];
        const groups = this.groupByValue(hand);
        const values = Object.keys(groups)
            .map(Number)
            .filter(v => groups[v].length >= 3)
            .sort((a, b) => a - b);

        // 找至少3个连续的有3张的点数
        for (let i = 0; i <= values.length - 3; i++) {
            if (values[i + 1] === values[i] + 1 && values[i + 2] === values[i] + 2) {
                const cards = [
                    ...groups[values[i]].slice(0, 3),
                    ...groups[values[i + 1]].slice(0, 3),
                    ...groups[values[i + 2]].slice(0, 3)
                ];
                chains.push(cards);
            }
        }

        return chains;
    }
}

// 导出机器人
if (typeof window !== 'undefined') {
    window.RobotPlayer = RobotPlayer;
}

// 导出到全局（浏览器环境）
if (typeof window !== 'undefined') {
    window.GameState = GameState;
    window.HAND_TYPES = HAND_TYPES;
    window.CARD_RANKS = CARD_RANKS;
    window.CARD_SUITS = CARD_SUITS;
    window.SUIT_SYMBOLS = SUIT_SYMBOLS;
    window.createDeck = createDeck;
    window.shuffle = shuffle;
    window.dealCards = dealCards;
    window.findSpade7Holder = findSpade7Holder;
    window.hasCard = hasCard;
    window.countTwos = countTwos;
    window.analyzeHand = analyzeHand;
    window.canPlay = canPlay;
    window.compareHands = compareHands;
    window.calculateMultiplier = calculateMultiplier;
    window.determineTeams = determineTeams;
    window.isGameOver = isGameOver;
    window.calculateFinalResult = calculateFinalResult;
    window.createCardHTML = createCardHTML;
    window.createCardBackHTML = createCardBackHTML;
}

// 导出到 CommonJS（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GameState,
        HAND_TYPES,
        CARD_RANKS,
        CARD_SUITS,
        SUIT_SYMBOLS,
        createDeck,
        shuffle,
        dealCards,
        findSpade7Holder,
        hasCard,
        countTwos,
        analyzeHand,
        canPlay,
        compareHands,
        calculateMultiplier,
        determineTeams,
        isGameOver,
        calculateFinalResult,
        createCardHTML,
        createCardBackHTML
    };
}
