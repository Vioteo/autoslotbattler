// Константы
const PRE_BATTLE_DELAY = 10000; // 10 секунд до начала боя
const BREAK_DURATION = 120000; // 2 минуты между боями
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
const BONUS_SYMBOL = { emoji: '💥', color: '#ff00ff', name: 'bonus', weight: 3 };

// Персонажи (должны совпадать с сервером)
const CHARACTERS = [
    {
        id: 'merchant',
        name: 'Торговец',
        emoji: '💰',
        ability: 'gold',
        description: '+25 постоянного золота',
        abilityValue: 25
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

// Игровое состояние
let gameState = {
    roundHp: 200,
    totalHp: 100,
    enemyRoundHp: 200,
    enemyTotalHp: 100,
    maxHp: 200,
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
const cardsShopList = document.getElementById('cardsShopList');
const refreshShopBtn = document.getElementById('refreshShopBtn');
const permGoldShop = document.getElementById('permGoldShop');
const tempGoldShop = document.getElementById('tempGoldShop');
const breakTimerCountdown = document.getElementById('breakTimerCountdown');

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
            
            // Обновляем состояние кнопки spin
            enableSpin();
            updateBattlePhase();
            updateCharacterStats();
            
            // Если duelStartTime только что обновился и игрок в дуэли, запускаем таймер
            if (player.isInDuel && player.duelStartTime && !battleTimerInterval) {
                startBattleTimer(player.duelStartTime);
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
    
    // Скрываем экран статистики и показываем игровой экран
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    initGame();
    showScreen(gameScreen);
    updateDuelsDisplay();
    updatePlayersListGame();
    updateGoldDisplay();
    updateStreakDisplay();
    updateStatsDisplay();
    updateRoundRewardDisplay();
    
    // Запускаем таймер перед боем, если игрок в дуэли
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player && player.isInDuel && player.duelStartTime) {
        startBattleTimer(player.duelStartTime);
    } else if (player && player.isInDuel) {
        // Если игрок в дуэли, но duelStartTime еще не пришел, проверяем периодически
        const checkTimer = setInterval(() => {
            const currentPlayer = roomState.players.find(p => p.socketId === playerState.socketId);
            if (currentPlayer && currentPlayer.duelStartTime) {
                clearInterval(checkTimer);
                startBattleTimer(currentPlayer.duelStartTime);
            } else if (!currentPlayer || !currentPlayer.isInDuel) {
                clearInterval(checkTimer);
            }
        }, 100);
        
        // Останавливаем проверку через 2 секунды, если duelStartTime не пришел
        setTimeout(() => {
            clearInterval(checkTimer);
        }, 2000);
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
        takeDamage(data.damage, data.dodged || false);
        // Показываем сообщение о комбинации противника
        if (data.comboInfo) {
            showComboMessage('enemy', data.comboInfo);
        }
    } else if (data.fromPlayerSocketId === playerState.socketId) {
        // Это наша атака, показываем анимацию на противнике
        showAttackAnimation(data.damage, true, data.dodged || false, data.crit || false);
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
    if (data.playerSocketId === playerState.socketId && data.healAmount > 0) {
        showFloatingMessage('player', `+${data.healAmount} HP`, 'heal', data.healAmount);
        updateHpBars();
    }
});

// Обработка начала перерыва между боями
let breakTimerInterval = null;
socket.on('breakStarted', (data) => {
    console.log('Начался перерыв между боями:', data);
    
    // Скрываем экран боя и статистику
    if (gameScreen) gameScreen.classList.remove('active');
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    
    // Показываем экран покупки карточек
    if (cardShopScreen) {
        cardShopScreen.classList.add('active');
        updateCardShop();
        startBreakTimer(data.duration);
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

// Обновление магазина карточек
function updateCardShop() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    // Обновляем золото
    if (permGoldShop) permGoldShop.textContent = player.permanentGold || 0;
    if (tempGoldShop) tempGoldShop.textContent = player.temporaryGold || 0;
    
    // TODO: Здесь будет генерация и отображение карточек
    // Пока заглушка
    if (cardsShopList) {
        cardsShopList.innerHTML = '<p style="text-align: center; color: #666;">Система карточек в разработке...</p>';
    }
}

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
        gameState.roundHp = player.roundHp || 200;
        gameState.totalHp = player.totalHp || 100;
        
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
        gameState.enemyRoundHp = opponent.roundHp || 200;
        gameState.enemyTotalHp = opponent.totalHp || 100;
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
    
    gameState.maxHp = 200;
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
    const allSymbols = [...SYMBOLS, WILD_SYMBOL, BONUS_SYMBOL];
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
        gameState.roundHp = player.roundHp || 200;
        gameState.totalHp = player.totalHp || 100;
    }
    
    const opponent = roomState.players.find(p => 
        p.socketId === playerState.currentOpponent || 
        (player && player.isInDuel && p.socketId === player.duelOpponent)
    );
    if (opponent) {
        gameState.enemyRoundHp = opponent.roundHp || 200;
        gameState.enemyTotalHp = opponent.totalHp || 100;
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
    const enemyHpPercent = (gameState.enemyRoundHp / gameState.maxHp) * 100;
    if (enemyHpFill) {
        enemyHpFill.style.width = `${enemyHpPercent}%`;
    }
    if (enemyHpText) {
        enemyHpText.textContent = `Раунд: ${gameState.enemyRoundHp} / ${gameState.maxHp} | Всего: ${gameState.enemyTotalHp}`;
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
    
    // Проверяем таймер перед боем (10 секунд)
    if (player.duelStartTime) {
        const now = Date.now();
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
    
    // Проверяем перезарядку
    const now = Date.now();
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
    
    // Генерируем финальные символы для каждого столбца заранее
    const finalSymbols = [];
    for (let i = 0; i < totalReels; i++) {
        finalSymbols.push([
            getRandomSymbol(),
            getRandomSymbol(),
            getRandomSymbol()
        ]);
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
                matchDetails.push({ line: lineIndex + 1, matches: totalLineMatches });
                
                // Определяем основной символ для совпадения (первый не-wild, или любой если все wild)
                const matchedSymbol = Object.keys(symbolCounts).length > 0
                    ? Object.keys(symbolCounts).find(key => symbolCounts[key] === maxRegularMatches)
                    : 'wild';
                
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
        
        // Если несколько комбинаций, показываем все
        if (matchDetails.length > 1) {
            const comboTexts = matchDetails.map(m => {
                const symbolName = symbolNames[m.symbol] || 'СИМВОЛОВ';
                return `${m.matches} ${symbolName}`;
            });
            comboInfo = {
                type: 'combo',
                text: `${matchDetails.length} КОМБИНАЦИИ`,
                combos: comboTexts,
                damage: damage,
                description: `Урон: ${damage}`
            };
        } else {
            // Одна комбинация
            const firstMatch = matchDetails[0];
            const symbolName = symbolNames[firstMatch.symbol] || 'СИМВОЛОВ';
            comboInfo = {
                type: 'combo',
                text: `${firstMatch.matches} ${symbolName} ШАРИКА`,
                damage: damage,
                description: `Урон: ${damage}`
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
        
        // Показываем сообщение о комбинации над игроком после отправки
        if (comboInfo) {
            // Небольшая задержка для синхронизации с анимацией спина
            setTimeout(() => {
                showComboMessage('player', comboInfo);
            }, 500);
        }
    }
    
    // Перезарядка уже началась при нажатии кнопки, не запускаем повторно
}

// Начало перезарядки
function startRecharge() {
    // Если перезарядка уже идет (штраф), не перезапускаем
    if (gameState.isRecharging && gameState.rechargeEndTime > Date.now()) {
        return;
    }
    
    gameState.isRecharging = true;
    gameState.rechargeTime = 3000; // 3 секунды
    gameState.rechargeEndTime = Date.now() + gameState.rechargeTime;
    
    const startTime = Date.now();
    const endTime = gameState.rechargeEndTime;
    
    // Блокируем кнопку спин на 3 секунды
    if (spinBtn) {
        spinBtn.disabled = true;
    }
    
    // Очищаем предыдущий интервал если есть
    if (rechargeInterval) {
        clearInterval(rechargeInterval);
    }
    
    rechargeInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const progress = 1 - (remaining / gameState.rechargeTime);
        
        if (rechargeFill) {
            rechargeFill.style.width = `${progress * 100}%`;
        }
        if (rechargeText) {
            rechargeText.textContent = remaining > 0 
                ? `Перезарядка: ${(remaining / 1000).toFixed(1)}с`
                : 'Готово';
        }
        
        if (remaining <= 0) {
            clearInterval(rechargeInterval);
            rechargeInterval = null;
            gameState.isRecharging = false;
            gameState.rechargeTime = 0;
            gameState.rechargeEndTime = 0;
            enableSpin();
        }
    }, 50);
}

// Включение спина
function enableSpin() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (!player) return;
    
    const now = Date.now();
    
    // Проверяем условия для доступности спина
    const hasPassedPreBattleTimer = !player.duelStartTime || now >= player.duelStartTime + PRE_BATTLE_DELAY;
    
    const canSpinNow = 
        !gameState.isSpinning && // Не крутится сейчас
        !gameState.isRecharging && // Не на перезарядке
        player.isInDuel && // В дуэли
        !player.hasEndedTurn && // Не закончил ход
        (player.temporaryGold >= 5 || player.permanentGold >= 5) && // Есть золото
        hasPassedPreBattleTimer; // Прошел таймер до боя
    
    gameState.canSpin = canSpinNow;
    if (spinBtn) {
        spinBtn.disabled = !canSpinNow;
    }
    if (rechargeFill) {
        rechargeFill.style.width = '100%';
    }
    if (rechargeText) {
        rechargeText.textContent = 'Готово';
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
    
    // Получаем статистику из карточек (пока заглушка, потом добавим реальную логику)
    const attack = 10 + (player.attackStyle || 0);
    const armor = 25 + (player.armorStyle || 0);
    const dodge = 15 + (player.dodgeStyle || 0);
    const crit = 10 + (player.critStyle || 0);
    const critMult = 1.5 + (player.critMultiplierStyle || 0);
    
    // Применяем пороговые бонусы
    const attackBonus = getStyleBonus(player.attackStyle || 0);
    const armorBonus = getStyleBonus(player.armorStyle || 0);
    const dodgeBonus = getStyleBonus(player.dodgeStyle || 0);
    const critBonus = getStyleBonus(player.critStyle || 0);
    const critMultBonus = getStyleBonus(player.critMultiplierStyle || 0);
    
    const finalAttack = attack + attackBonus;
    const finalArmor = armor + armorBonus;
    const finalDodge = dodge + dodgeBonus;
    const finalCrit = crit + critBonus;
    const finalCritMult = critMult + critMultBonus * 0.25;
    
    // Обновляем отображение
    const playerAttackEl = document.getElementById('playerAttack');
    const playerArmorEl = document.getElementById('playerArmor');
    const playerDodgeEl = document.getElementById('playerDodge');
    const playerCritEl = document.getElementById('playerCrit');
    const playerCritMultEl = document.getElementById('playerCritMult');
    
    if (playerAttackEl) playerAttackEl.textContent = Math.round(finalAttack);
    if (playerArmorEl) playerArmorEl.textContent = `${Math.round(finalArmor)}%`;
    if (playerDodgeEl) playerDodgeEl.textContent = `${Math.round(finalDodge)}%`;
    if (playerCritEl) playerCritEl.textContent = `${Math.round(finalCrit)}%`;
    if (playerCritMultEl) playerCritMultEl.textContent = `x${finalCritMult.toFixed(1)}`;
    
    // Обновляем статистику противника
    if (player.isInDuel && player.duelOpponent) {
        const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
        if (opponent) {
            const oppAttack = 10 + (opponent.attackStyle || 0);
            const oppArmor = 25 + (opponent.armorStyle || 0);
            const oppDodge = 15 + (opponent.dodgeStyle || 0);
            const oppCrit = 10 + (opponent.critStyle || 0);
            const oppCritMult = 1.5 + (opponent.critMultiplierStyle || 0);
            
            const oppAttackBonus = getStyleBonus(opponent.attackStyle || 0);
            const oppArmorBonus = getStyleBonus(opponent.armorStyle || 0);
            const oppDodgeBonus = getStyleBonus(opponent.dodgeStyle || 0);
            const oppCritBonus = getStyleBonus(opponent.critStyle || 0);
            const oppCritMultBonus = getStyleBonus(opponent.critMultiplierStyle || 0);
            
            const finalOppAttack = oppAttack + oppAttackBonus;
            const finalOppArmor = oppArmor + oppArmorBonus;
            const finalOppDodge = oppDodge + oppDodgeBonus;
            const finalOppCrit = oppCrit + oppCritBonus;
            const finalOppCritMult = oppCritMult + oppCritMultBonus * 0.25;
            
            const enemyAttackEl = document.getElementById('enemyAttack');
            const enemyArmorEl = document.getElementById('enemyArmor');
            const enemyDodgeEl = document.getElementById('enemyDodge');
            const enemyCritEl = document.getElementById('enemyCrit');
            const enemyCritMultEl = document.getElementById('enemyCritMult');
            
            if (enemyAttackEl) enemyAttackEl.textContent = Math.round(finalOppAttack);
            if (enemyArmorEl) enemyArmorEl.textContent = `${Math.round(finalOppArmor)}%`;
            if (enemyDodgeEl) enemyDodgeEl.textContent = `${Math.round(finalOppDodge)}%`;
            if (enemyCritEl) enemyCritEl.textContent = `${Math.round(finalOppCrit)}%`;
            if (enemyCritMultEl) enemyCritMultEl.textContent = `x${finalOppCritMult.toFixed(1)}`;
        }
    }
}

// Получение бонуса за пороги стиля
function getStyleBonus(stylePoints) {
    if (stylePoints >= 20) return 15;
    if (stylePoints >= 10) return 10;
    if (stylePoints >= 4) return 5;
    return 0;
}

// Получение урона
function takeDamage(damage, dodged = false) {
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
    }
    
    updateHpBars();
    
    // Показываем урон
    showFloatingMessage('player', `-${damage}`, 'damage', damage);
    
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
function showAttackAnimation(damage, isMyAttack = false, dodged = false, crit = false) {
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
    
    // Показываем урон
    if (crit) {
        showFloatingMessage(target, `КРИТ! -${damage}`, 'crit', damage);
    } else {
        showFloatingMessage(target, `-${damage}`, 'damage', damage);
    }
    
    // HP обновляется через gameState от другого игрока, здесь только анимация
}

// Показ всплывающего сообщения о комбинации
function showComboMessage(target, comboInfo) {
    if (!comboInfo) return;
    
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
        
        const roundHpPercent = (player.roundHp / 200) * 100;
        const totalHpPercent = (player.totalHp / 100) * 100;
        
        // Находим персонажа
        const character = CHARACTERS.find(c => c.id === player.characterId);
        const characterEmoji = character ? character.emoji : '👤';
        const characterName = character ? character.name : 'Без персонажа';
        
        return `
            <div class="player-item-game ${statusClass}">
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
    
    const battleTimer = document.getElementById('battleTimer');
    const vsText = document.getElementById('vsText');
    if (battleTimer) battleTimer.style.display = 'none';
    if (vsText) vsText.style.display = 'block';
    
    // Скрываем статистику при сбросе игры
    if (roundStatsScreen) roundStatsScreen.classList.remove('active');
    
    gameState = {
        roundHp: 200,
        totalHp: 100,
        enemyRoundHp: 200,
        enemyTotalHp: 100,
        maxHp: 200,
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
    } else if (player.duelStartTime && Date.now() < player.duelStartTime + PRE_BATTLE_DELAY) {
        battlePhase.textContent = 'Подготовка к бою';
        battlePhase.className = 'battle-phase phase-preparation';
    } else {
        battlePhase.textContent = 'Бой идет';
        battlePhase.className = 'battle-phase phase-battle';
    }
}

// Запуск таймера перед боем
function startBattleTimer(duelStartTime) {
    const battleTimer = document.getElementById('battleTimer');
    const battleTimerCountdown = document.getElementById('battleTimerCountdown');
    const vsText = document.getElementById('vsText');
    
    if (!battleTimer || !battleTimerCountdown) return;
    
    // Очищаем предыдущий таймер
    if (battleTimerInterval) {
        clearInterval(battleTimerInterval);
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
                const maxHp1 = 200;
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
                    const maxHp2 = 200;
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
