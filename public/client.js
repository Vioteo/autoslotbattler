// Константы
const PRE_BATTLE_DELAY = 10000; // 10 секунд до начала боя
const BREAK_DURATION = 120000; // 2 минуты между боями

// Автоматическое определение сервера
const getServerUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.hostname}:${window.location.port || 3000}`;
    }
    return window.location.origin;
};

// Инициализация Socket.io
const socket = io(getServerUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 20000
});

// Обработка ошибок
window.addEventListener('error', (event) => {
    console.error('Ошибка в коде:', event.error);
    if (gameScreen && gameScreen.classList.contains('active')) {
        showError('Произошла ошибка. Игра продолжается...');
    }
});

// Обработка необработанных промисов
window.addEventListener('unhandledrejection', (event) => {
    console.error('Необработанная ошибка промиса:', event.reason);
    if (gameScreen && gameScreen.classList.contains('active')) {
        showError('Произошла ошибка. Игра продолжается...');
    }
});

// Символы для игрового автомата (цветные фигуры) - уменьшенное количество
const SYMBOLS = [
    { emoji: '🔴', color: '#ff0000', name: 'red', weight: 20 },
    { emoji: '🔵', color: '#0066ff', name: 'blue', weight: 20 },
    { emoji: '🟢', color: '#00ff00', name: 'green', weight: 20 },
    { emoji: '🟡', color: '#ffff00', name: 'yellow', weight: 20 },
    { emoji: '🟣', color: '#9900ff', name: 'purple', weight: 20 }
];

// Wild символ (сочетается с любым)
const WILD_SYMBOL = { emoji: '⭐', color: '#ffd700', name: 'wild', weight: 5 };

// Бонус символ
const BONUS_SYMBOL = { emoji: '💥', color: '#ff00ff', name: 'bonus', weight: 8 };

// Получение эффектов предмета игрока
function getPlayerItemEffects() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player || !player.selectedItem) return null;
    return {
        effect: player.selectedItem.effect,
        hasGuaranteedWild: player.selectedItem.effect === 'guaranteedWild',
        hasGuaranteedWildCount: player.selectedItem.effect === 'guaranteedWildCount',
        hasBonusWeightIncrease: player.selectedItem.effect === 'bonusWeightIncrease'
    };
}

// Персонажи (должны совпадать с сервером)
const CHARACTERS = [
    {
        id: 'merchant',
        name: 'Торговец',
        emoji: '💰',
        ability: 'gold',
        description: '+15 постоянного золота',
        abilityValue: 15
    },
    {
        id: 'healer',
        name: 'Лекарь',
        emoji: '💚',
        ability: 'heal',
        description: 'Восстановление текущего здоровья',
        abilityValue: 50
    },
    {
        id: 'guardian',
        name: 'Страж',
        emoji: '🛡️',
        ability: 'block',
        description: 'Блокирование следующего урона',
        abilityValue: 1
    },
    {
        id: 'berserker',
        name: 'Берсерк',
        emoji: '⚔️',
        ability: 'damage',
        description: 'Нанесение 50 урона',
        abilityValue: 50
    }
];

// Определения карт (должны совпадать с сервером)
const CARDS = [
  // Комбинированные карточки
  { id: 'health_dodge_combined', bonus: { health: 20, dodge: 2 } },
  { id: 'health_armor_combined', bonus: { health: 20, armor: 2 } },
  { id: 'dodge_critical_combined', bonus: { dodge: 2, critical: 2, critMultiplier: 0.1 } },
  { id: 'armor_healing_combined', bonus: { armor: 2, healing: 10 } },
  { id: 'critical_freeze_combined', bonus: { critical: 2, critMultiplier: 0.1, freeze: 0.3 } },
  { id: 'health_healing_combined', bonus: { health: 20, healing: 10 } },
  { id: 'dodge_armor_combined', bonus: { dodge: 2, armor: 2 } },
  { id: 'attack_critical_combined', bonus: { attack: 6, critical: 2, critMultiplier: 0.1 } },
  { id: 'attack_dodge_combined', bonus: { attack: 6, dodge: 2 } },
  { id: 'attack_armor_combined', bonus: { attack: 6, armor: 2 } },
  { id: 'attack_health_combined', bonus: { attack: 6, health: 20 } },
  { id: 'attack_healing_combined', bonus: { attack: 6, healing: 10 } },
  { id: 'critical_healing_combined', bonus: { critical: 2, critMultiplier: 0.1, healing: 10 } },
  { id: 'freeze_armor_combined', bonus: { freeze: 0.3, armor: 2 } },
  { id: 'freeze_dodge_combined', bonus: { freeze: 0.3, dodge: 2 } },
  { id: 'attack_freeze_combined', bonus: { attack: 6, freeze: 0.3 } },
  { id: 'critical_armor_combined', bonus: { critical: 2, critMultiplier: 0.1, armor: 2 } },
  { id: 'health_critical_combined', bonus: { health: 20, critical: 2, critMultiplier: 0.1 } },
  // Редкие карточки
  { id: 'health_rare', bonus: { health: 67 } },
  { id: 'dodge_rare', bonus: { dodge: 4 } },
  { id: 'critical_rare', bonus: { critical: 4, critMultiplier: 0.2 } },
  { id: 'armor_rare', bonus: { armor: 4 } },
  { id: 'healing_rare', bonus: { healing: 20 } },
  { id: 'freeze_rare', bonus: { freeze: 0.6 } },
  { id: 'attack_rare', bonus: { attack: 12 } },
  // Легендарные карточки
  { id: 'attack_legendary', bonus: { attack: 4 } },
  { id: 'health_legendary', bonus: { health: 4 } },
  { id: 'healing_legendary', bonus: { healing: 4 } },
  { id: 'freeze_legendary', bonus: { freeze: 4 } },
  { id: 'health_legendary2', bonus: { health: 4 } },
  { id: 'dodge_legendary', bonus: { dodge: 4 } }
];

// Игровое состояние
let gameState = {
    roundHp: 100,
    totalHp: 100,
    enemyRoundHp: 100,
    enemyTotalHp: 100,
    maxHp: 100,
    enemyMaxHp: 100,
    isRecharging: false,
    rechargeTime: 0,
    canSpin: true,
    isSpinning: false,
    rechargeEndTime: 0
};

// Состояние игрока
let playerState = {
    nickname: '',
    socketId: null,
    roomId: null,
    isHost: false,
    currentOpponent: null,
    isInDuel: false,
    permanentGold: 0,
    temporaryGold: 0,
    winStreak: 0,
    loseStreak: 0,
    wins: 0,
    losses: 0,
    lastRoundGoldBonus: 0,
    lastRoundGoldEarned: 0
};

// Состояние комнаты
let roomState = {
    players: [],
    pairs: [],
    currentRound: 0
};

// Состояние игры (контроллер состояний)
let gameStateController = {
    currentState: null,
    stateStartTime: 0,
    roundStartTime: 0,
    breakStartTime: 0,
    preBattleEndTime: 0
};

// Offset между серверным и клиентским временем (для синхронизации)
let serverTimeOffset = 0;

// Получение синхронизированного времени (клиентское время + offset)
function getSyncedTime() {
    return Date.now() + serverTimeOffset;
}

// Элементы DOM
const menuScreen = document.getElementById('menuScreen');
const characterSelectScreen = document.getElementById('characterSelectScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const nicknameInput = document.getElementById('nicknameInput');
const playersCount = document.getElementById('playersCount');
const playersListWaiting = document.getElementById('playersList');
const playersListGame = document.getElementById('playersListGame');
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
const roomsList = document.getElementById('roomsList');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const currentRound = document.getElementById('currentRound');
const playerNickname = document.getElementById('playerNickname');
const leaveGameBtn = document.getElementById('leaveGameBtn');
const errorMessage = document.getElementById('errorMessage');
const spinBtn = document.getElementById('spinBtn');
const rechargeBar = document.getElementById('rechargeBar');
const rechargeFill = document.getElementById('rechargeFill');
const rechargeText = document.getElementById('rechargeText');
const playerHpFill = document.getElementById('playerHpFill');
const playerHpText = document.getElementById('playerHpText');
const enemyHpFill = document.getElementById('enemyHpFill');
const enemyHpText = document.getElementById('enemyHpText');
const playerAvatar = document.getElementById('playerAvatar');
const enemyAvatar = document.getElementById('enemyAvatar');
const gameResultModal = document.getElementById('gameResultModal');
const resultTitle = document.getElementById('resultTitle');
const resultMessage = document.getElementById('resultMessage');
const closeResultBtn = document.getElementById('closeResultBtn');
const duelsContainer = document.getElementById('duelsContainer');
const endTurnBtn = document.getElementById('endTurnBtn');
const roundStatsScreen = document.getElementById('roundStatsScreen');
const roundStatsContent = document.getElementById('roundStatsContent');
const cardShopScreen = document.getElementById('cardShopScreen');
const itemSelectScreen = document.getElementById('itemSelectScreen');
const itemsList = document.getElementById('itemsList');
const itemSelectTimerCountdown = document.getElementById('itemSelectTimerCountdown');
const cardsShopList = document.getElementById('cardsShopList');
const refreshShopBtn = document.getElementById('refreshShopBtn');
const permGoldShop = document.getElementById('permGoldShop');
const tempGoldShop = document.getElementById('tempGoldShop');
const breakTimerCountdown = document.getElementById('breakTimerCountdown');
const readyBtn = document.getElementById('readyBtn');
const roundStatsInShop = document.getElementById('roundStatsInShop');

// Получаем все линии слотов (старая структура для обратной совместимости)
const slotLines = [
    document.querySelectorAll('#line1 .slot-symbol'),
    document.querySelectorAll('#line2 .slot-symbol'),
    document.querySelectorAll('#line3 .slot-symbol')
];

// Получаем все рельсы (столбцы) для новой структуры
const slotReels = [
    document.getElementById('reel1'),
    document.getElementById('reel2'),
    document.getElementById('reel3'),
    document.getElementById('reel4'),
    document.getElementById('reel5')
];

let rechargeInterval = null;
let spinTimeout = null;
let battleTimerInterval = null;
let lastDuelStartTime = null; // Последнее время начала дуэли для предотвращения дублирования таймера

// Обработчики событий Socket.io
socket.on('connect', () => {
    console.log('Подключено к серверу');
    playerState.socketId = socket.id;
    
    // Отменяем таймер отключения, если был
    if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
        disconnectTimeout = null;
    }
    
    // Запрашиваем список комнат
    socket.emit('getRooms');
    
    // Если мы были в игре, пытаемся восстановить состояние
    if (playerState.roomId && gameScreen && gameScreen.classList.contains('active')) {
        // Запрашиваем обновление состояния комнаты
        socket.emit('getRooms');
    }
});

let disconnectTimeout = null;
socket.on('disconnect', (reason) => {
    console.log('Отключено от сервера, причина:', reason);
    
    // Если это не намеренное отключение и игра идет, не возвращаем в меню сразу
    // Socket.io попытается переподключиться автоматически
    if (reason === 'io server disconnect' || reason === 'transport close') {
        // Сервер отключил или потеря соединения - ждем переподключения
        if (gameScreen && gameScreen.classList.contains('active')) {
            showError('Потеряно соединение. Попытка переподключения...');
            // Даем время на переподключение (10 секунд)
            disconnectTimeout = setTimeout(() => {
                if (!socket.connected) {
                    showError('Не удалось переподключиться');
                    resetToMenu();
                }
            }, 10000);
        } else {
            showScreen(menuScreen);
            resetGame();
        }
    } else {
        // Намеренное отключение
        showScreen(menuScreen);
        resetGame();
    }
});

socket.on('connect_error', () => {
    console.log('Ошибка подключения');
});

socket.on('roomCreated', (data) => {
    console.log('Комната создана:', data);
    playerState.roomId = data.roomId;
    playerState.isHost = data.isHost || false;
    if (hostControls) {
        hostControls.style.display = playerState.isHost ? 'block' : 'none';
    }
    // Запрашиваем обновление списка игроков
    socket.emit('getRooms');
    // Показываем экран выбора персонажа
    showCharacterSelect();
    hideError();
});

socket.on('roomJoined', (data) => {
    console.log('Присоединено к комнате:', data);
    playerState.roomId = data.roomId;
    playerState.isHost = data.isHost || false;
    if (hostControls) {
        hostControls.style.display = playerState.isHost ? 'block' : 'none';
    }
    // Запрашиваем обновление списка игроков
    socket.emit('getRooms');
    // Показываем экран выбора персонажа
    showCharacterSelect();
    hideError();
});

socket.on('playerJoined', (data) => {
    console.log('Игрок присоединился:', data);
    if (playersCount) {
        playersCount.textContent = data.playerCount;
    }
    if (data.players) {
        roomState.players = data.players;
        updatePlayersListWaiting();
    }
});

socket.on('roomsList', (rooms) => {
    console.log('Список комнат:', rooms);
    updateRoomsList(rooms);
});

socket.on('becameHost', (data) => {
    console.log('Вы стали хостом');
    playerState.isHost = true;
    if (hostControls) {
        hostControls.style.display = 'block';
    }
    showError('Вы стали хостом комнаты');
});

socket.on('roomStateUpdate', (data) => {
    console.log('Обновление состояния комнаты:', data);
    if (data.players) {
        roomState.players = data.players;
        updatePlayersListGame();
        updateGoldDisplay();
        updateStreakDisplay();
        updateStatsDisplay();
        updateRoundRewardDisplay();
        
        // Обновляем баланс противника
        const player = roomState.players.find(p => p.socketId === playerState.socketId);
        if (player) {
            // Показываем статистику только если:
            // 1. Мы на игровом экране (не на меню)
            // 2. Игрок в комнате (roomId не null)
            // 3. Игрок выбрал персонажа (characterId не null)
            // 4. Прошел хотя бы один раунд (currentRound > 0)
            // 5. Игрок закончил бой или раунд (не в дуэли или дуэль завершена)
            const isInGame = gameScreen && gameScreen.classList.contains('active');
            const isNotInMenu = menuScreen && !menuScreen.classList.contains('active');
            const hasRoom = playerState.roomId !== null;
            const hasCharacter = player.characterId !== null && player.characterId !== undefined;
            const hasCompletedRound = roomState.currentRound > 0;
            
            // Скрываем статистику, если игрок в новой дуэли
            if (player.isInDuel && !player.duelStatus && !player.hasEndedTurn) {
                if (roundStatsScreen) roundStatsScreen.classList.remove('active');
            }
            
            // Показываем статистику только если закончил бой или раунд (не в активной дуэли)
            if (isInGame && isNotInMenu && hasRoom && hasCharacter && hasCompletedRound && (!player.isInDuel || player.duelStatus || player.hasEndedTurn)) {
                // Показываем статистику, если закончил бой или раунд
                showRoundStats();
            }
            
            if (player.isInDuel && player.duelOpponent) {
                const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
                if (opponent) {
                    const enemyTempGold = document.getElementById('enemyTempGold');
                    const enemyPermGold = document.getElementById('enemyPermGold');
                    const enemyName = document.querySelector('.enemy-character .character-name');
                    const enemyAvatar = document.getElementById('enemyAvatar');
                    
                    if (enemyTempGold) enemyTempGold.textContent = opponent.temporaryGold || 0;
                    if (enemyPermGold) enemyPermGold.textContent = opponent.permanentGold || 0;
                    
                    // Обновляем имя и аватар противника
                    if (enemyName) {
                        const character = CHARACTERS.find(c => c.id === opponent.characterId);
                        enemyName.textContent = `${opponent.nickname}${opponent.isBot ? ' 🤖' : ''}`;
                    }
                    if (enemyAvatar && opponent.characterId) {
                        const character = CHARACTERS.find(c => c.id === opponent.characterId);
                        if (character) enemyAvatar.textContent = character.emoji;
                    }
                }
            }
            
            // Синхронизируем перезарядку с сервером при обновлении состояния
            if (player.rechargeEndTime && player.rechargeEndTime > Date.now()) {
                const now = Date.now();
                if (!gameState.isRecharging || player.rechargeEndTime > gameState.rechargeEndTime) {
                    gameState.isRecharging = true;
                    gameState.rechargeEndTime = player.rechargeEndTime;
                    gameState.rechargeTime = player.rechargeEndTime - now;
                    updateRechargeDisplay();
                    if (!rechargeInterval) {
                        rechargeInterval = setInterval(() => {
                            updateRechargeDisplay();
                        }, 50);
                    }
                }
            } else if (player.rechargeEndTime === 0 || !player.rechargeEndTime) {
                // Если на сервере перезарядка закончилась, сбрасываем на клиенте
                if (gameState.isRecharging && gameState.rechargeEndTime <= Date.now()) {
                    if (rechargeInterval) {
                        clearInterval(rechargeInterval);
                        rechargeInterval = null;
                    }
                    gameState.isRecharging = false;
                    gameState.rechargeTime = 0;
                    gameState.rechargeEndTime = 0;
                }
            }
            
            // Обновляем состояние кнопки spin
            enableSpin();
            updateBattlePhase();
            updateCharacterStats();
            updateSpinButtonCost();
            
            // Если игрок в дуэли и есть общее состояние подготовки, запускаем таймер
            if (player.isInDuel && gameStateController.currentState === 'preparation' && 
                gameStateController.preBattleEndTime > 0) {
                startBattleTimerFromState(gameStateController.preBattleEndTime);
            } else if (!player.isInDuel) {
                // Если игрок больше не в дуэли, сбрасываем
                lastDuelStartTime = null;
            }
        }
    }
    if (data.pairs) {
        roomState.pairs = data.pairs;
        updateDuelsDisplay();
    }
    if (data.currentRound !== undefined) {
        roomState.currentRound = data.currentRound;
        if (currentRound) {
            currentRound.textContent = data.currentRound;
        }
    }
    
    // Обновляем магазин и статистику, если экран магазина активен
    if (cardShopScreen && cardShopScreen.classList.contains('active')) {
        updateCardShop();
        updateReadyCount();
    }
});

socket.on('roundStarted', (data) => {
    console.log('Раунд начался:', data);
    roomState.currentRound = data.round;
    roomState.pairs = data.pairs;
    if (currentRound) {
        currentRound.textContent = data.round;
    }
    if (playerNickname && playerState.nickname) {
        playerNickname.textContent = playerState.nickname;
    }
    
    // Останавливаем таймер перерыва
    if (breakTimerInterval) {
        clearInterval(breakTimerInterval);
        breakTimerInterval = null;
    }
    
    // Сбрасываем состояние перезарядки при начале раунда
    if (rechargeInterval) {
        clearInterval(rechargeInterval);
        rechargeInterval = null;
    }
    gameState.isRecharging = false;
    gameState.rechargeTime = 0;
    gameState.rechargeEndTime = 0;
    
    // Скрываем экран статистики и магазина, показываем игровой экран
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    if (cardShopScreen) cardShopScreen.classList.remove('active');
    initGame();
    showScreen(gameScreen);
    updateDuelsDisplay();
    updatePlayersListGame();
    updateGoldDisplay();
    updateStreakDisplay();
    updateStatsDisplay();
    updateRoundRewardDisplay();
    
    // Запускаем таймер перед боем, если игрок в дуэли и есть общее состояние
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player && player.isInDuel && gameStateController.currentState === 'preparation' && 
        gameStateController.preBattleEndTime > 0) {
        startBattleTimerFromState(gameStateController.preBattleEndTime);
    } else if (!player || !player.isInDuel) {
        lastDuelStartTime = null;
    }
    
    // Синхронизируем перезарядку с сервером, если она есть
    if (player && player.rechargeEndTime && player.rechargeEndTime > Date.now()) {
        const now = Date.now();
        gameState.isRecharging = true;
        gameState.rechargeEndTime = player.rechargeEndTime;
        gameState.rechargeTime = player.rechargeEndTime - now;
        updateRechargeDisplay();
        if (!rechargeInterval) {
            rechargeInterval = setInterval(() => {
                updateRechargeDisplay();
            }, 50);
        }
    }
    
    // Обновляем состояние кнопки спин
    enableSpin();
});

socket.on('gameEnded', (data) => {
    console.log('Игра окончена:', data);
    if (data.winner) {
        if (data.winner.socketId === playerState.socketId) {
            showGameResult(true, 'Вы победили в турнире!');
        } else {
            showGameResult(false, `Победитель: ${data.winner.nickname}`);
        }
    } else {
        showGameResult(false, 'Игра завершена');
    }
});

socket.on('gameStart', (data) => {
    console.log('Игра началась:', data);
    playerState.roomId = data.roomId;
    if (playerNickname && playerState.nickname) {
        playerNickname.textContent = playerState.nickname;
    }
    initGame();
    showScreen(gameScreen);
    hideError();
});

socket.on('gameState', (data) => {
    console.log('Получено состояние игры:', data);
    updateGameState(data);
});

socket.on('attack', (data) => {
    console.log('Получена атака:', data);
    if (data.targetPlayerSocketId === playerState.socketId) {
        // Мы получили урон
        takeDamage(data.damage, data.dodged || false, data.crit || false, data.armorReduced || false);
        // Показываем всплывающую табличку урона у противника с комбинацией
        if (data.comboInfo) {
            showEnemyDamagePopup(data.comboInfo, data.damage);
        }
    } else if (data.fromPlayerSocketId === playerState.socketId) {
        // Это наша атака, показываем анимацию на противнике
        showAttackAnimation(data.damage, true, data.dodged || false, data.crit || false, data.armorReduced || false);
        // Сообщение о комбинации уже показано в checkMatches, не дублируем
        // Обновляем состояние для отображения урона боту
        setTimeout(() => {
            updatePlayersListGame();
        }, 100);
    } else {
        // Атака другого игрока, обновляем состояние комнаты
        updatePlayersListGame();
    }
});

// Обработка лечения при спине
socket.on('heal', (data) => {
    const healAmount = data.amount || data.healAmount || 0;
    if (data.playerSocketId === playerState.socketId && healAmount > 0) {
        showFloatingMessage('player', `+${healAmount} HP`, 'heal', healAmount);
        updateHpBars();
    }
});

socket.on('spinRecharge', (data) => {
    console.log('Получена информация о перезарядке:', data);
    
    // Обновляем перезарядку только если это для текущего игрока
    if (data.playerSocketId === playerState.socketId) {
        // Синхронизируем с серверными данными
        const serverRechargeEndTime = data.rechargeEndTime;
        const serverRechargeTime = data.rechargeTime;
        const now = Date.now();
        
        // Если серверное время больше клиентского - используем серверное
        if (serverRechargeEndTime > gameState.rechargeEndTime || !gameState.isRecharging) {
            gameState.isRecharging = true;
            gameState.rechargeTime = serverRechargeTime;
            gameState.rechargeEndTime = serverRechargeEndTime;
            
            // Запускаем интервал обновления, если его нет
            if (!rechargeInterval) {
                rechargeInterval = setInterval(() => {
                    updateRechargeDisplay();
                }, 50);
            }
            
            // Обновляем визуализацию перезарядки
            updateRechargeDisplay();
        }
        
        // Если есть заморозка, показываем информацию
        if (data.freezeApplied && data.freezeApplied > 0) {
            console.log(`Применена заморозка: +${data.freezeApplied} сек`);
        }
    }
});

socket.on('abilityUsed', (data) => {
    console.log('Способность использована:', data);
    // Обновляем щиты при использовании способности
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    const opponent = roomState.players.find(p => p.socketId === (data.fromPlayerSocketId === playerState.socketId ? data.targetPlayerSocketId : data.fromPlayerSocketId));
    
    if (player && data.fromPlayerSocketId === playerState.socketId) {
        // Обновляем щиты игрока
        updateShieldDisplay('player', player.shields);
    }
    
    if (opponent && data.targetPlayerSocketId === playerState.socketId) {
        // Обновляем щиты противника (если это наш противник)
        updateShieldDisplay('enemy', opponent.shields);
    } else if (player && player.isInDuel && player.duelOpponent) {
        const duelOpponent = roomState.players.find(p => p.socketId === player.duelOpponent);
        if (duelOpponent) {
            updateShieldDisplay('enemy', duelOpponent.shields);
        }
    }
    
    // Показываем сообщение о способности только для текущего игрока или его противника
    if (data.message) {
        const isFromCurrentPlayer = data.fromPlayerSocketId === playerState.socketId;
        const isFromOpponent = player && player.isInDuel && player.duelOpponent === data.fromPlayerSocketId;
        
        if (isFromCurrentPlayer || isFromOpponent) {
            const target = isFromCurrentPlayer ? 'player' : 'enemy';
            showFloatingMessage(target, data.message, 'heal');
        }
    }
});

// Обработка выбора предметов
socket.on('itemSelectionRequired', (data) => {
    console.log('Требуется выбор предмета:', data);
    if (!itemSelectScreen || !itemsList) return;
    
    // Показываем экран выбора предметов
    showScreen(itemSelectScreen);
    
    // Отображаем предметы
    itemsList.innerHTML = data.items.map(item => `
        <div class="item-card" data-item-id="${item.id}">
            <div class="item-name">${item.name}</div>
            <div class="item-description">${item.description}</div>
            <div class="item-characteristic">${item.characteristic.description}</div>
            <div class="item-effect">${item.effectDescription}</div>
            <button class="btn btn-primary select-item-btn" data-item-id="${item.id}">Выбрать</button>
        </div>
    `).join('');
    
    // Добавляем обработчики выбора
    itemsList.querySelectorAll('.select-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-item-id');
            socket.emit('selectItem', { itemId });
        });
    });
    
    // Запускаем таймер
    let timeLeft = Math.floor(data.duration / 1000);
    if (itemSelectTimerCountdown) {
        itemSelectTimerCountdown.textContent = timeLeft;
    }
    
    const timerInterval = setInterval(() => {
        timeLeft--;
        if (itemSelectTimerCountdown) {
            itemSelectTimerCountdown.textContent = timeLeft;
        }
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Автоматически выбираем первый предмет, если не выбран
            if (data.items.length > 0) {
                socket.emit('selectItem', { itemId: data.items[0].id });
            }
        }
    }, 1000);
});

socket.on('itemSelected', (data) => {
    console.log('Предмет выбран:', data);
    // Скрываем экран выбора предметов
    if (itemSelectScreen) {
        itemSelectScreen.classList.remove('active');
    }
    // Показываем магазин карт
    if (cardShopScreen) {
        cardShopScreen.classList.add('active');
        updateCardShop();
        updateRoundStatsInShop();
    }
});

// Обработка начала перерыва между боями
let breakTimerInterval = null;
socket.on('breakStarted', (data) => {
    console.log('Начался перерыв между боями:', data);
    
    // Скрываем экран боя и статистику
    if (gameScreen) gameScreen.classList.remove('active');
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    
    // Показываем экран покупки карточек только если нет экрана выбора предметов
    if (itemSelectScreen && itemSelectScreen.classList.contains('active')) {
        return; // Не показываем магазин, если еще выбираем предмет
    }
    if (cardShopScreen) {
        cardShopScreen.classList.add('active');
        // Ждем обновления состояния с предложениями карт
        // Предложения должны быть сгенерированы на сервере в checkAllDuelsFinished
        updateCardShop();
        updateRoundStatsInShop();
        startBreakTimer(data.duration);
    }
});

// Обработка изменения состояния игры
socket.on('gameStateChanged', (data) => {
    console.log('Состояние игры изменилось:', data);
    
    // Вычисляем offset между серверным и клиентским временем для синхронизации
    if (data.serverTime) {
        const clientTime = Date.now();
        serverTimeOffset = data.serverTime - clientTime;
        console.log('Синхронизация времени: offset =', serverTimeOffset, 'мс');
    }
    
    // Обновляем состояние контроллера
    gameStateController.currentState = data.state;
    gameStateController.stateStartTime = data.stateStartTime;
    gameStateController.preBattleEndTime = data.preBattleEndTime || 0;
    gameStateController.roundStartTime = data.roundStartTime || 0;
    gameStateController.breakStartTime = data.breakStartTime || 0;
    
    // Обрабатываем в зависимости от состояния
    if (data.state === 'preparation') {
        // Состояние подготовки к бою - запускаем таймер
        if (data.preBattleEndTime) {
            startBattleTimerFromState(data.preBattleEndTime);
        }
    } else if (data.state === 'battle') {
        // Бой начался - скрываем таймер и разблокируем кнопку
        const battleTimer = document.getElementById('battleTimer');
        const vsText = document.getElementById('vsText');
        if (battleTimer) battleTimer.style.display = 'none';
        if (vsText) vsText.style.display = 'block';
        updateBattlePhase();
        enableSpin();
    } else if (data.state === 'break') {
        // Перерыв - запускаем таймер перерыва
        if (data.breakStartTime) {
            const duration = BREAK_DURATION;
            startBreakTimer(duration);
        }
    }
});

// Запуск таймера перерыва
function startBreakTimer(duration) {
    if (breakTimerInterval) {
        clearInterval(breakTimerInterval);
    }
    
    const startTime = Date.now();
    breakTimerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);
        const seconds = Math.ceil(remaining / 1000);
        
        if (breakTimerCountdown) {
            breakTimerCountdown.textContent = seconds;
        }
        
        if (remaining <= 0) {
            clearInterval(breakTimerInterval);
            breakTimerInterval = null;
        }
    }, 100);
}

// Обновление счетчика готовности игроков
function updateReadyCount() {
    const readyCount = document.getElementById('readyCount');
    if (!readyCount) return;
    
    if (!roomState.players || roomState.players.length === 0) {
        readyCount.textContent = '';
        return;
    }
    
    // Подсчитываем живых игроков (totalHp > 0)
    const alivePlayers = roomState.players.filter(p => p && p.totalHp > 0);
    const readyPlayers = alivePlayers.filter(p => p.isReady === true);
    
    const totalAlive = alivePlayers.length;
    const totalReady = readyPlayers.length;
    
    readyCount.textContent = `${totalReady}/${totalAlive} готовы`;
}

// Обновление уровней стиля игроков в магазине
function updatePlayersStatsInShop() {
    const playersStatsInShop = document.getElementById('playersStatsInShop');
    if (!playersStatsInShop) return;
    
    if (!roomState.players || roomState.players.length === 0) {
        playersStatsInShop.innerHTML = '';
        return;
    }
    
    // Находим текущего игрока
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) {
        playersStatsInShop.innerHTML = '';
        return;
    }
    
    // Названия стилей
    const styleNames = {
        health: '❤️ Здоровье',
        dodge: '💨 Уклонение',
        critical: '⚡ Крит',
        healing: '💚 Лечение',
        armor: '🛡️ Броня',
        freeze: '❄️ Заморозка',
        attack: '⚔️ Атака'
    };
    
    // Получаем статистику из stylePoints (для пороговых бонусов)
    const stylePoints = player.stylePoints || {};
    const attackStyle = stylePoints.attack || 0;
    const armorStyle = stylePoints.armor || 0;
    const dodgeStyle = stylePoints.dodge || 0;
    const critStyle = stylePoints.critical || 0;
    const freezeStyle = stylePoints.freeze || 0;
    const healingStyle = stylePoints.healing || 0;
    
    // Базовые значения
    let baseAttack = 10;
    let baseArmor = 25;
    let baseDodge = 15;
    let baseCritChance = 10;
    let baseCritMultiplier = 1.5;
    let baseFreeze = 0;
    let baseHealing = 0;
    let maxHp = 100;
    
    // Суммируем бонусы из всех купленных карт
    const cardsOwned = player.cardsOwned || {};
    Object.keys(cardsOwned).forEach(cardId => {
        const card = CARDS.find(c => c.id === cardId);
        if (card && card.bonus) {
            const count = cardsOwned[cardId] || 0;
            if (card.bonus.attack) baseAttack += card.bonus.attack * count;
            if (card.bonus.armor) baseArmor += card.bonus.armor * count;
            if (card.bonus.dodge) baseDodge += card.bonus.dodge * count;
            if (card.bonus.critical) baseCritChance += card.bonus.critical * count;
            if (card.bonus.critMultiplier) baseCritMultiplier += card.bonus.critMultiplier * count;
            if (card.bonus.freeze) baseFreeze += card.bonus.freeze * count;
            if (card.bonus.healing) baseHealing += card.bonus.healing * count;
            if (card.bonus.health) maxHp += card.bonus.health * count;
        }
    });
    
    // Применяем пороговые бонусы (на основе stylePoints)
    const attackBonus = getStyleBonus(attackStyle);
    const armorBonus = getStyleBonus(armorStyle);
    const dodgeBonus = getStyleBonus(dodgeStyle);
    const critBonus = getStyleBonus(critStyle);
    
    // Специальные пороговые эффекты для крита
    let critMultBonus = 0;
    if (critStyle >= 20) {
        critMultBonus = 0.75;
    } else if (critStyle >= 10) {
        critMultBonus = 0.5;
    } else if (critStyle >= 4) {
        critMultBonus = 0.25;
    }
    
    // Специальные пороговые эффекты для заморозки
    let freezeTimeBonus = 0;
    if (freezeStyle >= 20) {
        freezeTimeBonus = 5;
    } else if (freezeStyle >= 10) {
        freezeTimeBonus = 3;
    } else if (freezeStyle >= 4) {
        freezeTimeBonus = 2;
    }
    
    // Специальные пороговые эффекты для лечения
    const healingBonus = getStyleBonus(healingStyle);
    
    // Финальные значения
    const finalAttack = Math.round(baseAttack + attackBonus);
    const finalArmor = Math.round(baseArmor + armorBonus);
    const finalDodge = Math.round(baseDodge + dodgeBonus);
    const finalCritChance = Math.round(baseCritChance + critBonus);
    const finalCritMultiplier = (baseCritMultiplier + critMultBonus).toFixed(1);
    const finalFreeze = (baseFreeze + freezeTimeBonus).toFixed(1);
    const finalHealing = Math.round(baseHealing + healingBonus);
    const finalMaxHp = player.maxHp || maxHp;
    
    // Создаем двухколоночный layout
    let html = '<div class="player-stats-compact">';
    html += '<div class="player-stats-column">';
    html += '<div class="player-stats-list">';
    html += `<div class="stat-row"><span>${styleNames.health}:</span> <strong>${stylePoints.health || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.dodge}:</span> <strong>${stylePoints.dodge || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.critical}:</span> <strong>${stylePoints.critical || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.healing}:</span> <strong>${stylePoints.healing || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.armor}:</span> <strong>${stylePoints.armor || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.freeze}:</span> <strong>${stylePoints.freeze || 0}</strong></div>`;
    html += `<div class="stat-row"><span>${styleNames.attack}:</span> <strong>${stylePoints.attack || 0}</strong></div>`;
    html += '</div></div>';
    
    html += '<div class="player-stats-column">';
    html += '<div class="player-stats-list">';
    html += `<div class="stat-row"><span>Макс. HP:</span> <strong>${finalMaxHp}</strong></div>`;
    html += `<div class="stat-row"><span>Атака:</span> <strong>${finalAttack}</strong></div>`;
    html += `<div class="stat-row"><span>Броня:</span> <strong>${finalArmor}%</strong></div>`;
    html += `<div class="stat-row"><span>Уклонение:</span> <strong>${finalDodge}%</strong></div>`;
    html += `<div class="stat-row"><span>Крит. шанс:</span> <strong>${finalCritChance}%</strong></div>`;
    html += `<div class="stat-row"><span>Крит. множ.:</span> <strong>x${finalCritMultiplier}</strong></div>`;
    html += `<div class="stat-row"><span>Заморозка:</span> <strong>${finalFreeze} сек</strong></div>`;
    html += `<div class="stat-row"><span>Лечение:</span> <strong>${finalHealing} HP</strong></div>`;
    html += '</div></div>';
    html += '</div>';
    
    playersStatsInShop.innerHTML = html;
}

// Обновление статистики раунда в магазине
function updateRoundStatsInShop() {
    if (!roundStatsInShop) return;
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player || !roomState.pairs || roomState.pairs.length === 0) {
        roundStatsInShop.innerHTML = '';
        return;
    }
    
    // Формируем статистику всех пар раунда
    let pairsHtml = '<div class="round-stats-section"><h3>Результаты прошлого боя</h3>';
    
    roomState.pairs.forEach((pair, index) => {
        const player1 = roomState.players.find(p => p.socketId === pair[0]);
        const player2 = pair[1] ? roomState.players.find(p => p.socketId === pair[1]) : null;
        
        if (player1) {
            const char1 = CHARACTERS.find(c => c.id === player1.characterId);
            const emoji1 = char1 ? char1.emoji : '👤';
            const name1 = player1.nickname + (player1.isBot ? ' 🤖' : '');
            const hp1 = player1.roundHp || 0;
            const maxHp1 = player1.maxHp || 100;
            const hpPercent1 = Math.max(0, (hp1 / maxHp1) * 100);
            
            let status1 = '';
            if (player1.duelStatus === 'winner') {
                status1 = '<span style="color: #4caf50; font-weight: bold;">🏆 Победитель</span>';
            } else if (player1.duelStatus === 'loser') {
                status1 = '<span style="color: #f44336; font-weight: bold;">💀 Проиграл</span>';
            } else {
                status1 = '<span style="color: #9e9e9e;">⏳ Ожидание</span>';
            }
            
            if (player2) {
                const char2 = CHARACTERS.find(c => c.id === player2.characterId);
                const emoji2 = char2 ? char2.emoji : '👤';
                const name2 = player2.nickname + (player2.isBot ? ' 🤖' : '');
                const hp2 = player2.roundHp || 0;
                const maxHp2 = player2.maxHp || 100;
                const hpPercent2 = Math.max(0, (hp2 / maxHp2) * 100);
                
                let status2 = '';
                if (player2.duelStatus === 'winner') {
                    status2 = '<span style="color: #4caf50; font-weight: bold;">🏆 Победитель</span>';
                } else if (player2.duelStatus === 'loser') {
                    status2 = '<span style="color: #f44336; font-weight: bold;">💀 Проиграл</span>';
                } else {
                    status2 = '<span style="color: #9e9e9e;">⏳ Ожидание</span>';
                }
                
                pairsHtml += `
                    <div class="duel-pair-shop" style="margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 2px solid ${player1.duelStatus === 'winner' || player2.duelStatus === 'winner' ? '#4caf50' : '#ddd'};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <div style="font-size: 18px; margin-bottom: 3px;">${emoji1} ${name1}</div>
                                <div style="margin-bottom: 3px; font-size: 12px;">${status1}</div>
                                <div style="width: 100%; background: #e0e0e0; border-radius: 4px; height: 15px; margin-bottom: 3px;">
                                    <div style="width: ${hpPercent1}%; background: ${hp1 > 0 ? '#4caf50' : '#f44336'}; height: 15px; border-radius: 4px;"></div>
                                </div>
                                <div style="font-size: 11px; color: #666;">HP: ${hp1} / ${maxHp1}</div>
                            </div>
                            <div style="margin: 0 15px; font-size: 18px; font-weight: bold;">VS</div>
                            <div style="flex: 1; text-align: right;">
                                <div style="font-size: 18px; margin-bottom: 3px;">${emoji2} ${name2}</div>
                                <div style="margin-bottom: 3px; font-size: 12px;">${status2}</div>
                                <div style="width: 100%; background: #e0e0e0; border-radius: 4px; height: 15px; margin-bottom: 3px;">
                                    <div style="width: ${hpPercent2}%; background: ${hp2 > 0 ? '#4caf50' : '#f44336'}; height: 15px; border-radius: 4px;"></div>
                                </div>
                                <div style="font-size: 11px; color: #666;">HP: ${hp2} / ${maxHp2}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                pairsHtml += `
                    <div class="duel-pair-shop" style="margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px; border: 2px solid #4caf50;">
                        <div style="text-align: center;">
                            <div style="font-size: 18px; margin-bottom: 5px;">${emoji1} ${name1}</div>
                            <div style="color: #4caf50; font-weight: bold; font-size: 12px;">🏆 Прошел автоматически</div>
                        </div>
                    </div>
                `;
            }
        }
    });
    
    pairsHtml += '</div>';
    roundStatsInShop.innerHTML = pairsHtml;
}

