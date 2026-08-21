# 🧠 CEREBRO BINGOPRO — Documentación Maestra & Memoria de Sistema

Este archivo contiene el **Cerebro Operativo** completo de **BingoPro**, sirviendo como guía de conocimiento, reglas de negocio, arquitectura de código y referencia para desarrolladores e inteligencia artificial.

---

## 📌 1. Visión General del Proyecto

BingoPro es una plataforma profesional de Bingo online en tiempo real, 100% automatizada a través de WhatsApp y acompañada de un **Sistema Web Multi-Pantalla estilo Casino Las Vegas (SPA)** y un **Panel de Administración Web** con contabilidad financiera de doble entrada (*Double-Entry Ledger*).

### 💰 Parámetros Económicos (Reglas Activas)
- **Precio por Cartón (Sala Clásica):** `100.00 Bs`
- **Comisión de la Casa (Rake):** `15%`
- **Premio 1 Línea Horizontal:** `10%` del pote total
- **Premio 2 Líneas Horizontales:** `15%` del pote total
- **Premio Bingo Completo:** `60%` del pote total
- **Límite de Cartones:** Hasta `50` cartones por jugador por ronda
- **Intervalo entre Partidas:** Cada `5 minutos` (Automatizado en segundo plano)
- **Ventana de Ventas:** `60 segundos`
- **Mínimo de Jugadores:** `2` para iniciar partida (si no se cumple, se reembolsa automáticamente)
- **Método de Recarga:** Pago Móvil (aprobación atómica en 1 clic desde el Panel Admin)

---

## 🔑 2. Credenciales y Enlaces de Acceso Local

- **Servidor Web Principal:** `http://localhost:3000`
- **Panel Administrativo:** `http://localhost:3000`
  - **Usuario:** `admin`
  - **Contraseña:** `Heatox.227`
- **Plataforma Web Jugador (Casino Las Vegas SPA):** `http://localhost:3000/player.html`
- **Vinculador de WhatsApp (QR Code):** `http://localhost:3000/qr.html`
- **Repositorio GitHub Oficial:** `https://github.com/HeatoX/bingopro-whatsapp`

---

## 🎰 3. Plataforma Web del Jugador — Casino Las Vegas (player.html)

El portal del jugador está diseñado como una **Single Page Application (SPA)** de nivel casino internacional con navegación fluida entre 4 secciones principales:

```mermaid
graph LR
    L["🔑 Registro / Login"] --> A["🏠 Lobby Principal<br/>(#lobby)"]
    A --> B["🎮 Sala de Juego 3D<br/>(#room)"]
    A --> C["👤 Mi Perfil & Cartera<br/>(#profile)"]
    A --> D["🏦 Pago Móvil<br/>(Modal)"]
    B --> A
    C --> A
```

### 🌟 Secciones de la Plataforma:

1. **🔑 Registro / Login:** Formulario estilo cristal (*Glassmorphism*) con número de WhatsApp y nombre.
2. **🏠 Lobby Principal:**
   - **Salas de Bingo:** Bronce (50 Bs), Clásica En Vivo 🔴 (100 Bs), VIP Gold (250 Bs) y Diamante (500 Bs).
   - **Ticker Horizontal de Ganadores:** Ticker animado con últimos premios otorgados.
   - **Banner de Reglas & Premios:** Desglose porcentual de los pozos.
3. **👤 Mi Perfil & Cartera:**
   - Avatar personalizado con iniciales.
   - Saldo disponible en Bs con animación.
   - Botones de Recargar (Pago Móvil) y Retirar.
   - Estadísticas del jugador: partidas jugadas, cartones comprados y premios ganados.
4. **🎮 Sala de Juego en Vivo (Arena 3D):**
   - **🎰 Bombo Mecánico 3D con Física:** Jaula metálica giratoria con 18 bolillas numeradas rebotando en 3D, eje de bronce y reflejos de cristal.
   - **🗣️ Cantador de Voz en Español (`speechSynthesis`):** Pronuncia las bolillas cantadas (*"B-12"*, *"N-35"*).
   - **🔥 Detector "Near-Win" (1TG / 2TG):** Alerta en vivo cuando a un cartón le falta 1 o 2 números para el Bingo (`🔥 ¡FALTA 1!`).
   - **⚡ Pizarra LED Maestra 1-75:** 5 columnas B-I-N-G-O con colores temáticos e iluminación neón.
   - **🎟️ Auto-Tachado Inteligente:** Tachado en verde neón con sonido sintético.
   - **💬 Chat de la Comunidad:** Chat en tiempo real para interacción entre jugadores.

---

## 🔐 4. Sistema Financiero (Double-Entry Ledger)

Para prevenir cualquier descuadre financiero o saldo negativo:

1. **Cuentas del Sistema:**
   - `USER_REAL`: Billetera individual de cada jugador.
   - `HOUSE_ESCROW`: Billetera de custodia donde entran los fondos cobrados por cartones durante una ronda activa.
   - `HOUSE_REVENUE`: Billetera de la casa donde cae la comisión (15%).
   - `PAYMENT_GATEWAY`: Billetera para depósitos y retiros.

2. **Garantía ACID:** Todas las compras de cartones y distribución de premios se ejecutan en transacciones atómicas (`prisma.$transaction`) con bloqueos a nivel de fila (`FOR UPDATE`).

---

## ⚡ 5. Comandos del Bot de WhatsApp

| Comando | Acción |
|---------|--------|
| `!registro` | Registra al usuario en la base de datos |
| `!saldo` | Muestra el balance disponible en Bs |
| `!comprar [N]` | Compra de 1 a 50 cartones para la ronda actual |
| `!cartones` | Envía la imagen PNG de cada cartón del usuario |
| `!jugar` / `!panel` | Entrega el enlace de 1 toque al Casino Web 3D |
| `!recargar [monto] [ref]` | Registra reporte de pago para aprobación del Admin |
| `!retirar [monto]` | Registra solicitud de retiro de saldo |
| `!historial` | Muestra las últimas 10 transacciones |
| `!reglas` | Despliega reglas y porcentajes de premios |

---

## ☁️ 6. Despliegue 24/7 en la Nube (100% Gratis)

El proyecto está configurado para desplegarse de manera continua en la nube a través de **Render.com** o **Railway**:

1. Repositorio sincronizado en GitHub: `HeatoX/bingopro-whatsapp`.
2. Archivos de despliegue listos: `Procfile`, `railway.json`, `.gitignore`.
3. Script de construcción automática en `package.json`: `"postinstall": "prisma generate && tsc"`.
4. En Render.com:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`
   - **Environment Variable:** `ADMIN_PASSWORD` = `Heatox.227`

---
*BingoPro — Diseñado y construido con arquitectura de alta disponibilidad, seguridad financiera y experiencia Casino Las Vegas 3D.*
