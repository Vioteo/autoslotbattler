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

// Игровое состояние
let gameState = {
    roundHp: 100,
    totalHp: 100,
    enemyRoundHp: 100,
    enemyTotalHp: 100,
    maxHp: 100,
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
    isInDuel: false
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

// Получаем все линии слотов
const slotLines = [
    document.querySelectorAll('#line1 .slot-symbol'),
    document.querySelectorAll('#line2 .slot-symbol'),
    document.querySelectorAll('#line3 .slot-symbol')
];

let rechargeInterval = null;
let spinTimeout = null;

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
    showScreen(waitingScreen);
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
    showScreen(waitingScreen);
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

// Инициализация игры
function initGame() {
    const player = roomState.players.find(p => p.socketId === playerState.socketId);
    if (player) {
        gameState.roundHp = player.roundHp || 100;
        gameState.totalHp = player.totalHp || 100;
    }
    
    // Находим противника
    const opponent = roomState.players.find(p => 
        p.socketId === playerState.currentOpponent || 
        (player && player.isInDuel && p.socketId === player.duelOpponent)
    );
    
    if (opponent) {
        gameState.enemyRoundHp = opponent.roundHp || 100;
        gameState.enemyTotalHp = opponent.totalHp || 100;
        playerState.currentOpponent = opponent.socketId;
        playerState.isInDuel = true;
    }
    
    gameState.maxHp = 100;
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
    slotLines.forEach(line => {
        line.forEach(symbol => {
            const randomSymbol = getRandomSymbol();
            setSymbol(symbol, randomSymbol);
            symbol.classList.remove('spinning', 'matched');
        });
    });
}

// Обновление состояния игры
function updateGameState(data) {
    if (data.playerNumber !== currentPlayerNumber) {
        // Обновляем HP противника из его состояния
        if (data.gameState && data.gameState.playerHp !== undefined) {
            gameState.enemyHp = data.gameState.playerHp;
            updateHpBars();
        }
    }
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
    
    // Анимация спина - вращение барабана с остановкой
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
    const results = slotLines.map(line => {
        return Array.from(line).map(symbol => symbol.dataset.symbol);
    });
    
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
        slotLines.forEach((line, lineIndex) => {
            const matchedIndices = [];
            line.forEach((symbol, symbolIndex) => {
                if (symbol.dataset.symbol === 'bonus') {
                    symbol.classList.add('matched');
                    matchedIndices.push(symbolIndex);
                    setTimeout(() => {
                        symbol.classList.remove('matched');
                    }, 2000);
                }
            });
            // Рисуем линии для каждой линии с бонусами
            if (matchedIndices.length >= 2) {
                const lineElement = document.getElementById(`line${lineIndex + 1}`);
                if (lineElement) {
                    drawMatchLine(lineElement, matchedIndices);
                }
            }
        });
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
                        slotLines[lineIndex][index].classList.add('matched');
                        matchedIndices.push(index);
                        setTimeout(() => {
                            slotLines[lineIndex][index].classList.remove('matched');
                        }, 2000);
                    }
                });
                
                // Рисуем линию между совпавшими символами
                if (matchedIndices.length >= 2) {
                    const lineElement = document.getElementById(`line${lineIndex + 1}`);
                    if (lineElement) {
                        drawMatchLine(lineElement, matchedIndices);
                    }
                }
            }
        });
        
        // Расчет урона: базовый урон * количество совпадений
        const baseDamage = 5;
        damage = baseDamage * totalMatches;
    }
    
    if (damage > 0) {
        // Отправляем атаку на сервер
        socket.emit('attack', {
            roomId: currentRoomId,
            fromPlayer: currentPlayerNumber,
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
    
    roomsList.innerHTML = rooms.map(room => `
        <div class="room-item" data-room-id="${room.id}">
            <div class="room-item-info">
                <div class="room-item-id">${room.id}</div>
                <div class="room-item-count">${room.playerCount} / ${room.maxPlayers} игроков</div>
            </div>
            <button class="btn btn-small" onclick="joinRoomById('${room.id}')">Присоединиться</button>
        </div>
    `).join('');
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
        return `
            <div class="player-item-waiting ${isHost ? 'host' : ''}">
                <span>${player.nickname}${isHost ? ' (Хост)' : ''}${isBot ? ' 🤖' : ''}</span>
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
        
        if (player.isInDuel && player.duelOpponent) {
            playerState.currentOpponent = player.duelOpponent;
            playerState.isInDuel = true;
            
            const opponent = roomState.players.find(p => p.socketId === player.duelOpponent);
            if (opponent) {
                gameState.enemyRoundHp = opponent.roundHp;
                gameState.enemyTotalHp = opponent.totalHp;
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
        
        return `
            <div class="player-item-game ${statusClass}">
                <div class="player-item-header">
                    <span class="player-item-name">${player.nickname}${isMe ? ' (Вы)' : ''}${isBot ? ' 🤖' : ''}</span>
                </div>
                <div class="player-item-hp">
                    Раунд: ${player.roundHp} | Всего: ${player.totalHp}
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
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    screen.classList.add('active');
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
    gameState = {
        roundHp: 100,
        totalHp: 100,
        enemyRoundHp: 100,
        enemyTotalHp: 100,
        maxHp: 100,
        isRecharging: false,
        rechargeTime: 0,
        canSpin: true,
        isSpinning: false,
        rechargeEndTime: 0
    };
}

// Обработчики кнопок
createRoomBtn.addEventListener('click', () => {
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    socket.emit('createRoom', { nickname: nickname || undefined });
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

spinBtn.addEventListener('click', () => {
    spin();
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
