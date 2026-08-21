/* ═══════════════════════════════════════════════════
   BINGOPRO 3D — AAA CASINO ARENA ENGINE
   Voice Announcer, Physics Drum, Auto-Daub, Near-Win Detector
   ═══════════════════════════════════════════════════ */

let phone = localStorage.getItem('bp_phone') || '';
let soundOn = true;
let voiceOn = true;
let lastBallNum = null;
let drawnSet = new Set();
let prevCardHTML = {};

// ── URL param phone ──
const up = new URLSearchParams(location.search);
if (up.get('phone')) { phone = up.get('phone'); localStorage.setItem('bp_phone', phone); }

// ── SOUND ENGINE (Web Audio) ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;
function snd() { if (!actx) actx = new AudioCtx(); return actx; }

function playBallPop() {
  if (!soundOn) return;
  try {
    const c = snd(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(660, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, c.currentTime + .08);
    o.frequency.exponentialRampToValueAtTime(880, c.currentTime + .15);
    g.gain.setValueAtTime(.25, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + .2);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .2);
  } catch {}
}

function playDaub() {
  if (!soundOn) return;
  try {
    const c = snd(), o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1046, c.currentTime);
    g.gain.setValueAtTime(.12, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + .1);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .1);
  } catch {}
}

// ── SPANISH VOICE ANNOUNCER ──
function speakBall(column, number) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel(); // Stop prior speech
    const text = `${column}, ${number}`;
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'es-ES';
    msg.rate = 1.0;
    msg.pitch = 1.1;
    window.speechSynthesis.speak(msg);
  } catch {}
}

// ── PARTICLE / CONFETTI ENGINE ──
const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas.getContext('2d');
let particles = [];

function resizeFX() { fxCanvas.width = window.innerWidth; fxCanvas.height = window.innerHeight; }
resizeFX(); window.addEventListener('resize', resizeFX);

function spawnBurst(x, y, color, count = 25) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: .015 + Math.random() * .02,
      size: 2 + Math.random() * 4,
      color
    });
  }
}

function spawnConfetti(count = 120) {
  const colors = ['#FFD700','#FF1744','#00E5FF','#00FF6A','#D500F9','#FF9100','#FFFFFF'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * fxCanvas.width,
      y: -10 - Math.random() * 100,
      vx: (Math.random() - .5) * 4,
      vy: 2 + Math.random() * 4,
      life: 1,
      decay: .003 + Math.random() * .005,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rotV: (Math.random() - .5) * 10
    });
  }
}

function animateFX() {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += .12; p.life -= p.decay;
    if (p.rot !== undefined) p.rot += p.rotV;
    fxCtx.save();
    fxCtx.globalAlpha = p.life;
    fxCtx.fillStyle = p.color;
    if (p.rot !== undefined) {
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot * Math.PI / 180);
      fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2); fxCtx.fill();
    }
    fxCtx.restore();
  }
  requestAnimationFrame(animateFX);
}
animateFX();

// ── DOM REFS ──
const $id = id => document.getElementById(id);
const loginModal = $id('login-modal');
const app = $id('app');

// ── BUILD PIZARRA ──
function buildPizarra() {
  const cols = { B: [1,15], I: [16,30], N: [31,45], G: [46,60], O: [61,75] };
  for (const [letter, [lo, hi]] of Object.entries(cols)) {
    const container = $id(`piz-${letter}`);
    if (!container) continue;
    container.innerHTML = '';
    for (let n = lo; n <= hi; n++) {
      const d = document.createElement('div');
      d.className = 'piz-cell';
      d.id = `pc-${n}`;
      d.textContent = n;
      container.appendChild(d);
    }
  }
}
buildPizarra();

// ── INIT ──
if (!phone) { loginModal.classList.remove('hidden'); app.classList.add('hidden'); }
else { loginModal.classList.add('hidden'); app.classList.remove('hidden'); boot(); }

