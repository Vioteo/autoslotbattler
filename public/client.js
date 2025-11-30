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
    reconnectionAttempts: 5
});

// Символы для игрового автомата
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🍉', '⭐', '💎', '🎰'];

// Игровое состояние
let gameState = {
    playerHp: 100,
    enemyHp: 100,
    maxHp: 100,
    isRecharging: false,
    rechargeTime: 0,
    canSpin: true,
    isSpinning: false
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
const displayRoomId = document.getElementById('displayRoomId');
const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
const playersCount = document.getElementById('playersCount');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const gameRoomId = document.getElementById('gameRoomId');
const playerNumber = document.getElementById('playerNumber');
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

// Получаем все линии слотов
const slotLines = [
    document.querySelectorAll('#line1 .slot-symbol'),
    document.querySelectorAll('#line2 .slot-symbol'),
    document.querySelectorAll('#line3 .slot-symbol')
];

let currentRoomId = null;
let currentPlayerNumber = null;
let rechargeInterval = null;
let spinTimeout = null;

// Обработчики событий Socket.io
socket.on('connect', () => {
    console.log('Подключено к серверу');
    updateConnectionStatus('connected', 'Подключено');
});

socket.on('disconnect', () => {
    console.log('Отключено от сервера');
    updateConnectionStatus('disconnected', 'Отключено');
    showScreen(menuScreen);
    resetGame();
});

socket.on('connect_error', () => {
    console.log('Ошибка подключения');
    updateConnectionStatus('disconnected', 'Ошибка подключения');
});

socket.on('roomCreated', (data) => {
    console.log('Комната создана:', data.roomId);
    currentRoomId = data.roomId;
    currentPlayerNumber = data.playerNumber || 1;
    displayRoomId.textContent = data.roomId;
    showScreen(waitingScreen);
    hideError();
});

socket.on('roomJoined', (data) => {
    console.log('Присоединено к комнате:', data);
    currentRoomId = data.roomId;
    currentPlayerNumber = data.playerNumber;
    displayRoomId.textContent = data.roomId;
    showScreen(waitingScreen);
    hideError();
});

socket.on('playerJoined', (data) => {
    console.log('Игрок присоединился:', data);
    playersCount.textContent = data.playerCount;
});

socket.on('gameStart', (data) => {
    console.log('Игра началась:', data);
    currentRoomId = data.roomId;
    if (data.playerNumber) {
        currentPlayerNumber = data.playerNumber;
    }
    gameRoomId.textContent = data.roomId;
    playerNumber.textContent = currentPlayerNumber;
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
    if (data.targetPlayer === currentPlayerNumber) {
        // Мы получили урон
        takeDamage(data.damage);
    } else if (data.fromPlayer === currentPlayerNumber) {
        // Это наша атака, показываем анимацию на противнике
        showAttackAnimation(data.damage, true);
    } else {
        // Атака противника, показываем анимацию
        showAttackAnimation(data.damage, false);
    }
});

socket.on('playerLeft', (data) => {
    console.log('Игрок покинул комнату:', data);
    playersCount.textContent = data.playerCount;
    
    if (data.playerCount < 2 && gameScreen.classList.contains('active')) {
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
    gameState = {
        playerHp: 100,
        enemyHp: 100,
        maxHp: 100,
        isRecharging: false,
        rechargeTime: 0,
        canSpin: true,
        isSpinning: false
    };
    updateHpBars();
    generateInitialSymbols();
    enableSpin();
    
    // Отправляем начальное состояние
    socket.emit('gameState', {
        roomId: currentRoomId,
        playerNumber: currentPlayerNumber,
        gameState: gameState
    });
}

// Генерация начальных символов
function generateInitialSymbols() {
    slotLines.forEach(line => {
        line.forEach(symbol => {
            symbol.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
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
    // Игрок
    const playerHpPercent = (gameState.playerHp / gameState.maxHp) * 100;
    playerHpFill.style.width = `${playerHpPercent}%`;
    playerHpText.textContent = `${gameState.playerHp} / ${gameState.maxHp}`;
    
    if (playerHpPercent <= 25) {
        playerHpFill.classList.add('low');
        playerHpFill.classList.remove('medium');
    } else if (playerHpPercent <= 50) {
        playerHpFill.classList.add('medium');
        playerHpFill.classList.remove('low');
    } else {
        playerHpFill.classList.remove('low', 'medium');
    }
    
    // Противник
    const enemyHpPercent = (gameState.enemyHp / gameState.maxHp) * 100;
    enemyHpFill.style.width = `${enemyHpPercent}%`;
    enemyHpText.textContent = `${gameState.enemyHp} / ${gameState.maxHp}`;
    
    if (enemyHpPercent <= 25) {
        enemyHpFill.classList.add('low');
        enemyHpFill.classList.remove('medium');
    } else if (enemyHpPercent <= 50) {
        enemyHpFill.classList.add('medium');
        enemyHpFill.classList.remove('low');
    } else {
        enemyHpFill.classList.remove('low', 'medium');
    }
    
    // Проверка победы/поражения
    if (gameState.playerHp <= 0) {
        showError('Вы проиграли!');
        setTimeout(() => resetToMenu(), 3000);
    } else if (gameState.enemyHp <= 0) {
        showError('Вы победили!');
        setTimeout(() => resetToMenu(), 3000);
    }
}

// Спин игрового автомата
function spin() {
    if (!gameState.canSpin || gameState.isSpinning) return;
    
    const wasRecharging = gameState.isRecharging;
    
    // Если спин во время перезарядки, добавляем +2 секунды
    if (wasRecharging) {
        gameState.rechargeTime += 2000;
        rechargeText.textContent = `Перезарядка: +2 сек`;
        return;
    }
    
    gameState.isSpinning = true;
    gameState.canSpin = false;
    spinBtn.disabled = true;
    
    // Анимация спина
    slotLines.forEach((line, lineIndex) => {
        line.forEach((symbol, symbolIndex) => {
            setTimeout(() => {
                symbol.classList.add('spinning');
                // Случайные символы во время спина
                const spinInterval = setInterval(() => {
                    symbol.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                }, 50);
                
                // Остановка спина через 1-2 секунды
                setTimeout(() => {
                    clearInterval(spinInterval);
                    symbol.classList.remove('spinning');
                    // Финальный символ
                    symbol.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                    
                    // Если это последний символ, проверяем совпадения
                    if (lineIndex === slotLines.length - 1 && symbolIndex === line.length - 1) {
                        setTimeout(() => {
                            checkMatches();
                        }, 300);
                    }
                }, 1000 + Math.random() * 1000);
            }, (lineIndex * 200) + (symbolIndex * 100));
        });
    });
}

// Проверка совпадений и расчет урона
function checkMatches() {
    gameState.isSpinning = false;
    
    // Получаем символы из каждой линии
    const results = slotLines.map(line => {
        return Array.from(line).map(symbol => symbol.textContent);
    });
    
    // Подсчет совпадений по горизонтали (в каждой линии)
    let totalMatches = 0;
    const matchDetails = [];
    
    results.forEach((line, lineIndex) => {
        // Подсчет одинаковых символов в линии
        const symbolCounts = {};
        line.forEach(symbol => {
            symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
        });
        
        // Находим максимальное количество совпадений в линии
        const maxMatches = Math.max(...Object.values(symbolCounts));
        if (maxMatches >= 3) {
            totalMatches += maxMatches;
            matchDetails.push({ line: lineIndex + 1, matches: maxMatches });
            
            // Подсветка совпавших символов
            line.forEach((symbol, index) => {
                if (symbolCounts[symbol] === maxMatches) {
                    slotLines[lineIndex][index].classList.add('matched');
                    setTimeout(() => {
                        slotLines[lineIndex][index].classList.remove('matched');
                    }, 2000);
                }
            });
        }
    });
    
    // Расчет урона: базовый урон * количество совпадений
    const baseDamage = 5;
    const damage = baseDamage * totalMatches;
    
    if (damage > 0) {
        // Отправляем атаку на сервер
        socket.emit('attack', {
            roomId: currentRoomId,
            fromPlayer: currentPlayerNumber,
            damage: damage,
            matches: totalMatches
        });
    }
    
    // Начинаем перезарядку
    startRecharge();
}

// Начало перезарядки
function startRecharge() {
    gameState.isRecharging = true;
    gameState.rechargeTime = 3000; // 3 секунды
    
    const startTime = Date.now();
    const endTime = startTime + gameState.rechargeTime;
    
    rechargeInterval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const progress = 1 - (remaining / gameState.rechargeTime);
        
        rechargeFill.style.width = `${progress * 100}%`;
        rechargeText.textContent = remaining > 0 
            ? `Перезарядка: ${(remaining / 1000).toFixed(1)}с`
            : 'Готово';
        
        if (remaining <= 0) {
            clearInterval(rechargeInterval);
            gameState.isRecharging = false;
            gameState.rechargeTime = 0;
            enableSpin();
        }
    }, 50);
}

// Включение спина
function enableSpin() {
    gameState.canSpin = true;
    spinBtn.disabled = false;
    rechargeFill.style.width = '100%';
    rechargeText.textContent = 'Готово';
}

// Получение урона
function takeDamage(damage) {
    gameState.playerHp = Math.max(0, gameState.playerHp - damage);
    updateHpBars();
    
    // Анимация получения урона
    const playerContainer = document.querySelector('.player-character');
    playerContainer.classList.add('taking-damage');
    setTimeout(() => {
        playerContainer.classList.remove('taking-damage');
    }, 500);
    
    // Обновляем состояние на сервере после небольшой задержки
    setTimeout(() => {
        socket.emit('gameState', {
            roomId: currentRoomId,
            playerNumber: currentPlayerNumber,
            gameState: gameState
        });
    }, 100);
}

// Показ анимации атаки
function showAttackAnimation(damage, isMyAttack = false) {
    const targetContainer = isMyAttack 
        ? document.querySelector('.enemy-character')
        : document.querySelector('.player-character');
    
    targetContainer.classList.add('taking-damage');
    setTimeout(() => {
        targetContainer.classList.remove('taking-damage');
    }, 500);
    
    // HP обновляется через gameState от другого игрока, здесь только анимация
}

// Функции UI
function updateConnectionStatus(status, text) {
    connectionStatus.className = `status ${status}`;
    statusText.textContent = text;
}

function showScreen(screen) {
    menuScreen.classList.remove('active');
    waitingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    screen.classList.add('active');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    errorMessage.classList.remove('show');
}

function resetToMenu() {
    resetGame();
    currentRoomId = null;
    currentPlayerNumber = null;
    roomIdInput.value = '';
    displayRoomId.textContent = '-';
    playersCount.textContent = '1';
    showScreen(menuScreen);
    hideError();
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
        playerHp: 100,
        enemyHp: 100,
        maxHp: 100,
        isRecharging: false,
        rechargeTime: 0,
        canSpin: true,
        isSpinning: false
    };
}

// Обработчики кнопок
createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
    updateConnectionStatus('connecting', 'Создание комнаты...');
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        showError('Введите ID комнаты');
        return;
    }
    socket.emit('joinRoom', { roomId });
    updateConnectionStatus('connecting', 'Подключение...');
});

copyRoomIdBtn.addEventListener('click', () => {
    const roomId = displayRoomId.textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        copyRoomIdBtn.textContent = 'Скопировано!';
        setTimeout(() => {
            copyRoomIdBtn.textContent = 'Копировать ID';
        }, 2000);
    });
});

leaveRoomBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.leave(currentRoomId);
    }
    resetToMenu();
});

leaveGameBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.leave(currentRoomId);
    }
    resetToMenu();
});

spinBtn.addEventListener('click', () => {
    spin();
});

// Обработка Enter в поле ввода комнаты
roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// Инициализация
updateConnectionStatus('disconnected', 'Отключено');
