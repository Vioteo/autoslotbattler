const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище комнат
const rooms = new Map();

// Генерация уникального ID комнаты
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Хранилище игроков (socket.id -> player data)
const players = new Map();

// Хранилище ботов (botId -> bot data)
const bots = new Map();
let botIdCounter = 0;

// Имена для ботов
const botNames = [
  'Бот-Воин', 'Бот-Мастер', 'Бот-Победитель', 'Бот-Легенда',
  'Бот-Титан', 'Бот-Чемпион', 'Бот-Герой', 'Бот-Ветеран',
  'Бот-Стрелок', 'Бот-Защитник', 'Бот-Атакующий', 'Бот-Стратег'
];

// Структура данных игрока
function createPlayer(socketId, nickname, roomId, isBot = false) {
  return {
    socketId: socketId,
    nickname: nickname || `Игрок ${socketId.substring(0, 6)}`,
    roomId: roomId,
    totalHp: 100,
    roundHp: 100,
    isEliminated: false,
    isInDuel: false,
    duelOpponent: null,
    duelStatus: null, // 'fighting', 'winner', 'loser', null
    isBot: isBot,
    spinDelay: isBot ? getRandomSpinDelay() : 0, // Случайная задержка для бота
    lastSpinTime: 0,
    rechargeEndTime: 0
  };
}

// Генерация случайной задержки для бота (0.1-0.5 или 0.4-1.5 сек)
function getRandomSpinDelay() {
  const ranges = [
    { min: 100, max: 500 },   // 0.1-0.5 сек
    { min: 400, max: 1500 }   // 0.4-1.5 сек
  ];
  const range = ranges[Math.floor(Math.random() * ranges.length)];
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

// Создание бота
function createBot(roomId) {
  botIdCounter++;
  const botId = `BOT_${botIdCounter}`;
  const botName = botNames[Math.floor(Math.random() * botNames.length)];
  const bot = createPlayer(botId, botName, roomId, true);
  bots.set(botId, bot);
  players.set(botId, bot);
  return bot;
}

// Расчет урона для бота (симуляция спина)
function calculateBotDamage() {
  // 10% шанс на бонус (25 урона)
  if (Math.random() < 0.1) {
    return 25;
  }
  
  // Иначе случайное количество совпадений (3-15, что дает 15-75 урона)
  const matches = Math.floor(Math.random() * 13) + 3; // 3-15 совпадений
  return matches * 5; // базовый урон 5
}

// Обработка спина бота
function handleBotSpin(botId, roomId) {
  const bot = bots.get(botId);
  if (!bot || !bot.isInDuel || bot.isEliminated) return;
  
  const room = rooms.get(roomId);
  if (!room || !room.gameInProgress) return;
  
  const opponentId = bot.duelOpponent;
  if (!opponentId) return;
  
  const opponent = players.get(opponentId);
  if (!opponent || opponent.isEliminated) return;
  
  // Генерируем урон
  const damage = calculateBotDamage();
  
  // Наносим урон противнику
  opponent.roundHp = Math.max(0, opponent.roundHp - damage);
  
  // Отправляем атаку всем в комнате
  io.to(roomId).emit('attack', {
    fromPlayerSocketId: botId,
    targetPlayerSocketId: opponentId,
    damage: damage,
    matches: damage === 25 ? 'bonus' : 'normal'
  });
  
  // Обновляем время последнего спина и перезарядки
  const now = Date.now();
  bot.lastSpinTime = now;
  bot.rechargeEndTime = now + 3000; // 3 секунды перезарядки
  
  // Проверяем, закончился ли бой
  if (opponent.roundHp <= 0) {
    // Проигравший теряет 20% от общего HP
    opponent.totalHp = Math.max(0, opponent.totalHp - Math.floor(opponent.totalHp * 0.2));
    bot.duelStatus = 'winner';
    opponent.duelStatus = 'loser';
    
    if (opponent.totalHp <= 0) {
      opponent.isEliminated = true;
    }
    
    bot.isInDuel = false;
    opponent.isInDuel = false;
    
    updateRoomState(roomId);
    checkAllDuelsFinished(roomId);
  } else {
    updateRoomState(roomId);
  }
  
  // Планируем следующий спин бота (перезарядка + случайная задержка), только если бой еще идет
  if (bot.isInDuel && !bot.isEliminated) {
    const nextSpinDelay = 3000 + bot.spinDelay;
    setTimeout(() => {
      handleBotSpin(botId, roomId);
    }, nextSpinDelay);
  }
  
  console.log(`Бот ${bot.nickname} атакует ${opponent.nickname} на ${damage} урона`);
}

// Добавление ботов в комнату до 8 игроков
function fillRoomWithBots(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameInProgress) return;
  
  const neededBots = 8 - room.players.length;
  for (let i = 0; i < neededBots; i++) {
    const bot = createBot(roomId);
    room.players.push(bot.socketId);
    
    // Отправляем обновление списка игроков
    const playersInRoom = room.players.map(id => {
      const p = players.get(id);
      return p ? { socketId: id, nickname: p.nickname, totalHp: p.totalHp, roundHp: p.roundHp, isEliminated: p.isEliminated } : null;
    }).filter(p => p !== null);
    
    io.to(roomId).emit('playerJoined', {
      roomId,
      playerCount: room.players.length,
      players: playersInRoom
    });
  }
  
  console.log(`Добавлено ${neededBots} ботов в комнату ${roomId}`);
}

