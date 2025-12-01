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
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const menuScreen = document.getElementById('menuScreen');
const characterSelectScreen = document.getElementById('characterSelectScreen');
const waitingScreen = document.getElementById('waitingScreen');
const gameScreen = document.getElementById('gameScreen');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
const nicknameInput = document.getElementById('nicknameInput');
const displayRoomId = document.getElementById('displayRoomId');
const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
const playersCount = document.getElementById('playersCount');
const playersListWaiting = document.getElementById('playersList');
const playersListGame = document.getElementById('playersListGame');
const hostControls = document.getElementById('hostControls');
const startGameBtn = document.getElementById('startGameBtn');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
const roomsList = document.getElementById('roomsList');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const gameRoomId = document.getElementById('gameRoomId');
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
    updateConnectionStatus('connected', 'Подключено');
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
    updateConnectionStatus('disconnected', 'Отключено');
    
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
    updateConnectionStatus('disconnected', 'Ошибка подключения');
});

socket.on('roomCreated', (data) => {
    console.log('Комната создана:', data);
    playerState.roomId = data.roomId;
    playerState.isHost = data.isHost || false;
    if (displayRoomId) {
        displayRoomId.textContent = data.roomId;
    }
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
    if (displayRoomId) {
        displayRoomId.textContent = data.roomId;
    }
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
        if (player && player.isInDuel && player.duelOpponent) {
            const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
            if (opponent) {
                const enemyTempGold = document.getElementById('enemyTempGold');
                const enemyPermGold = document.getElementById('enemyPermGold');
                if (enemyTempGold) enemyTempGold.textContent = opponent.temporaryGold || 0;
                if (enemyPermGold) enemyPermGold.textContent = opponent.permanentGold || 0;
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
    if (gameRoomId && playerState.roomId) {
        gameRoomId.textContent = playerState.roomId;
    }
    if (playerNickname && playerState.nickname) {
        playerNickname.textContent = playerState.nickname;
    }
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
    }
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
    if (gameRoomId) {
        gameRoomId.textContent = data.roomId;
    }
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
        takeDamage(data.damage);
    } else if (data.fromPlayerSocketId === playerState.socketId) {
        // Это наша атака, показываем анимацию на противнике
        showAttackAnimation(data.damage, true);
        // Обновляем состояние для отображения урона боту
        setTimeout(() => {
            updatePlayersListGame();
        }, 100);
    } else {
        // Атака другого игрока, обновляем состояние комнаты
        updatePlayersListGame();
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
    
    // Проверяем таймер перед боем (3 секунды)
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player && player.duelStartTime) {
        const now = Date.now();
        if (now < player.duelStartTime + 3000) {
            const remaining = Math.ceil((player.duelStartTime + 3000 - now) / 1000);
            showError(`Бой еще не начался! Подождите ${remaining} секунд`);
            return;
        }
    }
    
    // Проверяем наличие золота (5 золота на спин)
    const spinCost = 5;
    if (player) {
        const totalGold = (player.temporaryGold || 0) + (player.permanentGold || 0);
        if (totalGold < spinCost) {
            showError('Недостаточно золота для спина (нужно 5 золота)');
            return;
        }
    }
    
    // Проверяем, прошло ли 3 секунды с начала перезарядки
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
        return; // Не позволяем спин, пока не прошло 3 секунды
    }
    
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
        const matchDetails = [];
        
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
    
    if ((damage > 0 || bonusCount >= 3) && playerState.currentOpponent) {
        // Отправляем атаку на сервер (золото тратится на сервере)
        // Если 3+ бонусов, сервер обработает способность персонажа
        socket.emit('attack', {
            roomId: playerState.roomId,
            fromPlayerSocketId: playerState.socketId,
            targetPlayerSocketId: playerState.currentOpponent,
            damage: damage,
            matches: bonusCount >= 3 ? 'bonus' : 'normal'
        });
    }
    
    // Начинаем перезарядку
    startRecharge();
}

// Начало перезарядки
function startRecharge() {
    gameState.isRecharging = true;
    gameState.rechargeTime = 3000; // 3 секунды
    gameState.rechargeEndTime = Date.now() + gameState.rechargeTime;
    
    const startTime = Date.now();
    const endTime = gameState.rechargeEndTime;
    
    // Блокируем кнопку спин на 3 секунды
    if (spinBtn) {
        spinBtn.disabled = true;
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
            gameState.isRecharging = false;
            gameState.rechargeTime = 0;
            gameState.rechargeEndTime = 0;
            enableSpin();
        }
    }, 50);
}