$id('btn-login').onclick = () => {
  snd();
  const v = $id('phone-input').value.trim().replace(/[^0-9]/g, '');
  if (!v) return alert('Ingresa tu número');
  phone = v; localStorage.setItem('bp_phone', phone);
  loginModal.classList.add('hidden'); app.classList.remove('hidden'); boot();
};

$id('btn-sound').onclick = () => { snd(); soundOn = !soundOn; $id('btn-sound').textContent = soundOn ? '🔊' : '🔇'; };
$id('btn-voice').onclick = () => {
  voiceOn = !voiceOn;
  $id('btn-voice').classList.toggle('active', voiceOn);
  if (voiceOn) speakBall('B', 12);
};

$id('btn-recargar').onclick = () => $id('dep-modal').classList.remove('hidden');
$id('dep-close').onclick = () => $id('dep-modal').classList.add('hidden');

document.querySelectorAll('.buy-btn').forEach(b => {
  b.onclick = () => { snd(); buyCards(parseInt(b.dataset.n)); };
});

$id('dep-submit').onclick = async () => {
  const amt = $id('dep-amt').value, ref = $id('dep-ref').value;
  if (!amt || !ref) return alert('Completa ambos campos');
  try {
    const r = await fetch('/api/player/deposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, amount: amt, referenceCode: ref })
    });
    const d = await r.json();
    d.success ? (alert('✅ Recarga registrada — será aprobada en breve'), $id('dep-modal').classList.add('hidden')) : alert('Error: ' + d.error);
  } catch { alert('Error de conexión'); }
};

// ── CHAT SYSTEM ──
$id('chat-send').onclick = () => sendChatMessage();
$id('chat-input').onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };

function sendChatMessage() {
  const input = $id('chat-input');
  const txt = input.value.trim();
  if (!txt) return;
  addChatMessage('Tú', txt);
  input.value = '';
}

function addChatMessage(user, text) {
  const box = $id('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="uname">${user}:</span> ${text}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function boot() {
  fetchProfile();
  poll();
  setInterval(poll, 2000);
  setInterval(fetchProfile, 4000);
  initDrum();
}

// ── PROFILE ──
async function fetchProfile() {
  if (!phone) return;
  try {
    const r = await (await fetch(`/api/player/me?phone=${phone}`)).json();
    if (r.name) {
      $id('hdr-name').textContent = r.name;
      $id('hdr-bal').textContent = r.balance.toFixed(2) + ' Bs';
      if (r.pagoMovil) {
        $id('pm-banco').textContent = r.pagoMovil.banco;
        $id('pm-tel').textContent = r.pagoMovil.telefono;
        $id('pm-ced').textContent = r.pagoMovil.cedula;
      }
    }
  } catch {}
}

// ── POLL GAME ──
async function poll() {
  try {
    const d = await (await fetch('/api/player/game')).json();
    if (!d.hasActiveGame) {
      $id('round-label').textContent = 'RONDA #--';
      $id('status-text').textContent = 'ESPERANDO PRÓXIMA RONDA…';
      $id('prog-bar').style.width = '0%';
      return;
    }

    $id('round-label').textContent = `RONDA #${d.roundNumber}`;
    $id('pot-value').textContent = d.prizePool.toFixed(2) + ' Bs';

    const statusMap = {
      WAITING: '⏳ PREPARANDO RONDA…',
      SELLING: '🛒 ¡VENTAS ABIERTAS — COMPRA AHORA!',
      DRAWING: `🔴 SORTEO EN VIVO — ${d.drawnBalls.length}/75`,
      PAUSED: '⏸️ RONDA PAUSADA',
      FINISHED: '🏁 RONDA FINALIZADA'
    };
    $id('status-text').textContent = statusMap[d.status] || d.status;
    $id('prog-bar').style.width = d.status === 'DRAWING'
      ? Math.min(100, (d.drawnBalls.length / 75) * 100) + '%'
      : d.status === 'SELLING' ? '20%' : d.status === 'FINISHED' ? '100%' : '0%';

    // Drawn set
    const newDrawn = new Set(d.drawnBalls.map(b => b.number));
    drawnSet = newDrawn;

    // Update pizarra
    for (let i = 1; i <= 75; i++) {
      const el = $id(`pc-${i}`);
      if (el) el.classList.toggle('lit', drawnSet.has(i));
    }

    // New ball?
    if (d.drawnBalls.length > 0) {
      const last = d.drawnBalls[d.drawnBalls.length - 1];
      if (lastBallNum !== last.number) {
        lastBallNum = last.number;
        onNewBall(last);
      }
    }

    // History strip
    renderHistory(d.drawnBalls.slice(-8).reverse());

    // Cards
    fetchCards();
  } catch {}
}

function onNewBall(ball) {
  // Update sphere
  const sphere = $id('cur-ball');
  sphere.className = `cur-ball ball-${ball.column.toLowerCase()} drop-in`;
  $id('cb-col').textContent = ball.column;
  $id('cb-num').textContent = ball.number;
  $id('cb-announce').textContent = `${ball.column} - ${ball.number}`;
  setTimeout(() => sphere.classList.remove('drop-in'), 650);

  // Glow correct BINGO header
  document.querySelectorAll('.bh').forEach(h => {
    h.className = 'bh';
    if (h.dataset.col === ball.column) {
      h.classList.add('glow-' + ball.column.toLowerCase());
    }
  });

  // Particle burst near ball
  const rect = sphere.getBoundingClientRect();
  const colorMap = { B: '#FFD700', I: '#00E5FF', N: '#00FF6A', G: '#D500F9', O: '#FF1744' };
  spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, colorMap[ball.column] || '#FFD700', 25);

  playBallPop();
  speakBall(ball.column, ball.number);
}

