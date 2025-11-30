// Автоматическое определение сервера
const getServerUrl = () => {
    // Если мы на localhost, используем localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.hostname}:${window.location.port || 3000}`;
    }
    // Иначе используем текущий хост
    return window.location.origin;
};

// Инициализация Socket.io с автоматическим определением сервера
const socket = io(getServerUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
});

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
const sendTestDataBtn = document.getElementById('sendTestDataBtn');
const gameDataDisplay = document.getElementById('gameDataDisplay');

let currentRoomId = null;
let currentPlayerNumber = null;

// Обработчики событий Socket.io
socket.on('connect', () => {
    console.log('Подключено к серверу');
    updateConnectionStatus('connected', 'Подключено');
});

socket.on('disconnect', () => {
    console.log('Отключено от сервера');
    updateConnectionStatus('disconnected', 'Отключено');
    showScreen(menuScreen);
});

socket.on('connect_error', () => {
    console.log('Ошибка подключения');
    updateConnectionStatus('disconnected', 'Ошибка подключения');
});

socket.on('roomCreated', (data) => {
    console.log('Комната создана:', data.roomId);
    currentRoomId = data.roomId;
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
    gameRoomId.textContent = data.roomId;
    playerNumber.textContent = currentPlayerNumber;
    showScreen(gameScreen);
    hideError();
});

socket.on('gameData', (data) => {
    console.log('Получены игровые данные:', data);
    displayGameData(data.gameData);
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
    currentRoomId = null;
    currentPlayerNumber = null;
    roomIdInput.value = '';
    displayRoomId.textContent = '-';
    playersCount.textContent = '1';
    gameDataDisplay.innerHTML = '';
    showScreen(menuScreen);
    hideError();
}

function displayGameData(data) {
    const timestamp = new Date().toLocaleTimeString();
    gameDataDisplay.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>${timestamp}:</strong> ${JSON.stringify(data, null, 2)}
        </div>
        ${gameDataDisplay.innerHTML}
    `;
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

sendTestDataBtn.addEventListener('click', () => {
    if (currentRoomId) {
        const testData = {
            player: currentPlayerNumber,
            action: 'test',
            timestamp: Date.now(),
            data: { x: Math.random() * 100, y: Math.random() * 100 }
        };
        socket.emit('gameData', { roomId: currentRoomId, gameData: testData });
        displayGameData(testData);
    }
});

// Обработка Enter в поле ввода комнаты
roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// Инициализация
updateConnectionStatus('disconnected', 'Отключено');