// Обновление магазина карточек
function updateCardShop() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Обновляем золото
    const permGoldEl = document.getElementById('permGoldShop');
    const tempGoldEl = document.getElementById('tempGoldShop');
    if (permGoldEl) permGoldEl.textContent = player.permanentGold || 0;
    if (tempGoldEl) tempGoldEl.textContent = player.temporaryGold || 0;
    
    // Обновляем состояние кнопки готовности
    if (readyBtn) {
        if (player.totalHp <= 0) {
            readyBtn.disabled = true;
            readyBtn.textContent = 'Выбыл';
        } else if (player.isReady) {
            readyBtn.disabled = true;
            readyBtn.textContent = 'Готов ✓';
        } else {
            readyBtn.disabled = false;
            readyBtn.textContent = 'Готов';
        }
    }
    
    // Обновляем статистику раунда
    updateRoundStatsInShop();
    
    // Обновляем уровни стиля игроков
    updatePlayersStatsInShop();
    
    // Обновляем счетчик готовности
    updateReadyCount();
    
    // Отображаем карточки
    const cardsShopList = document.getElementById('cardsShopList');
    if (!cardsShopList) return;
    
    const offers = player.cardShopOffers || [];
    if (offers.length === 0) {
        cardsShopList.innerHTML = '<p style="text-align: center; color: #666;">Нет доступных карточек</p>';
        return;
    }
    
    cardsShopList.innerHTML = offers.map(card => {
        const ownedCount = (player.cardsOwned || {})[card.id] || 0;
        const maxCount = card.rarity === 'legendary' ? 1 
            : card.rarity === 'rare' ? 3 
            : 5;
        const canBuy = ownedCount < maxCount && (player.permanentGold || 0) >= card.cost;
        const rarityClass = card.rarity === 'legendary' ? 'legendary' 
            : card.rarity === 'rare' ? 'rare' 
            : 'common';
        const isAnti = card.isAnti || false;
        
        // Визуальные индикаторы редкости
        const rarityBadge = card.rarity === 'legendary' ? '<span class="rarity-badge legendary-badge">⭐ Легендарная</span>' 
            : card.rarity === 'rare' ? '<span class="rarity-badge rare-badge">💜 Редкая</span>' 
            : '';
        
        return `
            <div class="card-offer ${rarityClass} ${isAnti ? 'anti' : ''}" data-card-id="${card.id}">
                ${rarityBadge}
                <div class="card-title">${card.name}</div>
                <div class="card-description">${card.description}</div>
                <div class="card-cost">💰 ${card.cost} золота</div>
                ${ownedCount > 0 ? `<div class="card-owned">Куплено: ${ownedCount}/${maxCount}</div>` : ''}
                <button class="card-buy-btn" ${!canBuy ? 'disabled' : ''} onclick="buyCard('${card.id.replace(/'/g, "\\'")}')">
                    ${canBuy ? 'Купить' : (ownedCount >= maxCount ? 'Лимит' : 'Недостаточно золота')}
                </button>
            </div>
        `;
    }).join('');
}

