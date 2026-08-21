let currentPhone = localStorage.getItem('bingopro_phone') || '';
let currentRoundId = '';
let drawnNumbersSet = new Set();

// Elements
const loginModal = document.getElementById('login-modal');
const phoneInput = document.getElementById('phone-input');
const btnLogin = document.getElementById('btn-login');

const playerNameEl = document.getElementById('player-name');
const playerBalanceEl = document.getElementById('player-balance');

const roundTitleEl = document.getElementById('round-title');
const prizePoolValEl = document.getElementById('prize-pool-val');

const mainBall = document.getElementById('main-ball');
const mainBallLetter = document.getElementById('main-ball-letter');
const mainBallNum = document.getElementById('main-ball-num');
const ballsStrip = document.getElementById('drawn-balls-strip');

const gameStatusText = document.getElementById('game-status-text');
const gameProgress = document.getElementById('game-progress');

const cardsContainer = document.getElementById('cards-container');
const myCardCount = document.getElementById('my-card-count');

const depositModal = document.getElementById('deposit-modal');
const btnDepositOpen = document.getElementById('btn-deposit-open');
const btnDepositClose = document.getElementById('btn-deposit-close');
const btnSubmitDep = document.getElementById('btn-submit-dep');

// Check URL params for phone
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('phone')) {
    currentPhone = urlParams.get('phone');
    localStorage.setItem('bingopro_phone', currentPhone);
}

// Init
if (!currentPhone) {
    loginModal.classList.remove('hidden');
} else {
    loginModal.classList.add('hidden');
    initApp();
}

btnLogin.addEventListener('click', () => {
    const val = phoneInput.value.trim();
    if (!val) return alert('Ingresa tu número');
    currentPhone = val.replace(/[^0-9]/g, '');
    localStorage.setItem('bingopro_phone', currentPhone);
    loginModal.classList.add('hidden');
    initApp();
});

btnDepositOpen.addEventListener('click', () => depositModal.classList.remove('hidden'));
btnDepositClose.addEventListener('click', () => depositModal.classList.add('hidden'));

// Store Buy Buttons
document.querySelectorAll('.btn-buy-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
        const count = parseInt(btn.getAttribute('data-count'));
        await buyCards(count);
    });
});

btnSubmitDep.addEventListener('click', async () => {
    const amount = document.getElementById('dep-amount').value;
    const ref = document.getElementById('dep-ref').value;
    if (!amount || !ref) return alert('Ingresa el monto y la referencia');

    try {
        const res = await fetch('/api/player/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, amount, referenceCode: ref })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Recarga registrada. Será aprobada en breve.');
            depositModal.classList.add('hidden');
        } else {
            alert('Error: ' + data.error);
        }
    } catch { alert('Error de conexión'); }
});

function initApp() {
    fetchProfile();
    pollGame();
    setInterval(pollGame, 2000);
    setInterval(fetchProfile, 5000);
}

async function fetchProfile() {
    if (!currentPhone) return;
    try {
        const res = await fetch(`/api/player/me?phone=${currentPhone}`);
        const data = await res.json();
        if (data.name) {
            playerNameEl.textContent = data.name;
            playerBalanceEl.textContent = `${data.balance.toFixed(2)} Bs`;
            if (data.pagoMovil) {
                document.getElementById('pm-banco').textContent = data.pagoMovil.banco;
                document.getElementById('pm-phone').textContent = data.pagoMovil.telefono;
                document.getElementById('pm-cedula').textContent = data.pagoMovil.cedula;
            }
        }
    } catch {}
}

