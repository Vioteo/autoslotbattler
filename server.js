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

io.on('connection', (socket) => {
  console.log('Пользователь подключился:', socket.id);

  // Создание новой комнаты
  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      id: roomId,
      players: [socket.id],
      gameState: null
    });
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
    console.log(`Комната ${roomId} создана пользователем ${socket.id}`);
  });

  // Подключение к комнате
  socket.on('joinRoom', (data) => {
    const { roomId } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('roomError', { message: 'Комната не найдена' });
      return;
    }

    const room = rooms.get(roomId);
    
    if (room.players.length >= 2) {
      socket.emit('roomError', { message: 'Комната заполнена' });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    
    socket.emit('roomJoined', { roomId, playerNumber: room.players.length });
    
    // Уведомляем всех в комнате о подключении нового игрока
    io.to(roomId).emit('playerJoined', {
      roomId,
      playerCount: room.players.length,
      playerNumber: room.players.length
    });

    console.log(`Игрок ${socket.id} присоединился к комнате ${roomId}`);

    // Если комната заполнена, начинаем игру
    if (room.players.length === 2) {
      io.to(roomId).emit('gameStart', {
        roomId,
        players: room.players
      });
      console.log(`Игра началась в комнате ${roomId}`);
    }
  });

  // Отправка игровых данных
  socket.on('gameData', (data) => {
    const { roomId, gameData } = data;
    // Пересылаем данные другому игроку в комнате
    socket.to(roomId).emit('gameData', { gameData });
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    console.log('Пользователь отключился:', socket.id);
    
    // Удаляем игрока из всех комнат
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
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
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});

