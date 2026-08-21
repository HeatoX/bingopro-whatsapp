# 🧠 CEREBRO BINGOPRO — Documentación Maestra & Memoria de Sistema

Este archivo contiene el **Cerebro Operativo** completo de **BingoPro**, sirviendo como guía de conocimiento, reglas de negocio, arquitectura de código y referencia para desarrolladores e inteligencia artificial.

---

## 📌 1. Visión General del Proyecto

BingoPro es una plataforma profesional de Bingo online en tiempo real, 100% automatizada a través de WhatsApp y acompañada de una **Arena de Juego Web 3D AAA para Jugadores** y un **Panel de Administración Web** con contabilidad financiera de doble entrada (*Double-Entry Ledger*).

### 💰 Parámetros Económicos (Reglas Activas)
- **Precio por Cartón:** `100.00 Bs`
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
- **Arena Web 3D del Jugador:** `http://localhost:3000/player.html`
- **Vinculador de WhatsApp (QR Code):** `http://localhost:3000/qr.html`
- **Repositorio GitHub Oficial:** `https://github.com/HeatoX/bingopro-whatsapp`

---

## 🎰 3. Arena de Juego 3D para Jugadores (player.html)

El proyecto cuenta con un portal de juego web de nivel Casino Internacional con las siguientes tecnologías:

1. **🎰 Bombo Mecánico 3D con Física:**
   - Animación Canvas 2D/3D con 12 esferas rebotando en tiempo real con gravedad y colisiones reales.
   - Animación de caída en zoom (*Drop-In*) con explosión de partículas de colores al salir cada bolilla.

2. **🗣️ Cantador de Voz en Español (Voice Announcer):**
   - El sistema canta las bolillas en español automáticamente (*"B-12"*, *"N-35"*, *"¡Bingo!"*) usando `window.speechSynthesis`.

3. **🔥 Detector Inteligente "Near-Win" (1TG / 2TG):**
   - Identificación automática de cartones a 1 o 2 números de ganar con insignias parpadeantes (`🔥 ¡FALTA 1 PARA BINGO!`).

4. **⚡ Pizarra Maestra Oficial 1-75 (LED Dynamic Matrix):**
   - Tablero LED de alto contraste organizado por 5 columnas temáticas (**B**=Dorado, **I**=Cyan, **N**=Verde, **G**=Morado, **O**=Rojo) que se iluminan al ser cantadas.

5. **🎟️ Cartones con Auto-Tachado Inteligente:**
   - Marca automática en verde neón brillante (`#00FF6A`) con efecto de sello (*Stamp-In*) al salir cada bolilla.

6. **🏆 Banner Flotante de Ganadores:**
   - Cartel animado estilo Casino Vegas que aparece solo cuando hay un ganador y se oculta automáticamente a los 6 segundos.

7. **💬 Chat de la Comunidad en Vivo:**
   - Chat interactivo en tiempo real integrado en la pantalla de juego.

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
| `!jugar` / `!panel` | Entrega el enlace de 1 toque a la Arena Web 3D |
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
*BingoPro — Diseñado y construido con arquitectura de alta disponibilidad, seguridad financiera y experiencia 3D premium.*