// Покупка карточки (глобальная функция для onclick)
window.buyCard = function(cardId) {
    if (!playerState.roomId) return;
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Проверяем, что игрок не исключён
    if (player.isEliminated || player.totalHp <= 0) {
        showError('Вы выбыли из турнира');
        return;
    }
    
    socket.emit('buyCard', { roomId: playerState.roomId, cardId });
};

// Обновление магазина
function refreshCardShop() {
    if (!playerState.roomId) return;
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Проверяем, что игрок не исключён
    if (player.isEliminated || player.totalHp <= 0) {
        showError('Вы выбыли из турнира');
        return;
    }
    
    socket.emit('refreshCardShop', { roomId: playerState.roomId });
}

// Инициализация обработчиков магазина
if (refreshShopBtn) {
    refreshShopBtn.addEventListener('click', () => {
        refreshCardShop();
    });
}

// Обработчик кнопки готовности
if (readyBtn) {
    readyBtn.addEventListener('click', () => {
        if (!playerState.roomId) return;
        const player = roomState.players.find(p => p.socketId === playerState.socketId);
        if (!player) return;
        
        // Проверяем, что игрок не исключён
        if (player.isEliminated || player.totalHp <= 0) {
            showError('Вы выбыли из турнира');
            return;
        }
        
        // Отправляем событие готовности
        socket.emit('playerReady', { roomId: playerState.roomId });
        
        // Обновляем состояние кнопки
        readyBtn.disabled = true;
        readyBtn.textContent = 'Готов ✓';
    });
}

// Обработчики событий карточек
socket.on('cardBought', (data) => {
    if (data.success) {
        showError(data.message);
        updateCardShop();
    } else {
        showError(data.message);
    }
});

socket.on('cardShopRefreshed', (data) => {
    if (data.success) {
        showError(data.message);
        if (data.offers) {
            const player = roomState.players.find(p => p.socketId === playerState.socketId);
            if (player) {
                player.cardShopOffers = data.offers;
            }
        }
        updateCardShop();
    } else {
        showError(data.message);
    }
});

socket.on('playerLeft', (data) => {
    console.log('Игрок покинул комнату:', data);
    if (playersCount) {
        playersCount.textContent = data.playerCount;
    }
    
    // Проверяем, остались ли реальные игроки (не боты) в комнате
    // Не возвращаем в меню, если игра в процессе и есть другие игроки
    const activePlayers = roomState.players.filter(p => !p.isEliminated);
    const realPlayers = activePlayers.filter(p => !p.isBot);
    
    // Возвращаем в меню только если нет реальных игроков (кроме себя) и игра не идет
    if (realPlayers.length < 2 && gameScreen && gameScreen.classList.contains('active') && !roomState.currentRound) {
        showError('Другой игрок покинул игру');
        setTimeout(() => {
            resetToMenu();
        }, 2000);
    }
});

socket.on('roomError', (data) => {
    console.error('Ошибка комнаты:', data.message);
    
    // Проверяем, не является ли игрок исключённым
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player && (player.isEliminated || player.totalHp <= 0)) {
        // Игнорируем ошибки для исключённых игроков, чтобы не показывать лишние сообщения
        return;
    }
    
    showError(data.message);
});

socket.on('characterSelected', (data) => {
    console.log('Персонаж выбран:', data);
    // Переключаемся на экран ожидания после выбора персонажа
    showScreen(waitingScreen);
    // Обновляем список игроков чтобы увидеть статус выбора
    socket.emit('getRooms');
});

// Инициализация игры
function initGame() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp || 100;
        gameState.totalHp = player.totalHp || 100;
        gameState.maxHp = player.maxHp || 100; // Используем динамическое maxHp от сервера
        
        // Обновляем аватар и имя игрока
        const playerAvatar = document.getElementById('playerAvatar');
        const playerName = document.querySelector('.player-character .character-name');
        if (playerAvatar && player.characterId) {
            const character = CHARACTERS.find(c => c.id === player.characterId);
            if (character) playerAvatar.textContent = character.emoji;
        }
        if (playerName) {
            playerName.textContent = `${player.nickname}${player.isBot ? ' 🤖' : ''}`;
        }
    }
    
    // Находим противника
    const opponent = roomState.players.find(p => 
        p.socketId === playerState.currentOpponent || 
        (player && player.isInDuel && p.socketId === player.duelOpponent)
    );
    
    if (opponent) {
        gameState.enemyRoundHp = opponent.roundHp || 100;
        gameState.enemyTotalHp = opponent.totalHp || 100;
        gameState.enemyMaxHp = opponent.maxHp || 100; // Используем динамическое maxHp для противника
        playerState.currentOpponent = opponent.socketId;
        playerState.isInDuel = true;
        
        // Обновляем аватар и имя противника
        const enemyAvatar = document.getElementById('enemyAvatar');
        const enemyName = document.getElementById('enemyName');
        if (enemyAvatar && opponent.characterId) {
            const character = CHARACTERS.find(c => c.id === opponent.characterId);
            if (character) enemyAvatar.textContent = character.emoji;
        }
        if (enemyName) {
            enemyName.textContent = `${opponent.nickname}${opponent.isBot ? ' 🤖' : ''}`;
        }
    } else {
        // Нет противника - скрываем информацию
        const enemyName = document.getElementById('enemyName');
        if (enemyName) enemyName.textContent = 'Противник';
    }
    gameState.isRecharging = false;
    gameState.rechargeTime = 0;
    gameState.canSpin = true;
    gameState.isSpinning = false;
    gameState.rechargeEndTime = 0;
    
    updateHpBars();
    generateInitialSymbols();
    enableSpin();
    updateBattlePhase();
}

// Получение случайного символа с учетом весов
function getRandomSymbol() {
    const itemEffects = getPlayerItemEffects();
    
    // Применяем эффект предмета: +3 к весу бонусного эффекта
    let bonusWeight = BONUS_SYMBOL.weight;
    if (itemEffects && itemEffects.hasBonusWeightIncrease) {
        bonusWeight += 3;
    }
    const adjustedBonusSymbol = { ...BONUS_SYMBOL, weight: bonusWeight };
    
    const allSymbols = [...SYMBOLS, WILD_SYMBOL, adjustedBonusSymbol];
    const totalWeight = allSymbols.reduce((sum, symbol) => sum + symbol.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const symbol of allSymbols) {
        random -= symbol.weight;
        if (random <= 0) {
            return symbol;
        }
    }
    
    // Fallback на первый символ
    return SYMBOLS[0];
}

// Установка символа в элемент
function setSymbol(element, symbol) {
    element.textContent = symbol.emoji;
    element.style.color = symbol.color;
    element.dataset.symbol = symbol.name;
}

// Генерация начальных символов
function generateInitialSymbols() {
    // Используем новую структуру с рельсами
    if (slotReels[0] && slotReels[0].children.length > 0) {
        slotReels.forEach(reel => {
            Array.from(reel.children).forEach((symbol, index) => {
                const randomSymbol = getRandomSymbol();
                setSymbol(symbol, randomSymbol);
                symbol.classList.remove('spinning', 'matched');
                // Сбрасываем позицию
                symbol.style.transform = 'translateY(0)';
                symbol.style.transition = 'none';
            });
        });
    } else {
        // Fallback на старую структуру
        slotLines.forEach(line => {
            line.forEach(symbol => {
                const randomSymbol = getRandomSymbol();
                setSymbol(symbol, randomSymbol);
                symbol.classList.remove('spinning', 'matched');
            });
        });
    }
}

// Обновление состояния игры
function updateGameState(data) {
    // Обновляем состояние из roomStateUpdate
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp || 100;
        gameState.totalHp = player.totalHp || 100;
        gameState.maxHp = player.maxHp || 100; // Обновляем динамическое maxHp
    }
    
    const opponent = roomState.players.find(p => 
        p.socketId === playerState.currentOpponent || 
        (player && player.isInDuel && p.socketId === player.duelOpponent)
    );
    if (opponent) {
        gameState.enemyRoundHp = opponent.roundHp || 100;
        gameState.enemyTotalHp = opponent.totalHp || 100;
        gameState.enemyMaxHp = opponent.maxHp || 100; // Обновляем динамическое maxHp для противника
    }
    updateHpBars();
}

