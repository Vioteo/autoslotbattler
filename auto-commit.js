#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

// Функция для выполнения команд git
function execGit(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (!options.silent) {
      console.error(`Ошибка выполнения: ${command}`);
      console.error(error.message);
    }
    throw error;
  }
}

// Получаем сообщение коммита из аргументов или используем дефолтное
const commitMessage = process.argv[2] || `Auto-commit: ${new Date().toLocaleString('ru-RU')}`;

try {
  // Проверяем, есть ли изменения
  const status = execGit('git status --porcelain', { silent: true });
  
  if (!status.trim()) {
    console.log('ℹ️  Нет изменений для коммита');
    process.exit(0);
  }

  console.log('📝 Обнаружены изменения, создаю коммит...');
  
  // Добавляем все изменения
  execGit('git add .');
  
  // Создаем коммит
  execGit(`git commit -m "${commitMessage}"`);
  
  console.log('✅ Коммит создан успешно');
  
  // Пытаемся отправить (если есть удаленный репозиторий)
  try {
    execGit('git push', { silent: true });
    console.log('🚀 Изменения отправлены на сервер');
  } catch (pushError) {
    console.log('⚠️  Не удалось отправить изменения (возможно, нет удаленного репозитория или нет прав)');
  }
  
} catch (error) {
  console.error('❌ Ошибка при создании коммита:', error.message);
  process.exit(1);
}