function renderHistory(balls) {
  const container = $id('history-balls');
  container.innerHTML = '';
  balls.forEach(b => {
    const d = document.createElement('div');
    d.className = `hs-ball col-${b.column.toLowerCase()}`;
    d.textContent = b.number;
    container.appendChild(d);
  });
}

// ── CARDS & NEAR-WIN DETECTOR ──
async function fetchCards() {
  if (!phone) return;
  try {
    const d = await (await fetch(`/api/player/my-cards?phone=${phone}`)).json();
    $id('card-count').textContent = d.cards ? d.cards.length : 0;
    if (!d.cards || !d.cards.length) {
      $id('cards-zone').innerHTML = '<div class="no-cards">Compra cartones arriba para jugar 🎲</div>';
      return;
    }
    const zone = $id('cards-zone');
    zone.innerHTML = '';
    d.cards.forEach(c => zone.appendChild(renderCard(c, d.drawnNumbers || [])));
  } catch {}
}

function renderCard(card, drawn) {
  const dSet = new Set(drawn);
  const div = document.createElement('div');
  div.className = 'bcard';

  // Near win calculation
  let totalMissing = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      const free = (r === 2 && c === 2) || n === 0;
      if (!free && !dSet.has(n)) totalMissing++;
    }
  }

  let nearBadge = '';
  if (totalMissing === 1) {
    nearBadge = '<span class="near-win-badge">🔥 ¡FALTA 1 PARA BINGO!</span>';
  } else if (totalMissing === 2) {
    nearBadge = '<span class="near-win-badge" style="border-color:#FF9100;color:#FF9100">⚡ ¡FALTAN 2!</span>';
  }

  let h = `<div class="bcard-hdr"><span>🎟️ #${card.cardNumber} ${nearBadge}</span><span>${card.hash}</span></div>`;
  h += '<table><thead><tr><th>B</th><th>I</th><th>N</th><th>G</th><th>O</th></tr></thead><tbody>';

  for (let r = 0; r < 5; r++) {
    h += '<tr>';
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      const free = (r === 2 && c === 2) || n === 0;
      const hit = free || dSet.has(n);
      const key = `${card.id}-${r}-${c}`;
      const wasHit = prevCardHTML[key];
      const isNew = hit && !wasHit;
      prevCardHTML[key] = hit;

      if (free) {
        h += '<td class="free">★</td>';
      } else if (hit) {
        h += `<td class="daubed ${isNew ? 'daubed-new' : ''}">${n}</td>`;
        if (isNew) playDaub();
      } else {
        h += `<td>${n}</td>`;
      }
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  div.innerHTML = h;
  return div;
}