// Обновление HP баров
function updateHpBars() {
    // Игрок - показываем HP раунда
    const playerHpPercent = (gameState.roundHp / gameState.maxHp) * 100;
    if (playerHpFill) {
        playerHpFill.style.width = `${playerHpPercent}%`;
    }
    if (playerHpText) {
        playerHpText.textContent = `Раунд: ${gameState.roundHp} / ${gameState.maxHp} | Всего: ${gameState.totalHp}`;
    }
    
    if (playerHpPercent <= 25) {
        playerHpFill.classList.add('low');
        playerHpFill.classList.remove('medium');
    } else if (playerHpPercent <= 50) {
        playerHpFill.classList.add('medium');
        playerHpFill.classList.remove('low');
    } else {
        playerHpFill.classList.remove('low', 'medium');
    }
    
    // Противник - показываем HP раунда
    const enemyMaxHp = gameState.enemyMaxHp || gameState.maxHp || 100; // Используем enemyMaxHp если доступен
    const enemyHpPercent = (gameState.enemyRoundHp / enemyMaxHp) * 100;
    if (enemyHpFill) {
        enemyHpFill.style.width = `${enemyHpPercent}%`;
    }
    if (enemyHpText) {
        enemyHpText.textContent = `Раунд: ${gameState.enemyRoundHp} / ${enemyMaxHp} | Всего: ${gameState.enemyTotalHp}`;
    }
    
    if (enemyHpPercent <= 25) {
        enemyHpFill.classList.add('low');
        enemyHpFill.classList.remove('medium');
    } else if (enemyHpPercent <= 50) {
        enemyHpFill.classList.add('medium');
        enemyHpFill.classList.remove('low');
    } else {
        enemyHpFill.classList.remove('low', 'medium');
    }
    
    // Проверка победы/поражения в дуэли
    if (gameState.roundHp <= 0) {
        // Проиграли дуэль, но не обязательно всю игру
        const player = roomState.players.find(p => p.socketId === playerState.socketId);
        if (player && player.totalHp <= 0) {
            showGameResult(false, 'Вы выбыли из турнира!');
        }
    } else if (gameState.enemyRoundHp <= 0) {
        // Победили в дуэли
        // Результат будет показан через roomStateUpdate
    }
}

// Спин игрового автомата
function spin() {
    if (gameState.isSpinning) return;
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Проверяем, не закончил ли игрок ход
    if (player.hasEndedTurn) {
        showError('Вы уже закончили ход');
        return;
    }
    
    // Проверяем, не мертв ли противник
    if (player.isInDuel && player.duelOpponent) {
        const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
        if (opponent && (opponent.roundHp <= 0 || opponent.isEliminated)) {
            showError('Противник уже мертв');
            return;
        }
    }
    
    // Проверяем, идет ли перерыв между боями (нет активной дуэли)
    if (!player.isInDuel) {
        showError('Сейчас перерыв между боями');
        return;
    }
    
    // Проверяем таймер перед боем (10 секунд) - используем общее состояние с синхронизацией
    const now = getSyncedTime();
    if (gameStateController.currentState === 'preparation' && 
        gameStateController.preBattleEndTime > 0 && 
        now < gameStateController.preBattleEndTime) {
        const remaining = Math.ceil((gameStateController.preBattleEndTime - now) / 1000);
        showError(`Бой еще не начался! Подождите ${remaining} секунд`);
        return;
    } else if (player.duelStartTime) {
        // Fallback на старый способ для обратной совместимости
        if (now < player.duelStartTime + PRE_BATTLE_DELAY) {
            const remaining = Math.ceil((player.duelStartTime + PRE_BATTLE_DELAY - now) / 1000);
            showError(`Бой еще не начался! Подождите ${remaining} секунд`);
            return;
        }
    }
    
    // Проверяем наличие золота (5 золота на спин)
    const spinCost = 5;
    const totalGold = (player.temporaryGold || 0) + (player.permanentGold || 0);
    if (totalGold < spinCost) {
        showError('Недостаточно золота для спина (нужно 5 золота)');
        return;
    }
    
    // Проверяем перезарядку (используем уже объявленную переменную now)
    if (gameState.isRecharging && now < gameState.rechargeEndTime) {
        // Штраф: добавляем +2 секунды
        const remaining = gameState.rechargeEndTime - now;
        gameState.rechargeTime = remaining + 2000;
        gameState.rechargeEndTime = now + gameState.rechargeTime;
        
        // Обновляем интервал перезарядки
        if (rechargeInterval) {
            clearInterval(rechargeInterval);
        }
        rechargeInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeRemaining = Math.max(0, gameState.rechargeEndTime - currentTime);
            const progress = 1 - (timeRemaining / gameState.rechargeTime);
            if (rechargeFill) {
                rechargeFill.style.width = `${progress * 100}%`;
            }
            if (rechargeText) {
                rechargeText.textContent = timeRemaining > 0 
                    ? `Перезарядка: ${(timeRemaining / 1000).toFixed(1)}с (+2 сек штраф)`
                    : 'Готово';
            }
            if (timeRemaining <= 0) {
                clearInterval(rechargeInterval);
                gameState.isRecharging = false;
                gameState.rechargeTime = 0;
                gameState.rechargeEndTime = 0;
                enableSpin();
            }
        }, 50);
        
        if (rechargeText) {
            rechargeText.textContent = `Перезарядка: +2 сек штраф`;
        }
        return; // Не позволяем спин, пока не прошло 10 секунд
    }
    
    // НАЧИНАЕМ ПЕРЕЗАРЯДКУ С МОМЕНТА НАЖАТИЯ КНОПКИ
    startRecharge();
    
    gameState.isSpinning = true;
    gameState.canSpin = false;
    if (spinBtn) spinBtn.disabled = true;
    
    // Используем новую структуру с рельсами (столбцами)
    if (slotReels[0] && slotReels[0].children.length > 0) {
        spinReels();
    } else {
        // Fallback на старую структуру
        spinOldStructure();
    }
}

// Новая функция спина для рельсов (столбцов)
function spinReels() {
    let completedReels = 0;
    const totalReels = slotReels.length;
    
    // Проверяем эффекты предмета: гарантированный wild при спине
    const itemEffects = getPlayerItemEffects();
    let wildCount = 0;
    if (itemEffects) {
        if (itemEffects.hasGuaranteedWildCount) {
            wildCount = 2; // +2 вайлда
        } else if (itemEffects.hasGuaranteedWild) {
            wildCount = 1; // 1 вайлд
        }
    }
    
    // Генерируем финальные символы для каждого столбца заранее
    const finalSymbols = [];
    for (let i = 0; i < totalReels; i++) {
        const symbols = [];
        for (let j = 0; j < 3; j++) {
            // Применяем гарантированные wild символы к первой линии
            if (wildCount > 0 && i === 0 && j < wildCount) {
                symbols.push(WILD_SYMBOL);
            } else {
                symbols.push(getRandomSymbol());
            }
        }
        finalSymbols.push(symbols);
    }
    
    slotReels.forEach((reel, reelIndex) => {
        // Разная скорость для каждого столбца (от 1.2 до 2.0 секунд для более плавной анимации)
        const baseSpeed = 1200 + Math.random() * 800;
        const speedVariation = 0.85 + (reelIndex * 0.12); // Разная скорость по столбцам
        const spinDuration = baseSpeed * speedVariation;
        
        // Задержка начала для каждого столбца (каскадный эффект)
        const startDelay = reelIndex * 120;
        
        setTimeout(() => {
            reel.classList.add('spinning');
            
            const originalSymbols = Array.from(reel.children);
            const symbolHeight = 60; // Высота символа
            
            // Создаем дополнительные символы для плавной прокрутки (больше символов для бесшовной прокрутки)
            const extraSymbols = [];
            const totalSymbolsNeeded = 20; // Больше символов для более плавной прокрутки
            for (let i = 0; i < totalSymbolsNeeded; i++) {
                const extraSymbol = document.createElement('div');
                extraSymbol.className = 'slot-symbol';
                const randomSymbol = getRandomSymbol();
                setSymbol(extraSymbol, randomSymbol);
                reel.appendChild(extraSymbol);
                extraSymbols.push(extraSymbol);
            }
            
            const allSymbolsInReel = Array.from(reel.children);
            let currentOffset = 0;
            const startTime = Date.now();
            const targetTime = startTime + spinDuration;
            
            function animate() {
                const currentTime = Date.now();
                const elapsed = currentTime - startTime;
                const remaining = targetTime - currentTime;
                const progress = elapsed / spinDuration;
                
                if (remaining <= 0) {
                    // Остановка - устанавливаем финальные символы с плавной анимацией
                    reel.classList.remove('spinning');
                    
                    // Удаляем дополнительные символы
                    extraSymbols.forEach(s => {
                        if (s.parentNode) s.remove();
                    });
                    
                    // Устанавливаем финальные символы с плавным переходом
                    originalSymbols.forEach((symbol, index) => {
                        setSymbol(symbol, finalSymbols[reelIndex][index]);
                        // Плавный переход к финальной позиции
                        symbol.style.transition = 'transform 0.2s ease-out';
                        symbol.style.transform = 'translateY(0)';
                        
                        // Убираем transition после завершения
                        setTimeout(() => {
                            symbol.style.transition = 'none';
                        }, 200);
                    });
                    
                    completedReels++;
                    
                    // Если все столбцы остановились, проверяем совпадения
                    if (completedReels === totalReels) {
                        setTimeout(() => {
                            checkMatches();
                        }, 400);
                    }
                    return;
                }
                
                // Плавное замедление в конце с более реалистичной кривой
                let easeFactor = 1;
                if (progress > 0.5) {
                    // Более плавное и длительное замедление
                    const slowProgress = (progress - 0.5) / 0.5;
                    // Используем более плавную кривую замедления
                    easeFactor = 1 - Math.pow(slowProgress, 2.5);
                }
                
                // Скорость прокрутки с более плавным изменением
                const maxSpeed = 12; // пикселей за кадр
                const minSpeed = 0.3;
                const currentSpeed = minSpeed + (maxSpeed - minSpeed) * easeFactor;
                currentOffset += currentSpeed;
                
                // Обновляем позиции всех символов для плавной прокрутки (сверху вниз)
                allSymbolsInReel.forEach((symbol, index) => {
                    // Вычисляем позицию с учетом прокрутки (направление: сверху вниз)
                    const totalHeight = allSymbolsInReel.length * symbolHeight;
                    const normalizedOffset = currentOffset % totalHeight;
                    // Начальная позиция символа - смещение (движение вниз = отрицательное значение translateY)
                    const basePosition = index * symbolHeight;
                    let position = basePosition - normalizedOffset;
                    
                    // Если символ ушел вниз за пределы видимости, перемещаем его наверх
                    if (position < -symbolHeight) {
                        position = position + totalHeight;
                        // Обновляем символ для эффекта бесконечной прокрутки
                        if (position < symbolHeight * 2 && position > -symbolHeight) {
                            const randomSymbol = getRandomSymbol();
                            setSymbol(symbol, randomSymbol);
                        }
                    }
                    
                    symbol.style.transform = `translateY(${position}px)`;
                    symbol.style.transition = 'none';
                });
                
                requestAnimationFrame(animate);
            }
            
            animate();
        }, startDelay);
    });
}

// Старая функция спина (для обратной совместимости)
function spinOldStructure() {
    const allSymbols = [...SYMBOLS, WILD_SYMBOL, BONUS_SYMBOL];
    let completedSpins = 0;
    const totalSymbols = slotLines.reduce((sum, line) => sum + line.length, 0);
    
    slotLines.forEach((line, lineIndex) => {
        line.forEach((symbol, symbolIndex) => {
            const delay = (lineIndex * 200) + (symbolIndex * 100);
            const spinDuration = 1000 + Math.random() * 1000;
            const spinStartTime = Date.now() + delay;
            
            setTimeout(() => {
                // Начало вращения - добавляем класс для анимации
                symbol.style.transition = 'transform 0.1s linear';
                symbol.classList.add('spinning');
                
                let spinFrame = 0;
                const spinSpeed = 50; // мс между сменами символов
                const totalFrames = Math.floor(spinDuration / spinSpeed);
                
                const spinInterval = setInterval(() => {
                    spinFrame++;
                    const progress = spinFrame / totalFrames;
                    
                    // Замедление в конце
                    const slowDownFactor = progress > 0.7 ? (1 - progress) * 3 : 1;
                    const randomSymbol = getRandomSymbol();
                    setSymbol(symbol, randomSymbol);
                    
                    // Остановка с замедлением
                    if (spinFrame >= totalFrames) {
                        clearInterval(spinInterval);
                        symbol.classList.remove('spinning');
                        symbol.style.transition = 'none';
                        
                        // Финальный символ
                        const finalSymbol = getRandomSymbol();
                        setSymbol(symbol, finalSymbol);
                        
                        completedSpins++;
                        
                        // Если все символы остановились, проверяем совпадения
                        if (completedSpins === totalSymbols) {
                            setTimeout(() => {
                                checkMatches();
                            }, 300);
                        }
                    }
                }, spinSpeed);
            }, delay);
        });
    });
}

// Рисование линии между совпавшими символами
function drawMatchLine(lineElement, matchedIndices) {
    if (matchedIndices.length < 2) return;
    
    // Удаляем старые линии
    const oldLines = lineElement.querySelectorAll('.match-line');
    oldLines.forEach(line => line.remove());
    
    // Получаем позиции первого и последнего совпавшего символа
    const firstSymbol = lineElement.children[matchedIndices[0]];
    const lastSymbol = lineElement.children[matchedIndices[matchedIndices.length - 1]];
    
    if (!firstSymbol || !lastSymbol) return;
    
    const firstRect = firstSymbol.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();
    
    // Вычисляем позицию и размер линии
    const lineLeft = firstSymbol.offsetLeft + firstSymbol.offsetWidth / 2;
    const lineWidth = (lastSymbol.offsetLeft + lastSymbol.offsetWidth / 2) - lineLeft;
    const lineTop = firstSymbol.offsetTop + firstSymbol.offsetHeight / 2 - 2;
    
    // Создаем линию
    const matchLine = document.createElement('div');
    matchLine.className = 'match-line';
    matchLine.style.left = `${lineLeft}px`;
    matchLine.style.top = `${lineTop}px`;
    matchLine.style.width = `${lineWidth}px`;
    
    lineElement.appendChild(matchLine);
    
    // Удаляем линию через 2 секунды
    setTimeout(() => {
        if (matchLine.parentNode) {
            matchLine.remove();
        }
    }, 2000);
}

