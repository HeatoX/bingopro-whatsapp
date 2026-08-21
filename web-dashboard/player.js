let currentPhone = localStorage.getItem('bingopro_phone') || '';
let soundEnabled = true;
let drawnNumbersSet = new Set();
let lastDrawnNumber = null;

// Sound Engine using Web Audio API (Zero external audio file dependency!)
class SoundEngine {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playBallDraw() {
        if (!soundEnabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch {}
    }

    playDaub() {
        if (!soundEnabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.08); // E5
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        } catch {}
    }

    playWinFanfare() {
        if (!soundEnabled || !this.ctx) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.1);
                gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.1);
                gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + idx * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(this.ctx.currentTime + idx * 0.1);
                osc.stop(this.ctx.currentTime + idx * 0.1 + 0.3);
            });
        } catch {}
    }
}

const audio = new SoundEngine();

// DOM Elements
const loginModal = document.getElementById('login-modal');
const phoneInput = document.getElementById('phone-input');
const btnLogin = document.getElementById('btn-login');

const playerNameEl = document.getElementById('player-name');
const playerBalanceEl = document.getElementById('player-balance');
const btnSound = document.getElementById('btn-sound');

const roundTitleEl = document.getElementById('round-title');
const prizePoolValEl = document.getElementById('prize-pool-val');

const ballSphere = document.getElementById('ball-3d-sphere');
const ballLetterEl = document.getElementById('ball-letter');
const ballNumberEl = document.getElementById('ball-number');
const pizarraGrid = document.getElementById('pizarra-grid');

const gameStatusText = document.getElementById('game-status-text');
const gameProgress = document.getElementById('game-progress');

const cardsContainer = document.getElementById('cards-container');
const myCardCount = document.getElementById('my-card-count');

const depositModal = document.getElementById('deposit-modal');
const btnDepositOpen = document.getElementById('btn-deposit-open');
const btnDepositClose = document.getElementById('btn-deposit-close');
const btnSubmitDep = document.getElementById('btn-submit-dep');

// Check URL param for phone
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('phone')) {
    currentPhone = urlParams.get('phone');
    localStorage.setItem('bingopro_phone', currentPhone);
}

// Build Pizarra 1-75 LED Grid
function buildPizarra() {
    pizarraGrid.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        const cell = document.createElement('div');
        cell.className = 'piz-cell';
        cell.id = `piz-${i}`;
        cell.textContent = i;
        pizarraGrid.appendChild(cell);
    }
}
buildPizarra();

// Init App
if (!currentPhone) {
    loginModal.classList.remove('hidden');
} else {
    loginModal.classList.add('hidden');
    initApp();
}

btnLogin.addEventListener('click', () => {
    audio.init();
    const val = phoneInput.value.trim();
    if (!val) return alert('Ingresa tu número');
    currentPhone = val.replace(/[^0-9]/g, '');
    localStorage.setItem('bingopro_phone', currentPhone);
    loginModal.classList.add('hidden');
    initApp();
});

btnSound.addEventListener('click', () => {
    audio.init();
    soundEnabled = !soundEnabled;
    btnSound.textContent = soundEnabled ? '🔊' : '🔇';
});

btnDepositOpen.addEventListener('click', () => depositModal.classList.remove('hidden'));
btnDepositClose.addEventListener('click', () => depositModal.classList.add('hidden'));

document.querySelectorAll('.btn-buy-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
        audio.init();
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
    setInterval(fetchProfile, 4000);
    initDrumCanvas();
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
            roundTitleEl.textContent = 'RONDA #--';
            gameStatusText.textContent = 'ESPERANDO PRÓXIMA RONDA...';
            gameProgress.style.width = '0%';
            return;
        }

        roundTitleEl.textContent = `RONDA #${data.roundNumber}`;
        prizePoolValEl.textContent = `${data.prizePool.toFixed(2)} Bs`;

        if (data.status === 'SELLING') {
            gameStatusText.textContent = '🛒 VENTAS ABIERTAS — ¡COMPRA TUS CARTONES!';
            gameProgress.style.width = '25%';
        } else if (data.status === 'DRAWING') {
            gameStatusText.textContent = `🔴 SORTEO EN VIVO (${data.drawnBalls.length}/75 BOLILLAS)`;
            gameProgress.style.width = `${Math.min(100, (data.drawnBalls.length / 75) * 100)}%`;
        } else if (data.status === 'FINISHED') {
            gameStatusText.textContent = '🏁 RONDA FINALIZADA';
            gameProgress.style.width = '100%';
        }

        // Update Pizarra Grid
        drawnNumbersSet = new Set(data.drawnBalls.map(b => b.number));
        for (let i = 1; i <= 75; i++) {
            const cell = document.getElementById(`piz-${i}`);
            if (cell) {
                if (drawnNumbersSet.has(i)) {
                    cell.classList.add('lit');
                } else {
                    cell.classList.remove('lit');
                }
            }
        }

        // Active 3D Drop Ball Update
        if (data.drawnBalls.length > 0) {
            const last = data.drawnBalls[data.drawnBalls.length - 1];
            if (lastDrawnNumber !== last.number) {
                lastDrawnNumber = last.number;
                ballLetterEl.textContent = last.column;
                ballNumberEl.textContent = last.number;

                // Color class by column
                ballSphere.className = `ball-3d ball-${last.column.toLowerCase()} drop-anim`;
                setTimeout(() => ballSphere.classList.remove('drop-anim'), 600);

                audio.playBallDraw();
            }
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
            cardsContainer.innerHTML = '<div class="empty-cards-notice">No tienes cartones en esta ronda. ¡Compra uno arriba para jugar!</div>';
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
    div.className = 'cyber-card-grid';

    let html = `
        <div class="card-top-info">
            <span>🎟️ CARTÓN #${card.cardNumber}</span>
            <span>ID: ${card.hash}</span>
        </div>
        <table class="bingo-table">
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
            audio.playDaub();
            alert(`🎉 ¡Compraste ${data.count} cartón(es) con éxito!`);
            fetchProfile();
            fetchMyCards();
        } else {
            alert('Error: ' + data.error);
        }
    } catch { alert('Error al realizar la compra.'); }
}

// 3D Canvas Rotating Drum Animation
function initDrumCanvas() {
    const canvas = document.getElementById('drum-3d-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let angle = 0;

    function drawDrum() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Center
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 65;

        // Outer Cage Glow
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner Spokes
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(radius, 0);
            ctx.stroke();
        }

        // Bouncing Balls inside cage
        for (let b = 0; b < 6; b++) {
            const bx = Math.cos(angle * 2 + b) * (radius - 20);
            const by = Math.sin(angle * 3 + b) * (radius - 20);
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(bx, by, 7, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        angle += 0.03;
        requestAnimationFrame(drawDrum);
    }

    drawDrum();
}