// ── BUY CARDS ──
async function buyCards(count) {
  if (!phone) return alert('Identifícate primero');
  try {
    const r = await fetch('/api/player/buy-cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, count })
    });
    const d = await r.json();
    if (d.success) {
      spawnConfetti(80);
      alert(`🎉 ¡${d.count} cartón(es) comprados!`);
      fetchProfile(); fetchCards();
    } else {
      alert('❌ ' + d.error);
    }
  } catch { alert('Error de conexión'); }
}

// ── 3D MECHANICAL DRUM (Canvas) ──
function initDrum() {
  const cv = $id('drum-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2, R = 85;

  const drumBalls = [];
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (R - 14);
    drumBalls.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      vx: (Math.random() - .5) * 3,
      vy: (Math.random() - .5) * 3,
      r: 8 + Math.random() * 4,
      hue: Math.floor(Math.random() * 360)
    });
  }

  let rotation = 0;

  function tick() {
    ctx.clearRect(0, 0, W, H);
    rotation += .02;

    ctx.save();
    ctx.translate(cx, cy);

    for (let ring = 0; ring < 3; ring++) {
      ctx.save();
      ctx.rotate(rotation + ring * Math.PI / 3);
      ctx.strokeStyle = `rgba(255,215,0,${.12 + ring * .05})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * .65, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let s = 0; s < 12; s++) {
      ctx.save();
      ctx.rotate(rotation + s * Math.PI / 6);
      ctx.strokeStyle = 'rgba(0,229,255,.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, 0);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    for (const b of drumBalls) {
      b.vy += .15;
      b.vx += Math.cos(rotation * 3) * .12;
      b.vy += Math.sin(rotation * 3) * .08;

      b.x += b.vx;
      b.y += b.vy;

      const dx = b.x - cx, dy = b.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist + b.r > R - 4) {
        const nx = dx / dist, ny = dy / dist;
        b.x = cx + nx * (R - b.r - 4);
        b.y = cy + ny * (R - b.r - 4);
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx * .7;
        b.vy -= 2 * dot * ny * .7;
        b.vx *= .85;
        b.vy *= .85;
      }

      for (const b2 of drumBalls) {
        if (b2 === b) continue;
        const ddx = b2.x - b.x, ddy = b2.y - b.y;
        const d2 = Math.sqrt(ddx * ddx + ddy * ddy);
        const minD = b.r + b2.r;
        if (d2 < minD && d2 > 0) {
          const overlap = minD - d2;
          const nnx = ddx / d2, nny = ddy / d2;
          b.x -= nnx * overlap * .5;
          b.y -= nny * overlap * .5;
          b2.x += nnx * overlap * .5;
          b2.y += nny * overlap * .5;
          const rel = (b.vx - b2.vx) * nnx + (b.vy - b2.vy) * nny;
          b.vx -= nnx * rel * .5;
          b.vy -= nny * rel * .5;
          b2.vx += nnx * rel * .5;
          b2.vy += nny * rel * .5;
        }
      }

      const grad = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, b.r * .1, b.x, b.y, b.r);
      grad.addColorStop(0, `hsl(${b.hue},90%,75%)`);
      grad.addColorStop(.6, `hsl(${b.hue},80%,50%)`);
      grad.addColorStop(1, `hsl(${b.hue},70%,25%)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.ellipse(b.x - b.r * .25, b.y - b.r * .3, b.r * .35, b.r * .2, -.5, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }
  tick();
}