// Проверка совпадений и расчет урона
function checkMatches() {
    gameState.isSpinning = false;
    
    // Получаем символы из каждой линии
    let results;
    const matchDetails = []; // Объявляем в начале функции
    
    // Используем новую структуру с рельсами
    if (slotReels[0] && slotReels[0].children.length >= 3) {
        // Читаем символы из рельсов (по горизонтали)
        results = [];
        for (let row = 0; row < 3; row++) {
            const line = [];
            slotReels.forEach(reel => {
                const symbols = Array.from(reel.children);
                if (symbols[row]) {
                    line.push(symbols[row].dataset.symbol);
                }
            });
            results.push(line);
        }
    } else {
        // Fallback на старую структуру
        results = slotLines.map(line => {
            return Array.from(line).map(symbol => symbol.dataset.symbol);
        });
    }
    
    // Подсчет бонусов (3 бонуса = 25 урона)
    let bonusCount = 0;
    results.forEach(line => {
        line.forEach(symbol => {
            if (symbol === 'bonus') bonusCount++;
        });
    });
    
    let damage = 0;
    
    // Если 3 или больше бонусов
    if (bonusCount >= 3) {
        damage = 25;
        // Подсветка всех бонусов и рисование линий
        for (let lineIndex = 0; lineIndex < results.length; lineIndex++) {
            const line = results[lineIndex];
            const matchedIndices = [];
            line.forEach((symbolName, symbolIndex) => {
                if (symbolName === 'bonus') {
                    // Находим соответствующий элемент символа
                    let symbolElement;
                    if (slotReels[0] && slotReels[0].children.length >= 3) {
                        // Новая структура
                        const reel = slotReels[symbolIndex];
                        if (reel) {
                            const symbols = Array.from(reel.children);
                            symbolElement = symbols[lineIndex];
                        }
                    } else {
                        // Старая структура
                        symbolElement = slotLines[lineIndex][symbolIndex];
                    }
                    
                    if (symbolElement) {
                        symbolElement.classList.add('matched');
                        matchedIndices.push(symbolIndex);
                        setTimeout(() => {
                            symbolElement.classList.remove('matched');
                        }, 2000);
                    }
                }
            });
            // Рисуем линии для каждой линии с бонусами
            if (matchedIndices.length >= 2) {
                if (slotReels[0] && slotReels[0].children.length >= 3) {
                    // Создаем визуальную линию поверх рельсов
                    const reelsWrapper = document.querySelector('.slot-reels-wrapper');
                    if (reelsWrapper) {
                        // Вычисляем позиции первого и последнего символа
                        const firstReel = slotReels[matchedIndices[0]];
                        const lastReel = slotReels[matchedIndices[matchedIndices.length - 1]];
                        
                        if (firstReel && lastReel) {
                            const firstSymbol = firstReel.children[lineIndex];
                            const lastSymbol = lastReel.children[lineIndex];
                            
                            if (firstSymbol && lastSymbol) {
                                const firstRect = firstSymbol.getBoundingClientRect();
                                const lastRect = lastSymbol.getBoundingClientRect();
                                const wrapperRect = reelsWrapper.getBoundingClientRect();
                                
                                const lineElement = document.createElement('div');
                                lineElement.className = 'slot-line-temp';
                                lineElement.style.position = 'absolute';
                                lineElement.style.top = `${firstRect.top - wrapperRect.top + firstRect.height / 2 - 2}px`;
                                lineElement.style.left = `${firstRect.left - wrapperRect.left + firstRect.width / 2}px`;
                                lineElement.style.width = `${lastRect.left - firstRect.left + lastRect.width / 2 - firstRect.width / 2}px`;
                                lineElement.style.height = '4px';
                                lineElement.style.background = 'linear-gradient(90deg, #4caf50 0%, #8bc34a 100%)';
                                lineElement.style.zIndex = '15';
                                lineElement.style.borderRadius = '2px';
                                lineElement.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.8)';
                                
                                if (reelsWrapper.style.position !== 'relative') {
                                    reelsWrapper.style.position = 'relative';
                                }
                                reelsWrapper.appendChild(lineElement);
                                setTimeout(() => {
                                    if (lineElement.parentNode) {
                                        lineElement.remove();
                                    }
                                }, 2000);
                            }
                        }
                    }
                } else {
                    const lineElement = document.getElementById(`line${lineIndex + 1}`);
                    if (lineElement) {
                        drawMatchLine(lineElement, matchedIndices);
                    }
                }
            }
        }
    } else {
        // Подсчет совпадений по горизонтали (в каждой линии) с учетом wild
        let totalMatches = 0;
        
        results.forEach((line, lineIndex) => {
            // Подсчет wild символов
            let wildCount = 0;
            const regularSymbols = [];
            
            line.forEach(symbol => {
                if (symbol === 'wild') {
                    wildCount++;
                } else if (symbol !== 'bonus') {
                    regularSymbols.push(symbol);
                }
            });
            
            // Подсчет одинаковых символов среди обычных (wild сочетается с любым)
            const symbolCounts = {};
            regularSymbols.forEach(symbol => {
                symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
            });
            
            // Находим максимальное количество совпадений
            const maxRegularMatches = Object.keys(symbolCounts).length > 0 
                ? Math.max(...Object.values(symbolCounts))
                : 0;
            
            // Общее количество совпадений = обычные + wild
            const totalLineMatches = maxRegularMatches + wildCount;
            
            if (totalLineMatches >= 3) {
                totalMatches += totalLineMatches;
                
                // Определяем основной символ для совпадения (первый не-wild, или любой если все wild)
                const matchedSymbol = Object.keys(symbolCounts).length > 0
                    ? Object.keys(symbolCounts).find(key => symbolCounts[key] === maxRegularMatches)
                    : 'wild';
                
                matchDetails.push({ line: lineIndex + 1, matches: totalLineMatches, symbol: matchedSymbol });
                
                const matchedIndices = [];
                
                // Подсветка совпавших символов и сбор индексов
                line.forEach((symbolName, index) => {
                    if (symbolName === 'wild' || symbolName === matchedSymbol) {
                        // Находим соответствующий элемент символа
                        let symbolElement;
                        if (slotReels[0] && slotReels[0].children.length >= 3) {
                            // Новая структура
                            const reel = slotReels[index];
                            if (reel) {
                                const symbols = Array.from(reel.children);
                                symbolElement = symbols[lineIndex];
                            }
                        } else {
                            // Старая структура
                            symbolElement = slotLines[lineIndex][index];
                        }
                        
                        if (symbolElement) {
                            symbolElement.classList.add('matched');
                            matchedIndices.push(index);
                            setTimeout(() => {
                                symbolElement.classList.remove('matched');
                            }, 2000);
                        }
                    }
                });
                
                // Рисуем линию между совпавшими символами
                if (matchedIndices.length >= 2) {
                    // Для новой структуры создаем временный контейнер для линии
                    if (slotReels[0] && slotReels[0].children.length >= 3) {
                        // Создаем визуальную линию поверх рельсов
                        const reelsWrapper = document.querySelector('.slot-reels-wrapper');
                        if (reelsWrapper) {
                            // Вычисляем позиции первого и последнего символа
                            const firstReel = slotReels[matchedIndices[0]];
                            const lastReel = slotReels[matchedIndices[matchedIndices.length - 1]];
                            
                            if (firstReel && lastReel) {
                                const firstSymbol = firstReel.children[lineIndex];
                                const lastSymbol = lastReel.children[lineIndex];
                                
                                if (firstSymbol && lastSymbol) {
                                    const firstRect = firstSymbol.getBoundingClientRect();
                                    const lastRect = lastSymbol.getBoundingClientRect();
                                    const wrapperRect = reelsWrapper.getBoundingClientRect();
                                    
                                    const lineElement = document.createElement('div');
                                    lineElement.className = 'slot-line-temp';
                                    lineElement.style.position = 'absolute';
                                    lineElement.style.top = `${firstRect.top - wrapperRect.top + firstRect.height / 2 - 2}px`;
                                    lineElement.style.left = `${firstRect.left - wrapperRect.left + firstRect.width / 2}px`;
                                    lineElement.style.width = `${lastRect.left - firstRect.left + lastRect.width / 2 - firstRect.width / 2}px`;
                                    lineElement.style.height = '4px';
                                    lineElement.style.background = 'linear-gradient(90deg, #4caf50 0%, #8bc34a 100%)';
                                    lineElement.style.zIndex = '15';
                                    lineElement.style.borderRadius = '2px';
                                    lineElement.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.8)';
                                    
                                    if (reelsWrapper.style.position !== 'relative') {
                                        reelsWrapper.style.position = 'relative';
                                    }
                                    reelsWrapper.appendChild(lineElement);
                                    setTimeout(() => {
                                        if (lineElement.parentNode) {
                                            lineElement.remove();
                                        }
                                    }, 2000);
                                }
                            }
                        }
                    } else {
                        const lineElement = document.getElementById(`line${lineIndex + 1}`);
                        if (lineElement) {
                            drawMatchLine(lineElement, matchedIndices);
                        }
                    }
                }
            }
        });
        
        // Расчет урона: базовый урон * количество совпадений
        const baseDamage = 5;
        damage = baseDamage * totalMatches;
    }
    
    // Формируем информацию о комбинации для отправки
    let comboInfo = null;
    if (bonusCount >= 3) {
        const player = roomState.players.find(p => p.socketId === playerState.socketId);
        const character = CHARACTERS.find(c => c.id === player?.characterId);
        comboInfo = {
            type: 'bonus',
            text: `3+ БОНУСА`,
            description: character ? character.description : 'Способность персонажа',
            damage: 0
        };
    } else if (damage > 0 && matchDetails.length > 0) {
        // Формируем информацию о комбинациях
        const symbolNames = {
            'red': 'КРАСНЫХ',
            'blue': 'СИНИХ',
            'green': 'ЗЕЛЕНЫХ',
            'yellow': 'ЖЕЛТЫХ',
            'purple': 'ФИОЛЕТОВЫХ',
            'wild': 'WILD'
        };
        
        // Функция для получения эмоджи символа
        const getSymbolEmoji = (symbolName) => {
            if (symbolName === 'wild') return WILD_SYMBOL.emoji;
            if (symbolName === 'bonus') return BONUS_SYMBOL.emoji;
            const symbol = SYMBOLS.find(s => s.name === symbolName);
            return symbol ? symbol.emoji : '❓';
        };
        
        // Если несколько комбинаций, показываем все
        if (matchDetails.length > 1) {
            const comboTexts = matchDetails.map(m => {
                const symbolName = symbolNames[m.symbol] || 'СИМВОЛОВ';
                return `${m.matches} ${symbolName}`;
            });
            // Берем первую комбинацию для отображения эмоджи
            const firstMatch = matchDetails[0];
            comboInfo = {
                type: 'combo',
                text: `${matchDetails.length} КОМБИНАЦИИ`,
                combos: comboTexts,
                damage: damage,
                description: `Урон: ${damage}`,
                symbol: firstMatch.symbol,
                symbolEmoji: getSymbolEmoji(firstMatch.symbol),
                matches: firstMatch.matches
            };
        } else {
            // Одна комбинация
            const firstMatch = matchDetails[0];
            const symbolName = symbolNames[firstMatch.symbol] || 'СИМВОЛОВ';
            comboInfo = {
                type: 'combo',
                text: `${firstMatch.matches} ${symbolName} ШАРИКА`,
                damage: damage,
                description: `Урон: ${damage}`,
                symbol: firstMatch.symbol,
                symbolEmoji: getSymbolEmoji(firstMatch.symbol),
                matches: firstMatch.matches
            };
        }
    }
    
    // Всегда отправляем атаку на сервер (золото тратится на сервере всегда, даже если нет комбинации)
    if (playerState.currentOpponent) {
        socket.emit('attack', {
            roomId: playerState.roomId,
            fromPlayerSocketId: playerState.socketId,
            targetPlayerSocketId: playerState.currentOpponent,
            damage: damage,
            matches: bonusCount >= 3 ? 'bonus' : 'normal',
            comboInfo: comboInfo
        });
        
        // Убрали показ комбинации над игроком - теперь показывается только у противника
    }
    
    // Перезарядка уже началась при нажатии кнопки, не запускаем повторно
}

// Обновление визуализации перезарядки
function updateRechargeDisplay() {
    if (!gameState.isRecharging) return;
    
    const now = Date.now();
    const remaining = Math.max(0, gameState.rechargeEndTime - now);
    const progress = gameState.rechargeTime > 0 ? 1 - (remaining / gameState.rechargeTime) : 0;
    
    if (rechargeFill) {
        rechargeFill.style.width = `${progress * 100}%`;
    }
    if (rechargeText) {
        rechargeText.textContent = remaining > 0 
            ? `Перезарядка: ${(remaining / 1000).toFixed(1)}с`
            : 'Готово';
    }
    
    if (remaining <= 0) {
        if (rechargeInterval) {
            clearInterval(rechargeInterval);
            rechargeInterval = null;
        }
        gameState.isRecharging = false;
        gameState.rechargeTime = 0;
        gameState.rechargeEndTime = 0;
        enableSpin();
    }
}

// Начало перезарядки
function startRecharge() {
    // Если перезарядка уже идет (штраф), не перезапускаем
    if (gameState.isRecharging && gameState.rechargeEndTime > Date.now()) {
        return;
    }
    
    // Используем дефолтное время, если сервер еще не отправил данные
    // Сервер отправит точное время через spinRecharge
    if (!gameState.isRecharging || gameState.rechargeTime === 0) {
        gameState.isRecharging = true;
        gameState.rechargeTime = 3000; // Дефолтное время (будет обновлено сервером)
        gameState.rechargeEndTime = Date.now() + gameState.rechargeTime;
    }
    
    const endTime = gameState.rechargeEndTime;
    
    // Блокируем кнопку спин
    if (spinBtn) {
        spinBtn.disabled = true;
    }
    
    // Очищаем предыдущий интервал если есть
    if (rechargeInterval) {
        clearInterval(rechargeInterval);
    }
    
    // Запускаем обновление визуализации
    rechargeInterval = setInterval(() => {
        updateRechargeDisplay();
    }, 50);
    
    // Сразу обновляем отображение
    updateRechargeDisplay();
}

// Включение спина
function enableSpin() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) {
        if (spinBtn) spinBtn.disabled = true;
        return;
    }
    
    const now = getSyncedTime();
    
    // Проверяем условия для доступности спина - используем общее состояние с синхронизацией
    let hasPassedPreBattleTimer = true;
    if (gameStateController.currentState === 'preparation' && gameStateController.preBattleEndTime > 0) {
        hasPassedPreBattleTimer = now >= gameStateController.preBattleEndTime;
    } else if (gameStateController.currentState === 'battle') {
        hasPassedPreBattleTimer = true;
    } else if (player.duelStartTime) {
        // Fallback на старый способ для обратной совместимости
        hasPassedPreBattleTimer = now >= player.duelStartTime + PRE_BATTLE_DELAY;
    }
    
    // Проверяем перезарядку - если она уже закончилась, сбрасываем флаг
    const isRecharging = gameState.isRecharging && now < gameState.rechargeEndTime;
    if (gameState.isRecharging && !isRecharging) {
        // Перезарядка закончилась, сбрасываем состояние
        gameState.isRecharging = false;
        gameState.rechargeTime = 0;
        gameState.rechargeEndTime = 0;
        if (rechargeInterval) {
            clearInterval(rechargeInterval);
            rechargeInterval = null;
        }
    }
    
    // Кнопка доступна если: идет бой И нет перезарядки И прошел таймер подготовки
    // Дополнительные проверки (золото, hasEndedTurn) делаются при нажатии
    const canSpinNow = 
        player.isInDuel && // В дуэли (идет бой)
        hasPassedPreBattleTimer && // Прошел таймер подготовки
        !isRecharging; // Нет перезарядки
    
    gameState.canSpin = canSpinNow;
    if (spinBtn) {
        spinBtn.disabled = !canSpinNow;
        updateSpinButtonCost();
    }
    
    // Обновляем UI перезарядки только если она активна
    if (isRecharging) {
        const remaining = Math.max(0, gameState.rechargeEndTime - now);
        const progress = 1 - (remaining / gameState.rechargeTime);
        if (rechargeFill) {
            rechargeFill.style.width = `${progress * 100}%`;
        }
        if (rechargeText) {
            rechargeText.textContent = remaining > 0 
                ? `Перезарядка: ${(remaining / 1000).toFixed(1)}с`
                : 'Готово';
        }
    } else {
        if (rechargeFill) {
            rechargeFill.style.width = '100%';
        }
        if (rechargeText) {
            rechargeText.textContent = 'Готово';
        }
    }
}

// Показ плавающего сообщения
function showFloatingMessage(target, text, type = 'damage', value = null) {
    const container = target === 'player' 
        ? document.getElementById('playerFloatingMessages')
        : document.getElementById('enemyFloatingMessages');
    
    if (!container) return;
    
    const message = document.createElement('div');
    message.className = `floating-message ${type}`;
    
    // Размер текста зависит от значения
    let fontSize = 16;
    if (value !== null) {
        fontSize = Math.min(24, Math.max(14, 14 + Math.log10(Math.abs(value) + 1) * 3));
    }
    message.style.fontSize = `${fontSize}px`;
    
    // Случайный сдвиг по X
    const offsetX = (Math.random() - 0.5) * 40;
    message.style.setProperty('--offset-x', offsetX);
    
    message.textContent = text;
    container.appendChild(message);
    
    // Удаляем через 1.5 секунды
    setTimeout(() => {
        if (message.parentNode) {
            message.parentNode.removeChild(message);
        }
    }, 1500);
}

// Обновление статистики персонажа
function updateCharacterStats() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Получаем статистику из stylePoints (для пороговых бонусов)
    const stylePoints = player.stylePoints || {};
    const attackStyle = stylePoints.attack || 0;
    const armorStyle = stylePoints.armor || 0;
    const dodgeStyle = stylePoints.dodge || 0;
    const critStyle = stylePoints.critical || 0;
    
    // Базовые значения
    let baseAttack = 10;
    let baseArmor = 25;
    let baseDodge = 15;
    let baseCrit = 10;
    let baseCritMult = 1.5;
    
    // Суммируем бонусы из всех купленных карт
    const cardsOwned = player.cardsOwned || {};
    Object.keys(cardsOwned).forEach(cardId => {
        const card = CARDS.find(c => c.id === cardId);
        if (card && card.bonus) {
            const count = cardsOwned[cardId] || 0;
            if (card.bonus.attack) baseAttack += card.bonus.attack * count;
            if (card.bonus.armor) baseArmor += card.bonus.armor * count;
            if (card.bonus.dodge) baseDodge += card.bonus.dodge * count;
            if (card.bonus.critical) baseCrit += card.bonus.critical * count;
            if (card.bonus.critMultiplier) baseCritMult += card.bonus.critMultiplier * count;
        }
    });
    
    // Применяем бонусы от предмета
    if (player.selectedItem && player.selectedItem.characteristic && player.selectedItem.characteristic.bonus) {
        const itemBonus = player.selectedItem.characteristic.bonus;
        if (itemBonus.attack) baseAttack += itemBonus.attack;
        if (itemBonus.armor) baseArmor += itemBonus.armor;
        if (itemBonus.dodge) baseDodge += itemBonus.dodge;
        if (itemBonus.critical) baseCrit += itemBonus.critical;
        if (itemBonus.critMultiplier) baseCritMult += itemBonus.critMultiplier;
        if (itemBonus.health) {
            // Здоровье учитывается отдельно в maxHp
        }
    }
    
    // Применяем пороговые бонусы (на основе stylePoints)
    const attackBonus = getStyleBonus(attackStyle);
    const armorBonus = getStyleBonus(armorStyle);
    const dodgeBonus = getStyleBonus(dodgeStyle);
    const critBonus = getStyleBonus(critStyle);
    
    // Специальные пороговые эффекты для крита
    let critMultBonus = 0;
    if (critStyle >= 20) {
        critMultBonus = 0.75;
    } else if (critStyle >= 10) {
        critMultBonus = 0.5;
    } else if (critStyle >= 4) {
        critMultBonus = 0.25;
    }
    
    const finalAttack = baseAttack + attackBonus;
    const finalArmor = baseArmor + armorBonus;
    const finalDodge = baseDodge + dodgeBonus;
    const finalCrit = baseCrit + critBonus;
    const finalCritMult = baseCritMult + critMultBonus;
    
    // Обновляем tooltip для игрока (характеристики теперь только в tooltip)
    updateStatsTooltip('player', player, finalAttack, finalArmor, finalDodge, finalCrit, finalCritMult);
    
    // Обновляем статистику противника
    if (player.isInDuel && player.duelOpponent) {
        const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
        if (opponent) {
            const oppStylePoints = opponent.stylePoints || {};
            const oppAttackStyle = oppStylePoints.attack || 0;
            const oppArmorStyle = oppStylePoints.armor || 0;
            const oppDodgeStyle = oppStylePoints.dodge || 0;
            const oppCritStyle = oppStylePoints.critical || 0;
            
            // Базовые значения
            let oppBaseAttack = 10;
            let oppBaseArmor = 25;
            let oppBaseDodge = 15;
            let oppBaseCrit = 10;
            let oppBaseCritMult = 1.5;
            
            // Суммируем бонусы из всех купленных карт противника
            const oppCardsOwned = opponent.cardsOwned || {};
            Object.keys(oppCardsOwned).forEach(cardId => {
                const card = CARDS.find(c => c.id === cardId);
                if (card && card.bonus) {
                    const count = oppCardsOwned[cardId] || 0;
                    if (card.bonus.attack) oppBaseAttack += card.bonus.attack * count;
                    if (card.bonus.armor) oppBaseArmor += card.bonus.armor * count;
                    if (card.bonus.dodge) oppBaseDodge += card.bonus.dodge * count;
                    if (card.bonus.critical) oppBaseCrit += card.bonus.critical * count;
                    if (card.bonus.critMultiplier) oppBaseCritMult += card.bonus.critMultiplier * count;
                }
            });
            
            const oppAttackBonus = getStyleBonus(oppAttackStyle);
            const oppArmorBonus = getStyleBonus(oppArmorStyle);
            const oppDodgeBonus = getStyleBonus(oppDodgeStyle);
            const oppCritBonus = getStyleBonus(oppCritStyle);
            
            // Специальные пороговые эффекты для крита
            let oppCritMultBonus = 0;
            if (oppCritStyle >= 20) {
                oppCritMultBonus = 0.75;
            } else if (oppCritStyle >= 10) {
                oppCritMultBonus = 0.5;
            } else if (oppCritStyle >= 4) {
                oppCritMultBonus = 0.25;
            }
            
            const finalOppAttack = oppBaseAttack + oppAttackBonus;
            const finalOppArmor = oppBaseArmor + oppArmorBonus;
            const finalOppDodge = oppBaseDodge + oppDodgeBonus;
            const finalOppCrit = oppBaseCrit + oppCritBonus;
            const finalOppCritMult = oppBaseCritMult + oppCritMultBonus;
            
            // Обновляем tooltip для противника (характеристики теперь только в tooltip)
            updateStatsTooltip('enemy', opponent, finalOppAttack, finalOppArmor, finalOppDodge, finalOppCrit, finalOppCritMult);
            
            // Обновляем визуализацию щитов противника
            updateShieldDisplay('enemy', opponent.shields);
        }
    }
    
    // Обновляем визуализацию щитов игрока
    updateShieldDisplay('player', player.shields);
}

