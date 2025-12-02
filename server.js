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
const BREAK_DURATION = 60000; // 1 минута между боями

// Состояния игры
const GAME_STATES = {
  PREPARATION: 'preparation', // Подготовка к бою
  BATTLE: 'battle', // Бой идет
  BREAK: 'break', // Перерыв между раундами
  ROUND_END: 'round_end' // Конец раунда
};

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

// Паттерны поведения ботов
const BOT_BEHAVIOR_PATTERNS = {
  AGGRESSIVE: {
    name: 'Агрессивный',
    permanentGoldAttackChance: 1.0, // 0.7 + 0.3 = 1.0 (100%)
    cardPurchaseChance: 0.5,
    suffixes: ['-Безумец', '-Разрушитель', '-Берсерк', '-Яростный']
  },
  ECONOMIC: {
    name: 'Экономичный',
    permanentGoldAttackChance: 0.5, // 0.2 + 0.3 = 0.5 (50%)
    cardPurchaseChance: 0.9,
    suffixes: ['-Скупой', '-Торгаш', '-Коллекционер', '-Хранитель']
  },
  STRATEGIC: {
    name: 'Стратегический',
    permanentGoldAttackChance: 0.6, // 0.3 + 0.3 = 0.6 (60%) до 30 HP
    permanentGoldAttackChanceAfter: 1.0, // 0.85 + 0.15 = 1.0 (100%) после 30 HP
    cardPurchaseChance: 0.6, // до 30 HP
    cardPurchaseChanceAfter: 1.0, // после 30 HP
    hpThreshold: 30,
    suffixes: ['-Терпеливый', '-Мудрый', '-Хитрец', '-Тактик']
  }
};

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
    description: '+15 постоянного золота',
    abilityValue: 15
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
  { id: 'health_dodge_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Ёжик в тумане', description: '+20 HP, +2% уклонения', bonus: { health: 20, dodge: 2 } },
  { id: 'health_armor_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Бронированный хомяк', description: '+20 HP, +2% брони', bonus: { health: 20, armor: 2 } },
  { id: 'dodge_critical_combined', type: CARD_TYPES.DODGE, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Ниндзя-снайпер', description: '+2% уклонения, +2% крита, +0.1 к множителю', bonus: { dodge: 2, critical: 2, critMultiplier: 0.1 } },
  { id: 'armor_healing_combined', type: CARD_TYPES.ARMOR, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Черепаха-медсестра', description: '+2% брони, +10 HP при спине', bonus: { armor: 2, healing: 10 } },
  { id: 'critical_freeze_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Ледяной удар в сердце', description: '+2% крита, +0.1 к множителю, +0.3 сек заморозки', bonus: { critical: 2, critMultiplier: 0.1, freeze: 0.3 } },
  { id: 'health_healing_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Бессмертный регенератор', description: '+20 HP, +10 HP при спине', bonus: { health: 20, healing: 10 } },
  { id: 'dodge_armor_combined', type: CARD_TYPES.DODGE, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Невидимая стена', description: '+2% уклонения, +2% брони', bonus: { dodge: 2, armor: 2 } },
  { id: 'attack_critical_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Критический пинок', description: '+6 к урону, +2% крита, +0.1 к множителю', bonus: { attack: 6, critical: 2, critMultiplier: 0.1 } },
  { id: 'attack_dodge_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Удар из-за угла', description: '+6 к урону, +2% уклонения', bonus: { attack: 6, dodge: 2 } },
  { id: 'attack_armor_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Таранный удар', description: '+6 к урону, +2% брони', bonus: { attack: 6, armor: 2 } },
  { id: 'attack_health_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Живучий боец', description: '+6 к урону, +20 HP', bonus: { attack: 6, health: 20 } },
  { id: 'attack_healing_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Боевой медик', description: '+6 к урону, +10 HP при спине', bonus: { attack: 6, healing: 10 } },
  { id: 'critical_healing_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Критическое исцеление', description: '+2% крита, +0.1 к множителю, +10 HP при спине', bonus: { critical: 2, critMultiplier: 0.1, healing: 10 } },
  { id: 'freeze_armor_combined', type: CARD_TYPES.FREEZE, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Ледяной щит', description: '+0.3 сек заморозки, +2% брони', bonus: { freeze: 0.3, armor: 2 } },
  { id: 'freeze_dodge_combined', type: CARD_TYPES.FREEZE, secondaryType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Морозный призрак', description: '+0.3 сек заморозки, +2% уклонения', bonus: { freeze: 0.3, dodge: 2 } },
  { id: 'attack_freeze_combined', type: CARD_TYPES.ATTACK, secondaryType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Ледяной удар', description: '+6 к урону, +0.3 сек заморозки', bonus: { attack: 6, freeze: 0.3 } },
  { id: 'critical_armor_combined', type: CARD_TYPES.CRITICAL, secondaryType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Критическая защита', description: '+2% крита, +0.1 к множителю, +2% брони', bonus: { critical: 2, critMultiplier: 0.1, armor: 2 } },
  { id: 'health_critical_combined', type: CARD_TYPES.HEALTH, secondaryType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, stylePoints: 1, isHybrid: true, name: 'Здоровый крит', description: '+20 HP, +2% крита, +0.1 к множителю', bonus: { health: 20, critical: 2, critMultiplier: 0.1 } },
  
  // Редкие карточки (10 золота, до 3 раз)
  { id: 'health_rare', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Сердце терминатора', description: '+67 HP', bonus: { health: 67 } },
  { id: 'dodge_rare', type: CARD_TYPES.DODGE, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Мастер побега', description: '+4% уклонения', bonus: { dodge: 4 } },
  { id: 'critical_rare', type: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Убийственный взгляд', description: '+4% крита, +0.2 к множителю', bonus: { critical: 4, critMultiplier: 0.2 } },
  { id: 'armor_rare', type: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Броня бога войны', description: '+4% снижение урона', bonus: { armor: 4 } },
  { id: 'healing_rare', type: CARD_TYPES.HEALING, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Аптечка самурая', description: '+20 HP при спине', bonus: { healing: 20 } },
  { id: 'freeze_rare', type: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Вечная мерзлота', description: '+0.6 сек к перезарядке противника', bonus: { freeze: 0.6 } },
  { id: 'attack_rare', type: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.RARE, cost: 10, stylePoints: 2, name: 'Кувалда разрушения', description: '+12 к базовому урону', bonus: { attack: 12 } },
  
  // Легендарные карточки (20 золота, 1 раз, требуют 10 очков стиля)
  { id: 'attack_legendary', type: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '⚡ Молния-убийца', description: '50% сокращение перезарядки', requiresStyle: 10, legendaryEffect: 'fastStrike', bonus: { attack: 4 } },
  { id: 'health_legendary', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '💎 Бессмертие дракона', description: '+40% к макс. HP', requiresStyle: 10, legendaryEffect: 'vitality', bonus: { health: 4 } },
  { id: 'healing_legendary', type: CARD_TYPES.HEALING, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '✨ Феникс возрождения', description: '20% от восстановленного HP как урон врагу', requiresStyle: 10, legendaryEffect: 'regeneration', bonus: { healing: 4 } },
  { id: 'freeze_legendary', type: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '❄️ Абсолютный ноль', description: '25 урона в секунду во время перезарядки врага', requiresStyle: 10, legendaryEffect: 'icePunishment', bonus: { freeze: 4 } },
  { id: 'health_legendary2', type: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '🔥 Мстительная кровь', description: '10% от потерянного HP врагу', requiresStyle: 10, legendaryEffect: 'vengefulHealth', bonus: { health: 4 } },
  { id: 'dodge_legendary', type: CARD_TYPES.DODGE, rarity: CARD_RARITIES.LEGENDARY, cost: 20, stylePoints: 4, name: '🛡️ Зеркало богов', description: '50% уклоненного урона врагу', requiresStyle: 10, legendaryEffect: 'reflection', bonus: { dodge: 4 } },
  
  // Антикарты (5 золота, до 5 раз)
  { id: 'anti_dodge', type: 'anti', antiType: CARD_TYPES.DODGE, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Клей для ног', description: '-10% к уклонению противника', isAnti: true },
  { id: 'anti_armor', type: 'anti', antiType: CARD_TYPES.ARMOR, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Ржавчина щита', description: '-10% к броне противника', isAnti: true },
  { id: 'anti_critical', type: 'anti', antiType: CARD_TYPES.CRITICAL, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Слепота удачи', description: '-10% к криту и множителю противника', isAnti: true },
  { id: 'anti_freeze', type: 'anti', antiType: CARD_TYPES.FREEZE, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Горячий чай', description: '-10% к заморозке противника', isAnti: true },
  { id: 'anti_attack', type: 'anti', antiType: CARD_TYPES.ATTACK, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Размягчение кулака', description: '-10% к атаке противника', isAnti: true },
  { id: 'anti_health', type: 'anti', antiType: CARD_TYPES.HEALTH, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Ослабление здоровья', description: '-10% к добавочному здоровью противника', isAnti: true },
  { id: 'anti_healing', type: 'anti', antiType: CARD_TYPES.HEALING, rarity: CARD_RARITIES.COMMON, cost: 5, name: 'Подавление лечения', description: '-10% к лечению противника', isAnti: true }
];

// Набор характеристик для предметов (на основе комбинированных карт)
const ITEM_CHARACTERISTICS = [
  { type: CARD_TYPES.ATTACK, description: '+6 к урону', bonus: { attack: 6 } },
  { type: CARD_TYPES.HEALTH, description: '+20 HP', bonus: { health: 20 } },
  { type: CARD_TYPES.DODGE, description: '+2% уклонения', bonus: { dodge: 2 } },
  { type: CARD_TYPES.ARMOR, description: '+2% брони', bonus: { armor: 2 } },
  { type: CARD_TYPES.CRITICAL, description: '+2% крита, +0.1 к множителю', bonus: { critical: 2, critMultiplier: 0.1 } },
  { type: CARD_TYPES.HEALING, description: '+10 HP при спине', bonus: { healing: 10 } },
  { type: CARD_TYPES.FREEZE, description: '+0.3 сек заморозки', bonus: { freeze: 0.3 } }
];

// Эффекты предметов
const ITEM_EFFECTS = {
  GUARANTEED_WILD: 'guaranteedWild', // Гарантированный wild при спине
  GUARANTEED_WILD_COUNT: 'guaranteedWildCount', // +2 вайлда при спине
  TEMP_GOLD_BONUS: 'tempGoldBonus', // +20 временного золота в каждом бою
  SPIN_COST_REDUCTION: 'spinCostReduction', // -1 к стоимости спина
  BONUS_WEIGHT_INCREASE: 'bonusWeightIncrease' // +3 к весу бонусного эффекта
};

// Шаблоны названий для предметов
const ITEM_NAME_TEMPLATES = {
  [CARD_TYPES.ATTACK]: ['Ударный молоток', 'Боевой топор', 'Разрушительный меч', 'Атакующий кинжал', 'Силовой кулак'],
  [CARD_TYPES.HEALTH]: ['Сердце воина', 'Живучий амулет', 'Броня здоровья', 'Эликсир жизни', 'Щит выносливости'],
  [CARD_TYPES.DODGE]: ['Сапоги скорости', 'Плащ невидимости', 'Кольцо уклонения', 'Ботинки проворства', 'Маска ловкости'],
  [CARD_TYPES.ARMOR]: ['Бронированный щит', 'Защитный панцирь', 'Стальная броня', 'Крепкий шлем', 'Щит обороны'],
  [CARD_TYPES.CRITICAL]: ['Критический клинок', 'Убийственный взгляд', 'Точный прицел', 'Смертельный удар', 'Критический урон'],
  [CARD_TYPES.HEALING]: ['Аптечка выживания', 'Регенеративный бальзам', 'Исцеляющий источник', 'Лечебный эликсир', 'Восстановительное зелье'],
  [CARD_TYPES.FREEZE]: ['Ледяной кристалл', 'Морозный амулет', 'Холодное кольцо', 'Ледяная перчатка', 'Замороженный артефакт']
};

// Описания эффектов
const ITEM_EFFECT_DESCRIPTIONS = {
  [ITEM_EFFECTS.GUARANTEED_WILD]: 'Гарантированный wild при спине',
  [ITEM_EFFECTS.GUARANTEED_WILD_COUNT]: '+2 вайлда при спине',
  [ITEM_EFFECTS.TEMP_GOLD_BONUS]: '+20 временного золота в каждом бою',
  [ITEM_EFFECTS.SPIN_COST_REDUCTION]: '-1 к стоимости спина',
  [ITEM_EFFECTS.BONUS_WEIGHT_INCREASE]: 'Увеличенный шанс выпадения бонусного эффекта (+3 к весу)'
};

// Генерация предмета
function generateItem(excludedEffects = []) {
  // Выбираем случайную характеристику
  const characteristic = ITEM_CHARACTERISTICS[Math.floor(Math.random() * ITEM_CHARACTERISTICS.length)];
  
  // Выбираем случайный эффект, исключая уже использованные
  const availableEffects = Object.values(ITEM_EFFECTS).filter(effect => !excludedEffects.includes(effect));
  const effect = availableEffects[Math.floor(Math.random() * availableEffects.length)];
  
  // Генерируем название на основе типа характеристики
  const templates = ITEM_NAME_TEMPLATES[characteristic.type];
  const name = templates[Math.floor(Math.random() * templates.length)];
  
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: name,
    characteristic: characteristic,
    effect: effect,
    effectDescription: ITEM_EFFECT_DESCRIPTIONS[effect],
    description: `${characteristic.description}, ${ITEM_EFFECT_DESCRIPTIONS[effect]}`
  };
}

// Генерация набора предметов для выбора (2 предмета без дубликатов эффектов)
function generateItemChoices() {
  const items = [];
  const usedEffects = [];
  
  for (let i = 0; i < 2; i++) {
    const item = generateItem(usedEffects);
    items.push(item);
    usedEffects.push(item.effect);
  }
  
  return items;
}

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
    rechargeEndTime: 0,
    // Экономика
    permanentGold: 30,
    temporaryGold: 0,
    hasEndedTurn: false, // Закончил ли ход
    turnEndTime: null, // Время окончания хода (timestamp)
    isReady: isBot, // Готовность к следующему раунду (боты всегда готовы)
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
    shields: [], // Массив щитов: [{ id: uniqueId, source: 'character' }]
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
    legendaryEffects: {}, // { effectType: true } - активные эффекты легендарных карт
    icePunishmentIntervals: {}, // { targetSocketId: intervalId } - активные интервалы ледяной кары
    // Флаги отказа действий (для ботов - до первого отказа)
    attackRefused: false, // Бот получил отказ на атаку (неправильная фаза или нет золота)
    cardPurchaseRefused: false, // Бот получил отказ на покупку карточек (неправильная фаза или нет золота)
    // Предмет
    selectedItem: null, // Выбранный предмет: { id, name, characteristic, effect, effectDescription, description }
    itemChoices: null, // Предложенные предметы для выбора
    itemBonus: {} // Бонусы от предмета: { attack, health, dodge, armor, critical, critMultiplier, healing, freeze }
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
  
  // Выбираем случайный паттерн поведения
  const patternKeys = Object.keys(BOT_BEHAVIOR_PATTERNS);
  const randomPatternKey = patternKeys[Math.floor(Math.random() * patternKeys.length)];
  const behaviorPattern = BOT_BEHAVIOR_PATTERNS[randomPatternKey];
  
  // Выбираем базовое имя и добавляем смешной суффикс в зависимости от паттерна
  const baseName = botNames[Math.floor(Math.random() * botNames.length)];
  const suffix = behaviorPattern.suffixes[Math.floor(Math.random() * behaviorPattern.suffixes.length)];
  const botName = baseName + suffix;
  
  const bot = createPlayer(botId, botName, roomId, true);
  
  // Добавляем паттерн поведения боту
  bot.behaviorPattern = randomPatternKey;
  
  // Автоматически назначаем случайного персонажа боту
  const randomCharacter = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  bot.characterId = randomCharacter.id;
  
  // Выбираем предпочтительные стили (минимум 2)
  const allStyles = Object.values(CARD_TYPES);
  const preferredStylesCount = 2 + Math.floor(Math.random() * 2); // 2-3 стиля
  const shuffledStyles = [...allStyles].sort(() => Math.random() - 0.5);
  bot.preferredStyles = shuffledStyles.slice(0, preferredStylesCount);
  
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
  // Применяем эффект предмета: +3 к весу бонусного эффекта
  let bonusWeight = 8;
  if (bot && bot.selectedItem && bot.selectedItem.effect === ITEM_EFFECTS.BONUS_WEIGHT_INCREASE) {
    bonusWeight += 3;
  }
  const BONUS_SYMBOL = { name: 'bonus', weight: bonusWeight };
  
  // Генерация случайного символа с учетом весов
  function getRandomSymbol(guaranteedWild = false) {
    if (guaranteedWild) {
      return 'wild';
    }
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
  
  // Проверяем эффекты предмета: гарантированный wild при спине
  const hasGuaranteedWild = bot && bot.selectedItem && bot.selectedItem.effect === ITEM_EFFECTS.GUARANTEED_WILD;
  const hasGuaranteedWildCount = bot && bot.selectedItem && bot.selectedItem.effect === ITEM_EFFECTS.GUARANTEED_WILD_COUNT;
  let wildCount = 0;
  if (hasGuaranteedWildCount) {
    wildCount = 2; // +2 вайлда
  } else if (hasGuaranteedWild) {
    wildCount = 1; // 1 вайлд
  }
  
  // Генерируем 3 линии по 5 символов (как на клиенте)
  const results = [];
  for (let line = 0; line < 3; line++) {
    const lineSymbols = [];
    for (let i = 0; i < 5; i++) {
      // Применяем гарантированные wild символы
      if (wildCount > 0 && line === 0 && i < wildCount) {
        lineSymbols.push('wild');
      } else {
        lineSymbols.push(getRandomSymbol(false));
      }
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
// БОТЫ ДОЛЖНЫ АКТИВНО ИСПОЛЬЗОВАТЬ ВРЕМЕННОЕ ЗОЛОТО, ТАК КАК ОНО ТЕРЯЕТСЯ В КОНЦЕ РАУНДА
function botDecideAction(bot, opponent) {
  // Применяем эффект предмета: -1 к стоимости спина
  let spinCost = 5;
  if (bot.selectedItem && bot.selectedItem.effect === ITEM_EFFECTS.SPIN_COST_REDUCTION) {
    spinCost = Math.max(1, spinCost - 1); // Минимум 1 золото
  }
  const botHpPercent = bot.roundHp / 100;
  const opponentHpPercent = opponent.roundHp / 100;
  
  // Копии тратят только временное золото
  if (bot.isCopy) {
    if (bot.temporaryGold >= spinCost) {
      return 'spin';
    } else {
      return 'endTurn';
    }
  }
  
  // 100% шанс атаковать при наличии временного золота (оно теряется в конце раунда!)
  if (bot.temporaryGold >= spinCost) {
    return 'spin';
  }
  
  // Если у бота нет золота - заканчивает ход
  if (bot.temporaryGold < spinCost && bot.permanentGold < spinCost) {
    return 'endTurn';
  }
  
  // Логика использования постоянного золота зависит от паттерна поведения
  const behaviorPattern = bot.behaviorPattern || 'ECONOMIC'; // По умолчанию экономичный
  const pattern = BOT_BEHAVIOR_PATTERNS[behaviorPattern];
  
  if (!pattern) {
    // Если паттерн не найден, используем старую логику
    return 'endTurn';
  }
  
  // Стратегический паттерн: проверяем totalHp
  if (behaviorPattern === 'STRATEGIC') {
    const hpThreshold = pattern.hpThreshold || 30;
    if (bot.totalHp >= hpThreshold) {
      // После достижения порога HP - агрессивно тратим на атаки
      if (bot.permanentGold >= spinCost && Math.random() < pattern.permanentGoldAttackChanceAfter) {
        return 'spin';
      }
    } else {
      // До достижения порога HP - экономим
      if (bot.permanentGold >= spinCost && Math.random() < pattern.permanentGoldAttackChance) {
        return 'spin';
      }
    }
  } else {
    // Агрессивный и экономичный паттерны
    if (bot.permanentGold >= spinCost && Math.random() < pattern.permanentGoldAttackChance) {
      return 'spin';
    }
  }
  
  // Иначе заканчиваем ход (боты предпочитают экономить постоянное золото на карточки)
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
      const playerStats = calculatePlayerStats(player);
      const maxHp = playerStats.maxHp;
      const healAmount = Math.min(character.abilityValue, maxHp - player.roundHp);
      player.roundHp = Math.min(maxHp, player.roundHp + character.abilityValue);
      result.message = `${character.name}: восстановлено ${healAmount} HP`;
      result.healAmount = healAmount;
      break;
      
    case 'block':
      // Добавление щита (блокирование следующего урона)
      const shieldId = `shield_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (!player.shields) player.shields = [];
      player.shields.push({ id: shieldId, source: 'character' });
      result.message = `${character.name}: получен щит (всего щитов: ${player.shields.length})`;
      result.shieldAdded = true;
      break;
      
    case 'damage':
      // Нанесение 50 урона (урон применяется в основной логике после проверки крита)
      if (opponent && opponent.shields && opponent.shields.length > 0) {
        // Урон поглощается щитом
        opponent.shields.shift(); // Удаляем первый щит
        result.message = `${character.name}: урон заблокирован щитом противника (щитов осталось: ${opponent.shields.length})`;
        result.damage = 0;
      } else {
        const damage = character.abilityValue;
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
  
  // Если бот уже получил отказ, прекращаем попытки
  if (bot.attackRefused) {
    return;
  }
  
  const now = Date.now();
  
  // Проверяем фазу игры - боты могут атаковать только в BATTLE
  if (room.gameStateController) {
    const currentState = room.gameStateController.currentState;
    // Если фаза PREPARATION, но прошло время подготовки, считаем что можно атаковать
    if (currentState === GAME_STATES.PREPARATION) {
      const controller = room.gameStateController;
      if (controller.preBattleEndTime > 0 && now < controller.preBattleEndTime) {
        // Еще идет подготовка, планируем повторную попытку
        const remaining = controller.preBattleEndTime - now;
        setTimeout(() => {
          handleBotSpin(botId, roomId);
        }, remaining + 100);
        return;
      }
      // Время подготовки прошло, можно атаковать (isBattleActive вернет true)
    } else if (currentState !== GAME_STATES.BATTLE) {
      // Неправильная фаза - устанавливаем флаг отказа и прекращаем попытки
      if (!bot.attackRefused) {
        bot.attackRefused = true;
        console.log(`Бот ${bot.nickname} получил отказ на атаку - неправильная фаза: ${currentState}`);
      }
      return;
    }
  }
  
  // СТРОГАЯ ПРОВЕРКА: Проверяем общее состояние боя - боты НЕ должны атаковать до старта
  if (!isBattleActive(roomId)) {
    // Бой еще не начался, устанавливаем флаг отказа
    if (!bot.attackRefused) {
      bot.attackRefused = true;
      console.log(`Бот ${bot.nickname} получил отказ на атаку - бой еще не активен`);
    }
    return;
  }
  
  const opponentId = bot.duelOpponent;
  if (!opponentId) return;
  
  const opponent = players.get(opponentId);
  if (!opponent || opponent.isEliminated) return;
  
  // Проверяем перезарядку
  if (bot.rechargeEndTime > 0 && now < bot.rechargeEndTime) {
    // Еще перезаряжается, планируем повторную попытку
    const remaining = bot.rechargeEndTime - now;
    setTimeout(() => {
      handleBotSpin(botId, roomId);
    }, remaining);
    return;
  }
  
  // Рассчитываем и устанавливаем перезарядку сразу после проверки (до обработки урона)
  // Пока устанавливаем базовое время - fastStrike применится после всех модификаторов
  bot.lastSpinTime = now;
  let baseRechargeTime = 3000; // 3 секунды перезарядки (базовое время)
  bot.rechargeEndTime = now + baseRechargeTime;
  
  // Применяем эффект предмета: -1 к стоимости спина
  let spinCost = 5;
  if (bot.selectedItem && bot.selectedItem.effect === ITEM_EFFECTS.SPIN_COST_REDUCTION) {
    spinCost = Math.max(1, spinCost - 1); // Минимум 1 золото
  }
  
  // Проверяем наличие золота
  if (bot.temporaryGold < spinCost && bot.permanentGold < spinCost) {
    // Нет золота - устанавливаем флаг отказа и заканчиваем ход
    if (!bot.attackRefused) {
      bot.attackRefused = true;
      console.log(`Бот ${bot.nickname} получил отказ на атаку - нет золота`);
    }
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
  // Копии тратят только временное золото
  if (bot.isCopy) {
    if (bot.temporaryGold >= spinCost) {
      bot.temporaryGold -= spinCost;
    } else {
      // Копия не может тратить постоянное золото
      return;
    }
  } else if (bot.temporaryGold >= spinCost) {
    bot.temporaryGold -= spinCost;
  } else if (bot.permanentGold >= spinCost) {
    bot.permanentGold -= spinCost;
  } else {
    // Не удалось потратить золото - устанавливаем флаг отказа
    if (!bot.attackRefused) {
      bot.attackRefused = true;
      console.log(`Бот ${bot.nickname} получил отказ на атаку - не удалось потратить золото`);
    }
    botEndTurn(botId, roomId);
    return;
  }
  
  // Симулируем реальный спин (как у игрока) - занимает около 1-2 секунд
  const spinDuration = 1000 + Math.random() * 1000; // 1-2 секунды спина
  
  // Планируем нанесение урона после завершения спина
  setTimeout(() => {
    const spinEndTime = Date.now();
    const spinResult = simulateBotSpin(bot);
    let damage = spinResult.damage || 0;
    
    // Рассчитываем характеристики игроков
    const attackerStats = calculatePlayerStats(bot);
    const targetStats = calculatePlayerStats(opponent);
    
    // Применяем антикарты противника к атакующему
    const attackReduction = getAntiCardEffect(opponent, CARD_TYPES.ATTACK);
    let effectiveAttack = attackerStats.attack * (1 - attackReduction);
    
    // Формула урона: базовый урон (10) + урон от всех линий (5 * совпадения) + бонус атаки
    const baseSpinDamage = 10; // Базовый урон всегда 10, даже если нет линий
    const lineDamage = damage || 0; // Урон от линий (5 * совпадения)
    const attackBonus = Math.max(0, effectiveAttack - 10); // Бонус атаки сверх базовой (10)
    let finalDamage = baseSpinDamage + lineDamage + attackBonus;
    
    // Применяем антикарты противника к статистике атакующего для крита
    const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, opponent);
    
    // Проверяем крит (применяется к итоговому урону)
    const critResult = applyCritToDamage(finalDamage, attackerStatsWithAntiCards);
    finalDamage = Math.max(0, critResult.damage); // Убеждаемся что урон не может быть отрицательным или -0
    let isCrit = critResult.isCrit;
    
    // Флаг для отслеживания снижения урона броней
    let armorReduced = false;
    // Флаг для отслеживания уклонения
    let dodged = false;
    
    // Если 3+ бонусных символа - используем способность персонажа
    if (spinResult.matches === 'bonus' && bot.characterId) {
      const abilityResult = useCharacterAbility(bot, opponent, roomId);
      if (abilityResult) {
        if (abilityResult.ability === 'damage' && abilityResult.damage) {
          // Применяем антикарты противника к статистике атакующего для крита
          const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, targetAntiCards);
          // Применяем крит к урону от способности
          const critResult = applyCritToDamage(abilityResult.damage, attackerStatsWithAntiCards);
          finalDamage = finalDamage + critResult.damage;
          isCrit = isCrit || critResult.isCrit;
        } else {
          finalDamage = 0;
          isCrit = false;
        }
        
        // Эффект регенерации при бонусе
        if (bot.legendaryEffects && bot.legendaryEffects.regeneration) {
          // Вычисляем количество HP, которое было бы восстановлено
          // Даже если HP уже максимальное, используем healing stat
          const potentialHeal = Math.max(
            attackerStats.maxHp - bot.roundHp,
            attackerStats.healing || 0
          );
          
          // Наносим 20% от восстановленного здоровья как урон врагу
          if (potentialHeal > 0) {
            const regenerationDamage = Math.floor(potentialHeal * 0.2);
            // Применяем антикарты противника к статистике атакующего для крита
            const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, targetAntiCards);
            // Применяем крит к урону от регенерации
            const critResult = applyCritToDamage(regenerationDamage, attackerStatsWithAntiCards);
            const finalRegenDamage = critResult.damage;
            
            // Наносим урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
            opponent.roundHp = Math.max(0, opponent.roundHp - finalRegenDamage);
            if (finalRegenDamage > 0) {
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: botId,
                targetPlayerSocketId: opponentId,
                damage: finalRegenDamage,
                matches: 'regeneration',
                crit: critResult.isCrit,
                comboInfo: { type: 'regeneration', text: 'Регенерация', description: '20% от восстановленного HP' }
              });
            }
          }
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
        
        // Применяем урон от способности с учетом всех проверок
        if (abilityResult.ability === 'damage' && finalDamage > 0) {
          // Проверяем уклонение
          const dodgeRoll = Math.random() * 100;
          let effectiveDodge = targetStats.dodge;
          if (targetAntiCards[CARD_TYPES.DODGE]) {
            effectiveDodge = Math.max(0, effectiveDodge + targetAntiCards[CARD_TYPES.DODGE]);
          }
          
          if (dodgeRoll < effectiveDodge) {
            dodged = true;
            const originalDamage = finalDamage;
            finalDamage = 0;
            
            // Эффект отражения при уклонении
            // ВАЖНО: Отражённый урон наносится напрямую без проверки уклонения/отражения,
            // чтобы исключить бесконечные циклы отражения
            if (opponent.legendaryEffects && opponent.legendaryEffects.reflection) {
              let reflectedDamage = Math.floor(originalDamage * 0.5);
              // Применяем антикарты атакующего (bot) к статистике цели (opponent) для крита
              const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, bot);
              const critResult = applyCritToDamage(reflectedDamage, targetStatsWithAntiCards);
              reflectedDamage = critResult.damage;
              // Наносим отражённый урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
              bot.roundHp = Math.max(0, bot.roundHp - reflectedDamage);
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: opponentId,
                targetPlayerSocketId: botId,
                damage: reflectedDamage,
                matches: 'reflection',
                crit: critResult.isCrit,
                isReflected: true, // Флаг, что это отражённый урон (не может быть снова отражён)
                comboInfo: { type: 'reflection', text: 'Отражение', description: '50% уклоненного урона' }
              });
            }
          } else {
            // Применяем броню
            const originalDamageBeforeArmor = finalDamage; // Сохраняем урон до применения брони
            const armorReduction = targetStats.armor / 100;
            if (targetAntiCards[CARD_TYPES.ARMOR]) {
              const effectiveArmor = Math.max(0, targetStats.armor + targetAntiCards[CARD_TYPES.ARMOR]);
              finalDamage = Math.floor(finalDamage * (1 - effectiveArmor / 100));
            } else {
              finalDamage = Math.floor(finalDamage * (1 - armorReduction));
            }
            // Отмечаем что урон был снижен броней (если урон действительно уменьшился)
            if (finalDamage < originalDamageBeforeArmor && finalDamage > 0) {
              armorReduced = true;
            }
            
            // Эффект мстительного здоровья
            if (opponent.legendaryEffects && opponent.legendaryEffects.vengefulHealth) {
              const lostHp = opponent.roundHp - Math.max(0, opponent.roundHp - finalDamage);
              let revengeDamage = Math.floor(lostHp * 0.1);
              // Применяем антикарты атакующего (bot) к статистике цели (opponent) для крита
              const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, bot);
              const critResult = applyCritToDamage(revengeDamage, targetStatsWithAntiCards);
              revengeDamage = critResult.damage;
              bot.roundHp = Math.max(0, bot.roundHp - revengeDamage);
              if (revengeDamage > 0) {
                io.to(roomId).emit('attack', {
                  fromPlayerSocketId: opponentId,
                  targetPlayerSocketId: botId,
                  damage: revengeDamage,
                  matches: 'revenge',
                  crit: critResult.isCrit,
                  comboInfo: { type: 'revenge', text: 'Мщение', description: '10% от потерянного HP' }
                });
              }
            }
            
            // Применяем урон
            opponent.roundHp = Math.max(0, opponent.roundHp - finalDamage);
          }
        }
      }
    } else if (damage > 0) {
      // Обычный урон - проверяем щиты противника
      const shieldResult = absorbDamageWithShields(opponent, finalDamage);
      if (shieldResult.shieldsUsed > 0) {
        finalDamage = shieldResult.remainingDamage;
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: opponentId,
          targetPlayerSocketId: botId,
          ability: 'block',
          message: `Урон заблокирован щитом (щитов осталось: ${opponent.shields ? opponent.shields.length : 0})`,
          damage: 0,
          shieldsUsed: shieldResult.shieldsUsed,
          shieldsRemaining: opponent.shields ? opponent.shields.length : 0
        });
      }
      
      if (finalDamage > 0) {
        // Проверяем уклонение (считается для каждого источника урона отдельно)
        const dodgeRoll = Math.random() * 100;
        const dodgeReduction = getAntiCardEffect(opponent, CARD_TYPES.DODGE);
        let effectiveDodge = targetStats.dodge * (1 - dodgeReduction);
        
        if (dodgeRoll < effectiveDodge) {
          dodged = true;
          const originalDamage = finalDamage;
          finalDamage = 0;
          
          // Эффект отражения при уклонении (50% от исходного урона)
          // ВАЖНО: Отражённый урон наносится напрямую без проверки уклонения/отражения,
          // чтобы исключить бесконечные циклы отражения
          if (opponent.legendaryEffects && opponent.legendaryEffects.reflection) {
            let reflectedDamage = Math.floor(originalDamage * 0.5);
            // Применяем антикарты атакующего (bot) к статистике цели (opponent) для крита
            const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, bot);
            // Применяем крит к отражённому урону (крит применяется от того, кто отражает)
            const critResult = applyCritToDamage(reflectedDamage, targetStatsWithAntiCards);
            reflectedDamage = critResult.damage;
            // Наносим отражённый урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
            bot.roundHp = Math.max(0, bot.roundHp - reflectedDamage);
            io.to(roomId).emit('attack', {
              fromPlayerSocketId: opponentId,
              targetPlayerSocketId: botId,
              damage: reflectedDamage,
              matches: 'reflection',
              crit: critResult.isCrit,
              isReflected: true, // Флаг, что это отражённый урон (не может быть снова отражён)
              comboInfo: { type: 'reflection', text: 'Отражение', description: '50% уклоненного урона' }
            });
          }
        } else {
          // Применяем броню
          const originalDamageBeforeArmor = finalDamage; // Сохраняем урон до применения брони
          const armorReduction = getAntiCardEffect(opponent, CARD_TYPES.ARMOR);
          const effectiveArmor = targetStats.armor * (1 - armorReduction);
          finalDamage = Math.max(0, Math.floor(finalDamage * (1 - effectiveArmor / 100)));
          // Отмечаем что урон был снижен броней (если урон действительно уменьшился)
          if (finalDamage < originalDamageBeforeArmor && finalDamage > 0) {
            armorReduced = true;
          }
          
          // Исправление бага: если урон стал 0, но у противника очень мало HP (<=2), применяем минимум 1 урон
          if (finalDamage === 0 && opponent.roundHp > 0 && opponent.roundHp <= 2) {
            finalDamage = 1;
          }
          
          // Эффект мстительного здоровья
          if (opponent.legendaryEffects && opponent.legendaryEffects.vengefulHealth) {
            const lostHp = opponent.roundHp - Math.max(0, opponent.roundHp - finalDamage);
            let revengeDamage = Math.floor(lostHp * 0.1);
            // Применяем антикарты атакующего (bot) к статистике цели (opponent) для крита
            const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, bot);
            // Применяем крит к мстительному урону (крит применяется от того, кто мстит)
            const critResult = applyCritToDamage(revengeDamage, targetStatsWithAntiCards);
            revengeDamage = critResult.damage;
            bot.roundHp = Math.max(0, bot.roundHp - revengeDamage);
            if (revengeDamage > 0) {
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: opponentId,
                targetPlayerSocketId: botId,
                damage: revengeDamage,
                matches: 'revenge',
                crit: critResult.isCrit,
                comboInfo: { type: 'revenge', text: 'Мщение', description: '10% от потерянного HP' }
              });
            }
          }
          
          // Применяем урон
          opponent.roundHp = Math.max(0, opponent.roundHp - finalDamage);
        }
      }
    }
    
    // Применяем лечение при спине
    if (attackerStats.healing > 0) {
      const healAmount = attackerStats.healing;
      const actualHeal = Math.min(attackerStats.maxHp - bot.roundHp, healAmount);
      bot.roundHp = Math.min(attackerStats.maxHp, bot.roundHp + healAmount);
      io.to(roomId).emit('heal', {
        playerSocketId: botId,
        amount: actualHeal
      });
      
      // Эффект регенерации: наносим 20% от восстановленного здоровья как урон врагу
      // Даже если HP уже максимальное, считаем восстановление равным healAmount
      if (bot.legendaryEffects && bot.legendaryEffects.regeneration) {
        const regenerationDamage = Math.floor(healAmount * 0.2);
        // Применяем антикарты противника к статистике атакующего для крита
        const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, opponent);
        // Применяем крит к урону от регенерации
        const critResult = applyCritToDamage(regenerationDamage, attackerStatsWithAntiCards);
        const finalRegenDamage = critResult.damage;
        
        // Наносим урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
        opponent.roundHp = Math.max(0, opponent.roundHp - finalRegenDamage);
        if (finalRegenDamage > 0) {
          io.to(roomId).emit('attack', {
            fromPlayerSocketId: botId,
            targetPlayerSocketId: opponentId,
            damage: finalRegenDamage,
            matches: 'regeneration',
            crit: critResult.isCrit,
            comboInfo: { type: 'regeneration', text: 'Регенерация', description: '20% от восстановленного HP' }
          });
        }
      }
    }
    
    // Применяем заморозку (увеличиваем перезарядку противника)
    // Заморозка добавляется к базовому времени перезарядки (3000ms)
    if (attackerStats.freeze > 0) {
      // Учитываем анти-заморозку противника
      const freezeReduction = getAntiCardEffect(opponent, CARD_TYPES.FREEZE);
      const effectiveFreeze = attackerStats.freeze * (1 - freezeReduction);
      
      if (effectiveFreeze > 0) {
        const freezeTime = effectiveFreeze * 1000; // в миллисекундах
        const baseRechargeTime = 3000; // Базовое время перезарядки
        if (opponent.rechargeEndTime > spinEndTime) {
          // Если уже идет перезарядка, добавляем время заморозки
          opponent.rechargeEndTime += freezeTime;
        } else {
          // Если перезарядка не идет, устанавливаем базовое время + заморозка
          opponent.rechargeEndTime = spinEndTime + baseRechargeTime + freezeTime;
        }
        
        // Применяем fastStrike цели ПОСЛЕ всех модификаторов (включая заморозку)
        if (opponent.legendaryEffects && opponent.legendaryEffects.fastStrike) {
          const currentRechargeTime = opponent.rechargeEndTime - spinEndTime;
          const reducedRechargeTime = Math.floor(currentRechargeTime * 0.5);
          opponent.rechargeEndTime = spinEndTime + reducedRechargeTime;
        }
        
        // Отправляем обновление перезарядки противнику с учетом заморозки и fastStrike
        const opponentSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === opponentId);
        if (opponentSocket) {
          const currentNow = Date.now();
          opponentSocket.emit('spinRecharge', {
            playerSocketId: opponentId,
            rechargeTime: Math.max(0, opponent.rechargeEndTime - currentNow),
            rechargeEndTime: opponent.rechargeEndTime,
            freezeApplied: effectiveFreeze
          });
        }
      }
    }
    
    // Применяем fastStrike боту ПОСЛЕ всех модификаторов
    // Используем now (время начала спина), так как перезарядка установлена относительно now
    if (bot.legendaryEffects && bot.legendaryEffects.fastStrike) {
      const botNow = Date.now(); // Текущее время в момент обработки
      const currentRechargeTime = bot.rechargeEndTime - botNow;
      if (currentRechargeTime > 0) {
        const reducedRechargeTime = Math.floor(currentRechargeTime * 0.5);
        bot.rechargeEndTime = botNow + reducedRechargeTime;
      }
    }
    
    // Эффект ледяной кары (25 урона в секунду во время перезарядки спина противника)
    if (bot.legendaryEffects && bot.legendaryEffects.icePunishment) {
      // Инициализируем хранилище интервалов, если его нет
      if (!bot.icePunishmentIntervals) {
        bot.icePunishmentIntervals = {};
      }
      
      // Проверяем, не запущен ли уже интервал для этого противника
      if (!bot.icePunishmentIntervals[opponentId]) {
        const iceDamage = 25;
        const iceInterval = setInterval(() => {
          const currentTarget = players.get(opponentId);
          const currentAttacker = bots.get(botId);
          const now = Date.now();
          
          // Проверяем, жив ли противник и в дуэли
          if (!currentTarget || currentTarget.roundHp <= 0 || !currentTarget.isInDuel || 
              !currentAttacker || !currentAttacker.isInDuel) {
            // Очищаем интервал
            if (currentAttacker && currentAttacker.icePunishmentIntervals) {
              clearInterval(currentAttacker.icePunishmentIntervals[opponentId]);
              delete currentAttacker.icePunishmentIntervals[opponentId];
            }
            return;
          }
          
          // Проверяем, идет ли перезарядка спина у противника
          if (currentTarget.rechargeEndTime > now) {
            // Перезарядка идет - наносим урон
            // Пересчитываем статистику атакующего для проверки крита
            const currentAttackerStats = calculatePlayerStats(currentAttacker);
            // Применяем антикарты цели к статистике атакующего для крита
            const currentTargetAntiCards = currentTarget.antiCards || {};
            const currentAttackerStatsWithAntiCards = applyAntiCardsToStats(currentAttackerStats, currentTargetAntiCards);
            let actualIceDamage = iceDamage;
            // Применяем крит к урону от ледяной кары
            const critResult = applyCritToDamage(actualIceDamage, currentAttackerStatsWithAntiCards);
            actualIceDamage = critResult.damage;
            
            currentTarget.roundHp = Math.max(0, currentTarget.roundHp - actualIceDamage);
            io.to(roomId).emit('attack', {
              fromPlayerSocketId: botId,
              targetPlayerSocketId: opponentId,
              damage: actualIceDamage,
              matches: 'ice',
              crit: critResult.isCrit,
              comboInfo: { type: 'ice', text: '❄️ Абсолютный ноль', description: '25 урона в секунду во время перезарядки' }
            });
            updateRoomState(roomId);
            
            // Проверяем, не умер ли противник
            if (currentTarget.roundHp <= 0) {
              if (currentAttacker && currentAttacker.icePunishmentIntervals) {
                clearInterval(currentAttacker.icePunishmentIntervals[opponentId]);
                delete currentAttacker.icePunishmentIntervals[opponentId];
              }
            }
          }
          // Если перезарядка не идет, просто пропускаем цикл - не наносим урон
        }, 1000);
        
        // Сохраняем интервал
        bot.icePunishmentIntervals[opponentId] = iceInterval;
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
        damage: finalDamage
      };
    } else if (finalDamage > 0 && spinResult.comboDetails) {
      // Используем детали комбинации из результата спина
      comboInfo = {
        type: 'combo',
        text: spinResult.comboDetails.text,
        damage: finalDamage,
        description: `Урон: ${finalDamage}`
      };
    } else if (finalDamage > 0) {
      // Для обычных комбинаций бота формируем базовую информацию
      comboInfo = {
        type: 'combo',
        text: `КОМБИНАЦИЯ`,
        damage: finalDamage,
        description: `Урон: ${finalDamage}`
      };
    }
    
    // Отправляем атаку всем в комнате
    if (finalDamage > 0 || spinResult.matches === 'bonus') {
      io.to(roomId).emit('attack', {
        fromPlayerSocketId: botId,
        targetPlayerSocketId: opponentId,
        damage: finalDamage,
        matches: spinResult.matches,
        crit: isCrit,
        comboInfo: comboInfo
      });
    }
    
    // Перезарядка уже установлена в начале handleBotSpin, не переустанавливаем
    
    // Обновляем состояние
    updateRoomState(roomId);
    
    // Проверяем, закончился ли бой
    if (opponent.roundHp <= 0) {
      // Проигравший теряет 20% от общего HP
      opponent.totalHp = Math.max(0, opponent.totalHp - Math.floor(opponent.totalHp * 0.2));
      
      // Проверяем и выбываем игрока, если totalHp <= 0
      checkAndEliminatePlayer(opponent);
      
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
      bot.turnEndTime = null;
      opponent.turnEndTime = null;
      
      // Очищаем интервалы ледяной кары при завершении дуэли
      clearIcePunishmentIntervals(bot);
      clearIcePunishmentIntervals(opponent);
      
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
      const totalDelay = rechargeTime + (bot.spinDelay || 0); // Перезарядка + задержка после окончания перезарядки
      
      setTimeout(() => {
        // Проверяем решение еще раз после перезарядки (вероятность повторяется)
        const currentBot = bots.get(botId);
        const currentOpponent = currentBot && currentBot.duelOpponent ? players.get(currentBot.duelOpponent) : null;
        if (currentBot && currentOpponent && currentBot.isInDuel && !currentBot.isEliminated && !currentBot.hasEndedTurn) {
          const nextDecision = botDecideAction(currentBot, currentOpponent);
          if (nextDecision === 'spin') {
            handleBotSpin(botId, roomId);
          } else {
            botEndTurn(botId, roomId);
          }
        }
      }, totalDelay);
    }
    
    console.log(`Бот ${bot.nickname} атакует ${opponent.nickname} на ${finalDamage} урона (Временное: ${bot.temporaryGold}, Постоянное: ${bot.permanentGold})`);
  }, spinDuration);
}

// Бот заканчивает ход
function botEndTurn(botId, roomId) {
  const bot = bots.get(botId);
  if (!bot || !bot.isInDuel) return;
  
  bot.hasEndedTurn = true;
  bot.turnEndTime = Date.now(); // Сохраняем время окончания хода
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
      // Антикарты имеют меньший шанс выпадения (30% против 70% для обычных карт)
      const antiCardChance = 0.3; // 30% шанс выбрать антикарту вместо обычной
      const commonAntiCards = antiCards.filter(c => c.rarity === CARD_RARITIES.COMMON);
      
      if (commonCards.length > 0 && (commonAntiCards.length === 0 || Math.random() >= antiCardChance)) {
        // Выбираем из обычных карт (70% шанс или если нет антикарт)
        card = commonCards[Math.floor(Math.random() * commonCards.length)];
      } else if (commonAntiCards.length > 0) {
        // Выбираем из антикарт (30% шанс)
        card = commonAntiCards[Math.floor(Math.random() * commonAntiCards.length)];
      } else if (commonCards.length > 0) {
        // Fallback: если нет антикарт, выбираем из обычных
        card = commonCards[Math.floor(Math.random() * commonCards.length)];
      } else if (antiCards.length > 0) {
        // Fallback: если нет обычных, выбираем из всех антикарт
        card = antiCards[Math.floor(Math.random() * antiCards.length)];
      }
    }
    
    if (card) {
      // Проверяем, что карта еще не добавлена в offers и не достигнут лимит покупки
      const alreadyInOffers = offers.some(offer => offer.id === card.id);
      const ownedCount = (player.cardsOwned || {})[card.id] || 0;
      const maxCount = card.rarity === CARD_RARITIES.LEGENDARY ? 1 
        : card.rarity === CARD_RARITIES.RARE ? 3 
        : 5;
      
      if (!alreadyInOffers && ownedCount < maxCount) {
        offers.push(card);
      } else if (i < 4) {
        // Если карта уже добавлена или достигнут лимит, пытаемся найти другую
        // (только если еще не достигли лимита в 5 карт)
        i--; // Повторяем итерацию
      }
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
  // Копии тратят только временное золото
  if (player.isCopy) {
    if (player.temporaryGold < card.cost) {
      return { success: false, message: 'Недостаточно временного золота' };
    }
    player.temporaryGold -= card.cost;
  } else {
    if (player.permanentGold < card.cost) {
      return { success: false, message: 'Недостаточно постоянного золота' };
    }
    player.permanentGold -= card.cost;
  }
  player.cardsOwned[cardId] = (player.cardsOwned[cardId] || 0) + 1;
  
  // Удаляем купленную карту из магазина
  if (player.cardShopOffers && Array.isArray(player.cardShopOffers)) {
    player.cardShopOffers = player.cardShopOffers.filter(offer => offer.id !== cardId);
  }
  
  // Проверяем, остались ли доступные карты в магазине
  // Если магазин пуст или все карты куплены, автоматически обновляем его
  if (!player.cardShopOffers || player.cardShopOffers.length === 0) {
    player.cardShopOffers = generateCardShopOffers(player);
  }
  
  // Обрабатываем антикарты - они уже добавлены в cardsOwned выше
  if (card.isAnti) {
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
  
  const message = `Карточка "${card.name}" куплена!`;
  
  return { success: true, message: message };
}

// Обновление магазина карточек
function refreshCardShop(player) {
  const refreshCost = 2;
  
  // Можно использовать временное или постоянное золото
  // Копии тратят только временное золото
  if (player.isCopy) {
    if (player.temporaryGold >= refreshCost) {
      player.temporaryGold -= refreshCost;
    } else {
      return { success: false, message: 'Недостаточно временного золота' };
    }
  } else if (player.temporaryGold >= refreshCost) {
    player.temporaryGold -= refreshCost;
  } else if (player.permanentGold >= refreshCost) {
    player.permanentGold -= refreshCost;
  } else {
    return { success: false, message: 'Недостаточно золота для обновления (нужно 2 золота)' };
  }
  
  player.cardShopOffers = generateCardShopOffers(player);
  return { success: true, message: 'Магазин обновлен!' };
}

// Расчет пороговых бонусов для атаки
function getAttackThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 30; // 20 единиц: +30 (5 + 10 + 15)
  } else if (stylePoints >= 10) {
    return 15; // 10 единиц: +15 (5 + 10)
  } else if (stylePoints >= 4) {
    return 5; // 4 единицы: +5
  }
  return 0;
}

// Расчет пороговых бонусов для уклонения
function getDodgeThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 30; // 20 единиц: +30% (5 + 10 + 15)
  } else if (stylePoints >= 10) {
    return 15; // 10 единиц: +15% (5 + 10)
  } else if (stylePoints >= 4) {
    return 5; // 4 единицы: +5%
  }
  return 0;
}

// Расчет пороговых бонусов для крита
function getCriticalThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return { chance: 30, multiplier: 1.5 }; // 20 единиц: +30% шанс, +1.5 множитель (0.25 + 0.5 + 0.75)
  } else if (stylePoints >= 10) {
    return { chance: 15, multiplier: 0.75 }; // 10 единиц: +15% шанс, +0.75 множитель (0.25 + 0.5)
  } else if (stylePoints >= 4) {
    return { chance: 5, multiplier: 0.25 }; // 4 единицы: +5% шанс, +0.25 множитель
  }
  return { chance: 0, multiplier: 0 };
}

// Расчет пороговых бонусов для брони
function getArmorThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 30; // 20 единиц: +30% (5 + 10 + 15)
  } else if (stylePoints >= 10) {
    return 15; // 10 единиц: +15% (5 + 10)
  } else if (stylePoints >= 4) {
    return 5; // 4 единицы: +5%
  }
  return 0;
}

// Расчет пороговых бонусов для заморозки
function getFreezeThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 10; // 20 единиц: +10 сек (2 + 3 + 5)
  } else if (stylePoints >= 10) {
    return 5; // 10 единиц: +5 сек (2 + 3)
  } else if (stylePoints >= 4) {
    return 2; // 4 единицы: +2 сек
  }
  return 0;
}

// Расчет пороговых бонусов для лечения
function getHealingThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 30; // 20 единиц: +30 HP (5 + 10 + 15)
  } else if (stylePoints >= 10) {
    return 15; // 10 единиц: +15 HP (5 + 10)
  } else if (stylePoints >= 4) {
    return 5; // 4 единицы: +5 HP
  }
  return 0;
}

// Расчет пороговых бонусов для здоровья
function getHealthThresholdBonus(stylePoints) {
  if (stylePoints >= 20) {
    return 30; // 20 единиц: +30 HP (5 + 10 + 15)
  } else if (stylePoints >= 10) {
    return 15; // 10 единиц: +15 HP (5 + 10)
  } else if (stylePoints >= 4) {
    return 5; // 4 единицы: +5 HP
  }
  return 0;
}

// Проверка и выбывание игрока, если totalHp <= 0
function checkAndEliminatePlayer(player) {
  if (player && player.totalHp <= 0) {
    player.isEliminated = true;
    player.totalHp = 0; // Гарантируем, что HP не будет отрицательным
    return true;
  }
  return false;
}

// Поглощение урона щитами
function absorbDamageWithShields(target, damage) {
  if (!target.shields || target.shields.length === 0) {
    return { remainingDamage: damage, shieldsUsed: 0 };
  }
  
  let remainingDamage = damage;
  let shieldsUsed = 0;
  
  // Щиты поглощают урон по очереди, каждый щит поглощает весь урон
  while (target.shields.length > 0 && remainingDamage > 0) {
    target.shields.shift(); // Удаляем щит
    shieldsUsed++;
    remainingDamage = 0; // Каждый щит полностью поглощает урон
  }
  
  return { remainingDamage, shieldsUsed };
}

// Получение эффекта антикарт для определенного типа
function getAntiCardEffect(player, antiType) {
  if (!player || !player.cardsOwned) {
    return 0;
  }
  
  // Находим все антикарты нужного типа
  const antiCards = CARDS.filter(card => card.isAnti && card.antiType === antiType);
  let totalCount = 0;
  
  antiCards.forEach(card => {
    const count = player.cardsOwned[card.id] || 0;
    totalCount += count;
  });
  
  // Возвращаем процент снижения (10% за каждую карту)
  return totalCount * 0.1;
}

// Применение антикарт противника к статистике с процентным снижением
function applyAntiCardsPercentage(stats, targetPlayer) {
  if (!targetPlayer || !stats) {
    return stats;
  }
  
  const modifiedStats = { ...stats };
  
  // Применяем антикарты для атаки
  const attackReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.ATTACK);
  if (attackReduction > 0) {
    modifiedStats.attack = modifiedStats.attack * (1 - attackReduction);
  }
  
  // Применяем антикарты для уклонения
  const dodgeReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.DODGE);
  if (dodgeReduction > 0) {
    modifiedStats.dodge = modifiedStats.dodge * (1 - dodgeReduction);
  }
  
  // Применяем антикарты для брони
  const armorReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.ARMOR);
  if (armorReduction > 0) {
    modifiedStats.armor = modifiedStats.armor * (1 - armorReduction);
  }
  
  // Применяем антикарты для заморозки
  const freezeReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.FREEZE);
  if (freezeReduction > 0) {
    modifiedStats.freeze = modifiedStats.freeze * (1 - freezeReduction);
  }
  
  // Применяем антикарты для лечения
  const healingReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.HEALING);
  if (healingReduction > 0) {
    modifiedStats.healing = modifiedStats.healing * (1 - healingReduction);
  }
  
  // Применяем антикарты для здоровья (только к добавочному)
  const healthReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.HEALTH);
  if (healthReduction > 0 && modifiedStats.maxHp > 100) {
    const additionalHp = modifiedStats.maxHp - 100;
    modifiedStats.maxHp = 100 + (additionalHp * (1 - healthReduction));
  }
  
  // Применяем антикарты для крита
  const critReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.CRITICAL);
  if (critReduction > 0) {
    modifiedStats.critChance = Math.max(0, modifiedStats.critChance * (1 - critReduction));
    modifiedStats.critMultiplier = Math.max(0.1, modifiedStats.critMultiplier * (1 - critReduction));
  }
  
  return modifiedStats;
}

// Применение антикарт противника к статистике атакующего
function applyAntiCardsToStats(attackerStats, targetPlayer) {
  if (!targetPlayer) {
    return attackerStats;
  }
  
  // Создаем копию статистики
  const modifiedStats = { ...attackerStats };
  
  // Применяем антикарты для крита
  const critReduction = getAntiCardEffect(targetPlayer, CARD_TYPES.CRITICAL);
  if (critReduction > 0) {
    modifiedStats.critChance = Math.max(0, attackerStats.critChance * (1 - critReduction));
    modifiedStats.critMultiplier = Math.max(0.1, attackerStats.critMultiplier * (1 - critReduction));
  }
  
  return modifiedStats;
}

// Применение крита к урону
function applyCritToDamage(damage, attackerStats) {
  if (!damage || damage <= 0) {
    return { damage: damage, isCrit: false };
  }
  
  const critRoll = Math.random() * 100;
  if (critRoll < attackerStats.critChance) {
    return {
      damage: Math.floor(damage * attackerStats.critMultiplier),
      isCrit: true
    };
  }
  
  return { damage: damage, isCrit: false };
}

// Расчет характеристик игрока с учетом карточек
function calculatePlayerStats(player) {
  const stylePoints = player.stylePoints || {};
  const cardsOwned = player.cardsOwned || {};
  
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
  
  // Применяем бонусы от предмета
  if (player.itemBonus) {
    if (player.itemBonus.attack) baseAttack += player.itemBonus.attack;
    if (player.itemBonus.armor) baseArmor += player.itemBonus.armor;
    if (player.itemBonus.dodge) baseDodge += player.itemBonus.dodge;
    if (player.itemBonus.critical) baseCritChance += player.itemBonus.critical;
    if (player.itemBonus.critMultiplier) baseCritMultiplier += player.itemBonus.critMultiplier;
    if (player.itemBonus.freeze) baseFreeze += player.itemBonus.freeze;
    if (player.itemBonus.healing) baseHealing += player.itemBonus.healing;
    if (player.itemBonus.health) maxHp += player.itemBonus.health;
  }
  
  // Применяем пороговые бонусы (на основе stylePoints)
  const attackBonus = getAttackThresholdBonus(stylePoints.attack || 0);
  const armorBonus = getArmorThresholdBonus(stylePoints.armor || 0);
  const dodgeBonus = getDodgeThresholdBonus(stylePoints.dodge || 0);
  const critBonus = getCriticalThresholdBonus(stylePoints.critical || 0);
  const freezeBonus = getFreezeThresholdBonus(stylePoints.freeze || 0);
  const healingBonus = getHealingThresholdBonus(stylePoints.healing || 0);
  const healthBonus = getHealthThresholdBonus(stylePoints.health || 0);
  
  // Применяем пороговые бонусы для крита (шанс и множитель)
  const critChanceBonus = critBonus.chance;
  const critMultBonus = critBonus.multiplier;
  
  // Применяем пороговые бонусы для заморозки
  const freezeTimeBonus = freezeBonus;
  
  // Применяем пороговые бонусы для лечения
  const healingHpBonus = healingBonus;
  
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
    maxHp: maxHp + healthBonus
  };
}

// Обработка покупки карточек ботом
// Обработка выбора предмета игроком
function handleItemSelection(playerId, roomId, itemId) {
  const player = players.get(playerId);
  if (!player) {
    console.warn(`Игрок ${playerId} не найден для выбора предмета`);
    return;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    console.warn(`Комната ${roomId} не найдена для выбора предмета`);
    return;
  }
  
  // Находим выбранный предмет из предложенных
  if (!player.itemChoices || player.itemChoices.length === 0) {
    console.warn(`У игрока ${playerId} нет предложенных предметов`);
    return;
  }
  
  const selectedItem = player.itemChoices.find(item => item.id === itemId);
  
  if (!selectedItem) {
    console.warn(`Предмет ${itemId} не найден среди предложенных`);
    return;
  }
  
  // Сохраняем выбранный предмет
  player.selectedItem = selectedItem;
  player.itemChoices = null; // Очищаем предложенные предметы
  
  // Применяем характеристику предмета к игроку
  if (selectedItem.characteristic && selectedItem.characteristic.bonus) {
    const bonus = selectedItem.characteristic.bonus;
    if (!player.itemBonus) {
      player.itemBonus = {};
    }
    Object.keys(bonus).forEach(key => {
      player.itemBonus[key] = (player.itemBonus[key] || 0) + bonus[key];
    });
  }
  
  console.log(`Игрок ${player.nickname} выбрал предмет: ${selectedItem.name} (эффект: ${selectedItem.effect})`);
  
  // Отправляем подтверждение выбора
  io.to(playerId).emit('itemSelected', {
    item: selectedItem
  });
  
  // Обновляем состояние комнаты
  updateRoomState(roomId);
}

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
    
    // Проверяем фазу игры - боты могут покупать карточки только в BREAK
    if (room.gameStateController) {
      const currentState = room.gameStateController.currentState;
      if (currentState !== GAME_STATES.BREAK) {
        // Неправильная фаза - устанавливаем флаг отказа и прекращаем попытки
        if (!bot.cardPurchaseRefused) {
          bot.cardPurchaseRefused = true;
          console.log(`Бот ${bot.nickname} получил отказ на покупку карточек - неправильная фаза: ${currentState}`);
        }
        return;
      }
    }
    
    // Если бот уже получил отказ, прекращаем попытки
    if (bot.cardPurchaseRefused) {
      return;
    }
    
    // Генерируем предложения, если их еще нет
    if (!bot.cardShopOffers || bot.cardShopOffers.length === 0) {
      bot.cardShopOffers = generateCardShopOffers(bot);
    }
    
    // Определяем шанс покупки карточек в зависимости от паттерна поведения
    const behaviorPattern = bot.behaviorPattern || 'ECONOMIC'; // По умолчанию экономичный
    const pattern = BOT_BEHAVIOR_PATTERNS[behaviorPattern];
    
    let cardPurchaseChance = 0.3; // Значение по умолчанию
    
    if (pattern) {
      if (behaviorPattern === 'STRATEGIC') {
        // Для стратегического паттерна проверяем totalHp
        const hpThreshold = pattern.hpThreshold || 30;
        if (bot.totalHp >= hpThreshold) {
          cardPurchaseChance = pattern.cardPurchaseChanceAfter || 0.7;
        } else {
          cardPurchaseChance = pattern.cardPurchaseChance || 0.3;
        }
      } else {
        // Для агрессивного и экономичного паттернов используем фиксированный шанс
        cardPurchaseChance = pattern.cardPurchaseChance || 0.3;
      }
    }
    
    // Проверяем предпочтительные стили бота
    const preferredStyles = bot.preferredStyles || [];
    
    // Проверяем, есть ли карты предпочтительных стилей в магазине
    const hasPreferredStyles = bot.cardShopOffers.some(card => {
      const cardTypes = [card.type];
      if (card.isHybrid && card.secondaryType) {
        cardTypes.push(card.secondaryType);
      }
      return cardTypes.some(type => preferredStyles.includes(type));
    });
    
    // Если нет карт предпочтительных стилей и есть золото для рерола - делаем рерол
    // Но только если после рерола останется золото для покупки хотя бы одной карты
    const refreshCost = 2;
    const minCardCost = 5; // Минимальная стоимость карты
    
    if (!hasPreferredStyles && preferredStyles.length > 0) {
      // Проверяем, хватит ли золота на рерол + хотя бы одну карту
      const totalNeeded = refreshCost + minCardCost;
      const hasEnoughForRefreshAndCard = 
        (bot.permanentGold >= totalNeeded) || 
        (bot.temporaryGold >= refreshCost && bot.permanentGold >= minCardCost) ||
        (bot.permanentGold >= refreshCost && bot.temporaryGold >= minCardCost);
      
      if (hasEnoughForRefreshAndCard && 
          (bot.permanentGold >= refreshCost || bot.temporaryGold >= refreshCost)) {
        const refreshResult = refreshCardShop(bot);
        if (refreshResult.success) {
          console.log(`Бот ${bot.nickname} сделал рерол магазина для поиска предпочтительных стилей (потрачено ${refreshCost} золота)`);
          // После рерола продолжаем с новыми предложениями
        }
      }
    }
    
    // Проверяем, есть ли доступные карточки для покупки (есть золото и карточки в предложениях)
    const affordableCards = bot.cardShopOffers.filter(card => bot.permanentGold >= card.cost);
    if (affordableCards.length === 0) {
      // Нет доступных карточек для покупки - устанавливаем флаг отказа
      if (!bot.cardPurchaseRefused) {
        bot.cardPurchaseRefused = true;
        console.log(`Бот ${bot.nickname} получил отказ на покупку карточек - нет доступных карточек или недостаточно золота`);
      }
      updateRoomState(roomId);
      return;
    }
    
    // Бот покупает карточки в цикле (может купить несколько подряд)
    let maxPurchaseAttempts = 10; // Максимум попыток покупки за один вызов
    let purchaseAttempt = 0;
    let purchasedAny = false;
    
    while (purchaseAttempt < maxPurchaseAttempts && bot.permanentGold >= 5) { // Минимальная стоимость карты
      purchaseAttempt++;
      
      // Пересчитываем доступные карты в каждой итерации (после покупки список обновляется)
      const currentAffordableCards = bot.cardShopOffers.filter(card => bot.permanentGold >= card.cost);
      if (currentAffordableCards.length === 0) {
        break; // Больше нет доступных карт
      }
      
      // Сортируем карты по приоритету (предпочтительные стили имеют больший приоритет)
      const sortedCards = [...currentAffordableCards].sort((a, b) => {
        const aTypes = [a.type];
        if (a.isHybrid && a.secondaryType) aTypes.push(a.secondaryType);
        const bTypes = [b.type];
        if (b.isHybrid && b.secondaryType) bTypes.push(b.secondaryType);
        
        const aHasPreferred = aTypes.some(type => preferredStyles.includes(type));
        const bHasPreferred = bTypes.some(type => preferredStyles.includes(type));
        
        if (aHasPreferred && !bHasPreferred) return -1;
        if (!aHasPreferred && bHasPreferred) return 1;
        return 0;
      });
      
      // Выбираем карту для покупки (предпочтительно из предпочтительных стилей)
      let cardToBuy = null;
      for (const card of sortedCards) {
        if (bot.permanentGold < card.cost) continue;
        
        const cardTypes = [card.type];
        if (card.isHybrid && card.secondaryType) cardTypes.push(card.secondaryType);
        const isPreferred = cardTypes.some(type => preferredStyles.includes(type));
        
        // Более высокая вероятность покупки для предпочтительных стилей
        const adjustedChance = isPreferred ? cardPurchaseChance * 1.5 : cardPurchaseChance;
        const finalChance = Math.min(adjustedChance, 1.0); // Ограничиваем до 1.0
        
        if (Math.random() < finalChance) {
          cardToBuy = card;
          break;
        }
      }
      
      // Если не выбрали карту, пробуем еще раз с обычной вероятностью
      if (!cardToBuy && sortedCards.length > 0) {
        const randomCard = sortedCards[Math.floor(Math.random() * sortedCards.length)];
        if (bot.permanentGold >= randomCard.cost && Math.random() < cardPurchaseChance) {
          cardToBuy = randomCard;
        }
      }
      
      // Покупаем выбранную карту (проверяем золото еще раз перед покупкой)
      if (cardToBuy && bot.permanentGold >= cardToBuy.cost) {
        const result = buyCard(bot, cardToBuy.id);
        if (result.success) {
          purchasedAny = true;
          console.log(`Бот ${bot.nickname} купил карточку ${cardToBuy.name} за ${cardToBuy.cost} золота (осталось: ${bot.permanentGold})`);
        } else {
          // Если покупка не удалась (например, достигнут лимит), прекращаем попытки
          break;
        }
      } else {
        // Не удалось выбрать карту или недостаточно золота - прекращаем попытки
        break;
      }
    }
    
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
// Создание копии игрока для боя при нечетном количестве
function createPlayerCopy(originalPlayer, roomId) {
  if (!originalPlayer) return null;
  
  const copyId = `COPY_${originalPlayer.socketId}_${Date.now()}`;
  const copy = JSON.parse(JSON.stringify(originalPlayer)); // Глубокая копия
  
  // Обновляем идентификаторы
  copy.socketId = copyId;
  copy.nickname = `${originalPlayer.nickname} (Копия)`;
  copy.isCopy = true;
  copy.originalSocketId = originalPlayer.socketId; // Ссылка на оригинал
  copy.roomId = roomId;
  
  // Копия должна тратить только временное золото
  // Синхронизируем золото с оригиналом
  copy.temporaryGold = originalPlayer.temporaryGold;
  copy.permanentGold = originalPlayer.permanentGold;
  
  // Сохраняем копию в хранилище
  players.set(copyId, copy);
  
  return copy;
}

function createPairs(playerIds) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    } else {
      // Нечетное количество - создаем копию одного из живых игроков
      const oddPlayerId = shuffled[i];
      const oddPlayer = players.get(oddPlayerId);
      
      if (oddPlayer && !oddPlayer.isEliminated) {
        // Выбираем случайного живого игрока для создания копии (не самого нечетного)
        const otherPlayers = shuffled.filter(id => id !== oddPlayerId && !players.get(id)?.isEliminated);
        if (otherPlayers.length > 0) {
          const originalId = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
          const originalPlayer = players.get(originalId);
          
          if (originalPlayer) {
            const copy = createPlayerCopy(originalPlayer, oddPlayer.roomId);
            if (copy) {
              // Добавляем копию в комнату
              const room = rooms.get(oddPlayer.roomId);
              if (room && !room.players.includes(copy.socketId)) {
                room.players.push(copy.socketId);
              }
              pairs.push([oddPlayerId, copy.socketId]);
            } else {
              pairs.push([oddPlayerId, null]);
            }
          } else {
            pairs.push([oddPlayerId, null]);
          }
        } else {
          pairs.push([oddPlayerId, null]);
        }
      } else {
        pairs.push([oddPlayerId, null]);
      }
    }
  }
  return pairs;
}

// Инициализация контроллера состояний игры
function initGameStateController() {
  return {
    currentState: null,
    stateStartTime: 0,
    roundStartTime: 0,
    breakStartTime: 0,
    preBattleEndTime: 0
  };
}

// Установка состояния игры
function setGameState(roomId, newState) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  if (!room.gameStateController) {
    room.gameStateController = initGameStateController();
  }
  
  const now = Date.now();
  const controller = room.gameStateController;
  const oldState = controller.currentState;
  controller.currentState = newState;
  controller.stateStartTime = now;
  
  // Устанавливаем специфичные таймеры в зависимости от состояния
  switch (newState) {
    case GAME_STATES.PREPARATION:
      controller.preBattleEndTime = now + PRE_BATTLE_DELAY;
      controller.roundStartTime = now;
      break;
    case GAME_STATES.BATTLE:
      controller.preBattleEndTime = 0; // Бой начался, таймер больше не нужен
      // Сбрасываем флаг отказа на атаку для всех ботов в комнате
      room.players.forEach(playerId => {
        const player = players.get(playerId);
        if (player && player.isBot && player.attackRefused) {
          player.attackRefused = false;
          console.log(`Сброшен флаг отказа на атаку для бота ${player.nickname} при переходе в BATTLE`);
        }
      });
      break;
    case GAME_STATES.BREAK:
      controller.breakStartTime = now;
      // Сбрасываем флаг отказа на покупку карточек для всех ботов в комнате
      room.players.forEach(playerId => {
        const player = players.get(playerId);
        if (player && player.isBot && player.cardPurchaseRefused) {
          player.cardPurchaseRefused = false;
          console.log(`Сброшен флаг отказа на покупку карточек для бота ${player.nickname} при переходе в BREAK`);
        }
      });
      break;
    case GAME_STATES.ROUND_END:
      break;
  }
  
  // Отправляем событие о смене состояния всем клиентам с серверным временем для синхронизации
  const serverTime = Date.now();
  io.to(roomId).emit('gameStateChanged', {
    state: newState,
    stateStartTime: controller.stateStartTime,
    preBattleEndTime: controller.preBattleEndTime,
    roundStartTime: controller.roundStartTime,
    breakStartTime: controller.breakStartTime,
    serverTime: serverTime // Серверное время для синхронизации
  });
  
  console.log(`Комната ${roomId}: состояние изменено с ${oldState} на ${newState}`);
}

// Получение текущего состояния игры
function getGameState(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.gameStateController) {
    return null;
  }
  return room.gameStateController.currentState;
}

// Проверка, активен ли бой (прошло ли 10 секунд подготовки)
function isBattleActive(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.gameStateController) {
    return false;
  }
  
  const controller = room.gameStateController;
  const now = Date.now();
  
  // Если состояние BATTLE, бой активен
  if (controller.currentState === GAME_STATES.BATTLE) {
    return true;
  }
  
  // Если состояние PREPARATION, проверяем таймер
  if (controller.currentState === GAME_STATES.PREPARATION) {
    return now >= controller.preBattleEndTime;
  }
  
  return false;
}

// Очистка интервалов ледяной кары для игрока
function clearIcePunishmentIntervals(player) {
  if (player && player.icePunishmentIntervals) {
    Object.values(player.icePunishmentIntervals).forEach(intervalId => {
      clearInterval(intervalId);
    });
    player.icePunishmentIntervals = {};
  }
}

// Обновление состояния комнаты
function updateRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const playersInRoom = room.players.map(id => {
    const p = players.get(id);
    if (!p) return null;
    // Рассчитываем максимальное HP с учетом эффектов карт
    const stats = calculatePlayerStats(p);
    return {
      socketId: id,
      nickname: p.nickname,
      totalHp: p.totalHp,
      roundHp: p.roundHp,
      maxHp: stats.maxHp, // Добавляем динамическое максимальное HP
      isEliminated: p.isEliminated,
      isInDuel: p.isInDuel,
      duelOpponent: p.duelOpponent,
      duelStatus: p.duelStatus,
      isBot: p.isBot || false,
      characterId: p.characterId || null,
      permanentGold: p.permanentGold || 0,
      temporaryGold: p.temporaryGold || 0,
      hasEndedTurn: p.hasEndedTurn || false,
      isReady: p.isReady || false,
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

// Проверка готовности всех живых игроков (totalHp > 0)
function checkAllPlayersReady(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.gameInProgress) return;
  
  // Проверяем, что сейчас перерыв
  if (!room.gameStateController || room.gameStateController.currentState !== GAME_STATES.BREAK) {
    return;
  }
  
  // Получаем всех живых игроков (totalHp > 0)
  const alivePlayers = room.players.filter(id => {
    const p = players.get(id);
    return p && p.totalHp > 0;
  });
  
  if (alivePlayers.length < 2) {
    return; // Недостаточно игроков
  }
  
  // Проверяем, все ли живые игроки готовы
  const allReady = alivePlayers.every(id => {
    const p = players.get(id);
    return p && p.isReady === true;
  });
  
  if (allReady) {
    console.log(`Все живые игроки готовы, начинаем следующий раунд`);
    // Отменяем таймер перерыва, если он есть
    if (room.breakTimeout) {
      clearTimeout(room.breakTimeout);
      room.breakTimeout = null;
    }
    // Сразу начинаем следующий раунд
    startNextRound(roomId);
  }
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
        if (p) {
          // Генерируем предложения, если их еще нет (для всех игроков, включая ботов)
          if (!p.cardShopOffers || p.cardShopOffers.length === 0) {
            p.cardShopOffers = generateCardShopOffers(p);
          }
        }
      });
      
      // Сбрасываем готовность всех игроков (кроме ботов, которые всегда готовы)
      activePlayers.forEach(id => {
        const p = players.get(id);
        if (p && !p.isBot) {
          p.isReady = false;
        }
      });
      
      // Начисляем 20% от постоянного золота в начале раунда закупки (только для не-копий)
      activePlayers.forEach(id => {
        const p = players.get(id);
        if (p && !p.isCopy) {
          const interestGold = Math.floor((p.permanentGold || 0) * 0.2);
          if (interestGold > 0) {
            p.permanentGold = (p.permanentGold || 0) + interestGold;
            p.lastRoundGoldEarned = interestGold;
            p.lastRoundGoldBonus = 20; // 20% проценты
          }
        }
      });
      
      // Проверяем, нужно ли показывать выбор предметов (раунды 2, 4, 6)
      const shouldShowItemSelection = [2, 4, 6].includes(room.currentRound);
      
      if (shouldShowItemSelection) {
        // Генерируем предметы для выбора для каждого живого игрока
        const alivePlayersForItems = activePlayers.filter(id => {
          const p = players.get(id);
          return p && p.totalHp > 0 && !p.isEliminated;
        });
        
        alivePlayersForItems.forEach(id => {
          const p = players.get(id);
          if (p && !p.selectedItem) { // Только если у игрока еще нет предмета
            const itemChoices = generateItemChoices();
            p.itemChoices = itemChoices; // Сохраняем предложенные предметы
            // Отправляем выбор предметов игроку
            if (p.isBot) {
              // Боты выбирают случайно
              setTimeout(() => {
                const randomChoice = itemChoices[Math.floor(Math.random() * itemChoices.length)];
                handleItemSelection(id, roomId, randomChoice.id);
              }, 500 + Math.random() * 1000); // Случайная задержка 0.5-1.5 секунды
            } else {
              // Реальные игроки получают выбор
              io.to(id).emit('itemSelectionRequired', {
                items: itemChoices,
                duration: 10000 // 10 секунд
              });
            }
          }
        });
        
        // Устанавливаем состояние BREAK после отправки выбора предметов
        // (экран выбора будет показан перед магазином карт)
        setTimeout(() => {
          setGameState(roomId, GAME_STATES.BREAK);
          
          // Боты покупают карточки во время перерыва
          activePlayers.forEach(id => {
            const p = players.get(id);
            if (p && p.isBot) {
              // Запускаем покупку карточек для бота с небольшой задержкой
              setTimeout(() => {
                handleBotCardPurchase(id, roomId);
              }, 1000 + Math.random() * 2000); // Случайная задержка 1-3 секунды
            }
          });
        }, 100); // Небольшая задержка для отправки события выбора предметов
      } else {
        // Устанавливаем состояние BREAK с таймером 1 минута
        setGameState(roomId, GAME_STATES.BREAK);
        
        // Боты покупают карточки во время перерыва
        activePlayers.forEach(id => {
          const p = players.get(id);
          if (p && p.isBot) {
            // Запускаем покупку карточек для бота с небольшой задержкой
            setTimeout(() => {
              handleBotCardPurchase(id, roomId);
            }, 1000 + Math.random() * 2000); // Случайная задержка 1-3 секунды
          }
        });
      }
      
      // Отправляем событие о начале перерыва перед следующим раундом (для обратной совместимости)
      io.to(roomId).emit('breakStarted', {
        duration: BREAK_DURATION,
        round: room.currentRound
      });
      
      // Автоматический переход к следующему раунду после перерыва (если все не готовы)
      room.breakTimeout = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.gameStateController && 
            currentRoom.gameStateController.currentState === GAME_STATES.BREAK) {
          startNextRound(roomId);
        }
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
  const baseGold = 20; // И за победу, и за поражение одинаково: 20
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
    let winner, loser;
    
    if (p1.roundHp > p2.roundHp) {
      winner = p1;
      loser = p2;
    } else if (p2.roundHp > p1.roundHp) {
      winner = p2;
      loser = p1;
    } else {
      // При равенстве HP побеждает тот, кто первый закончил ход
      if (p1.turnEndTime && p2.turnEndTime) {
        winner = p1.turnEndTime < p2.turnEndTime ? p1 : p2;
      } else if (p1.turnEndTime) {
        winner = p1; // p1 закончил, p2 еще нет (но это не должно происходить)
      } else if (p2.turnEndTime) {
        winner = p2;
      } else {
        // Fallback на старую логику, если время не установлено
        winner = p1.roundHp >= p2.roundHp ? p1 : p2;
      }
    }
    loser = winner === p1 ? p2 : p1;
    
    // Проигравший теряет 20% от общего HP
    loser.totalHp = Math.max(0, loser.totalHp - Math.floor(loser.totalHp * 0.2));
    
    // Проверяем и выбываем игрока, если totalHp <= 0
    checkAndEliminatePlayer(loser);
    
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
      winner.turnEndTime = null;
      loser.turnEndTime = null;
      
      // Очищаем интервалы ледяной кары при завершении дуэли
      clearIcePunishmentIntervals(winner);
      clearIcePunishmentIntervals(loser);
      
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
      // Если это копия, синхронизируем золото с оригиналом перед обновлением
      if (p.isCopy && p.originalSocketId) {
        const original = players.get(p.originalSocketId);
        if (original) {
          // Синхронизируем золото с оригиналом
          p.temporaryGold = original.temporaryGold;
          p.permanentGold = original.permanentGold;
        }
      }
      
      // Золото уже начислено при завершении дуэли, здесь только сбрасываем статусы
      // Сбрасываем информацию о последнем раунде (будет обновлена в следующем раунде)
      p.lastRoundGoldBonus = 0;
      p.lastRoundGoldEarned = 0;
      // Сбрасываем готовность (боты всегда готовы)
      p.isReady = p.isBot;
      
      // Сбрасываем флаги отказа для ботов при начале нового раунда
      if (p.isBot) {
        p.attackRefused = false;
        p.cardPurchaseRefused = false;
      }
      
      // Устанавливаем roundHp равным maxHp в начале раунда
      const stats = calculatePlayerStats(p);
      p.roundHp = stats.maxHp;
      p.isInDuel = false;
      p.duelOpponent = null;
      p.duelStatus = null;
      p.lastSpinTime = 0;
      p.rechargeEndTime = 0;
      
      // Выдаем 30 временного золота (для копий синхронизируем с оригиналом после)
      // Применяем эффект предмета: +20 временного золота в каждом бою
      let baseTempGold = 30;
      if (p.selectedItem && p.selectedItem.effect === ITEM_EFFECTS.TEMP_GOLD_BONUS) {
        baseTempGold += 20;
      }
      
      if (!p.isCopy) {
        p.temporaryGold = baseTempGold;
      } else if (p.originalSocketId) {
        const original = players.get(p.originalSocketId);
        if (original) {
          p.temporaryGold = original.temporaryGold;
        } else {
          p.temporaryGold = baseTempGold; // Fallback
        }
      }
      
      p.hasEndedTurn = false;
      p.turnEndTime = null;
      
      // Очищаем интервалы ледяной кары при начале нового раунда
      clearIcePunishmentIntervals(p);
      
      // Генерируем предложения карточек для всех игроков (для следующего раунда)
      // Предложения для текущего перерыва уже были сгенерированы в checkAllDuelsFinished
      // Здесь генерируем для следующего перерыва
      p.cardShopOffers = generateCardShopOffers(p);
    }
  });
  
  // Создаем пары
  room.pairs = createPairs(activePlayers);
  room.currentRound = (room.currentRound || 0) + 1;
  
  // Устанавливаем состояние PREPARATION с таймером 10 секунд
  setGameState(roomId, GAME_STATES.PREPARATION);
  
  // Автоматический переход в BATTLE через 10 секунд
  setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (currentRoom && currentRoom.gameStateController && 
        currentRoom.gameStateController.currentState === GAME_STATES.PREPARATION) {
      setGameState(roomId, GAME_STATES.BATTLE);
    }
  }, PRE_BATTLE_DELAY);
  
  // Назначаем дуэли
  const now = Date.now();
  room.pairs.forEach(pair => {
    if (pair[1] !== null) {
      const p1 = players.get(pair[0]);
      const p2 = players.get(pair[1]);
      if (p1 && p2) {
        p1.isInDuel = true;
        p1.duelOpponent = pair[1];
        p2.isInDuel = true;
        p2.duelOpponent = pair[0];
        
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
      noBots: noBots, // Флаг "без ботов"
      gameStateController: initGameStateController()
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
    
    // Проверяем общее состояние боя - строгая проверка
    const now = Date.now();
    if (!isBattleActive(roomId)) {
      const room = rooms.get(roomId);
      if (room && room.gameStateController) {
        const controller = room.gameStateController;
        if (controller.currentState === GAME_STATES.PREPARATION && controller.preBattleEndTime > 0) {
          const remaining = Math.ceil((controller.preBattleEndTime - now) / 1000);
          socket.emit('roomError', { message: `Бой еще не начался! Подождите ${remaining} секунд` });
          return;
        }
      }
      socket.emit('roomError', { message: 'Бой еще не начался!' });
      return;
    }
    
    // Проверяем перезарядку
    if (attacker.rechargeEndTime > 0 && now < attacker.rechargeEndTime) {
      socket.emit('roomError', { message: 'Оружие перезаряжается' });
      return;
    }
    
    // Рассчитываем и устанавливаем перезарядку сразу после проверки (до обработки урона)
    // Пока устанавливаем базовое время - fastStrike применится после всех модификаторов
    attacker.lastSpinTime = now;
    let baseRechargeTime = 3000; // 3 секунды перезарядки (базовое время)
    attacker.rechargeEndTime = now + baseRechargeTime;
    
    // Отправляем информацию о перезарядке клиенту (пока без fastStrike)
    socket.emit('spinRecharge', {
      playerSocketId: fromPlayerSocketId,
      rechargeTime: baseRechargeTime,
      rechargeEndTime: attacker.rechargeEndTime
    });
    
    // Тратим золото на спин (5 золота) - ВСЕГДА, даже если нет комбинации
    // Применяем эффект предмета: -1 к стоимости спина
    let spinCost = 5;
    if (attacker.selectedItem && attacker.selectedItem.effect === ITEM_EFFECTS.SPIN_COST_REDUCTION) {
      spinCost = Math.max(1, spinCost - 1); // Минимум 1 золото
    }
    // Копии тратят только временное золото
    if (attacker.isCopy) {
      if (attacker.temporaryGold >= spinCost) {
        attacker.temporaryGold -= spinCost;
      } else {
        // Копия не может тратить постоянное золото
        return;
      }
    } else if (attacker.temporaryGold >= spinCost) {
      attacker.temporaryGold -= spinCost;
    } else if (attacker.permanentGold >= spinCost) {
      attacker.permanentGold -= spinCost;
    } else {
      // Нет золота - не можем атаковать
      socket.emit('roomError', { message: 'Недостаточно золота для спина' });
      return;
    }
    
    // Рассчитываем характеристики игроков
    const attackerStats = calculatePlayerStats(attacker);
    const targetStats = calculatePlayerStats(target);
    
    // Применяем антикарты противника к атакующему
    const attackReduction = getAntiCardEffect(target, CARD_TYPES.ATTACK);
    let effectiveAttack = attackerStats.attack * (1 - attackReduction);
    
    // Формула урона: базовый урон (10) + урон от всех линий (5 * совпадения) + бонус атаки
    const baseSpinDamage = 10; // Базовый урон всегда 10, даже если нет линий
    const lineDamage = damage || 0; // Урон от линий (5 * совпадения)
    const attackBonus = Math.max(0, effectiveAttack - 10); // Бонус атаки сверх базовой (10)
    let finalDamage = baseSpinDamage + lineDamage + attackBonus;
    
    // Применяем антикарты противника к статистике атакующего для крита
    const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, target);
    
    // Проверяем крит (применяется к итоговому урону)
    const critResult = applyCritToDamage(finalDamage, attackerStatsWithAntiCards);
    finalDamage = Math.max(0, critResult.damage); // Убеждаемся что урон не может быть отрицательным или -0
    let isCrit = critResult.isCrit;
    
    // Флаг для отслеживания снижения урона броней
    let armorReduced = false;
    // Флаг для отслеживания уклонения
    let dodged = false;
    
    // Если 3+ бонусных символа - используем способность персонажа
    if (matches === 'bonus' && attacker.characterId) {
      const abilityResult = useCharacterAbility(attacker, target, roomId);
      if (abilityResult) {
        if (abilityResult.ability === 'damage' && abilityResult.damage) {
          // Применяем антикарты противника к статистике атакующего для крита
          const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, target);
          // Применяем крит к урону от способности
          const critResult = applyCritToDamage(abilityResult.damage, attackerStatsWithAntiCards);
          finalDamage = finalDamage + critResult.damage;
          isCrit = isCrit || critResult.isCrit;
        } else {
          finalDamage = 0;
          isCrit = false;
        }
        
        // Эффект регенерации при бонусе
        if (attacker.legendaryEffects && attacker.legendaryEffects.regeneration) {
          // Вычисляем количество HP, которое было бы восстановлено
          // Даже если HP уже максимальное, используем healing stat
          const potentialHeal = Math.max(
            attackerStats.maxHp - attacker.roundHp,
            attackerStats.healing || 0
          );
          
          // Наносим 20% от восстановленного здоровья как урон врагу
          if (potentialHeal > 0) {
            const regenerationDamage = Math.floor(potentialHeal * 0.2);
            // Применяем антикарты противника к статистике атакующего для крита
            const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, target);
            // Применяем крит к урону от регенерации
            const critResult = applyCritToDamage(regenerationDamage, attackerStatsWithAntiCards);
            const finalRegenDamage = critResult.damage;
            
            // Наносим урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
            target.roundHp = Math.max(0, target.roundHp - finalRegenDamage);
            if (finalRegenDamage > 0) {
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: fromPlayerSocketId,
                targetPlayerSocketId: targetPlayerSocketId,
                damage: finalRegenDamage,
                matches: 'regeneration',
                crit: critResult.isCrit,
                comboInfo: { type: 'regeneration', text: 'Регенерация', description: '20% от восстановленного HP' }
              });
            }
          }
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
        
        // Применяем урон от способности с учетом всех проверок
        if (abilityResult.ability === 'damage' && finalDamage > 0) {
          // Проверяем уклонение
          const dodgeRoll = Math.random() * 100;
          const dodgeReduction = getAntiCardEffect(target, CARD_TYPES.DODGE);
          let effectiveDodge = targetStats.dodge * (1 - dodgeReduction);
          
          if (dodgeRoll < effectiveDodge) {
            dodged = true;
            const originalDamage = finalDamage;
            finalDamage = 0;
            
            // Эффект отражения при уклонении
            // ВАЖНО: Отражённый урон наносится напрямую без проверки уклонения/отражения,
            // чтобы исключить бесконечные циклы отражения
            if (target.legendaryEffects && target.legendaryEffects.reflection) {
              let reflectedDamage = Math.floor(originalDamage * 0.5);
              // Применяем антикарты атакующего (attacker) к статистике цели (target) для крита
              const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, attacker);
              const critResult = applyCritToDamage(reflectedDamage, targetStatsWithAntiCards);
              reflectedDamage = critResult.damage;
              // Наносим отражённый урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
              attacker.roundHp = Math.max(0, attacker.roundHp - reflectedDamage);
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: targetPlayerSocketId,
                targetPlayerSocketId: fromPlayerSocketId,
                damage: reflectedDamage,
                matches: 'reflection',
                crit: critResult.isCrit,
                isReflected: true, // Флаг, что это отражённый урон (не может быть снова отражён)
                comboInfo: { type: 'reflection', text: 'Отражение', description: '50% уклоненного урона' }
              });
            }
          } else {
            // Применяем броню
            const originalDamageBeforeArmor = finalDamage; // Сохраняем урон до применения брони
            const armorReduction = getAntiCardEffect(target, CARD_TYPES.ARMOR);
            const effectiveArmor = targetStats.armor * (1 - armorReduction);
            finalDamage = Math.floor(finalDamage * (1 - effectiveArmor / 100));
            // Отмечаем что урон был снижен броней (если урон действительно уменьшился)
            if (finalDamage < originalDamageBeforeArmor && finalDamage > 0) {
              armorReduced = true;
            }
            
            // Эффект мстительного здоровья
            if (target.legendaryEffects && target.legendaryEffects.vengefulHealth) {
              const lostHp = target.roundHp - Math.max(0, target.roundHp - finalDamage);
              let revengeDamage = Math.floor(lostHp * 0.1);
              // Применяем антикарты атакующего (attacker) к статистике цели (target) для крита
              const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, attacker);
              const critResult = applyCritToDamage(revengeDamage, targetStatsWithAntiCards);
              revengeDamage = critResult.damage;
              attacker.roundHp = Math.max(0, attacker.roundHp - revengeDamage);
              if (revengeDamage > 0) {
                io.to(roomId).emit('attack', {
                  fromPlayerSocketId: targetPlayerSocketId,
                  targetPlayerSocketId: fromPlayerSocketId,
                  damage: revengeDamage,
                  matches: 'revenge',
                  crit: critResult.isCrit,
                  comboInfo: { type: 'revenge', text: 'Мщение', description: '10% от потерянного HP' }
                });
              }
            }
            
            // Применяем урон
            target.roundHp = Math.max(0, target.roundHp - finalDamage);
          }
        }
      }
    } else if (damage > 0) {
      // Обычный урон - проверяем щиты противника
      const shieldResult = absorbDamageWithShields(target, finalDamage);
      if (shieldResult.shieldsUsed > 0) {
        finalDamage = shieldResult.remainingDamage;
        io.to(roomId).emit('abilityUsed', {
          fromPlayerSocketId: targetPlayerSocketId,
          targetPlayerSocketId: fromPlayerSocketId,
          ability: 'block',
          message: `Урон заблокирован щитом (щитов осталось: ${target.shields ? target.shields.length : 0})`,
          damage: 0,
          shieldsUsed: shieldResult.shieldsUsed,
          shieldsRemaining: target.shields ? target.shields.length : 0
        });
      }
      
      if (finalDamage > 0) {
        // Проверяем уклонение (считается для каждого источника урона отдельно)
        const dodgeRoll = Math.random() * 100;
        const dodgeReduction = getAntiCardEffect(target, CARD_TYPES.DODGE);
        let effectiveDodge = targetStats.dodge * (1 - dodgeReduction);
        
        if (dodgeRoll < effectiveDodge) {
          dodged = true;
          const originalDamage = finalDamage;
          finalDamage = 0;
          
          // Эффект отражения при уклонении (50% от исходного урона)
          // ВАЖНО: Отражённый урон наносится напрямую без проверки уклонения/отражения,
          // чтобы исключить бесконечные циклы отражения
          if (target.legendaryEffects && target.legendaryEffects.reflection) {
            let reflectedDamage = Math.floor(originalDamage * 0.5);
            // Применяем антикарты атакующего (attacker) к статистике цели (target) для крита
            const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, attacker);
            // Применяем крит к отражённому урону (крит применяется от того, кто отражает)
            const critResult = applyCritToDamage(reflectedDamage, targetStatsWithAntiCards);
            reflectedDamage = critResult.damage;
            // Наносим отражённый урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
            attacker.roundHp = Math.max(0, attacker.roundHp - reflectedDamage);
            io.to(roomId).emit('attack', {
              fromPlayerSocketId: targetPlayerSocketId,
              targetPlayerSocketId: fromPlayerSocketId,
              damage: reflectedDamage,
              matches: 'reflection',
              crit: critResult.isCrit,
              isReflected: true, // Флаг, что это отражённый урон (не может быть снова отражён)
              comboInfo: { type: 'reflection', text: 'Отражение', description: '50% уклоненного урона' }
            });
          }
        } else {
          // Применяем броню
          const originalDamageBeforeArmor = finalDamage; // Сохраняем урон до применения брони
          const armorReduction = getAntiCardEffect(target, CARD_TYPES.ARMOR);
          const effectiveArmor = targetStats.armor * (1 - armorReduction);
          finalDamage = Math.max(0, Math.floor(finalDamage * (1 - effectiveArmor / 100)));
          // Отмечаем что урон был снижен броней (если урон действительно уменьшился)
          if (finalDamage < originalDamageBeforeArmor && finalDamage > 0) {
            armorReduced = true;
          }
          
          // Исправление бага: если урон стал 0, но у противника очень мало HP (<=2), применяем минимум 1 урон
          if (finalDamage === 0 && target.roundHp > 0 && target.roundHp <= 2) {
            finalDamage = 1;
          }
          
          // Эффект мстительного здоровья
          if (target.legendaryEffects && target.legendaryEffects.vengefulHealth) {
            const lostHp = target.roundHp - Math.max(0, target.roundHp - finalDamage);
            let revengeDamage = Math.floor(lostHp * 0.1);
            // Применяем антикарты атакующего (attacker) к статистике цели (target) для крита
            const targetStatsWithAntiCards = applyAntiCardsToStats(targetStats, attacker);
              // Применяем крит к мстительному урону (крит применяется от того, кто мстит)
              const critResult = applyCritToDamage(revengeDamage, targetStatsWithAntiCards);
              revengeDamage = critResult.damage;
              attacker.roundHp = Math.max(0, attacker.roundHp - revengeDamage);
            if (revengeDamage > 0) {
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: targetPlayerSocketId,
                targetPlayerSocketId: fromPlayerSocketId,
                damage: revengeDamage,
                matches: 'revenge',
                crit: critResult.isCrit,
                comboInfo: { type: 'revenge', text: 'Мщение', description: '10% от потерянного HP' }
              });
            }
          }
          
          target.roundHp = Math.max(0, target.roundHp - finalDamage);
        }
      }
      
      // Применяем лечение при спине
      if (attackerStats.healing > 0) {
        // Применяем антикарты лечения цели к лечению атакующего
        const healingReduction = getAntiCardEffect(target, CARD_TYPES.HEALING);
        const effectiveHealing = attackerStats.healing * (1 - healingReduction);
        const healAmount = effectiveHealing;
        const actualHeal = Math.min(attackerStats.maxHp - attacker.roundHp, healAmount);
        attacker.roundHp = Math.min(attackerStats.maxHp, attacker.roundHp + healAmount);
        io.to(roomId).emit('heal', {
          playerSocketId: fromPlayerSocketId,
          amount: actualHeal
        });
        
        // Эффект регенерации: наносим 20% от восстановленного здоровья как урон врагу
        // Даже если HP уже максимальное, считаем восстановление равным healAmount
        if (attacker.legendaryEffects && attacker.legendaryEffects.regeneration) {
          const regenerationDamage = Math.floor(healAmount * 0.2);
          // Применяем антикарты противника к статистике атакующего для крита
          const attackerStatsWithAntiCards = applyAntiCardsToStats(attackerStats, target);
          // Применяем крит к урону от регенерации
          const critResult = applyCritToDamage(regenerationDamage, attackerStatsWithAntiCards);
          const finalRegenDamage = critResult.damage;
          
          // Наносим урон напрямую, минуя логику обработки урона (уклонение, броня, отражение)
          target.roundHp = Math.max(0, target.roundHp - finalRegenDamage);
          if (finalRegenDamage > 0) {
            io.to(roomId).emit('attack', {
              fromPlayerSocketId: fromPlayerSocketId,
              targetPlayerSocketId: targetPlayerSocketId,
              damage: finalRegenDamage,
              matches: 'regeneration',
              crit: critResult.isCrit,
              comboInfo: { type: 'regeneration', text: 'Регенерация', description: '20% от восстановленного HP' }
            });
          }
        }
      }
      
      // Применяем заморозку (увеличиваем перезарядку противника)
      // Заморозка добавляется к базовому времени перезарядки (3000ms)
      if (attackerStats.freeze > 0) {
        // Учитываем анти-заморозку противника
        const freezeReduction = getAntiCardEffect(target, CARD_TYPES.FREEZE);
        const effectiveFreeze = attackerStats.freeze * (1 - freezeReduction);
        
        if (effectiveFreeze > 0) {
          const freezeTime = effectiveFreeze * 1000; // в миллисекундах
          const baseRechargeTime = 3000; // Базовое время перезарядки
          if (target.rechargeEndTime > now) {
            // Если уже идет перезарядка, добавляем время заморозки
            target.rechargeEndTime += freezeTime;
          } else {
            // Если перезарядка не идет, устанавливаем базовое время + заморозка
            target.rechargeEndTime = now + baseRechargeTime + freezeTime;
          }
          
          // Применяем fastStrike цели ПОСЛЕ всех модификаторов (включая заморозку)
          if (target.legendaryEffects && target.legendaryEffects.fastStrike) {
            const currentRechargeTime = target.rechargeEndTime - now;
            const reducedRechargeTime = Math.floor(currentRechargeTime * 0.5);
            target.rechargeEndTime = now + reducedRechargeTime;
          }
          
          // Отправляем обновление перезарядки противнику с учетом заморозки и fastStrike
          const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === targetPlayerSocketId);
          if (targetSocket) {
            const currentNow = Date.now();
            targetSocket.emit('spinRecharge', {
              playerSocketId: targetPlayerSocketId,
              rechargeTime: target.rechargeEndTime - currentNow,
              rechargeEndTime: target.rechargeEndTime,
              freezeApplied: effectiveFreeze
            });
          }
        }
      }
      
      // Применяем fastStrike атакующему ПОСЛЕ всех модификаторов
      if (attacker.legendaryEffects && attacker.legendaryEffects.fastStrike) {
        const currentRechargeTime = attacker.rechargeEndTime - now;
        const reducedRechargeTime = Math.floor(currentRechargeTime * 0.5);
        attacker.rechargeEndTime = now + reducedRechargeTime;
        
        // Отправляем обновление перезарядки атакующему
        socket.emit('spinRecharge', {
          playerSocketId: fromPlayerSocketId,
          rechargeTime: attacker.rechargeEndTime - now,
          rechargeEndTime: attacker.rechargeEndTime
        });
      }
      
      // Эффект ледяной кары (25 урона в секунду во время перезарядки спина противника)
      if (attacker.legendaryEffects && attacker.legendaryEffects.icePunishment) {
        // Инициализируем хранилище интервалов, если его нет
        if (!attacker.icePunishmentIntervals) {
          attacker.icePunishmentIntervals = {};
        }
        
        // Проверяем, не запущен ли уже интервал для этого противника
        if (!attacker.icePunishmentIntervals[targetPlayerSocketId]) {
          const iceDamage = 25;
          const iceInterval = setInterval(() => {
            const currentTarget = players.get(targetPlayerSocketId);
            const currentAttacker = players.get(fromPlayerSocketId);
            const now = Date.now();
            
            // Проверяем, жив ли противник и в дуэли
            if (!currentTarget || currentTarget.roundHp <= 0 || !currentTarget.isInDuel || 
                !currentAttacker || !currentAttacker.isInDuel) {
              // Очищаем интервал
              if (currentAttacker && currentAttacker.icePunishmentIntervals) {
                clearInterval(currentAttacker.icePunishmentIntervals[targetPlayerSocketId]);
                delete currentAttacker.icePunishmentIntervals[targetPlayerSocketId];
              }
              return;
            }
            
            // Проверяем, идет ли перезарядка спина у противника
            if (currentTarget.rechargeEndTime > now) {
              // Перезарядка идет - наносим урон
              // Пересчитываем статистику атакующего для проверки крита
              const currentAttackerStats = calculatePlayerStats(currentAttacker);
              // Применяем антикарты цели к статистике атакующего для крита
              const currentTargetAntiCards = currentTarget.antiCards || {};
              const currentAttackerStatsWithAntiCards = applyAntiCardsToStats(currentAttackerStats, currentTargetAntiCards);
              let actualIceDamage = iceDamage;
              // Применяем крит к урону от ледяной кары
              const critResult = applyCritToDamage(actualIceDamage, currentAttackerStatsWithAntiCards);
              actualIceDamage = critResult.damage;
              
              currentTarget.roundHp = Math.max(0, currentTarget.roundHp - actualIceDamage);
              io.to(roomId).emit('attack', {
                fromPlayerSocketId: fromPlayerSocketId,
                targetPlayerSocketId: targetPlayerSocketId,
                damage: actualIceDamage,
                matches: 'ice',
                crit: critResult.isCrit,
                comboInfo: { type: 'ice', text: '❄️ Абсолютный ноль', description: '25 урона в секунду во время перезарядки' }
              });
              updateRoomState(roomId);
              
              // Проверяем, не умер ли противник
              if (currentTarget.roundHp <= 0) {
                if (currentAttacker && currentAttacker.icePunishmentIntervals) {
                  clearInterval(currentAttacker.icePunishmentIntervals[targetPlayerSocketId]);
                  delete currentAttacker.icePunishmentIntervals[targetPlayerSocketId];
                }
              }
            }
            // Если перезарядка не идет, просто пропускаем цикл - не наносим урон
          }, 1000);
          
          // Сохраняем интервал
          attacker.icePunishmentIntervals[targetPlayerSocketId] = iceInterval;
        }
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
    
    // Отправляем атаку всем в комнате (включая уклонение)
    // Отправляем если есть урон, или это бонус, или было уклонение
    if (finalDamage > 0 || matches === 'bonus' || dodged) {
      io.to(roomId).emit('attack', {
        fromPlayerSocketId: fromPlayerSocketId,
        targetPlayerSocketId: targetPlayerSocketId,
        damage: finalDamage,
        matches: matches,
        crit: isCrit,
        dodged: dodged, // Флаг уклонения
        armorReduced: armorReduced, // Флаг снижения урона броней
        comboInfo: comboInfo
      });
    }
    
    // Обновляем состояние комнаты сразу после нанесения урона
    updateRoomState(roomId);
    
    // Проверяем, закончился ли бой
    if (target.roundHp <= 0) {
      // Проигравший теряет 20% от общего HP
      target.totalHp = Math.max(0, target.totalHp - Math.floor(target.totalHp * 0.2));
      
      // Проверяем и выбываем игрока, если totalHp <= 0
      checkAndEliminatePlayer(target);
      
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
      
      // Очищаем интервалы ледяной кары при завершении дуэли
      clearIcePunishmentIntervals(attacker);
      clearIcePunishmentIntervals(target);
      
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
    player.turnEndTime = Date.now(); // Сохраняем время окончания хода
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
    
    // Проверяем, что игрок не исключён
    if (player.isEliminated) {
      return; // Молча игнорируем для исключённых игроков
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
    
    // Проверяем, что игрок не исключён
    if (player.isEliminated) {
      return; // Молча игнорируем для исключённых игроков
    }
    
    const result = refreshCardShop(player);
    if (result.success) {
      updateRoomState(roomId);
      socket.emit('cardShopRefreshed', { success: true, message: result.message, offers: player.cardShopOffers });
    } else {
      socket.emit('cardShopRefreshed', { success: false, message: result.message });
    }
  });
  
  // Обработка готовности игрока к следующему раунду
  socket.on('selectItem', (data) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Игрок не найден' });
      return;
    }
    
    const roomId = player.roomId;
    if (!roomId) {
      socket.emit('error', { message: 'Игрок не в комнате' });
      return;
    }
    
    const itemId = data?.itemId;
    if (!itemId) {
      socket.emit('error', { message: 'Не указан ID предмета' });
      return;
    }
    
    handleItemSelection(socket.id, roomId, itemId);
  });

  socket.on('playerReady', (data) => {
    const { roomId } = data;
    const player = players.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!player || !room) {
      socket.emit('roomError', { message: 'Игрок или комната не найдены' });
      return;
    }
    
    // Проверяем, что игрок не исключён
    if (player.isEliminated) {
      return; // Молча игнорируем для исключённых игроков
    }
    
    // Проверяем, что сейчас перерыв
    if (!room.gameStateController || room.gameStateController.currentState !== GAME_STATES.BREAK) {
      socket.emit('roomError', { message: 'Сейчас не перерыв' });
      return;
    }
    
    // Устанавливаем готовность игрока
    player.isReady = true;
    updateRoomState(roomId);
    
    console.log(`Игрок ${player.nickname} готов к следующему раунду`);
    
    // Проверяем, все ли живые игроки готовы
    checkAllPlayersReady(roomId);
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
    
    // Очищаем интервалы ледяной кары при отключении
    if (player) {
      clearIcePunishmentIntervals(player);
    }
    
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
            // Очищаем интервалы ледяной кары у противника для отключившегося игрока
            if (opponent.icePunishmentIntervals && opponent.icePunishmentIntervals[socket.id]) {
              clearInterval(opponent.icePunishmentIntervals[socket.id]);
              delete opponent.icePunishmentIntervals[socket.id];
            }
          }
        }
        
        // Очищаем все интервалы ледяной кары, где отключившийся игрок был целью
        for (const [otherPlayerId, otherPlayer] of players.entries()) {
          if (otherPlayer && otherPlayer.icePunishmentIntervals && otherPlayer.icePunishmentIntervals[socket.id]) {
            clearInterval(otherPlayer.icePunishmentIntervals[socket.id]);
            delete otherPlayer.icePunishmentIntervals[socket.id];
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