// Получить список доступных комнат
function getAvailableRooms() {
  const availableRooms = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length < 8 && !room.gameInProgress) {
      availableRooms.push({
        id: roomId,
        playerCount: room.players.length,
        maxPlayers: 8
      });
    }
  }
  return availableRooms;
}

// Создать случайные пары для дуэлей
function createPairs(playerIds) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    } else {
      // Нечетное количество - один игрок проходит автоматически
      pairs.push([shuffled[i], null]);
    }
  }
  return pairs;
}

io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  // Отправка списка доступных комнат
  socket.on('getRooms', () => {
    socket.emit('roomsList', getAvailableRooms());
  });

  // Создание новой комнаты
  socket.on('createRoom', (data) => {
    const nickname = data?.nickname || `Игрок ${socket.id.substring(0, 6)}`;
    const roomId = generateRoomId();
    
    const player = createPlayer(socket.id, nickname, roomId);
    players.set(socket.id, player);
    
    rooms.set(roomId, {
      id: roomId,
      players: [socket.id],
      hostId: socket.id, // Первый игрок становится хостом
      gameState: null,
      gameInProgress: false,
      currentRound: null,
      pairs: []
    });
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerNumber: 1, isHost: true });
    
    // Отправляем начальный список игроков
    const playersInRoom = [{
      socketId: socket.id,
      nickname: player.nickname,
      totalHp: player.totalHp,
      roundHp: player.roundHp,
      isEliminated: player.isEliminated
    }];
    socket.emit('playerJoined', {
      roomId,
      playerCount: 1,
      players: playersInRoom
    });
    
    // Отправляем обновленный список комнат всем
    io.emit('roomsList', getAvailableRooms());
    console.log(`Комната ${roomId} создана пользователем ${socket.id} (${nickname})`);
  });

  // Подключение к комнате
  socket.on('joinRoom', (data) => {
    const { roomId, nickname } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('roomError', { message: 'Комната не найдена' });
      return;
    }

    const room = rooms.get(roomId);
    
    if (room.players.length >= 8) {
      socket.emit('roomError', { message: 'Комната заполнена (максимум 8 игроков)' });
      return;
    }

    if (room.gameInProgress) {
      socket.emit('roomError', { message: 'Игра уже началась' });
      return;
    }

    const playerNickname = nickname || `Игрок ${socket.id.substring(0, 6)}`;
    const player = createPlayer(socket.id, playerNickname, roomId);
    players.set(socket.id, player);
    
    room.players.push(socket.id);
    socket.join(roomId);
    
    // Проверяем, является ли игрок хостом (первый игрок)
    const isHost = room.players[0] === socket.id;
    socket.emit('roomJoined', { roomId, playerNumber: room.players.length, isHost: isHost });
    
    // Отправляем список игроков в комнате
    const playersInRoom = room.players.map(id => {
      const p = players.get(id);
      return p ? { socketId: id, nickname: p.nickname, totalHp: p.totalHp, roundHp: p.roundHp, isEliminated: p.isEliminated } : null;
    }).filter(p => p !== null);
    
    // Уведомляем всех в комнате о подключении нового игрока
    io.to(roomId).emit('playerJoined', {
      roomId,
      playerCount: room.players.length,
      players: playersInRoom
    });

    // Отправляем обновленный список комнат всем
    io.emit('roomsList', getAvailableRooms());
    
    console.log(`Игрок ${socket.id} (${playerNickname}) присоединился к комнате ${roomId}`);
  });

  // Отправка игровых данных
  socket.on('gameData', (data) => {
    const { roomId, gameData } = data;
    // Пересылаем данные другому игроку в комнате
    socket.to(roomId).emit('gameData', { gameData });
  });

  // Обновление состояния игры
  socket.on('gameState', (data) => {
    const { roomId, playerNumber, gameState } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      // Сохраняем состояние игрока
      if (!room.gameState) {
        room.gameState = {};
      }
      room.gameState[playerNumber] = gameState;
      
      // Отправляем состояние другому игроку
      socket.to(roomId).emit('gameState', {
        playerNumber: playerNumber,
        gameState: gameState
      });
    }
  });

  // Обработка атаки
  socket.on('attack', (data) => {
    const { roomId, fromPlayerSocketId, targetPlayerSocketId, damage, matches } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameInProgress) return;
    
    const attacker = players.get(fromPlayerSocketId);
    const target = players.get(targetPlayerSocketId);
    
    if (!attacker || !target || !attacker.isInDuel || attacker.duelOpponent !== targetPlayerSocketId) {
      return;
    }
    
    // Наносим урон по HP раунда
    target.roundHp = Math.max(0, target.roundHp - damage);
    
    // Отправляем атаку всем в комнате
    io.to(roomId).emit('attack', {
      fromPlayerSocketId: fromPlayerSocketId,
      targetPlayerSocketId: targetPlayerSocketId,
      damage: damage,
      matches: matches
    });
    
    // Проверяем, закончился ли бой
    if (target.roundHp <= 0) {
      // Проигравший теряет 20% от общего HP
      target.totalHp = Math.max(0, target.totalHp - Math.floor(target.totalHp * 0.2));
      attacker.duelStatus = 'winner';
      target.duelStatus = 'loser';
      
      if (target.totalHp <= 0) {
        target.isEliminated = true;
      }
      
      // Обновляем статусы
      attacker.isInDuel = false;
      target.isInDuel = false;
      
      // Отправляем обновление состояния всем
      updateRoomState(roomId);
      
      // Проверяем, все ли бои закончились
      checkAllDuelsFinished(roomId);
    } else {
      // Обновляем состояние комнаты
      updateRoomState(roomId);
    }
    
    console.log(`Игрок ${attacker.nickname} атакует ${target.nickname} на ${damage} урона`);
  });

  // Обновление состояния комнаты
  function updateRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const playersInRoom = room.players.map(id => {
      const p = players.get(id);
      if (!p) return null;
      return {
        socketId: id,
        nickname: p.nickname,
        totalHp: p.totalHp,
        roundHp: p.roundHp,
        isEliminated: p.isEliminated,
        isInDuel: p.isInDuel,
        duelOpponent: p.duelOpponent,
        duelStatus: p.duelStatus,
        isBot: p.isBot || false
      };
    }).filter(p => p !== null);
    
    io.to(roomId).emit('roomStateUpdate', {
      players: playersInRoom,
      pairs: room.pairs,
      currentRound: room.currentRound
    });
  }

  // Проверка, все ли дуэли закончились
  function checkAllDuelsFinished(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameInProgress) return;
    
    const activePlayers = room.players.filter(id => {
      const p = players.get(id);
      return p && !p.isEliminated;
    });
    
    // Проверяем, все ли бои закончились
    const allDuelsFinished = activePlayers.every(id => {
      const p = players.get(id);
      return !p.isInDuel || p.duelStatus !== null;
    });
    
    if (allDuelsFinished && activePlayers.length > 1) {
      // Все бои закончились, начинаем следующий раунд
      setTimeout(() => {
        startNextRound(roomId);
      }, 3000); // 3 секунды задержки перед следующим раундом
    } else if (activePlayers.length <= 1) {
      // Остался один игрок - игра окончена
      const winner = activePlayers.length === 1 ? players.get(activePlayers[0]) : null;
      room.gameInProgress = false;
      io.to(roomId).emit('gameEnded', {
        winner: winner ? { socketId: winner.socketId, nickname: winner.nickname } : null
      });
    }
  }

  // Начало следующего раунда
  function startNextRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const activePlayers = room.players.filter(id => {
      const p = players.get(id);
      return p && !p.isEliminated;
    });
    
    if (activePlayers.length < 2) {
      // Недостаточно игроков
      room.gameInProgress = false;
      io.to(roomId).emit('gameEnded', { winner: null });
      return;
    }
    
    // Сбрасываем HP раунда для всех активных игроков
    activePlayers.forEach(id => {
      const p = players.get(id);
      if (p) {
        p.roundHp = 100;
        p.isInDuel = false;
        p.duelOpponent = null;
        p.duelStatus = null;
        p.lastSpinTime = 0;
        p.rechargeEndTime = 0;
      }
    });
    
    // Создаем пары
    room.pairs = createPairs(activePlayers);
    room.currentRound = (room.currentRound || 0) + 1;
    
    // Назначаем дуэли
    room.pairs.forEach(pair => {
      if (pair[1] !== null) {
        const p1 = players.get(pair[0]);
        const p2 = players.get(pair[1]);
        if (p1 && p2) {
          p1.isInDuel = true;
          p1.duelOpponent = pair[1];
          p2.isInDuel = true;
          p2.duelOpponent = pair[0];
        }
      } else {
        // Игрок без пары проходит автоматически
        const p = players.get(pair[0]);
        if (p) {
          p.duelStatus = 'winner';
        }
      }
    });
    
    updateRoomState(roomId);
    io.to(roomId).emit('roundStarted', {
      round: room.currentRound,
      pairs: room.pairs
    });
    
    // Запускаем ботов для автоматических спинов
    activePlayers.forEach(id => {
      const p = players.get(id);
      if (p && p.isBot && p.isInDuel) {
        // Бот начинает спин после случайной задержки
        setTimeout(() => {
          handleBotSpin(id, roomId);
        }, p.spinDelay);
      }
    });
  }

  // Начало игры (только хост может запустить)
  socket.on('startGame', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || room.gameInProgress) {
      socket.emit('roomError', { message: 'Игра уже началась или комната не найдена' });
      return;
    }
    
    // Проверяем, что только хост может запустить игру
    if (room.hostId !== socket.id) {
      socket.emit('roomError', { message: 'Только хост может запустить игру' });
      return;
    }
    
    // Дозаполняем комнату ботами до 8 игроков
    fillRoomWithBots(roomId);
    
    const activePlayers = room.players.filter(id => {
      const p = players.get(id);
      return p && !p.isEliminated;
    });
    
    if (activePlayers.length < 2) {
      socket.emit('roomError', { message: 'Недостаточно игроков для начала игры (минимум 2)' });
      return;
    }
    
    room.gameInProgress = true;
    startNextRound(roomId);
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
    
    const player = players.get(socket.id);
    
    // Удаляем игрока из всех комнат
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        // Если игрок был в дуэли, отмечаем противника как победителя
        if (player && player.isInDuel && player.duelOpponent) {
          const opponent = players.get(player.duelOpponent);
          if (opponent) {
            opponent.duelStatus = 'winner';
            opponent.isInDuel = false;
            opponent.duelOpponent = null;
          }
        }
        
        // Обновляем состояние комнаты
        updateRoomState(roomId);
        
        // Проверяем, все ли бои закончились
        if (room.gameInProgress) {
          checkAllDuelsFinished(roomId);
        }
        
        // Если хост покинул комнату, назначаем нового хоста
        if (room.hostId === socket.id && room.players.length > 0) {
          room.hostId = room.players[0];
          // Уведомляем нового хоста
          io.to(room.hostId).emit('becameHost', { roomId });
        }
        
        // Уведомляем других игроков
        io.to(roomId).emit('playerLeft', {
          roomId,
          playerCount: room.players.length
        });

        // Если комната пуста, удаляем её
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`Комната ${roomId} удалена`);
        }
        break;
      }
    }
    
    // Удаляем игрока из хранилища
    players.delete(socket.id);
    
    // Если это был бот, удаляем его из хранилища ботов
    if (bots.has(socket.id)) {
      bots.delete(socket.id);
    }
    
    // Отправляем обновленный список комнат
    io.emit('roomsList', getAvailableRooms());
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});

