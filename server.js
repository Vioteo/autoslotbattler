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

// Константы
const PRE_BATTLE_DELAY = 10000; // 10 секунд до начала боя
const BREAK_DURATION = 120000; // 2 минуты между боями

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

// Персонажи с уникальными способностями
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
    abilityValue: 50 // Восстанавливает 50 HP
  },
  {
    id: 'guardian',
    name: 'Страж',
    emoji: '🛡️',
    ability: 'block',
    description: 'Блокирование следующего урона',
    abilityValue: 1 // Блокирует 1 атаку
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

// Система карточек
const CARD_TYPES = {
  HEALTH: 'health',
  DODGE: 'dodge',
  CRITICAL: 'critical',
  HEALING: 'healing',
  ARMOR: 'armor',
  FREEZE: 'freeze',
  ATTACK: 'attack'
};

const CARD_RARITIES = {
  COMMON: 'common',
  RARE: 'rare',
  LEGENDARY: 'legendary'
};

// Определение карточек
const CARDS = [
  // Комбинированные карточки (5 золота, до 5 раз)
  { id: 'health_dodge_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Здоровье-Уклонение', description: '+30 HP, +2% уклонения' },
  { id: 'health_armor_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Здоровье-Броня', description: '+30 HP, +2% брони' },
  { id: 'dodge_critical_combined', type: CARD_TYPES.DODGE, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Уклонение-Крит', description: '+2% уклонения, +2% крита, +0.1 к множителю' },
  { id: 'armor_healing_combined', type: CARD_TYPES.ARMOR, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Броня-Лечение', description: '+2% брони, +10 HP при спине' },
  { id: 'critical_freeze_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Крит-Заморозка', description: '+2% крита, +0.1 к множителю, +0.3 сек заморозки' },
  { id: 'health_healing_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Здоровье-Лечение', description: '+30 HP, +10 HP при спине' },
  { id: 'dodge_armor_combined', type: CARD_TYPES.DODGE, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Уклонение-Броня', description: '+2% уклонения, +2% брони' },
  { id: 'attack_critical_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Крит', description: '+2 к урону, +2% крита, +0.1 к множителю' },
  { id: 'attack_dodge_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Уклонение', description: '+2 к урону, +2% уклонения' },
  { id: 'attack_armor_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Броня', description: '+2 к урону, +2% брони' },
  { id: 'attack_health_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Здоровье', description: '+2 к урону, +30 HP' },
  { id: 'attack_healing_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Лечение', description: '+2 к урону, +10 HP при спине' },
  { id: 'critical_healing_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Крит-Лечение', description: '+2% крита, +0.1 к множителю, +10 HP при спине' },
  { id: 'freeze_armor_combined', type: CARD_TYPES.FREEZE, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Заморозка-Броня', description: '+0.3 сек заморозки, +2% брони' },
  { id: 'freeze_dodge_combined', type: CARD_TYPES.FREEZE, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Заморозка-Уклонение', description: '+0.3 сек заморозки, +2% уклонения' },
  { id: 'attack_freeze_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Атака-Заморозка', description: '+2 к урону, +0.3 сек заморозки' },
  { id: 'critical_armor_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Крит-Броня', description: '+2% крита, +0.1 к множителю, +2% брони' },
  { id: 'health_critical_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Здоровье-Крит', description: '+30 HP, +2% крита, +0.1 к множителю' },
  
  // Редкие карточки (10 золота, до 3 раз)
  { id: 'health_rare', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленное здоровье', description: '+100 HP' },
  { id: 'dodge_rare', type: CARD_TYPES.DODGE, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленное уклонение', description: '+4% уклонения' },
  { id: 'critical_rare', type: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленный крит', description: '+4% крита, +0.2 к множителю' },
  { id: 'armor_rare', type: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленная броня', description: '+4% снижение урона' },
  { id: 'healing_rare', type: CARD_TYPES.HEALING, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленное лечение', description: '+20 HP при спине' },
  { id: 'freeze_rare', type: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленная заморозка', description: '+0.6 сек к перезарядке противника' },
  { id: 'attack_rare', type: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Усиленная атака', description: '+4 к базовому урону' },
  
  // Легендарные карточки (20 золота, 1 раз, требуют 10 очков стиля)
  { id: 'attack_legendary', type: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Быстрый удар', description: '+4 атака, 50% сокращение перезарядки', requiresStyle: 10, legendaryEffect: 'fastStrike' },
  { id: 'health_legendary', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Живучесть', description: '+4 здоровье, +40% к макс. HP', requiresStyle: 10, legendaryEffect: 'vitality' },
  { id: 'healing_legendary', type: CARD_TYPES.HEALING, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Регенерация', description: '+4 лечение, полное восстановление HP при бонусе', requiresStyle: 10, legendaryEffect: 'regeneration' },
  { id: 'freeze_legendary', type: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Ледяная кара', description: '+4 заморозка, 25 урона в секунду врагу', requiresStyle: 10, legendaryEffect: 'icePunishment' },
  { id: 'health_legendary2', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Мстительное здоровье', description: '+4 здоровье, 10% от потерянного HP врагу', requiresStyle: 10, legendaryEffect: 'vengefulHealth' },
  { id: 'dodge_legendary', type: CARD_TYPES.DODGE, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: 'Отражение', description: '+4 уклонение, 50% уклоненного урона врагу', requiresStyle: 10, legendaryEffect: 'reflection' },
  
  // Антикарты (5 золота, до 5 раз)
  { id: 'anti_dodge', type: 'anti', antiType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Снижение уклонения', description: '-2% уклонения противника', isAnti: true },
  { id: 'anti_armor', type: 'anti', antiType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Снижение брони', description: '-2% брони противника', isAnti: true },
  { id: 'anti_critical', type: 'anti', antiType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Снижение крита', description: '-2% крита, -0.1 к множителю противника', isAnti: true },
  { id: 'anti_freeze', type: 'anti', antiType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Разморозка', description: '-0.3 сек к перезарядке противника', isAnti: true },
  { id: 'anti_attack', type: 'anti', antiType: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Снижение атаки', description: '-2 к базовому урону противника', isAnti: true },
  
  // Редкие антикарты (10 золота, до 3 раз)
  { id: 'anti_dodge_rare', type: 'anti', antiType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.RARE, cost: 10, name: 'Сильное снижение уклонения', description: '-4% уклонения противника', isAnti: true },
  { id: 'anti_armor_rare', type: 'anti', antiType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.RARE, cost: 10, name: 'Сильное снижение брони', description: '-4% брони противника', isAnti: true },
  { id: 'anti_critical_rare', type: 'anti', antiType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.RARE, cost: 10, name: 'Сильное снижение крита', description: '-4% крита, -0.2 к множителю противника', isAnti: true },
  { id: 'anti_attack_rare', type: 'anti', antiType: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.RARE, cost: 10, name: 'Сильное снижение атаки', description: '-4 к базовому урону противника', isAnti: true }
];

// Структура данных игрока
function createPlayer(socketId, nickname, roomId, isBot = false) {
  return {
    socketId: socketId,
    nickname: nickname || `Игрок ${socketId.substring(0, 6)}`,
    roomId: roomId,
    totalHp: 100,
    roundHp: 200,
    isEliminated: false,
    isInDuel: false,
    duelOpponent: null,
    duelStatus: null, // 'fighting', 'winner', 'loser', null
    isBot: isBot,
    spinDelay: isBot ? getRandomSpinDelay() : 0, // Случайная задержка для бота
    lastSpinTime: 0,
    rechargeEndTime: 0,
    duelStartTime: 0, // Время начала дуэли (для таймера 10 секунд)
    // Экономика
    permanentGold: 0,
    temporaryGold: 0,
    hasEndedTurn: false, // Закончил ли ход
    // Серии побед/поражений
    winStreak: 0,
    loseStreak: 0,
    // Статистика
    wins: 0,
    losses: 0,
    lastRoundGoldBonus: 0, // Бонус процентов за последний раунд
    lastRoundGoldEarned: 0, // Золото, заработанное в последнем раунде
    // Персонаж
    characterId: null, // ID выбранного персонажа
    hasBlock: false, // Есть ли блок от следующего урона
    // Система карточек
    stylePoints: {
      health: 0,
      dodge: 0,
      critical: 0,
      healing: 0,
      armor: 0,
      freeze: 0,
      attack: 0
    },
    cardsOwned: {}, // { cardId: count } - количество купленных карточек
    cardShopOffers: [], // Текущие предложения в магазине
    antiCards: {}, // { antiType: value } - антикарты, снижающие характеристики противника
    legendaryEffects: {} // { effectType: true } - активные эффекты легендарных карт
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
  
  // Автоматически назначаем случайного персонажа боту
  const randomCharacter = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  bot.characterId = randomCharacter.id;
  
  bots.set(botId, bot);
  players.set(botId, bot);
  return bot;
}

// Симуляция спина для бота (как у реального игрока)
function simulateBotSpin() {
  // Символы с весами (как на клиенте)
  const SYMBOLS = [
    { name: 'red', weight: 20 },
    { name: 'blue', weight: 20 },
    { name: 'green', weight: 20 },
    { name: 'yellow', weight: 20 },
    { name: 'purple', weight: 20 }
  ];
  const WILD_SYMBOL = { name: 'wild', weight: 5 };
  const BONUS_SYMBOL = { name: 'bonus', weight: 3 };
  
  // Генерация случайного символа с учетом весов
  function getRandomSymbol() {
    const allSymbols = [...SYMBOLS, WILD_SYMBOL, BONUS_SYMBOL];
    const totalWeight = allSymbols.reduce((sum, symbol) => sum + symbol.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const symbol of allSymbols) {
      random -= symbol.weight;
      if (random <= 0) {
        return symbol.name;
      }
    }
    return SYMBOLS[0].name;
  }
  
  // Генерируем 3 линии по 5 символов (как на клиенте)
  const results = [];
  for (let line = 0; line < 3; line++) {
    const lineSymbols = [];
    for (let i = 0; i < 5; i++) {
      lineSymbols.push(getRandomSymbol());
    }
    results.push(lineSymbols);
  }
  
  // Подсчет бонусов (3+ бонусов = способность персонажа)
  let bonusCount = 0;
  results.forEach(line => {
    line.forEach(symbol => {
      if (symbol === 'bonus') bonusCount++;
    });
  });
  
  if (bonusCount >= 3) {
    return { matches: 'bonus', bonusCount };
  }
  
  // Подсчет совпадений по горизонтали с учетом wild
  let totalMatches = 0;
  let firstMatchLine = null;
  let firstMatchSymbol = null;
  
  results.forEach(line => {
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
    
    // Подсчет одинаковых символов среди обычных
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
    
    // Только если 3 или больше совпадений в линии
    if (totalLineMatches >= 3) {
      totalMatches += totalLineMatches;
      
      // Сохраняем информацию о первой комбинации
      if (!firstMatchLine) {
        firstMatchLine = totalLineMatches;
        firstMatchSymbol = Object.keys(symbolCounts).length > 0
          ? Object.keys(symbolCounts).find(key => symbolCounts[key] === maxRegularMatches)
          : 'wild';
      }
    }
  });
  
  // Расчет урона: базовый урон * количество совпадений
  const baseDamage = 5;
  const damage = baseDamage * totalMatches;
  
  // Формируем информацию о комбинации
  let comboDetails = null;
  if (firstMatchLine && firstMatchSymbol) {
    const symbolNames = {
      'red': 'КРАСНЫХ',
      'blue': 'СИНИХ',
      'green': 'ЗЕЛЕНЫХ',
      'yellow': 'ЖЕЛТЫХ',
      'purple': 'ФИОЛЕТОВЫХ',
      'wild': 'WILD'
    };
    const symbolName = symbolNames[firstMatchSymbol] || 'СИМВОЛОВ';
    comboDetails = {
      symbol: firstMatchSymbol,
      count: firstMatchLine,
      text: `${firstMatchLine} ${symbolName} ШАРИКА`
    };
  }
  
  return { damage: damage, matches: 'normal', comboDetails: comboDetails };
}

// Принятие решения ботом: делать ли еще спин или закончить ход
// БОТЫ ДОЛЖНЫ РЕДКО ДЕЛАТЬ СПИНЫ - ТОЛЬКО ЕСЛИ ЕСТЬ ВРЕМЕННОЕ ЗОЛОТО ИЛИ КРИТИЧЕСКАЯ СИТУАЦИЯ
function botDecideAction(bot, opponent) {
  const spinCost = 5;
  const botHpPercent = bot.roundHp / 200;
  const opponentHpPercent = opponent.roundHp / 200;
  
  // Если есть временное золото - крутим (но редко, с вероятностью 20%)
  if (bot.temporaryGold >= spinCost) {
    // Только 20% шанс сделать спин, даже если есть временное золото
    if (Math.random() < 0.2) {
      return 'spin';
    }
    return 'endTurn';
  }
  
  // Если у бота нет золота - заканчивает ход
  if (bot.temporaryGold < spinCost && bot.permanentGold < spinCost) {
    return 'endTurn';
  }
  
  // Очень редко тратим постоянное золото на спины - только в критических ситуациях
  // Если противник почти мертв (HP < 15%) - пытаемся добить (можно тратить постоянное, но с 30% шансом)
  if (opponentHpPercent < 0.15 && bot.permanentGold >= spinCost) {
    if (Math.random() < 0.3) {
      return 'spin';
    }
    return 'endTurn';
  }
  
  // Если у бота очень мало HP (< 20%) и есть постоянное золото - пытаемся атаковать (с 25% шансом)
  if (botHpPercent < 0.2 && bot.permanentGold >= spinCost) {
    if (Math.random() < 0.25) {
      return 'spin';
    }
    return 'endTurn';
  }
  
  // Иначе заканчиваем ход (боты предпочитают экономить золото на карточки)
  return 'endTurn';
}

// Обработка способности персонажа
function useCharacterAbility(player, opponent, roomId) {
  if (!player.characterId) return null;
  
  const character = CHARACTERS.find(c => c.id === player.characterId);
  if (!character) return null;
  
  const result = {
    ability: character.ability,
    characterName: character.name,
    message: ''
  };
  
  switch (character.ability) {
    case 'gold':
      // +25 постоянного золота
      player.permanentGold = (player.permanentGold || 0) + character.abilityValue;
      result.message = `${character.name}: +${character.abilityValue} постоянного золота`;
      break;
      
    case 'heal':
      // Восстановление текущего здоровья
      const healAmount = Math.min(character.abilityValue, 200 - player.roundHp);
      player.roundHp = Math.min(200, player.roundHp + character.abilityValue);
      result.message = `${character.name}: восстановлено ${healAmount} HP`;
      result.healAmount = healAmount;
      break;
      
    case 'block':
      // Блокирование следующего урона
      player.hasBlock = true;
      result.message = `${character.name}: следующий урон будет заблокирован`;
      break;
      
    case 'damage':
      // Нанесение 50 урона
      if (opponent && opponent.hasBlock) {
        opponent.hasBlock = false;
        result.message = `${character.name}: урон заблокирован защитой противника`;
        result.damage = 0;
      } else {
        const damage = character.abilityValue;
        if (opponent) {
          opponent.roundHp = Math.max(0, opponent.roundHp - damage);
        }
        result.message = `${character.name}: нанесено ${damage} урона`;
        result.damage = damage;
      }
      break;
  }
  
  updateRoomState(roomId);
  return result;
}

// Обработка спина бота
function handleBotSpin(botId, roomId) {
  const bot = bots.get(botId);
  if (!bot || !bot.isInDuel || bot.isEliminated || bot.hasEndedTurn) return;
  
  const room = rooms.get(roomId);
  if (!room || !room.gameInProgress) return;
  
  const opponentId = bot.duelOpponent;
  if (!opponentId) return;
  
  const opponent = players.get(opponentId);
  if (!opponent || opponent.isEliminated) return;
  
  const now = Date.now();
  
  // СТРОГАЯ ПРОВЕРКА: Проверяем таймер перед боем (10 секунд) - боты НЕ должны атаковать до старта
  if (bot.duelStartTime > 0) {
    const timeSinceStart = now - bot.duelStartTime;
    if (timeSinceStart < PRE_BATTLE_DELAY) {
      // Еще не прошло 10 секунд, планируем повторную попытку
      const remaining = PRE_BATTLE_DELAY - timeSinceStart;
      setTimeout(() => {
        handleBotSpin(botId, roomId);
      }, remaining + 100); // Добавляем задержку для надежности
      return;
    }
  } else {
    // Если duelStartTime еще не установлен, ждем и повторяем
    setTimeout(() => {
      handleBotSpin(botId, roomId);
    }, 200);
    return;
  }
  
  // Проверяем перезарядку
  if (bot.rechargeEndTime > 0 && now < bot.rechargeEndTime) {
    // Еще перезаряжается, планируем повторную попытку
    const remaining = bot.rechargeEndTime - now;
    setTimeout(() => {
      handleBotSpin(botId, roomId);
    }, remaining);
    return;
  }
  
  const spinCost = 5;
  
  // Проверяем наличие золота
  if (bot.temporaryGold < spinCost && bot.permanentGold < spinCost) {
    // Нет золота - заканчиваем ход
    botEndTurn(botId, roomId);
    return;
  }
  
  // Принимаем решение
  const decision = botDecideAction(bot, opponent);
  
  if (decision === 'endTurn') {
    botEndTurn(botId, roomId);
    return;
  }
  
  // Тратим золото (сначала временное, потом постоянное)
  if (bot.temporaryGold >= spinCost) {
    bot.temporaryGold -= spinCost;
  } else if (bot.permanentGold >= spinCost) {
    bot.permanentGold -= spinCost;
  } else {
    botEndTurn(botId, roomId);
    return;
  }
  
  // Симулируем реальный спин (как у игрока) - занимает около 1-2 секунд
  const spinDuration = 1000 + Math.random() * 1000; // 1-2 секунды спина
  
  // Планируем нанесение урона после завершения спина
  setTimeout(() => {
    const spinResult = simulateBotSpin();
    let damage = 0;
    
    // Если 3+ бонусных символа - используем способность персонажа
    if (spinResult.matches === 'bonus' && bot.characterId) {
      const abilityResult = useCharacterAbility(bot, opponent, roomId);
      if (abilityResult) {
        if (abilityResult.ability === 'damage' && abilityResult.damage) {
          damage = abilityResult.damage;
        }
        
        // Отправляем информацию о способности
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: botId,
          targetPlayerSocketId: opponentId,
          ability: abilityResult.ability,
          message: abilityResult.message,
          damage: abilityResult.damage || 0,
          healAmount: abilityResult.healAmount || 0
        });
      }
    } else {
      // Обычный урон от совпадений
      damage = spinResult.damage || 0;
      
      // Проверяем блок противника
      if (opponent && opponent.hasBlock && damage > 0) {
        opponent.hasBlock = false;
        damage = 0;
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: opponentId,
          targetPlayerSocketId: botId,
          ability: 'block',
          message: 'Урон заблокирован защитой',
          damage: 0
        });
      }
      
      if (damage > 0) {
        opponent.roundHp = Math.max(0, opponent.roundHp - damage);
      }
    }
    
    // Формируем информацию о комбинации для бота
    let comboInfo = null;
    if (spinResult.matches === 'bonus' && bot.characterId) {
      const character = CHARACTERS.find(c => c.id === bot.characterId);
      comboInfo = {
        type: 'bonus',
        text: `3+ БОНУСА`,
        description: character ? character.description : 'Способность персонажа',
        damage: damage
      };
    } else if (damage > 0 && spinResult.comboDetails) {
      // Используем детали комбинации из результата спина
      comboInfo = {
        type: 'combo',
        text: spinResult.comboDetails.text,
        damage: damage,
        description: `Урон: ${damage}`
      };
    } else if (damage > 0) {
      // Для обычных комбинаций бота формируем базовую информацию
      comboInfo = {
        type: 'combo',
        text: `КОМБИНАЦИЯ`,
        damage: damage,
        description: `Урон: ${damage}`
      };
    }
    
    // Отправляем атаку всем в комнате
    if (damage > 0 || spinResult.matches === 'bonus') {
      io.to(roomId).emit('attack', {
        fromPlayerSocketId: botId,
        targetPlayerSocketId: opponentId,
        damage: damage,
        matches: spinResult.matches,
        comboInfo: comboInfo
      });
    }
    
    // Обновляем время последнего спина и перезарядки
    const spinEndTime = Date.now();
    bot.lastSpinTime = spinEndTime;
    bot.rechargeEndTime = spinEndTime + 3000; // 3 секунды перезарядки
    
    // Обновляем состояние
    updateRoomState(roomId);
    
    // Проверяем, закончился ли бой
    if (opponent.roundHp <= 0) {
      // Проигравший теряет 20% от общего HP
      opponent.totalHp = Math.max(0, opponent.totalHp - Math.floor(opponent.totalHp * 0.2));
      
      // Обновляем серии и статистику
      bot.winStreak = (bot.winStreak || 0) + 1;
      bot.loseStreak = 0; // Победа сбрасывает серию поражений
      bot.wins = (bot.wins || 0) + 1;
      
      opponent.winStreak = 0; // Поражение сбрасывает серию побед
      opponent.loseStreak = (opponent.loseStreak || 0) + 1;
      opponent.losses = (opponent.losses || 0) + 1;
      
      // Начисляем золото с учетом серий
      const winnerGold = awardGold(bot, true);
      const loserGold = awardGold(opponent, false);
      // Победитель получает 10% золота проигравшего
      const stolenGold = transferKillGold(bot, opponent);
      
      bot.duelStatus = 'winner';
      opponent.duelStatus = 'loser';
      
      if (opponent.totalHp <= 0) {
        opponent.isEliminated = true;
      }
      
      bot.isInDuel = false;
      opponent.isInDuel = false;
      bot.hasEndedTurn = false;
      opponent.hasEndedTurn = false;
      
      updateRoomState(roomId);
      checkAllDuelsFinished(roomId);
      
      console.log(`Дуэль завершена (бот). Победитель: ${bot.nickname} +${winnerGold.totalGold} (${winnerGold.bonusPercent}%) + украдено ${stolenGold}, Проигравший: ${opponent.nickname} +${loserGold.totalGold} (${loserGold.bonusPercent}%)`);
      return;
    }
    
    // Планируем следующее действие бота ПОСЛЕ окончания перезарядки + задержка
    // Перезарядка начинается после окончания спина (spinEndTime) и длится 3000мс
    // После окончания перезарядки добавляем задержку bot.spinDelay
    // Общее время до следующего спина = время перезарядки (3000мс) + задержка (bot.spinDelay)
    if (bot.isInDuel && !bot.isEliminated && !bot.hasEndedTurn) {
      const rechargeTime = 3000; // 3 секунды перезарядки
      const totalDelay = rechargeTime + bot.spinDelay; // Перезарядка + задержка после окончания перезарядки
      
      setTimeout(() => {
        handleBotSpin(botId, roomId);
      }, totalDelay);
    }
    
    console.log(`Бот ${bot.nickname} атакует ${opponent.nickname} на ${damage} урона (Временное: ${bot.temporaryGold}, Постоянное: ${bot.permanentGold})`);
  }, spinDuration);
}

// Бот заканчивает ход
function botEndTurn(botId, roomId) {
  const bot = bots.get(botId);
  if (!bot || !bot.isInDuel) return;
  
  bot.hasEndedTurn = true;
  updateRoomState(roomId);
  
  // Проверяем, оба ли игрока закончили ход
  checkBothEndedTurn(roomId, bot.duelOpponent, botId);
  
  console.log(`Бот ${bot.nickname} закончил ход`);
}

// Генерация предложений магазина карточек
function generateCardShopOffers(player) {
  const offers = [];
  
  // Разделяем карты по категориям
  const commonCards = CARDS.filter(card => {
    // Обычные карты (с 1 очком стиля) всегда доступны
    // Также антикарты с обычной редкостью всегда доступны
    if (card.rarity === CARD_RARITIES.COMMON) {
      // Обычные карты с 1 очком стиля
      if (card.stylePoints === 1) {
        const ownedCount = (player.cardsOwned || {})[card.id] || 0;
        const maxCount = 5;
        return ownedCount < maxCount;
      }
      // Антикарты обычной редкости
      if (card.isAnti) {
        const ownedCount = (player.cardsOwned || {})[card.id] || 0;
        const maxCount = 5;
        return ownedCount < maxCount;
      }
    }
    return false;
  });
  
  const rareCards = CARDS.filter(card => {
    // Редкие карточки требуют минимум 4 очка стиля соответствующего типа
    if (card.rarity === CARD_RARITIES.RARE) {
      const stylePoints = player.stylePoints[card.type] || 0;
      if (stylePoints < 4) {
        return false;
      }
      // Проверяем лимиты покупки
      const ownedCount = (player.cardsOwned || {})[card.id] || 0;
      const maxCount = 3;
      return ownedCount < maxCount;
    }
    return false;
  });
  
  const legendaryCards = CARDS.filter(card => {
    // Легендарные карточки требуют 10 очков стиля
    if (card.rarity === CARD_RARITIES.LEGENDARY) {
      const stylePoints = player.stylePoints[card.type] || 0;
      if (stylePoints < (card.requiresStyle || 10)) {
        return false;
      }
      // Проверяем лимиты покупки
      const ownedCount = (player.cardsOwned || {})[card.id] || 0;
      const maxCount = 1;
      return ownedCount < maxCount;
    }
    return false;
  });
  
  // Также включаем антикарты (они всегда доступны, если не достигнут лимит)
  const antiCards = CARDS.filter(card => {
    if (card.isAnti) {
      const ownedCount = (player.cardsOwned || {})[card.id] || 0;
      const maxCount = card.rarity === CARD_RARITIES.LEGENDARY ? 1 
        : card.rarity === CARD_RARITIES.RARE ? 3 
        : 5;
      return ownedCount < maxCount;
    }
    return false;
  });
  
  // Генерируем 5 случайных карточек
  for (let i = 0; i < 5; i++) {
    let card;
    
    // Сначала всегда убеждаемся, что есть хотя бы одна обычная карта
    if (commonCards.length === 0 && i === 0) {
      // Если нет доступных обычных карт, это ошибка - должны быть всегда
      console.warn('Нет доступных обычных карт! Это не должно происходить.');
    }
    
    // Определяем вероятность редкой карты на основе очков стиля конкретного типа
    // Для каждого типа карты рассчитываем свой шанс
    let maxRareChance = 0.1; // Базовая вероятность 10%
    
    // Ищем максимальный шанс среди всех типов стилей
    Object.keys(player.stylePoints || {}).forEach(styleType => {
      const stylePoints = player.stylePoints[styleType] || 0;
      if (stylePoints >= 4) {
        // Шанс растет от 10% при 4 очках до 50% при 20+ очках
        const typeRareChance = Math.min(0.5, 0.1 + ((stylePoints - 4) * 0.025));
        maxRareChance = Math.max(maxRareChance, typeRareChance);
      }
    });
    
    if (Math.random() < maxRareChance && (rareCards.length > 0 || legendaryCards.length > 0)) {
      // Пытаемся выдать редкую карточку
      if (rareCards.length > 0 && Math.random() < 0.7) {
        // 70% шанс на редкую, если доступна
        card = rareCards[Math.floor(Math.random() * rareCards.length)];
      } else {
        // Или легендарную, если доступна
        if (legendaryCards.length > 0 && Math.random() < 0.2) {
          card = legendaryCards[Math.floor(Math.random() * legendaryCards.length)];
        } else {
          // Или обычную
          if (commonCards.length > 0) {
            card = commonCards[Math.floor(Math.random() * commonCards.length)];
          } else if (antiCards.length > 0) {
            card = antiCards[Math.floor(Math.random() * antiCards.length)];
          }
        }
      }
    } else {
      // Обычная карточка или антикарта
      const allCommon = [...commonCards, ...antiCards.filter(c => c.rarity === CARD_RARITIES.COMMON)];
      if (allCommon.length > 0) {
        card = allCommon[Math.floor(Math.random() * allCommon.length)];
      } else if (commonCards.length > 0) {
        card = commonCards[Math.floor(Math.random() * commonCards.length)];
      } else if (antiCards.length > 0) {
        card = antiCards[Math.floor(Math.random() * antiCards.length)];
      }
    }
    
    if (card) {
      offers.push(card);
    }
  }
  
  // Если не удалось сгенерировать предложения, добавляем хотя бы обычные карты
  if (offers.length === 0 && commonCards.length > 0) {
    // Берем первые 5 доступных обычных карт
    for (let i = 0; i < Math.min(5, commonCards.length); i++) {
      offers.push(commonCards[i]);
    }
  }
  
  return offers;
}

// Покупка карточки
function buyCard(player, cardId) {
  const card = CARDS.find(c => c.id === cardId);
  if (!card) {
    return { success: false, message: 'Карточка не найдена' };
  }
  
  // Проверяем требования для легендарных карточек
  if (card.rarity === CARD_RARITIES.LEGENDARY) {
    const stylePoints = player.stylePoints[card.type] || 0;
    if (stylePoints < (card.requiresStyle || 10)) {
      return { success: false, message: `Требуется ${card.requiresStyle} очков стиля ${card.type}` };
    }
  }
  
  // Проверяем лимиты покупки
  const ownedCount = player.cardsOwned[cardId] || 0;
  const maxCount = card.rarity === CARD_RARITIES.LEGENDARY ? 1 
    : card.rarity === CARD_RARITIES.RARE ? 3 
    : 5;
  
  if (ownedCount >= maxCount) {
    return { success: false, message: `Достигнут лимит покупки этой карточки (${maxCount})` };
  }
  
  // Проверяем золото
  if (player.permanentGold < card.cost) {
    return { success: false, message: 'Недостаточно постоянного золота' };
  }
  
  // Покупаем карточку
  player.permanentGold -= card.cost;
  player.cardsOwned[cardId] = (player.cardsOwned[cardId] || 0) + 1;
  
  // Обрабатываем антикарты
  if (card.isAnti) {
    if (!player.antiCards) player.antiCards = {};
    const antiValue = card.rarity === CARD_RARITIES.RARE ? -4 : -2;
    const currentValue = player.antiCards[card.antiType] || 0;
    
    if (card.antiType === CARD_TYPES.CRITICAL) {
      // Для крита снижаем и шанс, и множитель
      if (!player.antiCards.critChance) player.antiCards.critChance = 0;
      if (!player.antiCards.critMultiplier) player.antiCards.critMultiplier = 0;
      player.antiCards.critChance += antiValue;
      player.antiCards.critMultiplier += (card.rarity === CARD_RARITIES.RARE ? -0.2 : -0.1);
    } else {
      player.antiCards[card.antiType] = currentValue + antiValue;
    }
    
    return { success: true, message: `Антикарта "${card.name}" куплена!` };
  }
  
  // Добавляем очки стиля
  player.stylePoints[card.type] = (player.stylePoints[card.type] || 0) + card.stylePoints;
  
  // Если это комбинированная карта, добавляем очки и второму стилю
  if (card.isHybrid && card.secondaryType) {
    player.stylePoints[card.secondaryType] = (player.stylePoints[card.secondaryType] || 0) + card.stylePoints;
  }
  
  // Активируем легендарные эффекты
  if (card.legendaryEffect) {
    if (!player.legendaryEffects) player.legendaryEffects = {};
    player.legendaryEffects[card.legendaryEffect] = true;
    
    // Применяем эффект живучести сразу (увеличиваем макс. HP)
    if (card.legendaryEffect === 'vitality') {
      player.totalHp = Math.floor(player.totalHp * 1.4);
    }
  }
  
  return { success: true, message: `Карточка "${card.name}" куплена!` };
}

// Обновление магазина карточек
function refreshCardShop(player) {
  const refreshCost = 2;
  
  // Можно использовать временное или постоянное золото
  if (player.temporaryGold >= refreshCost) {
    player.temporaryGold -= refreshCost;
  } else if (player.permanentGold >= refreshCost) {
    player.permanentGold -= refreshCost;
  } else {
    return { success: false, message: 'Недостаточно золота для обновления (нужно 2 золота)' };
  }
  
  player.cardShopOffers = generateCardShopOffers(player);
  return { success: true, message: 'Магазин обновлен!' };
}

// Расчет пороговых бонусов для стиля
function getStyleThresholdBonus(stylePoints) {
  let bonus = 0;
  if (stylePoints >= 20) {
    bonus = 15; // 20 единиц: +15
  } else if (stylePoints >= 10) {
    bonus = 10; // 10 единиц: +10
  } else if (stylePoints >= 4) {
    bonus = 5; // 4 единицы: +5
  }
  return bonus;
}

// Расчет характеристик игрока с учетом карточек
function calculatePlayerStats(player) {
  const stylePoints = player.stylePoints || {};
  
  // Базовые значения
  let baseAttack = 10;
  let baseArmor = 25;
  let baseDodge = 15;
  let baseCritChance = 10;
  let baseCritMultiplier = 1.5;
  let baseFreeze = 0;
  let baseHealing = 0;
  let maxHp = 100;
  
  // Применяем очки стиля (1 единица = базовый эффект)
  baseAttack += stylePoints.attack || 0;
  baseArmor += stylePoints.armor || 0;
  baseDodge += stylePoints.dodge || 0;
  baseCritChance += stylePoints.critical || 0;
  baseCritMultiplier += (stylePoints.critical || 0) * 0.1; // +0.1 за единицу крита
  baseFreeze += (stylePoints.freeze || 0) * 0.3; // +0.3 сек за единицу заморозки
  baseHealing += (stylePoints.healing || 0) * 10; // +10 HP за единицу лечения
  maxHp += (stylePoints.health || 0) * 30; // +30 HP за единицу здоровья
  
  // Применяем пороговые бонусы
  const attackBonus = getStyleThresholdBonus(stylePoints.attack || 0);
  const armorBonus = getStyleThresholdBonus(stylePoints.armor || 0);
  const dodgeBonus = getStyleThresholdBonus(stylePoints.dodge || 0);
  const critBonus = getStyleThresholdBonus(stylePoints.critical || 0);
  const freezeBonus = getStyleThresholdBonus(stylePoints.freeze || 0);
  const healingBonus = getStyleThresholdBonus(stylePoints.healing || 0);
  
  // Специальные пороговые эффекты для крита
  let critChanceBonus = critBonus;
  let critMultBonus = 0;
  if ((stylePoints.critical || 0) >= 20) {
    critMultBonus = 0.75;
  } else if ((stylePoints.critical || 0) >= 10) {
    critMultBonus = 0.5;
  } else if ((stylePoints.critical || 0) >= 4) {
    critMultBonus = 0.25;
  }
  
  // Специальные пороговые эффекты для заморозки
  let freezeTimeBonus = 0;
  if ((stylePoints.freeze || 0) >= 20) {
    freezeTimeBonus = 5;
  } else if ((stylePoints.freeze || 0) >= 10) {
    freezeTimeBonus = 3;
  } else if ((stylePoints.freeze || 0) >= 4) {
    freezeTimeBonus = 2;
  }
  
  // Специальные пороговые эффекты для лечения
  let healingHpBonus = healingBonus;
  
  // Применяем эффекты легендарных карт
  const legendaryEffects = player.legendaryEffects || {};
  if (legendaryEffects.vitality) {
    maxHp = Math.floor(maxHp * 1.4); // +40% к макс. HP
  }
  if (legendaryEffects.fastStrike) {
    // 50% сокращение перезарядки обрабатывается отдельно
  }
  
  return {
    attack: baseAttack + attackBonus,
    armor: baseArmor + armorBonus,
    dodge: baseDodge + dodgeBonus,
    critChance: baseCritChance + critChanceBonus,
    critMultiplier: baseCritMultiplier + critMultBonus,
    freeze: baseFreeze + freezeTimeBonus,
    healing: baseHealing + healingHpBonus,
    maxHp: maxHp
  };
}

// Обработка покупки карточек ботом
function handleBotCardPurchase(botId, roomId) {
  try {
    const bot = bots.get(botId);
    if (!bot) {
      console.warn(`Бот ${botId} не найден для покупки карточек`);
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
      console.warn(`Комната ${roomId} не найдена для покупки карточек ботом ${botId}`);
      return;
    }
    
    // Генерируем предложения, если их еще нет
    if (!bot.cardShopOffers || bot.cardShopOffers.length === 0) {
      bot.cardShopOffers = generateCardShopOffers(bot);
    }
    
    // Бот случайным образом покупает карточки (30% шанс на каждую)
    bot.cardShopOffers.forEach(card => {
      if (Math.random() < 0.3 && bot.permanentGold >= card.cost) {
        const result = buyCard(bot, card.id);
        if (result.success) {
          console.log(`Бот ${bot.nickname} купил карточку ${card.name}`);
        }
      }
    });
    
    // Обновляем состояние комнаты
    updateRoomState(roomId);
  } catch (error) {
    console.error(`Ошибка при покупке карточек ботом ${botId}:`, error);
  }
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
      return p ? { 
        socketId: id, 
        nickname: p.nickname, 
        totalHp: p.totalHp, 
        roundHp: p.roundHp, 
        isEliminated: p.isEliminated,
        isBot: p.isBot || false,
        characterId: p.characterId || null
      } : null;
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
      // Подсчитываем реальных игроков (не ботов)
      const realPlayers = room.players.filter(id => {
        const p = players.get(id);
        return p && !p.isBot;
      }).length;
      
      availableRooms.push({
        id: roomId,
        playerCount: room.players.length,
        realPlayerCount: realPlayers,
        maxPlayers: 8,
        noBots: room.noBots || false
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
      isBot: p.isBot || false,
      characterId: p.characterId || null,
      permanentGold: p.permanentGold || 0,
      temporaryGold: p.temporaryGold || 0,
      hasEndedTurn: p.hasEndedTurn || false,
      duelStartTime: p.duelStartTime || 0,
      winStreak: p.winStreak || 0,
      loseStreak: p.loseStreak || 0,
      wins: p.wins || 0,
      losses: p.losses || 0,
      lastRoundGoldBonus: p.lastRoundGoldBonus || 0,
      lastRoundGoldEarned: p.lastRoundGoldEarned || 0,
      stylePoints: p.stylePoints || { health: 0, dodge: 0, critical: 0, healing: 0, armor: 0, freeze: 0, attack: 0 },
      cardsOwned: p.cardsOwned || {},
      cardShopOffers: p.cardShopOffers || (p.isBot ? [] : generateCardShopOffers(p)), // Генерируем предложения, если их нет (для не-ботов)
      antiCards: p.antiCards || {},
      legendaryEffects: p.legendaryEffects || {}
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
    // Все бои закончились
    // Перерыв только между раундами, не перед первым раундом
    if (room.currentRound > 0) {
      // Генерируем предложения карточек для всех игроков перед показом магазина
      activePlayers.forEach(id => {
        const p = players.get(id);
        if (p && !p.isBot) {
          // Генерируем предложения, если их еще нет
          if (!p.cardShopOffers || p.cardShopOffers.length === 0) {
            p.cardShopOffers = generateCardShopOffers(p);
          }
        }
      });
      
      // Отправляем событие о начале перерыва перед следующим раундом
      io.to(roomId).emit('breakStarted', {
        duration: BREAK_DURATION,
        round: room.currentRound
      });
      
      // Запускаем следующий раунд после перерыва
      setTimeout(() => {
        startNextRound(roomId);
      }, BREAK_DURATION);
    } else {
      // Первый раунд - начинаем сразу без перерыва
      startNextRound(roomId);
    }
  } else if (activePlayers.length <= 1) {
    // Остался один игрок - игра окончена
    // Проверяем, что это не бот
    const realPlayers = activePlayers.filter(id => {
      const p = players.get(id);
      return p && !p.isBot;
    });
    
    if (realPlayers.length <= 1) {
      const winner = activePlayers.length === 1 ? players.get(activePlayers[0]) : null;
      // Игра окончена только если остался один реальный игрок (не бот)
      if (winner && !winner.isBot) {
        room.gameInProgress = false;
        io.to(roomId).emit('gameEnded', {
          winner: { socketId: winner.socketId, nickname: winner.nickname }
        });
      } else if (realPlayers.length === 0) {
        // Все реальные игроки выбыли
        room.gameInProgress = false;
        io.to(roomId).emit('gameEnded', {
          winner: null
        });
      }
    }
  }
}

// Расчет процента бонуса на основе серии
function calculateBonusPercent(streak, isWin) {
  if (isWin) {
    // Бонус за серию побед: +5% за каждую победу (максимум +50%)
    return Math.min(streak * 5, 50);
  } else {
    // Бонус за серию поражений: +3% за каждое поражение (максимум +30%)
    return Math.min(streak * 3, 30);
  }
}

// Начисление золота с учетом серий
function awardGold(player, isWinner) {
  const baseGold = 10; // И за победу, и за поражение одинаково: 10
  const streak = isWinner ? player.winStreak : player.loseStreak;
  const bonusPercent = calculateBonusPercent(streak, isWinner);
  const bonusGold = Math.floor(baseGold * bonusPercent / 100);
  const totalGold = baseGold + bonusGold;
  
  player.permanentGold = (player.permanentGold || 0) + totalGold;
  player.lastRoundGoldBonus = bonusPercent;
  player.lastRoundGoldEarned = totalGold;
  
  return { baseGold, bonusGold, totalGold, bonusPercent };
}

// Передача 10% золота проигравшего победителю
function transferKillGold(winner, loser) {
  const loserPerm = loser.permanentGold || 0;
  const loserTemp = loser.temporaryGold || 0;
  const totalGold = loserPerm + loserTemp;
  
  if (totalGold <= 0) {
    return 0;
  }
  
  // 10% от всего золота проигравшего
  const transferAmount = Math.floor(totalGold * 0.10);
  if (transferAmount <= 0) {
    return 0;
  }
  
  let remaining = transferAmount;
  
  // Сначала забираем из временного золота
  const fromTemp = Math.min(loserTemp, remaining);
  loser.temporaryGold = loserTemp - fromTemp;
  remaining -= fromTemp;
  
  // Остальное забираем из постоянного золота
  if (remaining > 0) {
    loser.permanentGold = Math.max(0, loserPerm - remaining);
  }
  
  // Все украденное золото добавляем к постоянному золоту победителя
  winner.permanentGold = (winner.permanentGold || 0) + transferAmount;
  // Учитываем в статистике последнего раунда победителя
  winner.lastRoundGoldEarned = (winner.lastRoundGoldEarned || 0) + transferAmount;
  
  return transferAmount;
}

// Проверка, оба ли игрока закончили ход
function checkBothEndedTurn(roomId, player1Id, player2Id) {
  const p1 = players.get(player1Id);
  const p2 = players.get(player2Id);
  
  if (!p1 || !p2 || !p1.isInDuel || !p2.isInDuel) return;
  
  if (p1.hasEndedTurn && p2.hasEndedTurn) {
    // Оба закончили ход - определяем победителя по HP
    const winner = p1.roundHp >= p2.roundHp ? p1 : p2;
    const loser = winner === p1 ? p2 : p1;
    
    // Проигравший теряет 20% от общего HP
    loser.totalHp = Math.max(0, loser.totalHp - Math.floor(loser.totalHp * 0.2));
    
    // Обновляем серии и статистику
    winner.winStreak = (winner.winStreak || 0) + 1;
    winner.loseStreak = 0; // Победа сбрасывает серию поражений
    winner.wins = (winner.wins || 0) + 1;
    
    loser.loseStreak = (loser.loseStreak || 0) + 1;
    loser.winStreak = 0; // Поражение сбрасывает серию побед
    loser.losses = (loser.losses || 0) + 1;
    
    // Начисляем золото с учетом серий
    const winnerGold = awardGold(winner, true);
    const loserGold = awardGold(loser, false);
    // Победитель получает 10% золота проигравшего
    const stolenGold = transferKillGold(winner, loser);
    
    winner.duelStatus = 'winner';
    loser.duelStatus = 'loser';
    
    if (loser.totalHp <= 0) {
      loser.isEliminated = true;
    }
    
    winner.isInDuel = false;
    loser.isInDuel = false;
    winner.hasEndedTurn = false;
    loser.hasEndedTurn = false;
    
    updateRoomState(roomId);
    checkAllDuelsFinished(roomId);
    
    console.log(`Оба игрока закончили ход. Победитель: ${winner.nickname} (HP: ${winner.roundHp} vs ${loser.roundHp}). Золото: ${winner.nickname} +${winnerGold.totalGold} (${winnerGold.bonusPercent}%) + украдено ${stolenGold}, ${loser.nickname} +${loserGold.totalGold} (${loserGold.bonusPercent}%)`);
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
  
  // Сбрасываем HP раунда и выдаем золото для всех активных игроков
  activePlayers.forEach(id => {
    const p = players.get(id);
    if (p) {
      // Золото уже начислено при завершении дуэли, здесь только сбрасываем статусы
      // Сбрасываем информацию о последнем раунде (будет обновлена в следующем раунде)
      p.lastRoundGoldBonus = 0;
      p.lastRoundGoldEarned = 0;
      
      // Начисляем 20% от постоянного золота в конце раунда
      const interestGold = Math.floor((p.permanentGold || 0) * 0.2);
      if (interestGold > 0) {
        p.permanentGold = (p.permanentGold || 0) + interestGold;
        p.lastRoundGoldEarned = interestGold;
        p.lastRoundGoldBonus = 20; // 20% проценты
      }
      
      p.roundHp = 200;
      p.isInDuel = false;
      p.duelOpponent = null;
      p.duelStatus = null;
      p.lastSpinTime = 0;
      p.rechargeEndTime = 0;
      p.duelStartTime = 0;
      p.temporaryGold = 30; // Выдаем 30 временного золота
      p.hasEndedTurn = false;
      
      // Генерируем предложения карточек для всех игроков (для следующего раунда)
      // Предложения для текущего перерыва уже были сгенерированы в checkAllDuelsFinished
      // Здесь генерируем для следующего перерыва
      p.cardShopOffers = generateCardShopOffers(p);
      
      // Боты покупают карточки между боями
      if (p.isBot) {
        // Запускаем покупку карточек для бота с небольшой задержкой
        setTimeout(() => {
          handleBotCardPurchase(id, roomId);
        }, 1000 + Math.random() * 2000); // Случайная задержка 1-3 секунды
      }
    }
  });
  
  // Создаем пары
  room.pairs = createPairs(activePlayers);
  room.currentRound = (room.currentRound || 0) + 1;
  
  // Назначаем дуэли
  const now = Date.now();
  room.pairs.forEach(pair => {
    if (pair[1] !== null) {
      const p1 = players.get(pair[0]);
      const p2 = players.get(pair[1]);
      if (p1 && p2) {
        p1.isInDuel = true;
        p1.duelOpponent = pair[1];
        p1.duelStartTime = now; // Устанавливаем время начала дуэли
        p2.isInDuel = true;
        p2.duelOpponent = pair[0];
        p2.duelStartTime = now; // Устанавливаем время начала дуэли
        
        // Запускаем ботов, если они в дуэли
        // handleBotSpin сам проверит таймер PRE_BATTLE_DELAY внутри
        if (p1.isBot) {
          // Небольшая задержка перед первым спином (бот сам проверит таймер)
          const delay = p1.spinDelay || 0;
          setTimeout(() => {
            handleBotSpin(p1.socketId, roomId);
          }, delay);
        }
        if (p2.isBot) {
          // Небольшая задержка перед первым спином (бот сам проверит таймер)
          const delay = p2.spinDelay || 0;
          setTimeout(() => {
            handleBotSpin(p2.socketId, roomId);
          }, delay);
        }
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
    const noBots = data?.noBots || false; // Флаг "без ботов"
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
      pairs: [],
      noBots: noBots // Флаг "без ботов"
    });
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerNumber: 1, isHost: true });
    
    // Отправляем начальный список игроков
    const playersInRoom = [{
      socketId: socket.id,
      nickname: player.nickname,
      totalHp: player.totalHp,
      roundHp: player.roundHp,
      isEliminated: player.isEliminated,
      isBot: player.isBot || false,
      characterId: player.characterId || null
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
      return p ? { 
        socketId: id, 
        nickname: p.nickname, 
        totalHp: p.totalHp, 
        roundHp: p.roundHp, 
        isEliminated: p.isEliminated,
        isBot: p.isBot || false,
        characterId: p.characterId || null
      } : null;
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
      socket.emit('roomError', { message: 'Нельзя атаковать сейчас' });
      return;
    }
    
    // Проверяем, не закончил ли атакующий ход
    if (attacker.hasEndedTurn) {
      socket.emit('roomError', { message: 'Вы уже закончили ход' });
      return;
    }
    
    // Проверяем, не мертв ли противник
    if (target.roundHp <= 0 || target.isEliminated) {
      socket.emit('roomError', { message: 'Противник уже мертв' });
      return;
    }
    
    // Проверяем таймер перед боем (10 секунд) - строгая проверка
    const now = Date.now();
    if (attacker.duelStartTime > 0 && now < attacker.duelStartTime + PRE_BATTLE_DELAY) {
      const remaining = Math.ceil((attacker.duelStartTime + PRE_BATTLE_DELAY - now) / 1000);
      socket.emit('roomError', { message: `Бой еще не начался! Подождите ${remaining} секунд` });
      return;
    }
    
    // Проверяем перезарядку
    if (attacker.rechargeEndTime > 0 && now < attacker.rechargeEndTime) {
      socket.emit('roomError', { message: 'Оружие перезаряжается' });
      return;
    }
    
    // Тратим золото на спин (5 золота) - ВСЕГДА, даже если нет комбинации
    const spinCost = 5;
    if (attacker.temporaryGold >= spinCost) {
      attacker.temporaryGold -= spinCost;
    } else if (attacker.permanentGold >= spinCost) {
      attacker.permanentGold -= spinCost;
    } else {
      // Нет золота - не можем атаковать
      socket.emit('roomError', { message: 'Недостаточно золота для спина' });
      return;
    }
    
    // Обновляем время последнего спина и перезарядки
    attacker.lastSpinTime = now;
    let rechargeTime = 3000; // 3 секунды перезарядки
    // Эффект быстрого удара (50% сокращение перезарядки)
    if (attacker.legendaryEffects && attacker.legendaryEffects.fastStrike) {
      rechargeTime = Math.floor(rechargeTime * 0.5);
    }
    attacker.rechargeEndTime = now + rechargeTime;
    
    // Рассчитываем характеристики игроков
    const attackerStats = calculatePlayerStats(attacker);
    const targetStats = calculatePlayerStats(target);
    
    // Применяем антикарты противника к атакующему
    const targetAntiCards = target.antiCards || {};
    let effectiveAttack = attackerStats.attack;
    if (targetAntiCards[CARD_TYPES.ATTACK]) {
      effectiveAttack = Math.max(0, effectiveAttack + targetAntiCards[CARD_TYPES.ATTACK]);
    }
    
    // Базовый урон = урон от комбинации + базовый урон за спин (10) + бонус атаки
    const baseSpinDamage = 10;
    let finalDamage = damage + baseSpinDamage + (effectiveAttack - 10); // effectiveAttack уже включает базовые 10
    
    // Проверяем крит
    let isCrit = false;
    const critRoll = Math.random() * 100;
    if (critRoll < attackerStats.critChance) {
      isCrit = true;
      finalDamage = Math.floor(finalDamage * attackerStats.critMultiplier);
    }
    
    // Если 3+ бонусных символа - используем способность персонажа
    if (matches === 'bonus' && attacker.characterId) {
      const abilityResult = useCharacterAbility(attacker, target, roomId);
      if (abilityResult) {
        if (abilityResult.ability === 'damage' && abilityResult.damage) {
          finalDamage = abilityResult.damage;
        } else {
          finalDamage = 0;
        }
        
        // Эффект регенерации при бонусе
        if (attacker.legendaryEffects && attacker.legendaryEffects.regeneration) {
          attacker.roundHp = attackerStats.maxHp;
          attacker.totalHp = attackerStats.maxHp;
          io.to(roomId).emit('heal', {
            playerSocketId: fromPlayerSocketId,
            amount: attackerStats.maxHp - attacker.roundHp,
            isFull: true
          });
        }
        
        // Отправляем информацию о способности
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: fromPlayerSocketId,
          targetPlayerSocketId: targetPlayerSocketId,
          ability: abilityResult.ability,
          message: abilityResult.message,
          damage: abilityResult.damage || 0,
          healAmount: abilityResult.healAmount || 0
        });
      }
    } else if (damage > 0) {
      // Обычный урон - проверяем блок противника
      if (target.hasBlock) {
        target.hasBlock = false;
        finalDamage = 0;
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: targetPlayerSocketId,
          targetPlayerSocketId: fromPlayerSocketId,
          ability: 'block',
          message: 'Урон заблокирован защитой',
          damage: 0
        });
      } else if (finalDamage > 0) {
        // Проверяем уклонение (считается для каждого источника урона отдельно)
        let dodged = false;
        const dodgeRoll = Math.random() * 100;
        let effectiveDodge = targetStats.dodge;
        if (targetAntiCards[CARD_TYPES.DODGE]) {
          effectiveDodge = Math.max(0, effectiveDodge + targetAntiCards[CARD_TYPES.DODGE]);
        }
        
        if (dodgeRoll < effectiveDodge) {
          dodged = true;
          const originalDamage = finalDamage;
          finalDamage = 0;
          
          // Эффект отражения при уклонении (50% от исходного урона)
          if (target.legendaryEffects && target.legendaryEffects.reflection) {
            const reflectedDamage = Math.floor(originalDamage * 0.5);
            attacker.roundHp = Math.max(0, attacker.roundHp - reflectedDamage);
            io.to(roomId).emit('attack', {
              fromPlayerSocketId: targetPlayerSocketId,
              targetPlayerSocketId: fromPlayerSocketId,
              damage: reflectedDamage,
              matches: 'reflection',
              comboInfo: { type: 'reflection', text: 'Отражение', description: '50% уклоненного урона' }
            });
          }
        } else {
          // Применяем броню
          const armorReduction = targetStats.armor / 100;
          if (targetAntiCards[CARD_TYPES.ARMOR]) {
            const effectiveArmor = Math.max(0, targetStats.armor + targetAntiCards[CARD_TYPES.ARMOR]);
            finalDamage = Math.floor(finalDamage * (1 - effectiveArmor / 100));
          } else {
            finalDamage = Math.floor(finalDamage * (1 - armorReduction));
          }
          
          // Эффект мстительного здоровья
          if (target.legendaryEffects && target.legendaryEffects.vengefulHealth) {
            const lostHp = target.roundHp - Math.max(0, target.roundHp - finalDamage);
            const revengeDamage = Math.floor(lostHp * 0.1);
            attacker.roundHp = Math.max(0, attacker.roundHp - revengeDamage);
            if (revengeDamage > 0) {
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: targetPlayerSocketId,
                targetPlayerSocketId: fromPlayerSocketId,
                damage: revengeDamage,
                matches: 'revenge',
                comboInfo: { type: 'revenge', text: 'Мщение', description: '10% от потерянного HP' }
              });
            }
          }
          
          target.roundHp = Math.max(0, target.roundHp - finalDamage);
        }
      }
      
      // Применяем лечение при спине
      if (attackerStats.healing > 0) {
        const healAmount = attackerStats.healing;
        attacker.roundHp = Math.min(attackerStats.maxHp, attacker.roundHp + healAmount);
        io.to(roomId).emit('heal', {
          playerSocketId: fromPlayerSocketId,
          amount: healAmount
        });
      }
      
      // Применяем заморозку (увеличиваем перезарядку противника)
      if (attackerStats.freeze > 0) {
        const freezeTime = attackerStats.freeze * 1000; // в миллисекундах
        if (target.rechargeEndTime > now) {
          target.rechargeEndTime += freezeTime;
        } else {
          target.rechargeEndTime = now + freezeTime;
        }
      }
      
      // Эффект ледяной кары (25 урона в секунду)
      if (attacker.legendaryEffects && attacker.legendaryEffects.icePunishment) {
        // Применяем урон каждую секунду
        const iceDamage = 25;
        const iceInterval = setInterval(() => {
          const currentTarget = players.get(targetPlayerSocketId);
          if (!currentTarget || currentTarget.roundHp <= 0 || !currentTarget.isInDuel) {
            clearInterval(iceInterval);
            return;
          }
          currentTarget.roundHp = Math.max(0, currentTarget.roundHp - iceDamage);
          io.to(roomId).emit('attack', {
            fromPlayerSocketId: fromPlayerSocketId,
            targetPlayerSocketId: targetPlayerSocketId,
            damage: iceDamage,
            matches: 'ice',
            comboInfo: { type: 'ice', text: 'Ледяная кара', description: '25 урона в секунду' }
          });
          updateRoomState(roomId);
        }, 1000);
        
        // Останавливаем через 10 секунд
        setTimeout(() => clearInterval(iceInterval), 10000);
      }
    }
    
    console.log(`Урон нанесен: ${attacker.nickname} -> ${target.nickname}, урон: ${finalDamage}, HP после: ${target.roundHp}`);
    
    // Формируем информацию о комбинации
    let comboInfo = null;
    if (matches === 'bonus' && attacker.characterId) {
      const character = CHARACTERS.find(c => c.id === attacker.characterId);
      comboInfo = {
        type: 'bonus',
        text: `3+ БОНУСА`,
        description: character ? character.description : 'Способность персонажа',
        damage: finalDamage
      };
    } else if (finalDamage > 0 && data.comboInfo) {
      // Используем информацию о комбинации от клиента
      comboInfo = data.comboInfo;
      comboInfo.damage = finalDamage;
    }
    
    // Отправляем атаку всем в комнате
    if (finalDamage > 0 || matches === 'bonus') {
      io.to(roomId).emit('attack', {
        fromPlayerSocketId: fromPlayerSocketId,
        targetPlayerSocketId: targetPlayerSocketId,
        damage: finalDamage,
        matches: matches,
        comboInfo: comboInfo
      });
    }
    
    // Обновляем состояние комнаты сразу после нанесения урона
    updateRoomState(roomId);
    
    // Проверяем, закончился ли бой
    if (target.roundHp <= 0) {
      // Проигравший теряет 20% от общего HP
      target.totalHp = Math.max(0, target.totalHp - Math.floor(target.totalHp * 0.2));
      
      // Обновляем серии и статистику
      attacker.winStreak = (attacker.winStreak || 0) + 1;
      attacker.loseStreak = 0; // Победа сбрасывает серию поражений
      attacker.wins = (attacker.wins || 0) + 1;
      
      target.loseStreak = (target.loseStreak || 0) + 1;
      target.winStreak = 0; // Поражение сбрасывает серию побед
      target.losses = (target.losses || 0) + 1;
      
      // Начисляем золото с учетом серий
      const winnerGold = awardGold(attacker, true);
      const loserGold = awardGold(target, false);
      // Победитель получает 10% золота проигравшего
      const stolenGold = transferKillGold(attacker, target);
      
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
      
      console.log(`Дуэль завершена. Победитель: ${attacker.nickname} +${winnerGold.totalGold} (${winnerGold.bonusPercent}%) + украдено ${stolenGold}, Проигравший: ${target.nickname} +${loserGold.totalGold} (${loserGold.bonusPercent}%)`);
    } else {
      // Обновляем состояние комнаты
      updateRoomState(roomId);
    }
    
    console.log(`Игрок ${attacker.nickname} атакует ${target.nickname} на ${damage} урона`);
  });


  // Обработка завершения хода
  socket.on('endTurn', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    const player = players.get(socket.id);
    
    if (!room || !room.gameInProgress || !player || !player.isInDuel) {
      socket.emit('roomError', { message: 'Нельзя закончить ход сейчас' });
      return;
    }
    
    player.hasEndedTurn = true;
    updateRoomState(roomId);
    
    // Проверяем, оба ли игрока закончили ход
    if (player.duelOpponent) {
      checkBothEndedTurn(roomId, socket.id, player.duelOpponent);
    }
    
    console.log(`Игрок ${player.nickname} закончил ход`);
  });

  // Обработка покупки карточки
  socket.on('buyCard', (data) => {
    const { roomId, cardId } = data;
    const player = players.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!player || !room) {
      socket.emit('roomError', { message: 'Игрок или комната не найдены' });
      return;
    }
    
    const result = buyCard(player, cardId);
    if (result.success) {
      updateRoomState(roomId);
      socket.emit('cardBought', { success: true, message: result.message });
    } else {
      socket.emit('cardBought', { success: false, message: result.message });
    }
  });
  
  // Обработка обновления магазина карточек
  socket.on('refreshCardShop', (data) => {
    const { roomId } = data;
    const player = players.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!player || !room) {
      socket.emit('roomError', { message: 'Игрок или комната не найдены' });
      return;
    }
    
    const result = refreshCardShop(player);
    if (result.success) {
      updateRoomState(roomId);
      socket.emit('cardShopRefreshed', { success: true, message: result.message, offers: player.cardShopOffers });
    } else {
      socket.emit('cardShopRefreshed', { success: false, message: result.message });
    }
  });
  
  // Начало игры (только хост может запустить)
  // Обработка выбора персонажа
  socket.on('selectCharacter', (data) => {
    const { roomId, characterId } = data;
    const player = players.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!player || !room || room.gameInProgress) {
      socket.emit('roomError', { message: 'Нельзя выбрать персонажа сейчас' });
      return;
    }
    
    // Проверяем, что персонаж существует
    const character = CHARACTERS.find(c => c.id === characterId);
    if (!character) {
      socket.emit('roomError', { message: 'Неверный персонаж' });
      return;
    }
    
    player.characterId = characterId;
    updateRoomState(roomId);
    
    socket.emit('characterSelected', { characterId, character });
    console.log(`Игрок ${player.nickname} выбрал персонажа: ${character.name}`);
  });

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
    
    // Проверяем, что все реальные игроки выбрали персонажа
    const realPlayers = room.players.filter(id => {
      const p = players.get(id);
      return p && !p.isBot;
    });
    
    const playersWithoutCharacter = realPlayers.filter(id => {
      const p = players.get(id);
      return !p.characterId;
    });
    
    if (playersWithoutCharacter.length > 0) {
      socket.emit('roomError', { message: 'Не все игроки выбрали персонажа' });
      return;
    }
    
    // Дозаполняем комнату ботами до 8 игроков (только если не установлен флаг noBots)
    if (!room.noBots) {
      fillRoomWithBots(roomId);
    }
    
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

