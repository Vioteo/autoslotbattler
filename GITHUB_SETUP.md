# Инструкция по созданию репозитория на GitHub

## Шаг 1: Создайте репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Заполните форму:
   - **Repository name**: `burmalda` (или любое другое имя)
   - **Description**: "Сетевая веб-игра для 2 игроков"
   - **Visibility**: Public или Private (на ваше усмотрение)
   - **НЕ** создавайте README, .gitignore или лицензию (они уже есть в проекте)
3. Нажмите "Create repository"

## Шаг 2: Подключите локальный репозиторий к GitHub

После создания репозитория GitHub покажет вам команды. Выполните их в терминале:

```bash
git remote add origin https://github.com/Vioteo/burmalda.git
git branch -M main
git push -u origin main
```

**Важно:** Замените `Vioteo/burmalda` на ваше реальное имя пользователя и название репозитория!

## Альтернативный способ (через SSH)

Если у вас настроен SSH ключ:

```bash
git remote add origin git@github.com:Vioteo/burmalda.git
git branch -M main
git push -u origin main
```

## Если возникнут проблемы

Если GitHub требует аутентификацию:
- Используйте Personal Access Token вместо пароля
- Или настройте SSH ключи для более удобной работы