// Обновление визуализации щитов
function updateShieldDisplay(target, shields) {
    const containerId = target === 'player' ? 'playerCharacterContainer' : 'enemyCharacterContainer';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Удаляем существующий индикатор щита
    const existingShield = container.querySelector('.shield-indicator');
    if (existingShield) {
        existingShield.remove();
    }
    
    // Если есть щиты, создаем индикатор
    const shieldCount = shields ? shields.length : 0;
    if (shieldCount > 0) {
        const shieldIndicator = document.createElement('div');
        shieldIndicator.className = 'shield-indicator active';
        if (shieldCount > 1) {
            shieldIndicator.classList.add('multiple');
        }
        
        const shieldCountEl = document.createElement('div');
        shieldCountEl.className = 'shield-count';
        shieldCountEl.textContent = shieldCount;
        shieldIndicator.appendChild(shieldCountEl);
        
        container.appendChild(shieldIndicator);
    }
}

// Обновление tooltip с характеристиками
function updateStatsTooltip(target, player, attack, armor, dodge, crit, critMult) {
    const tooltipId = target === 'player' ? 'playerStatsTooltip' : 'enemyStatsTooltip';
    const tooltip = document.getElementById(tooltipId);
    if (!tooltip) return;
    
    const character = CHARACTERS.find(c => c.id === player.characterId);
    const characterName = character ? character.name : 'Без персонажа';
    
    // Получаем уровни стилей
    const stylePoints = player.stylePoints || {};
    const styleNames = {
        health: '❤️ Здоровье',
        dodge: '💨 Уклонение',
        critical: '⚡ Крит',
        healing: '💚 Лечение',
        armor: '🛡️ Броня',
        freeze: '❄️ Заморозка',
        attack: '⚔️ Атака'
    };
    
    // Формируем список стилей
    let styleList = '';
    Object.keys(styleNames).forEach(styleType => {
        const points = stylePoints[styleType] || 0;
        if (points > 0) {
            styleList += `<div class="tooltip-stat">${styleNames[styleType]}: <strong>${points}</strong></div>`;
        }
    });
    
    if (!styleList) {
        styleList = '<div class="tooltip-stat" style="color: #999;">Нет очков стиля</div>';
    }
    
    // Формируем информацию о предмете
    let itemInfo = '';
    if (player.selectedItem) {
        const item = player.selectedItem;
        itemInfo = `
            <div class="tooltip-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
                <strong>🎁 Предмет:</strong>
                <div class="tooltip-stat" style="color: #ff9800; font-weight: bold;">${item.name}</div>
                <div class="tooltip-stat" style="font-size: 12px; color: #4caf50;">${item.characteristic.description}</div>
                <div class="tooltip-stat" style="font-size: 12px; color: #ff9800;">${item.effectDescription}</div>
            </div>
        `;
    }
    
    tooltip.innerHTML = `
        <div class="tooltip-title">${player.nickname}${player.isBot ? ' 🤖' : ''}</div>
        <div class="tooltip-stat">Персонаж: <strong>${characterName}</strong></div>
        <div class="tooltip-stat">⚔️ Атака: <strong>${Math.round(attack)}</strong></div>
        <div class="tooltip-stat">🛡️ Броня: <strong>${Math.round(armor)}%</strong></div>
        <div class="tooltip-stat">💨 Уклонение: <strong>${Math.round(dodge)}%</strong></div>
        <div class="tooltip-stat">⚡ Крит: <strong>${Math.round(crit)}%</strong> (x${critMult.toFixed(1)})</div>
        ${itemInfo}
        <div class="tooltip-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
            <strong>Уровни стилей:</strong>
        </div>
        ${styleList}
        <div class="tooltip-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
            <div class="tooltip-stat">❤️ HP: <strong>${player.roundHp} / 100</strong> (Раунд)</div>
            <div class="tooltip-stat">❤️ HP: <strong>${player.totalHp} / 100</strong> (Всего)</div>
            <div class="tooltip-stat">💰 Золото: <strong>${player.permanentGold || 0}</strong> (постоянное)</div>
            <div class="tooltip-stat">💵 Золото: <strong>${player.temporaryGold || 0}</strong> (временное)</div>
        </div>
    `;
}

// Получение бонуса за пороги стиля
function getStyleBonus(stylePoints) {
    if (stylePoints >= 20) return 15;
    if (stylePoints >= 10) return 10;
    if (stylePoints >= 4) return 5;
    return 0;
}

// Получение урона
function takeDamage(damage, dodged = false, crit = false, armorReduced = false) {
    if (dodged) {
        showFloatingMessage('player', 'Уклонение!', 'dodge');
        return;
    }
    
    gameState.roundHp = Math.max(0, gameState.roundHp - damage);
    
    // Обновляем из состояния комнаты
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp;
        gameState.totalHp = player.totalHp;
        gameState.maxHp = player.maxHp || 100; // Обновляем динамическое maxHp
    }
    
    updateHpBars();
    
    // Показываем урон (после снижения броней, если было)
    if (armorReduced) {
        // Урон был снижен броней - показываем финальный урон
        if (crit) {
            showFloatingMessage('player', `КРИТ! -${damage}`, 'crit', damage);
        } else {
            showFloatingMessage('player', `-${damage}`, 'damage', damage);
        }
    } else {
        // Обычный урон
        if (crit) {
            showFloatingMessage('player', `КРИТ! -${damage}`, 'crit', damage);
        } else {
            showFloatingMessage('player', `-${damage}`, 'damage', damage);
        }
    }
    
    // Анимация получения урона
    const playerContainer = document.querySelector('.player-character');
    if (playerContainer) {
        playerContainer.classList.add('taking-damage');
        setTimeout(() => {
            playerContainer.classList.remove('taking-damage');
        }, 500);
    }
}

// Показ анимации атаки
function showAttackAnimation(damage, isMyAttack = false, dodged = false, crit = false, armorReduced = false) {
    const target = isMyAttack ? 'enemy' : 'player';
    const targetContainer = isMyAttack 
        ? document.querySelector('.enemy-character')
        : document.querySelector('.player-character');
    
    if (dodged) {
        showFloatingMessage(target, 'Уклонение!', 'dodge');
        return;
    }
    
    if (targetContainer) {
        targetContainer.classList.add('taking-damage');
        setTimeout(() => {
            targetContainer.classList.remove('taking-damage');
        }, 500);
    }
    
    // Показываем урон (после снижения броней, если было)
    if (armorReduced) {
        // Урон был снижен броней - показываем финальный урон
        if (crit) {
            showFloatingMessage(target, `КРИТ! -${damage}`, 'crit', damage);
        } else {
            showFloatingMessage(target, `-${damage}`, 'damage', damage);
        }
    } else {
        // Обычный урон
        if (crit) {
            showFloatingMessage(target, `КРИТ! -${damage}`, 'crit', damage);
        } else {
            showFloatingMessage(target, `-${damage}`, 'damage', damage);
        }
    }
    
    // HP обновляется через gameState от другого игрока, здесь только анимация
}

// Показ всплывающего сообщения о комбинации (только для противника, если нужно)
function showComboMessage(target, comboInfo) {
    if (!comboInfo) return;
    // Эта функция больше не используется для игрока, только для обратной совместимости
    if (target === 'player') return;
    
    const containerId = target === 'player' ? 'playerComboMessages' : 'enemyComboMessages';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Создаем элемент сообщения
    const messageEl = document.createElement('div');
    messageEl.className = 'combo-message';
    
    if (comboInfo.type === 'bonus') {
        messageEl.className += ' combo-bonus';
        messageEl.innerHTML = `
            <div class="combo-title">${comboInfo.text}</div>
            <div class="combo-description">${comboInfo.description}</div>
        `;
    } else {
        messageEl.className += ' combo-normal';
        if (comboInfo.combos && comboInfo.combos.length > 1) {
            // Несколько комбинаций
            messageEl.innerHTML = `
                <div class="combo-title">${comboInfo.text}</div>
                <div class="combo-multiple">${comboInfo.combos.join(', ')}</div>
                <div class="combo-damage">Урон: ${comboInfo.damage}</div>
            `;
        } else {
            // Одна комбинация
            messageEl.innerHTML = `
                <div class="combo-title">${comboInfo.text}</div>
                <div class="combo-damage">Урон: ${comboInfo.damage}</div>
            `;
        }
    }
    
    container.appendChild(messageEl);
    
    // Анимация появления
    setTimeout(() => {
        messageEl.classList.add('show');
    }, 10);
    
    // Удаление через 3 секунды
    setTimeout(() => {
        messageEl.classList.add('hide');
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 500);
    }, 3000);
}

// Показ всплывающей таблички урона у противника с комбинацией
function showEnemyDamagePopup(comboInfo, damage) {
    if (!comboInfo || !damage) return;
    
    const enemyContainer = document.getElementById('enemyCharacterContainer');
    if (!enemyContainer) return;
    
    // Создаем всплывающую табличку
    const popup = document.createElement('div');
    popup.className = 'enemy-damage-popup';
    
    let comboDisplay = '';
    if (comboInfo.type === 'bonus') {
        // Для бонуса показываем 3 бонусных символа
        comboDisplay = `${BONUS_SYMBOL.emoji} ${BONUS_SYMBOL.emoji} ${BONUS_SYMBOL.emoji}`;
    } else if (comboInfo.symbolEmoji) {
        // Используем эмоджи из comboInfo (если есть)
        const matches = comboInfo.matches || 3;
        comboDisplay = `${comboInfo.symbolEmoji} ${comboInfo.symbolEmoji} ${comboInfo.symbolEmoji}`;
    } else {
        // Fallback: пытаемся извлечь из текста
        const getSymbolEmoji = (symbolName) => {
            if (symbolName === 'wild') return WILD_SYMBOL.emoji;
            if (symbolName === 'bonus') return BONUS_SYMBOL.emoji;
            const symbol = SYMBOLS.find(s => s.name === symbolName);
            return symbol ? symbol.emoji : '❓';
        };
        
        if (comboInfo.symbol) {
            const emoji = getSymbolEmoji(comboInfo.symbol);
            comboDisplay = `${emoji} ${emoji} ${emoji}`;
        } else {
            // Последняя попытка - извлекаем из text
            const text = comboInfo.text || '';
            const match = text.match(/(\d+)\s+(\w+)/);
            if (match) {
                const symbolName = match[2].toLowerCase();
                let symbolEmoji = '❓';
                if (symbolName.includes('красн')) symbolEmoji = SYMBOLS.find(s => s.name === 'red')?.emoji || '🔴';
                else if (symbolName.includes('син')) symbolEmoji = SYMBOLS.find(s => s.name === 'blue')?.emoji || '🔵';
                else if (symbolName.includes('зелен')) symbolEmoji = SYMBOLS.find(s => s.name === 'green')?.emoji || '🟢';
                else if (symbolName.includes('желт')) symbolEmoji = SYMBOLS.find(s => s.name === 'yellow')?.emoji || '🟡';
                else if (symbolName.includes('фиолет')) symbolEmoji = SYMBOLS.find(s => s.name === 'purple')?.emoji || '🟣';
                else if (symbolName.includes('wild')) symbolEmoji = WILD_SYMBOL.emoji;
                
                comboDisplay = `${symbolEmoji} ${symbolEmoji} ${symbolEmoji}`;
            } else {
                comboDisplay = '❓ ❓ ❓';
            }
        }
    }
    
    popup.innerHTML = `
        <div class="enemy-damage-combo">${comboDisplay}</div>
        <div class="enemy-damage-value">-${damage}</div>
    `;
    
    enemyContainer.appendChild(popup);
    
    // Анимация появления
    setTimeout(() => {
        popup.classList.add('show');
    }, 10);
    
    // Удаление через 2.5 секунды
    setTimeout(() => {
        popup.classList.add('hide');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
        }, 500);
    }, 2500);
}

// Показ результата игры (победа/поражение)
function showGameResult(isVictory, message = null) {
    if (!gameResultModal || !resultTitle || !resultMessage) return;
    
    if (isVictory) {
        resultTitle.textContent = '🎉 Победа!';
        resultMessage.textContent = message || 'Вы победили противника!';
        gameResultModal.classList.add('show');
    } else {
        resultTitle.textContent = '💀 Поражение';
        resultMessage.textContent = message || 'Вы проиграли. Попробуйте еще раз!';
        gameResultModal.classList.add('show');
    }
    
    // Автоматически закрываем через 5 секунд и возвращаем в меню
    setTimeout(() => {
        closeGameResult();
        setTimeout(() => {
            resetToMenu();
        }, 500);
    }, 5000);
}

// Обновление списка комнат
function updateRoomsList(rooms) {
    if (!roomsList) return;
    
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Нет доступных комнат</p>';
        return;
    }
    
    roomsList.innerHTML = rooms.map(room => {
        const realCount = room.realPlayerCount !== undefined ? room.realPlayerCount : room.playerCount;
        const botCount = room.playerCount - realCount;
        const botInfo = botCount > 0 ? ` (${botCount} ботов)` : '';
        const noBotsBadge = room.noBots ? '<span style="color: #4caf50; font-weight: bold; margin-left: 10px;">🚫 Без ботов</span>' : '';
        
        return `
            <div class="room-item" data-room-id="${room.id}">
                <div class="room-item-info">
                    <div class="room-item-id">${room.id}${noBotsBadge}</div>
                    <div class="room-item-count">${realCount} реальных${botInfo} / ${room.maxPlayers} игроков</div>
                </div>
                <button class="btn btn-small" onclick="joinRoomById('${room.id}')">Присоединиться</button>
            </div>
        `;
    }).join('');
}

// Присоединение к комнате по ID
function joinRoomById(roomId) {
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    socket.emit('joinRoom', { roomId, nickname: nickname || undefined });
}

// Обновление списка игроков в ожидании
function updatePlayersListWaiting() {
    if (!playersListWaiting) return;
    
    if (roomState.players.length === 0) {
        playersListWaiting.innerHTML = '';
        return;
    }
    
    playersListWaiting.innerHTML = roomState.players.map(player => {
        const isHost = player.socketId === (roomState.players[0]?.socketId);
        const isBot = player.isBot || false;
        const hasCharacter = player.characterId ? true : false;
        
        // Находим информацию о персонаже
        let characterInfo = '';
        if (hasCharacter) {
            const character = CHARACTERS.find(c => c.id === player.characterId);
            if (character) {
                characterInfo = ` ${character.emoji} ${character.name}`;
            }
        }
        
        const statusText = isBot ? '✅ Выбрал' : (hasCharacter ? '✅ Выбрал' : '⏳ Выбирает...');
        
        return `
            <div class="player-item-waiting ${isHost ? 'host' : ''}">
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <span>${player.nickname}${isHost ? ' (Хост)' : ''}${isBot ? ' 🤖' : ''}</span>
                    <span style="font-size: 12px; color: ${hasCharacter ? '#4caf50' : '#ff9800'};">
                        ${statusText}${characterInfo}
                    </span>
                </div>
                <span>HP: ${player.totalHp}</span>
            </div>
        `;
    }).join('');
}