// Включение спина
function enableSpin() {
    gameState.canSpin = true;
    if (spinBtn) {
        spinBtn.disabled = false;
    }
    if (rechargeFill) {
        rechargeFill.style.width = '100%';
    }
    if (rechargeText) {
        rechargeText.textContent = 'Готово';
    }
}

// Получение урона
function takeDamage(damage) {
    gameState.roundHp = Math.max(0, gameState.roundHp - damage);
    
    // Обновляем из состояния комнаты
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp;
        gameState.totalHp = player.totalHp;
    }
    
    updateHpBars();
    
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
function showAttackAnimation(damage, isMyAttack = false) {
    const targetContainer = isMyAttack 
        ? document.querySelector('.enemy-character')
        : document.querySelector('.player-character');
    
    if (targetContainer) {
        targetContainer.classList.add('taking-damage');
        setTimeout(() => {
            targetContainer.classList.remove('taking-damage');
        }, 500);
    }
    
    // HP обновляется через gameState от другого игрока, здесь только анимация
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
    updateConnectionStatus('connecting', 'Подключение...');
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
                
                // Запускаем таймер перед боем, если он есть
                if (opponent.duelStartTime || player.duelStartTime) {
                    const duelStartTime = player.duelStartTime || opponent.duelStartTime;
                    if (duelStartTime > 0) {
                        startBattleTimer(duelStartTime);
                    }
                }
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
        
        return `
            <div class="player-item-game ${statusClass}">
                <div class="player-item-header">
                    <span class="player-item-name">${player.nickname}${isMe ? ' (Вы)' : ''}${isBot ? ' 🤖' : ''}</span>
                </div>
                <div class="player-item-hp">
                    Раунд: ${player.roundHp} | Всего: ${player.totalHp}
                </div>
                <div class="player-item-gold" style="font-size: 12px; color: #ffd700; margin-top: 5px;">
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
function updateConnectionStatus(status, text) {
    if (connectionStatus) {
        connectionStatus.className = `status ${status}`;
    }
    if (statusText) {
        statusText.textContent = text;
    }
}

function showScreen(screen) {
    menuScreen.classList.remove('active');
    characterSelectScreen.classList.remove('active');
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
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
    if (displayRoomId) {
        displayRoomId.textContent = '-';
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
    
    const battleTimer = document.getElementById('battleTimer');
    const vsText = document.getElementById('vsText');
    if (battleTimer) battleTimer.style.display = 'none';
    if (vsText) vsText.style.display = 'block';
    
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
    updateConnectionStatus('connecting', 'Создание комнаты...');
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        showError('Введите ID комнаты');
        return;
    }
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    socket.emit('joinRoom', { roomId, nickname: nickname || undefined });
    updateConnectionStatus('connecting', 'Подключение...');
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

copyRoomIdBtn.addEventListener('click', () => {
    if (displayRoomId && copyRoomIdBtn) {
        const roomId = displayRoomId.textContent;
        navigator.clipboard.writeText(roomId).then(() => {
            copyRoomIdBtn.textContent = 'Скопировано!';
            setTimeout(() => {
                copyRoomIdBtn.textContent = 'Копировать ID';
            }, 2000);
        });
    }
});

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
    
    battleTimer.style.display = 'block';
    if (vsText) vsText.style.display = 'none';
    
    battleTimerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, duelStartTime + 3000 - now);
        
        if (remaining <= 0) {
            clearInterval(battleTimerInterval);
            battleTimerInterval = null;
            battleTimer.style.display = 'none';
            if (vsText) vsText.style.display = 'block';
            return;
        }
        
        // Показываем секунды, но не показываем 0
        const seconds = Math.ceil(remaining / 1000);
        if (battleTimerCountdown) {
            battleTimerCountdown.textContent = seconds > 0 ? seconds : 1;
        }
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
        winStreakDisplay.innerHTML = `🏆 Побед: <strong>${winStreak}</strong>`;
        winStreakDisplay.title = `Серия побед: +5% за каждую победу (макс. +50%)\nТекущий бонус: +${bonusPercent}%`;
    }
    
    if (loseStreakDisplay) {
        const loseStreak = playerState.loseStreak || 0;
        const bonusPercent = Math.min(loseStreak * 3, 30);
        loseStreakDisplay.innerHTML = `💔 Поражений: <strong>${loseStreak}</strong>`;
        loseStreakDisplay.title = `Серия поражений: +3% за каждое поражение (макс. +30%)\nТекущий бонус: +${bonusPercent}%`;
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
updateConnectionStatus('disconnected', 'Отключено');

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
