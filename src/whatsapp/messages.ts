import { config } from '../config/env';

export function welcomeMessage(name: string): string {
    return `¡Hola *${name}*! 👋 Bienvenido a *BingoPro* 🎲\n\n` +
           `El sistema automatizado de bingo por WhatsApp más confiable y rápido.\n\n` +
           `*¿Cómo jugar?*\n` +
           `1. Usa \`!registro\` para crear tu cuenta.\n` +
           `2. Recarga saldo con \`!recargar\`.\n` +
           `3. Compra cartones con \`!comprar\`.\n` +
           `4. ¡Disfruta y gana!\n\n` +
           `Escribe \`!ayuda\` para ver todos los comandos.`;
}

export function balanceMessage(balance: number, currency: string = 'Bs'): string {
    return `💰 *Tu Saldo Actual*\n\n` +
           `Tienes: *${balance.toFixed(2)} ${currency}*\n\n` +
           `_Para recargar, usa el comando !recargar_`;
}

export function cardPurchaseConfirm(cardCount: number, totalCost: number, newBalance: number): string {
    return `✅ *¡Compra Exitosa!*\n\n` +
           `Has adquirido *${cardCount}* cartón(es).\n` +
           `Costo total: *${totalCost.toFixed(2)} Bs*\n` +
           `Saldo restante: *${newBalance.toFixed(2)} Bs*\n\n` +
           `_Tus cartones jugarán en la próxima ronda. Usa !cartones para verlos._`;
}

export function roundAnnouncement(roundNumber: number, timeToStartSeconds: number, currentPlayers: number): string {
    const timeStr = timeToStartSeconds >= 60 ? `${Math.round(timeToStartSeconds / 60)} min` : `${timeToStartSeconds}s`;
    return `🚨 *¡Próxima Ronda #${roundNumber}!* 🚨\n\n` +
           `⏰ Ventana de compra: *${timeStr}*\n` +
           `👥 Jugadores anotados: *${currentPlayers}*\n\n` +
           `¡No te quedes por fuera! Compra tus cartones con \`!comprar [cantidad]\``;
}

export function sellingOpenMessage(roundNumber: number, prizePool: number): string {
    return `🛒 *¡Ventas Abiertas para la Ronda #${roundNumber}!*\n\n` +
           `💰 Pote estimado inicial: *${prizePool.toFixed(2)} Bs*\n` +
           `💵 Precio por cartón: *${config.cardPriceBs.toFixed(2)} Bs*\n\n` +
           `Para participar envía: \`!comprar [cantidad]\``;
}

export function sellingClosedMessage(roundNumber: number, totalCards: number, prizePool: number): string {
    return `⛔ *Ventas Cerradas - Ronda #${roundNumber}* ⛔\n\n` +
           `📊 Total cartones vendidos: *${totalCards}*\n` +
           `💰 *POTE A REPARTIR: ${prizePool.toFixed(2)} Bs*\n\n` +
           `¡Preparando el sorteo! Mucha suerte a todos 🍀`;
}

export function ballDrawnMessage(ballNumber: number, column: string, sequence: number, totalBalls: number): string {
    return `🎱 *¡BOLILLA #${sequence}!* 🎱\n\n` +
           `Letra: *${column}*\n` +
           `Número: *${ballNumber}*\n\n` +
           `_(${sequence} de ${totalBalls} bolillas extraídas)_`;
}

export function winnerMessage(type: '1LINE' | '2LINES' | 'FULLCARD', winnerName: string, prize: number, roundNumber: number): string {
    const titles = {
        '1LINE': '🏆 ¡BINGO DE 1 LÍNEA! 🏆',
        '2LINES': '🏆 ¡BINGO DE 2 LÍNEAS! 🏆',
        'FULLCARD': '👑 ¡BINGO CARTÓN LLENO! 👑'
    };
    
    return `${titles[type]}\n\n` +
           `Ronda: #${roundNumber}\n` +
           `Ganador: *${winnerName}* 🎉\n` +
           `Premio: *${prize.toFixed(2)} Bs* 💰\n\n` +
           `_¡Felicidades al ganador!_`;
}

