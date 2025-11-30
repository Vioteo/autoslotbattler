# Инструкция по деплою на Render

## Настройка на Render.com

1. **Создайте новый Web Service** на Render
2. **Подключите ваш GitHub репозиторий**
3. **Настройте следующие параметры:**

### Build & Deploy Settings:

- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: `.` (оставьте пустым или точку)

### Environment Variables:

- `NODE_ENV` = `production`
- `PORT` = `10000` (или оставьте пустым, Render автоматически назначит порт)

## Важно!

Если вы видите ошибку `Cannot find module '/opt/render/project/src/install'`:

1. Убедитесь, что в настройках сервиса:
   - **Build Command** = `npm install` (не `/opt/render/project/src/install`)
   - **Start Command** = `npm start` (не `/opt/render/project/src/install`)

2. Проверьте, что файл `render.yaml` находится в корне проекта

3. Если используете `render.yaml`, Render автоматически применит настройки из него

## Альтернатива: Ручная настройка

Если `render.yaml` не работает, настройте вручную в веб-интерфейсе Render:

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Auto-Deploy**: `Yes`

## Проверка

После деплоя проверьте:
- Сервис должен быть доступен по URL, который предоставит Render
- В логах должно быть: `Сервер запущен на порту ...`

