# ☁️ Guía de Despliegue en la Nube 24/7 (GitHub + Hosting)

Esta guía explica cómo subir **BingoPro** a GitHub y desplegarlo en la nube para que funcione **24 horas al día, 7 días a la semana**, sin necesidad de tener tu computadora encendida.

---

## 📤 Paso 1: Subir el Proyecto a GitHub

1. Crea un nuevo repositorio privado en [GitHub](https://github.com/new) con el nombre `bingo-whatsapp`.
2. Abre la consola en la carpeta de tu proyecto `C:\Users\PABLO\Desktop\BINGO WHATSAPP` y ejecuta:

```bash
git init
git add .
git commit -m "BingoPro v1.0 - Sistema Automatizado de Bingo por WhatsApp"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/bingo-whatsapp.git
git push -u origin main
```

---

## 🚀 Paso 2: Opciones de Despliegue 24/7 (Elegir 1)

### Opción A: Railway.app (Recomendado - Gratis/Económico y Fácil)
1. Inicia sesión en [Railway.app](https://railway.app) con tu cuenta de GitHub.
2. Crea un **Nuevo Proyecto** -> **Deploy from GitHub repo** -> Selecciona `bingo-whatsapp`.
3. Agrega una base de datos PostgreSQL desde el botón **+ New** -> **Database** -> **Add PostgreSQL**.
4. En las variables de entorno (`Variables`) configura:
   - `DATABASE_URL` (se conecta automáticamente a la DB de Railway)
   - `ADMIN_PASSWORD`: Tu contraseña elegida
   - `CARD_PRICE_BS`: 100
   - `GAME_INTERVAL_MINUTES`: 5
5. Railway desplegará el sistema automáticamente y te dará un dominio público para el Panel Admin Web.

---

### Opción B: VPS / Servidor Dedicado (Ubuntu / Debian)
Si prefieres un servidor propio (ej: DigitalOcean, AWS, Hetzner, Contabo):

```bash
# 1. Clonar el repositorio
git clone https://github.com/TU_USUARIO/bingo-whatsapp.git
cd bingo-whatsapp

# 2. Instalar dependencias e iniciar Docker
npm install
docker-compose up -d

# 3. Aplicar esquema DB
npx prisma db push

# 4. Iniciar con PM2 (Servicio 24/7 en segundo plano)
npm install -g pm2
pm2 start dist/index.js --name "bingopro"
pm2 save
pm2 startup
```

---

## 📱 Conexión de WhatsApp en la Nube

Una vez desplegado en la nube (Railway o VPS):
1. Verás los logs del servidor mediante el dashboard o `pm2 logs`.
2. Escaneas el **código QR** desde tu teléfono una sola vez.
3. La sesión se guarda de forma persistente y el bot funcionará de manera ininterrumpida las 24 horas.
