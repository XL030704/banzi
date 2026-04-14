/**
 * 音效模块 - 真人语音 + 出牌音效
 * 与 js/ui.js 中合成的 playCardSound 并行存在，作为更完整的音效系统
 */

const AUDIO_BASE = 'assets/';

// 文件映射（来自 assets/ 实际文件名）
const AUDIO_FILES = {
    // 单张：rank → 文件
    single: {
        '3':  '01_3_263152.mp3',
        '4':  '02_4_136755.mp3',
        '5':  '03_5_964620.mp3',
        '6':  '04_6_455393.mp3',
        '7':  '05_7_550430.mp3',
        '8':  '06_8_648617.mp3',
        '9':  '07_9_752629.mp3',
        '10': '08_10_476823.mp3',
        'J':  '09_J_467937.mp3',
        'Q':  '10_Q_853491.mp3',
        'K':  '11_K_536582.mp3',
        'A':  '12_A_611765.mp3',
        '2':  '13_2_585794.mp3'
    },
    // 对子：rank → 文件
    pair: {
        '3':  '14_对三_667526.mp3',
        '4':  '15_对四_800775.mp3',
        '5':  '16_对五_697623.mp3',
        '6':  '17_对六_402051.mp3',
        '7':  '18_对七_636572.mp3',
        '8':  '19_对八_278966.mp3',
        '9':  '20_对九_705963.mp3',
        '10': '21_对十_934645.mp3',
        'J':  '22_对J_904312.mp3',
        'Q':  '23_对Q_174286.mp3',
        'K':  '24_对K_309560.mp3',
        'A':  '25_对A_689333.mp3',
        '2':  '26_对二_243422.mp3'
    },
    // 其他通用
    straight:   '27_顺子_105957.mp3',
    bomb:       '28_炸弹_373001.mp3',
    pass:       '29_不要_824936.mp3',
    cantBeat:   '30_要不起_164845.mp3',
    cover:      '31_管上_189494.mp3',
    bigger:     '32_大你_349821.mp3',
    oneLeft:    '我就剩一张牌了_364723.mp3',
    twoLeft:    '我就剩两张牌了_315413.mp3',
    shuffle:    'card_shuffle.mp3'
};

// 缓存 Audio 实例，避免每次 new
const _audioCache = {};
let _muted = false;
let _volume = 0.7;

function _getAudio(file) {
    if (!_audioCache[file]) {
        const a = new Audio(AUDIO_BASE + file);
        a.preload = 'auto';
        _audioCache[file] = a;
    }
    return _audioCache[file];
}

// 播放（克隆节点支持快速重叠）
function _play(file) {
    if (_muted || !file) return;
    try {
        const base = _getAudio(file);
        const node = base.cloneNode();
        node.volume = _volume;
        node.play().catch(() => {});
    } catch (e) {
        // 忽略
    }
}

function _randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 出牌音效。
 * @param {Object} handType analyzeHand 返回结果，含 type 与 cards
 * @param {boolean} isPressing 是否在压上家的牌
 */
function playPlay(handType, isPressing) {
    if (!handType) return;

    // 炸弹族：三张/四张/滚龙/连三 全部用炸弹音效
    const bombTypes = new Set([
        HAND_TYPES.THREE,
        HAND_TYPES.FOUR,
        HAND_TYPES.ROLLING,
        HAND_TYPES.CHAIN_THREE
    ]);
    if (bombTypes.has(handType.type)) {
        _play(AUDIO_FILES.bomb);
        return;
    }

    if (handType.type === HAND_TYPES.STRAIGHT) {
        _play(AUDIO_FILES.straight);
        return;
    }

    // 单张 / 对子：取首张牌的 rank
    const rank = handType.cards[0].rank;
    const isPair = handType.type === HAND_TYPES.PAIR;
    const rankFile = isPair ? AUDIO_FILES.pair[rank] : AUDIO_FILES.single[rank];

    // 压牌时：在 "对应点数语音" / "管上" / "大你" 三者中随机
    if (isPressing) {
        const choices = [];
        if (rankFile) choices.push(rankFile);
        choices.push(AUDIO_FILES.cover);
        choices.push(AUDIO_FILES.bigger);
        _play(_randomPick(choices));
    } else {
        _play(rankFile);
    }
}

/**
 * 不要 / 要不起 — 随机
 */
function playPass() {
    _play(_randomPick([AUDIO_FILES.pass, AUDIO_FILES.cantBeat]));
}

/**
 * 出完牌后报剩余张数（仅 1 或 2 张时报）
 */
function playRemaining(count) {
    if (count === 1) _play(AUDIO_FILES.oneLeft);
    else if (count === 2) _play(AUDIO_FILES.twoLeft);
}

function playShuffle() {
    _play(AUDIO_FILES.shuffle);
}

function setMuted(m)   { _muted = !!m; }
function setVolume(v)  { _volume = Math.max(0, Math.min(1, v)); }

// 导出
window.GameAudio = {
    playPlay,
    playPass,
    playRemaining,
    playShuffle,
    setMuted,
    setVolume
};