// Обновление списка игроков в игре
function updatePlayersListGame() {
    if (!playersListGame) return;
    
    // Обновляем состояние игрока из комнаты
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp;
        gameState.totalHp = player.totalHp;
        
        // Обновляем золото
        if (player.permanentGold !== undefined) {
            playerState.permanentGold = player.permanentGold;
        }
        if (player.temporaryGold !== undefined) {
            playerState.temporaryGold = player.temporaryGold;
        }
        // Обновляем серии
        if (player.winStreak !== undefined) {
            playerState.winStreak = player.winStreak;
        }
        if (player.loseStreak !== undefined) {
            playerState.loseStreak = player.loseStreak;
        }
        if (player.wins !== undefined) {
            playerState.wins = player.wins;
        }
        if (player.losses !== undefined) {
            playerState.losses = player.losses;
        }
        if (player.lastRoundGoldBonus !== undefined) {
            playerState.lastRoundGoldBonus = player.lastRoundGoldBonus;
        }
        if (player.lastRoundGoldEarned !== undefined) {
            playerState.lastRoundGoldEarned = player.lastRoundGoldEarned;
        }
        updateGoldDisplay();
        updateStreakDisplay();
        updateStatsDisplay();
        updateRoundRewardDisplay();
        
        // Обновляем состояние кнопки "Закончил ход"
        if (endTurnBtn) {
            if (player.hasEndedTurn) {
                endTurnBtn.disabled = true;
                endTurnBtn.textContent = 'Ход завершен';
            } else if (player.isInDuel) {
                endTurnBtn.disabled = false;
                endTurnBtn.textContent = 'Закончил ход';
            } else {
                endTurnBtn.disabled = true;
            }
        }
        
        if (player.isInDuel && player.duelOpponent) {
            playerState.currentOpponent = player.duelOpponent;
            playerState.isInDuel = true;
            
            const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
            if (opponent) {
                gameState.enemyRoundHp = opponent.roundHp;
                gameState.enemyTotalHp = opponent.totalHp;
                gameState.enemyMaxHp = opponent.maxHp || 100; // Обновляем динамическое maxHp для противника
                
                // Обновляем баланс противника
                const enemyGoldDisplay = document.getElementById('enemyGoldDisplay');
                const enemyTempGold = document.getElementById('enemyTempGold');
                const enemyPermGold = document.getElementById('enemyPermGold');
                if (enemyGoldDisplay && enemyTempGold && enemyPermGold) {
                    enemyGoldDisplay.style.display = 'block';
                    enemyTempGold.textContent = opponent.temporaryGold || 0;
                    enemyPermGold.textContent = opponent.permanentGold || 0;
                }
                
                // Таймер запускается в roundStarted, не запускаем здесь повторно
            }
        } else {
            // Скрываем баланс противника, если не в дуэли
            const enemyGoldDisplay = document.getElementById('enemyGoldDisplay');
            if (enemyGoldDisplay) {
                enemyGoldDisplay.style.display = 'none';
            }
        }
        
        updateHpBars();
    }
    
    if (roomState.players.length === 0) {
        playersListGame.innerHTML = '';
        return;
    }
    
    playersListGame.innerHTML = roomState.players.map(player => {
        const isMe = player.socketId === playerState.socketId;
        const isBot = player.isBot || false;
        const statusClass = player.isEliminated ? 'eliminated' : 
                          player.duelStatus === 'winner' ? 'winner' :
                          player.duelStatus === 'loser' ? 'loser' :
                          player.isInDuel ? 'in-duel' : '';
        
        const roundHpPercent = (player.roundHp / 100) * 100;
        const totalHpPercent = (player.totalHp / 100) * 100;
        
        // Находим персонажа
        const character = CHARACTERS.find(c => c.id === player.characterId);
        const characterEmoji = character ? character.emoji : '👤';
        const characterName = character ? character.name : 'Без персонажа';
        
        // Вычисляем статистику для tooltip (используем бонусы из карт)
        const stylePoints = player.stylePoints || {};
        const attackStyle = stylePoints.attack || 0;
        const armorStyle = stylePoints.armor || 0;
        const dodgeStyle = stylePoints.dodge || 0;
        const critStyle = stylePoints.critical || 0;
        
        // Базовые значения
        let baseAttack = 10;
        let baseArmor = 25;
        let baseDodge = 15;
        let baseCrit = 10;
        let baseCritMult = 1.5;
        
        // Суммируем бонусы из всех купленных карт
        const cardsOwned = player.cardsOwned || {};
        Object.keys(cardsOwned).forEach(cardId => {
            const card = CARDS.find(c => c.id === cardId);
            if (card && card.bonus) {
                const count = cardsOwned[cardId] || 0;
                if (card.bonus.attack) baseAttack += card.bonus.attack * count;
                if (card.bonus.armor) baseArmor += card.bonus.armor * count;
                if (card.bonus.dodge) baseDodge += card.bonus.dodge * count;
                if (card.bonus.critical) baseCrit += card.bonus.critical * count;
                if (card.bonus.critMultiplier) baseCritMult += card.bonus.critMultiplier * count;
            }
        });
        
        const attackBonus = getStyleBonus(attackStyle);
        const armorBonus = getStyleBonus(armorStyle);
        const dodgeBonus = getStyleBonus(dodgeStyle);
        const critBonus = getStyleBonus(critStyle);
        
        // Специальные пороговые эффекты для крита
        let critMultBonus = 0;
        if (critStyle >= 20) {
            critMultBonus = 0.75;
        } else if (critStyle >= 10) {
            critMultBonus = 0.5;
        } else if (critStyle >= 4) {
            critMultBonus = 0.25;
        }
        
        const finalAttack = baseAttack + attackBonus;
        const finalArmor = baseArmor + armorBonus;
        const finalDodge = baseDodge + dodgeBonus;
        const finalCrit = baseCrit + critBonus;
        const finalCritMult = baseCritMult + critMultBonus;
        
        // Получаем уровни стилей (используем уже объявленную переменную stylePoints)
        const styleNames = {
            health: '❤️ Здоровье',
            dodge: '💨 Уклонение',
            critical: '⚡ Крит',
            healing: '💚 Лечение',
            armor: '🛡️ Броня',
            freeze: '❄️ Заморозка',
            attack: '⚔️ Атака'
        };
        
        // Формируем список стилей
        let styleList = '';
        Object.keys(styleNames).forEach(styleType => {
            const points = stylePoints[styleType] || 0;
            if (points > 0) {
                styleList += `<div class="tooltip-stat">${styleNames[styleType]}: <strong>${points}</strong></div>`;
            }
        });
        
        if (!styleList) {
            styleList = '<div class="tooltip-stat" style="color: #999;">Нет очков стиля</div>';
        }
        
        return `
            <div class="player-item-game ${statusClass}" data-player-id="${player.socketId}" style="position: relative; cursor: pointer;">
                <div class="player-item-header">
                    <span class="player-item-name">
                        ${characterEmoji} ${player.nickname}${isMe ? ' (Вы)' : ''}${isBot ? ' 🤖' : ''}
                    </span>
                </div>
                <div class="player-item-character" style="font-size: 11px; color: #666; margin-top: 3px;">
                    ${characterName}
                </div>
                <div class="player-item-hp" style="font-size: 11px;">
                    Раунд: ${player.roundHp} | Всего: ${player.totalHp}
                </div>
                <div class="player-item-gold" style="font-size: 11px; color: #ffd700; margin-top: 3px;">
                    💵 ${player.temporaryGold || 0} | 💰 ${player.permanentGold || 0}
                </div>
                <div class="player-hp-bars">
                    <div class="player-hp-bar-mini">
                        <div class="player-hp-fill-mini ${roundHpPercent <= 25 ? 'low' : roundHpPercent <= 50 ? 'medium' : ''}" 
                             style="width: ${roundHpPercent}%"></div>
                    </div>
                </div>
                <div class="stats-tooltip player-list-tooltip">
                    <div class="tooltip-title">${player.nickname}${player.isBot ? ' 🤖' : ''}</div>
                    <div class="tooltip-stat">Персонаж: <strong>${characterName}</strong></div>
                    <div class="tooltip-stat">⚔️ Атака: <strong>${Math.round(finalAttack)}</strong></div>
                    <div class="tooltip-stat">🛡️ Броня: <strong>${Math.round(finalArmor)}%</strong></div>
                    <div class="tooltip-stat">💨 Уклонение: <strong>${Math.round(finalDodge)}%</strong></div>
                    <div class="tooltip-stat">⚡ Крит: <strong>${Math.round(finalCrit)}%</strong> (x${finalCritMult.toFixed(1)})</div>
                    <div class="tooltip-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
                        <strong>Уровни стилей:</strong>
                    </div>
                    ${styleList}
                    <div class="tooltip-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
                        <div class="tooltip-stat">❤️ HP: <strong>${player.roundHp} / 100</strong> (Раунд)</div>
                    <div class="tooltip-stat">❤️ HP: <strong>${player.totalHp} / 100</strong> (Всего)</div>
                    <div class="tooltip-stat">💰 Золото: <strong>${player.permanentGold || 0}</strong> (постоянное)</div>
                    <div class="tooltip-stat">💵 Золото: <strong>${player.temporaryGold || 0}</strong> (временное)</div>
                </div>
                    <div class="player-hp-bar-mini">
                        <div class="player-hp-fill-mini ${totalHpPercent <= 25 ? 'low' : totalHpPercent <= 50 ? 'medium' : ''}" 
                             style="width: ${totalHpPercent}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Обновление отображения дуэлей
function updateDuelsDisplay() {
    if (!duelsContainer) return;
    
    if (!roomState.pairs || roomState.pairs.length === 0) {
        duelsContainer.innerHTML = '';
        return;
    }
    
    duelsContainer.innerHTML = roomState.pairs.map(pair => {
        const player1 = roomState.players.find(p => p.socketId === pair[0]);
        const player2 = pair[1] ? roomState.players.find(p => p.socketId === pair[1]) : null;
        
        if (!player1) return '';
        
        if (!player2) {
            // Игрок без пары проходит автоматически
            return `
                <div class="duel-pair">
                    <div class="duel-player">
                        <strong>${player1.nickname}</strong>
                        <div>Раунд HP: ${player1.roundHp} | Всего HP: ${player1.totalHp}</div>
                    </div>
                    <div class="duel-status winner">ПРОХОДИТ</div>
                    <div class="duel-player"></div>
                </div>
            `;
        }
        
        const status1 = player1.duelStatus || (player1.isInDuel ? 'fighting' : '');
        const status2 = player2.duelStatus || (player2.isInDuel ? 'fighting' : '');
        
        let statusText = 'БОЙ ИДЕТ';
        let statusClass = 'fighting';
        if (status1 === 'winner' || status2 === 'loser') {
            statusText = `${player1.nickname} ПОБЕДИЛ`;
            statusClass = 'winner';
        } else if (status1 === 'loser' || status2 === 'winner') {
            statusText = `${player2.nickname} ПОБЕДИЛ`;
            statusClass = 'winner';
        }
        
        return `
            <div class="duel-pair">
                <div class="duel-player">
                    <strong>${player1.nickname}</strong>
                    <div>Раунд HP: ${player1.roundHp} | Всего HP: ${player1.totalHp}</div>
                </div>
                <div class="duel-status ${statusClass}">${statusText}</div>
                <div class="duel-player">
                    <strong>${player2.nickname}</strong>
                    <div>Раунд HP: ${player2.roundHp} | Всего HP: ${player2.totalHp}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Закрытие модального окна результата
function closeGameResult() {
    if (gameResultModal) {
        gameResultModal.classList.remove('show');
    }
}

// Функции UI
function showScreen(screen) {
    menuScreen.classList.remove('active');
    characterSelectScreen.classList.remove('active');
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    screen.classList.add('active');
}

// Показ экрана выбора персонажа
function showCharacterSelect() {
    const charactersGrid = document.getElementById('charactersGrid');
    const confirmBtn = document.getElementById('confirmCharacterBtn');
    let selectedCharacterId = null;
    
    if (!charactersGrid) return;
    
    charactersGrid.innerHTML = CHARACTERS.map(char => `
        <div class="character-card" data-character-id="${char.id}">
            <div class="character-emoji">${char.emoji}</div>
            <div class="character-name">${char.name}</div>
            <div class="character-description">${char.description}</div>
        </div>
    `).join('');
    
    // Обработчики выбора персонажа
    charactersGrid.querySelectorAll('.character-card').forEach(card => {
        card.addEventListener('click', () => {
            // Убираем выделение с других карточек
            charactersGrid.querySelectorAll('.character-card').forEach(c => {
                c.classList.remove('selected');
            });
            // Выделяем выбранную карточку
            card.classList.add('selected');
            selectedCharacterId = card.dataset.characterId;
            if (confirmBtn) {
                confirmBtn.style.display = 'block';
            }
        });
    });
    
    // Обработчик подтверждения выбора
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            if (selectedCharacterId) {
                socket.emit('selectCharacter', {
                    roomId: playerState.roomId,
                    characterId: selectedCharacterId
                });
            }
        };
    }
    
    showScreen(characterSelectScreen);
}

function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        setTimeout(() => {
            hideError();
        }, 5000);
    }
}

function hideError() {
    errorMessage.classList.remove('show');
}

function resetToMenu() {
    resetGame();
    playerState.roomId = null;
    playerState.isHost = false;
    playerState.currentOpponent = null;
    playerState.isInDuel = false;
    roomState.players = [];
    roomState.pairs = [];
    roomState.currentRound = 0;
    
    if (roomIdInput) {
        roomIdInput.value = '';
    }
    if (playersCount) {
        playersCount.textContent = '1';
    }
    if (hostControls) {
        hostControls.style.display = 'none';
    }
    if (playersListWaiting) {
        playersListWaiting.innerHTML = '';
    }
    if (playersListGame) {
        playersListGame.innerHTML = '';
    }
    if (duelsContainer) {
        duelsContainer.innerHTML = '';
    }
    showScreen(menuScreen);
    hideError();
    socket.emit('getRooms');
}

function resetGame() {
    if (rechargeInterval) {
        clearInterval(rechargeInterval);
        rechargeInterval = null;
    }
    if (spinTimeout) {
        clearTimeout(spinTimeout);
        spinTimeout = null;
    }
    if (battleTimerInterval) {
        clearInterval(battleTimerInterval);
        battleTimerInterval = null;
    }
    if (statsScreenTimeout) {
        clearTimeout(statsScreenTimeout);
        statsScreenTimeout = null;
    }
    
    // Сбрасываем время начала дуэли для предотвращения дублирования таймера
    lastDuelStartTime = null;
    
    const battleTimer = document.getElementById('battleTimer');
    const vsText = document.getElementById('vsText');
    if (battleTimer) battleTimer.style.display = 'none';
    if (vsText) vsText.style.display = 'block';
    
    // Скрываем статистику при сбросе игры
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    
    gameState = {
        roundHp: 100,
        totalHp: 100,
        enemyRoundHp: 100,
        enemyTotalHp: 100,
        maxHp: 100,
        enemyMaxHp: 100,
        isRecharging: false,
        rechargeTime: 0,
        canSpin: true,
        isSpinning: false,
        rechargeEndTime: 0
    };
}

// Обработчики кнопок
const noBotsCheckbox = document.getElementById('noBotsCheckbox');

createRoomBtn.addEventListener('click', () => {
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    const noBots = noBotsCheckbox ? noBotsCheckbox.checked : false;
    socket.emit('createRoom', { 
        nickname: nickname || undefined,
        noBots: noBots
    });
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        showError('Введите ID комнаты');
        return;
    }
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    socket.emit('joinRoom', { roomId, nickname: nickname || undefined });
});

if (refreshRoomsBtn) {
    refreshRoomsBtn.addEventListener('click', () => {
        socket.emit('getRooms');
    });
}

if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
        if (playerState.roomId) {
            socket.emit('startGame', { roomId: playerState.roomId });
        }
    });
}


if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', () => {
        if (playerState.roomId) {
            socket.leave(playerState.roomId);
        }
        resetToMenu();
    });
}

if (leaveGameBtn) {
    leaveGameBtn.addEventListener('click', () => {
        if (playerState.roomId) {
            socket.leave(playerState.roomId);
        }
        resetToMenu();
    });
}

if (spinBtn) {
    spinBtn.addEventListener('click', () => {
        spin();
    });
}

if (endTurnBtn) {
    endTurnBtn.addEventListener('click', () => {
        if (playerState.roomId && playerState.isInDuel) {
            socket.emit('endTurn', { roomId: playerState.roomId });
            if (endTurnBtn) {
                endTurnBtn.disabled = true;
                endTurnBtn.textContent = 'Ход завершен';
            }
        }
    });
}

// Обработчик завершения хода
socket.on('turnEnded', (data) => {
    console.log('Ход завершен:', data);
    updatePlayersListGame();
});

// Обработка Enter в поле ввода комнаты
roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// Обработчик закрытия модального окна результата
if (closeResultBtn) {
    closeResultBtn.addEventListener('click', () => {
        closeGameResult();
        resetToMenu();
    });
}