async function pollGame() {
    try {
        const res = await fetch('/api/player/game');
        const data = await res.json();

        if (!data.hasActiveGame) {
            roundTitleEl.textContent = 'Ronda #--';
            gameStatusText.textContent = 'Esperando próxima ronda...';
            gameProgress.style.width = '0%';
            return;
        }

        roundTitleEl.textContent = `Ronda #${data.roundNumber}`;
        prizePoolValEl.textContent = `${data.prizePool.toFixed(2)} Bs`;

        if (data.status === 'SELLING') {
            gameStatusText.textContent = '🛒 Ventas Abiertas — ¡Compra tus cartones!';
            gameProgress.style.width = '30%';
        } else if (data.status === 'DRAWING') {
            gameStatusText.textContent = `🔴 Sorteo en curso (${data.drawnBalls.length}/75 bolillas)`;
            gameProgress.style.width = `${Math.min(100, (data.drawnBalls.length / 75) * 100)}%`;
        } else if (data.status === 'FINISHED') {
            gameStatusText.textContent = '🏁 Ronda Finalizada — Calculando ganadores';
            gameProgress.style.width = '100%';
        }

        // Balls display
        drawnNumbersSet = new Set(data.drawnBalls.map(b => b.number));
        if (data.drawnBalls.length > 0) {
            const last = data.drawnBalls[data.drawnBalls.length - 1];
            if (mainBallNum.textContent !== last.number.toString()) {
                mainBallLetter.textContent = last.column;
                mainBallNum.textContent = last.number;
                mainBall.classList.add('pop');
                setTimeout(() => mainBall.classList.remove('pop'), 400);
            }

            // Strip
            ballsStrip.innerHTML = '';
            const recent = data.drawnBalls.slice(-6).reverse();
            recent.forEach(b => {
                const mini = document.createElement('div');
                mini.className = 'mini-ball';
                mini.textContent = `${b.column}${b.number}`;
                ballsStrip.appendChild(mini);
            });
        }

        fetchMyCards();
    } catch {}
}

async function fetchMyCards() {
    if (!currentPhone) return;
    try {
        const res = await fetch(`/api/player/my-cards?phone=${currentPhone}`);
        const data = await res.json();

        myCardCount.textContent = data.cards ? data.cards.length : 0;

        if (!data.cards || data.cards.length === 0) {
            cardsContainer.innerHTML = '<div class="empty-cards">No tienes cartones en esta ronda. ¡Compra uno arriba para jugar!</div>';
            return;
        }

        cardsContainer.innerHTML = '';
        data.cards.forEach(card => {
            const cardEl = renderBingoCard(card, data.drawnNumbers || []);
            cardsContainer.appendChild(cardEl);
        });
    } catch {}
}

function renderBingoCard(card, drawnNumbers) {
    const drawnSet = new Set(drawnNumbers);
    const div = document.createElement('div');
    div.className = 'bingo-card';

    let html = `
        <div class="card-header-bar">
            <span>🎟️ Cartón #${card.cardNumber}</span>
            <span>ID: ${card.hash}</span>
        </div>
        <table class="grid-table">
            <thead>
                <tr><th>B</th><th>I</th><th>N</th><th>G</th><th>O</th></tr>
            </thead>
            <tbody>
    `;

    for (let r = 0; r < 5; r++) {
        html += '<tr>';
        for (let c = 0; c < 5; c++) {
            const num = card.grid[r][c];
            const isFree = (r === 2 && c === 2) || num === 0;
            const isDaubed = isFree || drawnSet.has(num);

            if (isFree) {
                html += '<td class="free">LIBRE</td>';
            } else {
                html += `<td class="${isDaubed ? 'daubed' : ''}">${num}</td>`;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    div.innerHTML = html;
    return div;
}

async function buyCards(count) {
    if (!currentPhone) return alert('Identifícate primero');
    try {
        const res = await fetch('/api/player/buy-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, count })
        });
        const data = await res.json();
        if (data.success) {
            alert(`🎉 ¡Compraste ${data.count} cartón(es) con éxito!`);
            fetchProfile();
            fetchMyCards();
        } else {
            alert('Error: ' + data.error);
        }
    } catch { alert('Error al realizar la compra.'); }
}