export function roundFinishedMessage(roundNumber: number, stats: { totalCards: number, prizePool?: number, totalPrize?: number, houseRake?: number, duration?: string, ballsDrawn?: number, winners?: any }): string {
    const prize = stats.prizePool ?? stats.totalPrize ?? 0;
    return `🏁 *Resumen Ronda #${roundNumber}* 🏁\n\n` +
           `Cartones jugados: *${stats.totalCards}*\n` +
           `Pote total: *${prize.toFixed(2)} Bs*\n` +
           `Bolillas extraídas: *${stats.ballsDrawn || 0}*\n\n` +
           `¡Gracias por jugar con BingoPro! En breve iniciamos una nueva ronda.`;
}


export function insufficientFundsMessage(required: number, available: number): string {
    return `❌ *Saldo Insuficiente*\n\n` +
           `Necesitas *${required.toFixed(2)} Bs* pero sólo tienes *${available.toFixed(2)} Bs*.\n\n` +
           `_Por favor, realiza una recarga usando !recargar_`;
}

export function depositInstructions(pagoMovilInfo: { banco: string, telefono: string, cedula: string }): string {
    return `🏦 *Instrucciones de Recarga (Pago Móvil)*\n\n` +
           `Por favor transfiere al siguiente Pago Móvil:\n` +
           `*Banco:* ${pagoMovilInfo.banco}\n` +
           `*Teléfono:* ${pagoMovilInfo.telefono}\n` +
           `*Cédula:* ${pagoMovilInfo.cedula}\n\n` +
           `Una vez hecho el pago, reporta usando el comando:\n` +
           `\`!recargar [monto] [referencia]\`\n\n` +
           `_Ejemplo: !recargar 100 123456_`;
}

export function helpMessage(): string {
    return `📚 *Comandos Disponibles de BingoPro* 📚\n\n` +
           `*Cuenta:*\n` +
           `👤 \`!registro\` - Crea tu cuenta en el sistema\n` +
           `💰 \`!saldo\` - Consulta tu saldo actual\n` +
           `📜 \`!historial\` - Ver tus últimas transacciones\n\n` +
           `*Juego:*\n` +
           `🛒 \`!comprar [N]\` - Compra N cartones (Max ${config.maxCardsPerPlayer})\n` +
           `🎟️ \`!cartones\` - Ver tus cartones activos\n` +
           `⚖️ \`!reglas\` - Conoce las reglas y premios\n` +
           `🔍 \`!verificar [ronda]\` - Verifica los resultados de una ronda\n\n` +
           `*Pagos:*\n` +
           `💸 \`!recargar [monto] [ref]\` - Reporta un depósito\n` +
           `🏧 \`!retirar [monto]\` - Solicita un retiro de ganancias`;
}

export function rulesMessage(): string {
    return `⚖️ *Reglas de BingoPro* ⚖️\n\n` +
           `1️⃣ El precio por cartón es de *${config.cardPriceBs} Bs*\n` +
           `2️⃣ Puedes comprar hasta *${config.maxCardsPerPlayer}* cartones por ronda\n` +
           `3️⃣ El juego comienza con mínimo *${config.minPlayersToStart}* jugadores\n\n` +
           `💰 *Distribución de Premios:*\n` +
           `• Línea Horizontal: *${config.prize1LinePercentage}%*\n` +
           `• Dos Líneas: *${config.prize2LinesPercentage}%*\n` +
           `• Cartón Lleno: *${config.prizeFullCardPercentage}%*\n` +
           `• Casa: *${config.housePercentage}%*\n\n` +
           `_El sistema verifica automáticamente los cartones y paga de inmediato al ganar._`;
}

export function historyMessage(transactions: Array<{ date: string, type: string, amount: number }>): string {
    if (transactions.length === 0) {
        return `📜 *Historial de Transacciones*\n\nNo tienes transacciones recientes.`;
    }
    
    let msg = `📜 *Últimas Transacciones*\n\n`;
    for (const tx of transactions) {
        const icon = tx.amount > 0 ? '🟢' : '🔴';
        const sign = tx.amount > 0 ? '+' : '';
        msg += `${icon} *${tx.type}* | ${sign}${tx.amount.toFixed(2)} Bs\n📅 _${tx.date}_\n\n`;
    }
    return msg;
}

export function errorMessage(error: string): string {
    return `⚠️ *Error del Sistema*\n\n` +
           `${error}\n\n` +
           `_Si el problema persiste, contacta al soporte._`;
}