// Обновление этапа боя
function updateBattlePhase() {
    const battlePhase = document.getElementById('battlePhase');
    if (!battlePhase) return;
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) {
        battlePhase.textContent = 'Ожидание...';
        battlePhase.className = 'battle-phase phase-waiting';
        return;
    }
    
    if (!player.isInDuel) {
        battlePhase.textContent = 'Перерыв между боями';
        battlePhase.className = 'battle-phase phase-break';
    } else {
        // Используем общее состояние игры с синхронизацией
        const now = getSyncedTime();
        if (gameStateController.currentState === 'preparation' && 
            gameStateController.preBattleEndTime > 0 && 
            now < gameStateController.preBattleEndTime) {
            battlePhase.textContent = 'Подготовка к бою';
            battlePhase.className = 'battle-phase phase-preparation';
        } else if (gameStateController.currentState === 'battle' || 
                   (gameStateController.currentState === 'preparation' && 
                    gameStateController.preBattleEndTime > 0 && 
                    now >= gameStateController.preBattleEndTime)) {
            battlePhase.textContent = 'Бой идет';
            battlePhase.className = 'battle-phase phase-battle';
        } else {
            // Fallback на старый способ для обратной совместимости
            if (player.duelStartTime && now < player.duelStartTime + PRE_BATTLE_DELAY) {
                battlePhase.textContent = 'Подготовка к бою';
                battlePhase.className = 'battle-phase phase-preparation';
            } else {
                battlePhase.textContent = 'Бой идет';
                battlePhase.className = 'battle-phase phase-battle';
            }
        }
    }
}

// Запуск таймера перед боем из общего состояния (новый способ)
function startBattleTimerFromState(preBattleEndTime) {
    const battleTimer = document.getElementById('battleTimer');
    const battleTimerCountdown = document.getElementById('battleTimerCountdown');
    const vsText = document.getElementById('vsText');
    
    if (!battleTimer || !battleTimerCountdown) return;
    
    // Очищаем предыдущий таймер, если он запущен
    if (battleTimerInterval) {
        clearInterval(battleTimerInterval);
        battleTimerInterval = null;
    }
    
    // Проверяем, что preBattleEndTime валидный
    if (!preBattleEndTime || preBattleEndTime <= 0) {
        console.warn('Invalid preBattleEndTime:', preBattleEndTime);
        return;
    }
    
    // Используем синхронизированное время
    const now = getSyncedTime();
    const remaining = preBattleEndTime - now;
    
    // Если таймер уже прошел, сразу разблокируем кнопку
    if (remaining <= 0) {
        battleTimer.style.display = 'none';
        if (vsText) vsText.style.display = 'block';
        updateBattlePhase();
        enableSpin();
        return;
    }
    
    battleTimer.style.display = 'block';
    if (vsText) vsText.style.display = 'none';
    
    battleTimerInterval = setInterval(() => {
        const syncedNow = getSyncedTime();
        const remaining = Math.max(0, preBattleEndTime - syncedNow);
        
        if (remaining <= 0) {
            clearInterval(battleTimerInterval);
            battleTimerInterval = null;
            battleTimer.style.display = 'none';
            if (vsText) vsText.style.display = 'block';
            updateBattlePhase();
            enableSpin();
            return;
        }
        
        // Показываем секунды
        const seconds = Math.ceil(remaining / 1000);
        if (battleTimerCountdown) {
            battleTimerCountdown.textContent = seconds;
        }
        updateBattlePhase();
        // Периодически проверяем, можно ли разблокировать кнопку
        enableSpin();
    }, 100);
}

// Запуск таймера перед боем (старый способ для обратной совместимости)
function startBattleTimer(duelStartTime) {
    // Если есть общее состояние, используем его
    if (gameStateController.preBattleEndTime > 0) {
        startBattleTimerFromState(gameStateController.preBattleEndTime);
        return;
    }
    
    // Иначе используем старый способ (для обратной совместимости)
    const battleTimer = document.getElementById('battleTimer');
    const battleTimerCountdown = document.getElementById('battleTimerCountdown');
    const vsText = document.getElementById('vsText');
    
    if (!battleTimer || !battleTimerCountdown) return;
    
    // Очищаем предыдущий таймер, если он запущен
    if (battleTimerInterval) {
        clearInterval(battleTimerInterval);
        battleTimerInterval = null;
    }
    
    // Проверяем, что duelStartTime валидный
    if (!duelStartTime || duelStartTime <= 0) {
        console.warn('Invalid duelStartTime:', duelStartTime);
        return;
    }
    
    const now = Date.now();
    const timeDiff = now - duelStartTime;
    
    // Если duelStartTime в будущем, это ошибка - используем текущее время
    if (timeDiff < 0) {
        console.warn('duelStartTime is in the future, using current time');
        duelStartTime = now;
    }
    
    // Если таймер уже прошел, сразу разблокируем кнопку
    if (timeDiff >= PRE_BATTLE_DELAY) {
        battleTimer.style.display = 'none';
        if (vsText) vsText.style.display = 'block';
        updateBattlePhase();
        enableSpin();
        return;
    }
    
    battleTimer.style.display = 'block';
    if (vsText) vsText.style.display = 'none';
    
    battleTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, duelStartTime + PRE_BATTLE_DELAY - now);
        
        if (remaining <= 0) {
            clearInterval(battleTimerInterval);
            battleTimerInterval = null;
            battleTimer.style.display = 'none';
            if (vsText) vsText.style.display = 'block';
            updateBattlePhase();
            enableSpin();
            return;
        }
        
        // Показываем секунды
        const seconds = Math.ceil(remaining / 1000);
        if (battleTimerCountdown) {
            battleTimerCountdown.textContent = seconds;
        }
        updateBattlePhase();
        // Периодически проверяем, можно ли разблокировать кнопку
        enableSpin();
    }, 100);
}

// Обновление отображения золота
function updateGoldDisplay() {
    const tempGoldEl = document.getElementById('tempGoldDisplay');
    const permGoldEl = document.getElementById('permGoldDisplay');
    const tempGoldStatsEl = document.getElementById('tempGoldDisplayStats');
    const permGoldStatsEl = document.getElementById('permGoldDisplayStats');
    
    // Обновляем из состояния комнаты
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        if (player.temporaryGold !== undefined) {
            playerState.temporaryGold = player.temporaryGold;
        }
        if (player.permanentGold !== undefined) {
            playerState.permanentGold = player.permanentGold;
        }
    }
    
    if (tempGoldEl) {
        tempGoldEl.textContent = playerState.temporaryGold || 0;
    }
    if (permGoldEl) {
        permGoldEl.textContent = playerState.permanentGold || 0;
    }
    if (tempGoldStatsEl) {
        tempGoldStatsEl.textContent = playerState.temporaryGold || 0;
    }
    if (permGoldStatsEl) {
        permGoldStatsEl.textContent = playerState.permanentGold || 0;
    }
}

// Обновление отображения серий
function updateStreakDisplay() {
    const winStreakDisplay = document.getElementById('winStreakDisplay');
    const loseStreakDisplay = document.getElementById('loseStreakDisplay');
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        if (player.winStreak !== undefined) {
            playerState.winStreak = player.winStreak;
        }
        if (player.loseStreak !== undefined) {
            playerState.loseStreak = player.loseStreak;
        }
    }
    
    if (winStreakDisplay) {
        const winStreak = playerState.winStreak || 0;
        const bonusPercent = Math.min(winStreak * 5, 50);
        winStreakDisplay.innerHTML = `🏆 Серия побед: <strong>${winStreak}</strong>`;
        winStreakDisplay.title = `Серия побед: +5% за каждую победу (макс. +50%)\nТекущий бонус: +${bonusPercent}%`;
        winStreakDisplay.style.display = 'block';
    }
    
    if (loseStreakDisplay) {
        const loseStreak = playerState.loseStreak || 0;
        const bonusPercent = Math.min(loseStreak * 3, 30);
        loseStreakDisplay.innerHTML = `💔 Серия поражений: <strong>${loseStreak}</strong>`;
        loseStreakDisplay.title = `Серия поражений: +3% за каждое поражение (макс. +30%)\nТекущий бонус: +${bonusPercent}%`;
        loseStreakDisplay.style.display = 'block';
    }
}

// Обновление отображения статистики
function updateStatsDisplay() {
    const winsDisplay = document.getElementById('winsDisplay');
    const lossesDisplay = document.getElementById('lossesDisplay');
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        if (player.wins !== undefined) {
            playerState.wins = player.wins;
        }
        if (player.losses !== undefined) {
            playerState.losses = player.losses;
        }
    }
    
    if (winsDisplay) {
        const wins = playerState.wins || 0;
        winsDisplay.innerHTML = `✅ Побед: <strong>${wins}</strong>`;
    }
    
    if (lossesDisplay) {
        const losses = playerState.losses || 0;
        lossesDisplay.innerHTML = `❌ Поражений: <strong>${losses}</strong>`;
    }
}

// Показ статистики раунда
let statsScreenTimeout = null;
function showRoundStats() {
    if (!roundStatsScreen || !roundStatsContent) return;
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Проверяем, что игрок выбрал персонажа и находится в игре (не на меню)
    const isInGame = gameScreen && gameScreen.classList.contains('active');
    const isNotInMenu = menuScreen && !menuScreen.classList.contains('active');
    const hasCharacter = player.characterId !== null && player.characterId !== undefined;
    const hasCompletedRound = roomState.currentRound > 0;
    const hasRoom = playerState.roomId !== null;
    
    if (!isInGame || !isNotInMenu || !hasRoom || !hasCharacter || !hasCompletedRound) return;
    
    // Показываем статистику только если не в дуэли или дуэль завершена, или закончил ход
    if (player.isInDuel && !player.duelStatus && !player.hasEndedTurn) return;
    
    // Очищаем предыдущий таймер, если есть
    if (statsScreenTimeout) {
        clearTimeout(statsScreenTimeout);
        statsScreenTimeout = null;
    }
    
    // Формируем статистику всех пар раунда
    let pairsHtml = '';
    
    if (roomState.pairs && roomState.pairs.length > 0) {
        pairsHtml = '<div class="round-stats-section"><h3>Результаты боев раунда</h3>';
        
        roomState.pairs.forEach((pair, index) => {
            const player1 = roomState.players.find(p => p.socketId === pair[0]);
            const player2 = pair[1] ? roomState.players.find(p => p.socketId === pair[1]) : null;
            
            if (player1) {
                const char1 = CHARACTERS.find(c => c.id === player1.characterId);
                const emoji1 = char1 ? char1.emoji : '👤';
                const name1 = player1.nickname + (player1.isBot ? ' 🤖' : '');
                const hp1 = player1.roundHp || 0;
                const maxHp1 = player1.maxHp || 100;
                const hpPercent1 = Math.max(0, (hp1 / maxHp1) * 100);
                
                let status1 = '';
                if (player1.duelStatus === 'winner') {
                    status1 = '<span style="color: #4caf50; font-weight: bold;">🏆 Победитель</span>';
                } else if (player1.duelStatus === 'loser') {
                    status1 = '<span style="color: #f44336; font-weight: bold;">💀 Проиграл</span>';
                } else if (player1.isInDuel) {
                    status1 = '<span style="color: #ff9800;">⚔️ Бой идет</span>';
                } else if (player1.hasEndedTurn) {
                    status1 = '<span style="color: #2196f3;">✅ Закончил ход</span>';
                } else {
                    status1 = '<span style="color: #9e9e9e;">⏳ Ожидание</span>';
                }
                
                if (player2) {
                    const char2 = CHARACTERS.find(c => c.id === player2.characterId);
                    const emoji2 = char2 ? char2.emoji : '👤';
                    const name2 = player2.nickname + (player2.isBot ? ' 🤖' : '');
                    const hp2 = player2.roundHp || 0;
                    const maxHp2 = player2.maxHp || 100;
                    const hpPercent2 = Math.max(0, (hp2 / maxHp2) * 100);
                    
                    let status2 = '';
                    if (player2.duelStatus === 'winner') {
                        status2 = '<span style="color: #4caf50; font-weight: bold;">🏆 Победитель</span>';
                    } else if (player2.duelStatus === 'loser') {
                        status2 = '<span style="color: #f44336; font-weight: bold;">💀 Проиграл</span>';
                    } else if (player2.isInDuel) {
                        status2 = '<span style="color: #ff9800;">⚔️ Бой идет</span>';
                    } else if (player2.hasEndedTurn) {
                        status2 = '<span style="color: #2196f3;">✅ Закончил ход</span>';
                    } else {
                        status2 = '<span style="color: #9e9e9e;">⏳ Ожидание</span>';
                    }
                    
                    pairsHtml += `
                        <div class="duel-pair" style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; border: 2px solid ${player1.duelStatus === 'winner' || player2.duelStatus === 'winner' ? '#4caf50' : '#ddd'};">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <div style="font-size: 24px; margin-bottom: 5px;">${emoji1} ${name1}</div>
                                    <div style="margin-bottom: 5px;">${status1}</div>
                                    <div style="width: 100%; background: #e0e0e0; border-radius: 4px; height: 20px; margin-bottom: 5px;">
                                        <div style="width: ${hpPercent1}%; background: ${hp1 > 0 ? '#4caf50' : '#f44336'}; height: 20px; border-radius: 4px; transition: width 0.3s;"></div>
                                    </div>
                                    <div style="font-size: 12px; color: #666;">HP: ${hp1} / ${maxHp1}</div>
                                </div>
                                <div style="margin: 0 20px; font-size: 24px; font-weight: bold;">VS</div>
                                <div style="flex: 1; text-align: right;">
                                    <div style="font-size: 24px; margin-bottom: 5px;">${emoji2} ${name2}</div>
                                    <div style="margin-bottom: 5px;">${status2}</div>
                                    <div style="width: 100%; background: #e0e0e0; border-radius: 4px; height: 20px; margin-bottom: 5px;">
                                        <div style="width: ${hpPercent2}%; background: ${hp2 > 0 ? '#4caf50' : '#f44336'}; height: 20px; border-radius: 4px; transition: width 0.3s;"></div>
                                    </div>
                                    <div style="font-size: 12px; color: #666;">HP: ${hp2} / ${maxHp2}</div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    // Игрок без пары (прошел автоматически)
                    pairsHtml += `
                        <div class="duel-pair" style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; border: 2px solid #4caf50;">
                            <div style="text-align: center;">
                                <div style="font-size: 24px; margin-bottom: 5px;">${emoji1} ${name1}</div>
                                <div style="color: #4caf50; font-weight: bold;">🏆 Прошел автоматически (нет противника)</div>
                            </div>
                        </div>
                    `;
                }
            }
        });
        
        pairsHtml += '</div>';
    }
    
    // Формируем финальный HTML
    const statsHtml = `
        ${pairsHtml}
        <div class="round-stats-note">Ожидание следующего раунда...</div>
    `;
    
    roundStatsContent.innerHTML = statsHtml;
    
    // Показываем экран статистики поверх игрового экрана
    if (gameScreen && gameScreen.classList.contains('active')) {
        roundStatsScreen.classList.add('active');
        
        // Автоматически скрываем через 5 секунд (если раунд еще не начался)
        statsScreenTimeout = setTimeout(() => {
            const currentPlayer = roomState.players.find(p => p.socketId === playerState.socketId);
            if (currentPlayer && (!currentPlayer.isInDuel || currentPlayer.hasEndedTurn) && roundStatsScreen && roundStatsScreen.classList.contains('active')) {
                // Если раунд еще не начался или закончил ход, скрываем статистику
                roundStatsScreen.classList.remove('active');
            }
        }, 5000);
    }
}

// Обновление отображения награды за раунд
function updateRoundRewardDisplay() {
    const roundRewardInfo = document.getElementById('roundRewardInfo');
    const roundRewardText = document.getElementById('roundRewardText');
    
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player && player.lastRoundGoldEarned > 0) {
        if (player.lastRoundGoldBonus !== undefined) {
            playerState.lastRoundGoldBonus = player.lastRoundGoldBonus;
        }
        if (player.lastRoundGoldEarned !== undefined) {
            playerState.lastRoundGoldEarned = player.lastRoundGoldEarned;
        }
        
        if (roundRewardInfo && roundRewardText) {
            const bonus = playerState.lastRoundGoldBonus || 0;
            const earned = playerState.lastRoundGoldEarned || 0;
            const baseGold = bonus > 0 ? Math.round(earned / (1 + bonus / 100)) : earned;
            
            roundRewardText.innerHTML = `💰 Получено: <strong>+${earned}</strong> золота`;
            if (bonus > 0) {
                roundRewardText.innerHTML += ` <span style="color: #4caf50;">(+${bonus}% бонус)</span>`;
            }
            roundRewardText.title = `Базовое золото: ${baseGold}\nБонус от серии: +${bonus}%\nИтого: ${earned} золота`;
            roundRewardInfo.style.display = 'block';
            
            // Скрываем через 10 секунд
            setTimeout(() => {
                if (roundRewardInfo) {
                    roundRewardInfo.style.display = 'none';
                }
            }, 10000);
        }
    } else if (roundRewardInfo) {
        roundRewardInfo.style.display = 'none';
    }
}

// Инициализация
// Загружаем ник из localStorage
if (nicknameInput) {
    const savedNickname = localStorage.getItem('playerNickname');
    if (savedNickname) {
        nicknameInput.value = savedNickname;
    }
    playerState.nickname = nicknameInput.value.trim() || '';
    
    // Сохраняем ник при изменении
    nicknameInput.addEventListener('change', () => {
        const nickname = nicknameInput.value.trim();
        playerState.nickname = nickname;
        if (nickname) {
            localStorage.setItem('playerNickname', nickname);
        }
    });
}
