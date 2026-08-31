/* ═══════════════════════════════════════════════════════════════
   BINGOPRO ROYAL 3D — FULL SPA ENGINE
   Apuestas Royal Style: Lobby, Promos, Quick Buy Pills, 3D Physics Drum,
   User Profile, Double-Entry Ledger Wallet & Instant Withdrawals
   ═══════════════════════════════════════════════════════════════ */

let phone = localStorage.getItem('bp_phone') || '';
let userName = localStorage.getItem('bp_name') || '';
let userToken = localStorage.getItem('bp_token') || '';
let soundOn = true, voiceOn = true;
let lastBallNum = null;
let drawnSet = new Set();
let prevDaub = {};
let pollTimer = null;
let serverCardPrice = 100;

// Phase winners tracking
let currentWinner1Line = null;
let currentWinner2Lines = null;
let currentWinnerFullCard = null;

const $id = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ═══ SOUND ENGINE ═══
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;
function snd() { if (!actx) actx = new AudioCtx(); return actx; }

function playPop() {
  if (!soundOn) return;
  try {
    const c = snd(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(660, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, c.currentTime + .08);
    o.frequency.exponentialRampToValueAtTime(880, c.currentTime + .15);
    g.gain.setValueAtTime(.22, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + .2);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .2);
  } catch {}
}
function playDaub() {
  if (!soundOn) return;
  try {
    const c = snd(), o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1046, c.currentTime);
    g.gain.setValueAtTime(.1, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + .1);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .1);
  } catch {}
}
function speakBall(col, num) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(`${col}, ${num}`); u.lang = 'es-ES'; u.rate = 1; u.pitch = 1.1; speechSynthesis.speak(u); } catch {}
}

// ═══ PARTICLE / CONFETTI ENGINE ═══
const fxC = $id('fx-canvas'), fxX = fxC.getContext('2d');
let particles = [];
function resizeFX() { fxC.width = innerWidth; fxC.height = innerHeight; }
resizeFX(); addEventListener('resize', resizeFX);

function burst(x, y, color, n = 25) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1, decay: .015 + Math.random() * .02, size: 2 + Math.random() * 4, color }); }
}
function confetti(n = 120) {
  const colors = ['#FFD700','#FF1744','#00E5FF','#00FF6A','#D500F9','#FF9100','#FFF'];
  for (let i = 0; i < n; i++) particles.push({ x: Math.random() * fxC.width, y: -10 - Math.random() * 80, vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4, life: 1, decay: .003 + Math.random() * .005, size: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 360, rotV: (Math.random() - .5) * 10 });
}
function animFX() {
  fxX.clearRect(0, 0, fxC.width, fxC.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += .12; p.life -= p.decay;
    if (p.rot !== undefined) p.rot += p.rotV;
    fxX.save(); fxX.globalAlpha = p.life; fxX.fillStyle = p.color;
    if (p.rot !== undefined) { fxX.translate(p.x, p.y); fxX.rotate(p.rot * Math.PI / 180); fxX.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
    else { fxX.beginPath(); fxX.arc(p.x, p.y, p.size, 0, Math.PI * 2); fxX.fill(); }
    fxX.restore();
  }
  requestAnimationFrame(animFX);
}
animFX();

// ═══ SPA ROUTER ═══
function showScreen(name) {
  ['lobby', 'profile', 'room'].forEach(s => {
    const el = $id(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  $$('.lt-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name || (name === 'lobby' && t.dataset.tab === 'rooms')));
  if (name === 'room') { initDrum(); fetchCards(); }
  if (name === 'profile') refreshProfile();
  if (name === 'lobby') refreshLobby();
}

// ── NAV EVENTS ──
$$('.bn-item').forEach(b => b.onclick = () => { snd(); showScreen(b.dataset.screen); });
$$('.btn-back').forEach(b => b.onclick = () => showScreen(b.dataset.to));
$$('.btn-change-room').forEach(b => b.onclick = () => showScreen(b.dataset.to));
const btnClassic = $id('btn-enter-classic');
if (btnClassic) btnClassic.onclick = () => { snd(); showScreen('room'); };
if ($id('nav-profile-btn')) $id('nav-profile-btn').onclick = () => showScreen('profile');
if ($id('btn-topbar-profile')) $id('btn-topbar-profile').onclick = () => showScreen('profile');
if ($id('brand-home-btn')) $id('brand-home-btn').onclick = () => showScreen('lobby');
if ($id('lt-profile-tab')) $id('lt-profile-tab').onclick = () => showScreen('profile');

// ═══ AUTH MODE TOGGLE ═══
if ($id('tab-login-btn') && $id('tab-register-btn')) {
  $id('tab-login-btn').onclick = () => {
    $id('tab-login-btn').classList.add('active');
    $id('tab-register-btn').classList.remove('active');
    $id('form-login-box').classList.remove('hidden');
    $id('form-register-box').classList.add('hidden');
    $id('auth-error-msg').classList.add('hidden');
  };
  $id('tab-register-btn').onclick = () => {
    $id('tab-register-btn').classList.add('active');
    $id('tab-login-btn').classList.remove('active');
    $id('form-register-box').classList.remove('hidden');
    $id('form-login-box').classList.add('hidden');
    $id('auth-error-msg').classList.add('hidden');
  };
}

function showAuthError(msg) {
  const el = $id('auth-error-msg');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

// ═══ LOGIN HANDLER ═══
if ($id('btn-login')) {
  $id('btn-login').onclick = async () => {
    snd();
    const ph = $id('login-phone').value.trim().replace(/[^0-9]/g, '');
    const pin = $id('login-pin').value.trim();
    if (!ph) return showAuthError('Ingresa tu número de WhatsApp');

    try {
      const res = await fetch('/api/player/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: ph, pin })
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        return showAuthError(d.error || 'Error al iniciar sesión');
      }

      phone = d.user.phone;
      userName = d.user.name || `Jugador ${phone.slice(-4)}`;
      userToken = d.token || '';
      localStorage.setItem('bp_phone', phone);
      localStorage.setItem('bp_name', userName);
      if (userToken) localStorage.setItem('bp_token', userToken);
      enterApp();
    } catch {
      showAuthError('Error de conexión con el servidor');
    }
  };
}

// ═══ REGISTER HANDLER ═══
if ($id('btn-register')) {
  $id('btn-register').onclick = async () => {
    snd();
    const ph = $id('reg-phone').value.trim().replace(/[^0-9]/g, '');
    const nm = $id('reg-name').value.trim();
    const pin = $id('reg-pin').value.trim();
    const ced = $id('reg-cedula').value.trim();

    if (!ph || ph.length < 10) return showAuthError('Ingresa un número de WhatsApp válido');
    if (pin && !/^\d{4}$/.test(pin)) return showAuthError('El PIN debe tener exactamente 4 dígitos numéricos');

    try {
      const res = await fetch('/api/player/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: ph, name: nm, pin, cedula: ced })
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        return showAuthError(d.error || 'Error al registrar usuario');
      }

      phone = d.user.phone;
      userName = d.user.name || `Jugador ${phone.slice(-4)}`;
      userToken = d.token || '';
      localStorage.setItem('bp_phone', phone);
      localStorage.setItem('bp_name', userName);
      if (userToken) localStorage.setItem('bp_token', userToken);
      enterApp();
    } catch {
      showAuthError('Error de conexión con el servidor');
    }
  };
}

function enterApp() {
  $id('screen-login').classList.add('hidden');
  $id('app-shell').classList.remove('hidden');
  updateTopbar();
  showScreen('lobby');
  startGamePolling();
  setInterval(updateTopbar, 4000);
}

// Auto-login
if (phone) enterApp();

// Logout
if ($id('btn-logout')) {
  $id('btn-logout').onclick = () => { localStorage.clear(); phone = ''; location.reload(); };
}

// ═══ TOPBAR ═══
async function updateTopbar() {
  if (!phone) return;
  try {
    const d = await (await fetch(`/api/player/me?phone=${phone}`)).json();
    if (d.name) {
      userName = d.name;
      serverCardPrice = d.cardPriceBs || 100;
      $id('tb-name').textContent = d.name;
      $id('tb-bal').textContent = `Bs ${d.balance.toFixed(2)}`;
      $id('tb-avatar').textContent = d.name.charAt(0).toUpperCase();
      if (d.pagoMovil) {
        if ($id('pm-banco')) $id('pm-banco').textContent = d.pagoMovil.banco;
        if ($id('pm-tel')) $id('pm-tel').textContent = d.pagoMovil.telefono;
        if ($id('pm-ced')) $id('pm-ced').textContent = d.pagoMovil.cedula;
      }
    }
  } catch {}
}

// ═══ LOBBY ═══
async function refreshLobby() {
  try {
    const url = phone ? `/api/player/game?phone=${phone}` : '/api/player/game';
    const d = await (await fetch(url)).json();
    const oc = d.onlineCount || 1;
    if ($id('online-count-lbl')) $id('online-count-lbl').textContent = `${oc} En Línea`;
    if ($id('chat-online-num')) $id('chat-online-num').textContent = oc;

    if (d.hasActiveGame) {
      if ($id('lobby-pot')) $id('lobby-pot').textContent = `Bs ${d.prizePool.toFixed(2)}`;
      if ($id('lobby-players')) $id('lobby-players').textContent = d.activePlayersCount || 0;
      if ($id('lobby-cards-count')) $id('lobby-cards-count').textContent = d.totalCards || 0;
    }
  } catch {}
}

// ═══ PROFILE & WALLET VIEW ═══
async function refreshProfile() {
  if (!phone) return;
  try {
    const me = await (await fetch(`/api/player/me?phone=${phone}`)).json();
    if (me.name) {
      if ($id('prof-name')) $id('prof-name').textContent = me.name;
      if ($id('prof-phone')) $id('prof-phone').textContent = me.phone;
      if ($id('prof-cedula')) $id('prof-cedula').textContent = me.cedula || 'Sin registrar';
      if ($id('prof-available-bal')) $id('prof-available-bal').textContent = `Bs ${me.balance.toFixed(2)}`;
      if ($id('prof-locked-bal')) $id('prof-locked-bal').textContent = `Bs ${(me.lockedBalance || 0).toFixed(2)}`;
      
      // Fill form inputs if empty
      if ($id('prof-input-bank') && me.bankCode) $id('prof-input-bank').value = me.bankCode;
      if ($id('prof-input-cedula') && me.cedula) $id('prof-input-cedula').value = me.cedula;
      if ($id('prof-input-bank-tel') && (me.bankAccount || me.phone)) $id('prof-input-bank-tel').value = me.bankAccount || me.phone;
    }

    // Fetch transactions
    const txData = await (await fetch(`/api/player/transactions?phone=${phone}`)).json();
    renderProfileHistory(txData);
  } catch {}
}

function renderProfileHistory(txData) {
  const tbody = $id('prof-history-tbody');
  if (!tbody) return;

  const rows = [];
  
  // Withdrawals
  (txData.withdrawals || []).forEach(w => {
    const statusBadges = {
      PENDING: '<span style="color:#FFD700;font-weight:700">⏳ PENDIENTE</span>',
      APPROVED: '<span style="color:#00FF88;font-weight:700">✅ APROBADO</span>',
      REJECTED: '<span style="color:#FF4444;font-weight:700">❌ RECHAZADO</span>'
    };
    rows.push({
      date: new Date(w.date),
      concept: `💸 Retiro Pago Móvil (${w.bankCode})`,
      amount: `- Bs ${w.amount.toFixed(2)}`,
      amountColor: '#FF6B6B',
      status: statusBadges[w.status] || w.status
    });
  });

  // Deposits
  (txData.deposits || []).forEach(d => {
    const statusBadges = {
      PENDING: '<span style="color:#FFD700;font-weight:700">⏳ PENDIENTE</span>',
      APPROVED: '<span style="color:#00FF88;font-weight:700">✅ ACREDITADO</span>',
      REJECTED: '<span style="color:#FF4444;font-weight:700">❌ RECHAZADO</span>'
    };
    rows.push({
      date: new Date(d.date),
      concept: `🏦 Recarga Pago Móvil (Ref: ${d.reference})`,
      amount: `+ Bs ${d.amount.toFixed(2)}`,
      amountColor: '#00FF88',
      status: statusBadges[d.status] || d.status
    });
  });

  // Ledger entries (game purchases & payouts)
  (txData.ledger || []).forEach(l => {
    const isCredit = l.amount > 0;
    rows.push({
      date: new Date(l.date),
      concept: l.description || l.type,
      amount: `${isCredit ? '+' : ''} Bs ${l.amount.toFixed(2)}`,
      amountColor: isCredit ? '#00FF88' : '#AAA',
      status: '<span style="color:#00E5FF;font-weight:700">✔ EJECUTADO</span>'
    });
  });

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:20px;color:#888;">No tienes movimientos registrados aún</td></tr>';
    return;
  }

  tbody.innerHTML = rows.slice(0, 20).map(r => `
    <tr>
      <td style="color:#AAA">${r.date.toLocaleDateString()} ${r.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
      <td>${r.concept}</td>
      <td style="color:${r.amountColor};font-weight:800">${r.amount}</td>
      <td>${r.status}</td>
    </tr>
  `).join('');
}

// Save profile
if ($id('btn-save-profile')) {
  $id('btn-save-profile').onclick = async () => {
    const bankCode = $id('prof-input-bank').value;
    const cedula = $id('prof-input-cedula').value.trim();
    const bankAccount = $id('prof-input-bank-tel').value.trim();
    const newPin = $id('prof-input-pin').value.trim();

    const alertEl = $id('prof-save-alert');
    try {
      const res = await fetch('/api/player/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, bankCode, cedula, bankAccount, newPin })
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        alertEl.textContent = d.error || 'Error al guardar datos';
        alertEl.classList.remove('hidden');
      } else {
        alertEl.textContent = '✅ ¡Datos actualizados exitosamente!';
        alertEl.style.background = 'rgba(0, 255, 136, 0.15)';
        alertEl.style.borderColor = '#00FF88';
        alertEl.style.color = '#00FF88';
        alertEl.classList.remove('hidden');
        if ($id('prof-input-pin')) $id('prof-input-pin').value = '';
        setTimeout(() => alertEl.classList.add('hidden'), 4000);
        refreshProfile();
      }
    } catch {
      alertEl.textContent = 'Error de conexión';
      alertEl.classList.remove('hidden');
    }
  };
}

// ═══ DEPOSITS ═══
if ($id('btn-topbar-deposit')) $id('btn-topbar-deposit').onclick = () => $id('dep-modal').classList.remove('hidden');
if ($id('prof-btn-dep')) $id('prof-btn-dep').onclick = () => $id('dep-modal').classList.remove('hidden');
if ($id('dep-close')) $id('dep-close').onclick = () => $id('dep-modal').classList.add('hidden');
if ($id('dep-submit')) {
  $id('dep-submit').onclick = async () => {
    const amt = $id('dep-amt').value, ref = $id('dep-ref').value;
    if (!amt || !ref) return alert('Completa ambos campos');
    try {
      const d = await (await fetch('/api/player/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, amount: amt, referenceCode: ref }) })).json();
      if (d.success) {
        alert('✅ Recarga registrada — será aprobada en breve por administración');
        $id('dep-modal').classList.add('hidden');
        $id('dep-amt').value = '';
        $id('dep-ref').value = '';
        refreshProfile();
      } else {
        alert('Error: ' + d.error);
      }
    } catch { alert('Error de conexión'); }
  };
}

// ═══ WITHDRAWALS ═══
async function openWithdrawModal() {
  if (!phone) return alert('Inicia sesión primero');
  const modal = $id('withdraw-modal');
  if (!modal) return;

  try {
    const me = await (await fetch(`/api/player/me?phone=${phone}`)).json();
    if ($id('with-available-txt')) $id('with-available-txt').textContent = `Bs ${me.balance.toFixed(2)}`;
    if ($id('with-bank') && me.bankCode) $id('with-bank').value = me.bankCode;
    if ($id('with-cedula') && me.cedula) $id('with-cedula').value = me.cedula;
    if ($id('with-phone')) $id('with-phone').value = me.bankAccount || me.phone;
  } catch {}

  modal.classList.remove('hidden');
}

if ($id('btn-topbar-withdraw')) $id('btn-topbar-withdraw').onclick = openWithdrawModal;
if ($id('prof-btn-with')) $id('prof-btn-with').onclick = openWithdrawModal;
if ($id('with-close')) $id('with-close').onclick = () => $id('withdraw-modal').classList.add('hidden');

if ($id('with-submit')) {
  $id('with-submit').onclick = async () => {
    const amt = parseFloat($id('with-amt').value);
    const bankCode = $id('with-bank').value;
    const cedula = $id('with-cedula').value.trim();
    const bankAccount = $id('with-phone').value.trim();
    const errEl = $id('with-error-msg');

    if (isNaN(amt) || amt <= 0) {
      errEl.textContent = 'Ingresa un monto válido a retirar';
      errEl.classList.remove('hidden');
      return;
    }
    if (!cedula || !bankAccount) {
      errEl.textContent = 'Completa tu cédula y teléfono Pago Móvil';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/player/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount: amt, bankCode, cedula, bankAccount })
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        errEl.textContent = d.error || 'Error al solicitar retiro';
        errEl.classList.remove('hidden');
      } else {
        alert(`✅ ¡Solicitud de retiro por Bs ${amt.toFixed(2)} procesada!\n\nTus fondos han quedado reservados y se transferirán a tu Pago Móvil.`);
        $id('withdraw-modal').classList.add('hidden');
        $id('with-amt').value = '';
        errEl.classList.add('hidden');
        updateTopbar();
        refreshProfile();
      }
    } catch {
      errEl.textContent = 'Error de conexión';
      errEl.classList.remove('hidden');
    }
  };
}

// ═══ SOUND / VOICE TOGGLES ═══
$id('btn-sound').onclick = () => { snd(); soundOn = !soundOn; $id('btn-sound').textContent = soundOn ? '🔊' : '🔇'; };
$id('btn-voice').onclick = () => { voiceOn = !voiceOn; $id('btn-voice').classList.toggle('active', voiceOn); };

// ═══ BUY CONFIRMATION MODAL LOGIC ═══
let pendingBuyCount = 0;
let userBalance = 0;

// Promo: Lleva 6 Paga 4 logic
function calculatePurchaseTotal(count, unitPrice) {
  if (count === 6) return 4 * unitPrice;
  if (count === 12) return 8 * unitPrice;
  if (count === 24) return 16 * unitPrice;
  if (count === 48) return 32 * unitPrice;
  return count * unitPrice;
}

async function openBuyConfirmation(count) {
  snd();
  pendingBuyCount = count;
  if (!phone) return alert('Por favor inicia sesión primero');

  try {
    const me = await (await fetch(`/api/player/me?phone=${phone}`)).json();
    userBalance = me.balance || 0;
    serverCardPrice = me.cardPriceBs || 100;
  } catch { userBalance = 0; }

  const unitPrice = serverCardPrice;
  const totalCost = calculatePurchaseTotal(count, unitPrice);
  const nextBal = userBalance - totalCost;
  const hasFunds = userBalance >= totalCost;

  if ($id('bcm-cards-count')) $id('bcm-cards-count').textContent = count === 1 ? '1 Cartón' : `${count} Cartones`;
  if ($id('bcm-unit-price')) $id('bcm-unit-price').textContent = `Bs ${unitPrice.toFixed(2)}`;
  if ($id('bcm-total-price')) $id('bcm-total-price').textContent = `Bs ${totalCost.toFixed(2)}`;
  if ($id('bcm-user-balance')) $id('bcm-user-balance').textContent = `Bs ${userBalance.toFixed(2)}`;
  
  const discountRow = $id('bcm-discount-row');
  if (discountRow) {
    discountRow.style.display = (count >= 6) ? 'flex' : 'none';
  }

  const nbEl = $id('bcm-next-balance');
  if (nbEl) {
    nbEl.textContent = `Bs ${Math.max(0, nextBal).toFixed(2)}`;
    nbEl.className = hasFunds ? 'bcm-w-val green' : 'bcm-w-val red';
  }

  const alertBox = $id('bcm-funds-alert');
  const confirmBtn = $id('buy-modal-confirm');
  const depositBtn = $id('buy-modal-deposit');

  if (hasFunds) {
    if (alertBox) alertBox.classList.add('hidden');
    if (confirmBtn) { confirmBtn.classList.remove('hidden'); confirmBtn.disabled = false; confirmBtn.textContent = '✅ SÍ, COMPRAR'; }
    if (depositBtn) depositBtn.classList.add('hidden');
  } else {
    const missing = totalCost - userBalance;
    if (alertBox) {
      alertBox.textContent = `⚠️ Saldo insuficiente (Te faltan Bs ${missing.toFixed(2)}). Recarga para comprar.`;
      alertBox.classList.remove('hidden');
    }
    if (confirmBtn) confirmBtn.classList.add('hidden');
    if (depositBtn) depositBtn.classList.remove('hidden');
  }

  $id('buy-confirm-modal').classList.remove('hidden');
}

function closeBuyModal() {
  $id('buy-confirm-modal').classList.add('hidden');
}

if ($id('buy-modal-close')) $id('buy-modal-close').onclick = closeBuyModal;
if ($id('buy-modal-cancel')) $id('buy-modal-cancel').onclick = closeBuyModal;

if ($id('buy-modal-deposit')) {
  $id('buy-modal-deposit').onclick = () => {
    closeBuyModal();
    $id('dep-modal').classList.remove('hidden');
  };
}

if ($id('buy-modal-confirm')) {
  $id('buy-modal-confirm').onclick = async () => {
    if (!pendingBuyCount) return;
    const btn = $id('buy-modal-confirm');
    btn.disabled = true;
    btn.textContent = '⏳ Procesando compra...';

    try {
      const d = await (await fetch('/api/player/buy-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, count: pendingBuyCount })
      })).json();

      if (d.success) {
        closeBuyModal();
        confetti(120);
        playPop();
        updateTopbar();
        refreshProfile();
        fetchCards();
        poll();
      } else {
        btn.disabled = false;
        btn.textContent = '✅ SÍ, COMPRAR';
        alert('❌ ' + (d.error || 'Error en la compra'));
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '✅ SÍ, COMPRAR';
      alert('Error de conexión con el servidor');
    }
  };
}

// ═══ BUY CARDS PILL TRIGGERS ═══
$$('.buy-pill').forEach(b => b.onclick = () => {
  const count = parseInt(b.dataset.n);
  openBuyConfirmation(count);
});

// ═══ CHAT ═══
if ($id('chat-form')) {
  $id('chat-form').onsubmit = (e) => {
    e.preventDefault();
    const i = $id('chat-input'), t = i.value.trim();
    if (!t) return;
    addChat(userName || 'Tú', t);
    i.value = '';
  };
}
function addChat(u, t) {
  const b = $id('chat-box');
  if (!b) return;
  const d = document.createElement('div');
  d.className = 'chat-msg';
  d.innerHTML = `<span class="c-user">${u}:</span> ${t}`;
  b.appendChild(d);
  b.scrollTop = b.scrollHeight;
}

// ═══ BUILD PIZARRA ═══
function buildPizarra() {
  const cols = { B: [1,15], I: [16,30], N: [31,45], G: [46,60], O: [61,75] };
  for (const [L, [lo, hi]] of Object.entries(cols)) {
    const c = $id(`mb-${L}`); if (!c) continue; c.innerHTML = '';
    for (let n = lo; n <= hi; n++) { const d = document.createElement('div'); d.className = 'piz-cell'; d.id = `pc-${n}`; d.textContent = n; c.appendChild(d); }
  }
}
buildPizarra();

// ═══ GAME POLLING ═══
function startGamePolling() { if (pollTimer) return; poll(); pollTimer = setInterval(poll, 1000); }
function stopGamePolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

let lastRoundNum = null;
let announcedWinners = new Set();

async function poll() {
  try {
    const url = phone ? `/api/player/game?phone=${phone}` : '/api/player/game';
    const d = await (await fetch(url)).json();
    const oc = d.onlineCount || 1;
    if ($id('online-count-lbl')) $id('online-count-lbl').textContent = `${oc} En Línea`;
    if ($id('chat-online-num')) $id('chat-online-num').textContent = oc;

    // Always update Lobby card elements in real time
    if ($id('lobby-pot')) $id('lobby-pot').textContent = `Bs ${(d.prizePool || 0).toFixed(2)}`;
    if ($id('lobby-players')) $id('lobby-players').textContent = d.activePlayersCount || 0;
    if ($id('lobby-cards-count')) $id('lobby-cards-count').textContent = d.totalCards || 0;

    // Always update countdown timers across all screens
    updateCountdowns(d);

    if (!d.hasActiveGame) {
      $id('room-label').textContent = 'RONDA #--';
      $id('status-text').textContent = 'ESPERANDO PRÓXIMA RONDA…';
      $id('prog-bar').style.width = '0%';
      $id('pot-value').textContent = `Bs ${(d.prizePool || 0).toFixed(2)}`;
      if ($id('room-active-players')) $id('room-active-players').textContent = '0';
      if ($id('room-total-cards')) $id('room-total-cards').textContent = '0';
      updateLivePrizes({ prizePool: d.prizePool || 0 });

      // ═══ AUTO-RESET: Clean pizarra, drawn balls, cards for next round ═══
      drawnSet = new Set();
      lastBallNum = null;
      currentWinner1Line = null;
      currentWinner2Lines = null;
      currentWinnerFullCard = null;
      for (let i = 1; i <= 75; i++) { const el = $id(`pc-${i}`); if (el) el.classList.remove('lit'); }
      renderHistory([]);
      if ($id('cb-num')) $id('cb-num').textContent = '--';
      if ($id('cb-col')) $id('cb-col').textContent = '';
      if ($id('cb-lbl')) $id('cb-lbl').textContent = 'ESPERANDO';
      if ($id('cards-zone')) $id('cards-zone').innerHTML = '<div class="no-cards">Compra cartones para la próxima ronda 🎲</div>';
      if ($id('card-count')) $id('card-count').textContent = '0';
      userCardsList = [];
      // Close winner modal if still open
      const wm = $id('winner-celebration-modal');
      if (wm) wm.classList.add('hidden');
      return;
    }
    
    // Update live player & card counters inside game room
    if ($id('room-active-players')) $id('room-active-players').textContent = d.activePlayersCount || 0;
    if ($id('room-total-cards')) $id('room-total-cards').textContent = d.totalCards || 0;

    // Track active winners in global phase variables
    currentWinner1Line = d.winner1LineUserId || null;
    currentWinner2Lines = d.winner2LinesUserId || null;
    currentWinnerFullCard = d.winnerFullCardUserId || null;

    // Reset state on new round transition
    if (lastRoundNum !== d.roundNumber) {
      lastRoundNum = d.roundNumber;
      announcedWinners.clear();
      prevDaub = {};
      lastBallNum = null;
    }

    $id('room-label').textContent = `RONDA #${d.roundNumber}`;
    $id('pot-value').textContent = `Bs ${d.prizePool.toFixed(2)}`;
    const smap = { WAITING: '⏳ PREPARANDO…', SELLING: '🛒 ¡VENTAS ABIERTAS! COMPRA TUS CARTONES', DRAWING: `🔴 EN VIVO — ${d.drawnBalls.length}/75`, PAUSED: '⏸️ PAUSADA', FINISHED: '🏁 FIN DE RONDA' };
    $id('status-text').textContent = smap[d.status] || d.status;
    $id('prog-bar').style.width = d.status === 'DRAWING' ? (d.drawnBalls.length / 75 * 100) + '%' : d.status === 'SELLING' ? '20%' : d.status === 'FINISHED' ? '100%' : '0%';
    drawnSet = new Set(d.drawnBalls.map(b => b.number));
    for (let i = 1; i <= 75; i++) { const el = $id(`pc-${i}`); if (el) el.classList.toggle('lit', drawnSet.has(i)); }
    if (d.drawnBalls.length > 0) { const last = d.drawnBalls[d.drawnBalls.length - 1]; if (lastBallNum !== last.number) { lastBallNum = last.number; onNewBall(last); } }
    renderHistory(d.drawnBalls.slice(-8).reverse());

    // Winner detection (triggers SPOTLIGHT WINNER MODAL)
    const winType = d.winnerFullCardUserId ? 'full' : d.winner2LinesUserId ? '2line' : d.winner1LineUserId ? '1line' : null;
    if (winType) {
      const winKey = `${d.roundNumber}-${winType}`;
      if (!announcedWinners.has(winKey)) {
        announcedWinners.add(winKey);
        const prize57 = (d.prizePool * 0.57).toFixed(2);
        const prize14 = (d.prizePool * 0.14).toFixed(2);
        const prize9 = (d.prizePool * 0.09).toFixed(2);
        const winningCard = findWinningCard(winType, drawnSet);

        if (d.winnerFullCardUserId) {
          openWinnerCelebration('👑 ¡BINGO COMPLETO!', d.winnerFullCardName || 'Jugador', `Bs ${prize57}`, winningCard);
          showBanner('👑 ¡BINGO CARTÓN LLENO!', `🎉 Ganador: ${d.winnerFullCardName || 'Jugador'} | Premio: Bs ${prize57}`);
          confetti(180);
        } else if (d.winner2LinesUserId) {
          openWinnerCelebration('✌️ ¡2 LÍNEAS GANADAS!', d.winner2LinesName || 'Jugador', `Bs ${prize14}`, winningCard);
          showBanner('✌️ ¡DOS LÍNEAS COMPLETAS!', `⭐ Ganador: ${d.winner2LinesName || 'Jugador'} | Premio: Bs ${prize14}`);
          confetti(100);
        } else if (d.winner1LineUserId) {
          openWinnerCelebration('🥇 ¡1 LÍNEA GANADA!', d.winner1LineName || 'Jugador', `Bs ${prize9}`, winningCard);
          showBanner('🎉 ¡UNA LÍNEA COMPLETA!', `🎊 Ganador: ${d.winner1LineName || 'Jugador'} | Premio: Bs ${prize9}`);
          confetti(80);
        }
      }
    }

    updateLivePrizes(d);
    updateCountdowns(d);
    fetchCards();
  } catch {}
}

function updateLivePrizes(d) {
  const pool = d.prizePool || 0;
  const p9 = (pool * 0.09).toFixed(2);
  const p14 = (pool * 0.14).toFixed(2);
  const p57 = (pool * 0.57).toFixed(2);

  // 1 Line (9%)
  if ($id('prize-1line-val')) $id('prize-1line-val').textContent = `Bs ${p9}`;
  if ($id('card-prize-1line')) {
    if (d.winner1LineUserId) {
      $id('badge-prize-1line').textContent = '✅ GANADO';
      $id('badge-prize-1line').className = 'ppc-badge won';
      $id('prize-1line-winner').textContent = `🏆 ${d.winner1LineName || 'Jugador'}`;
      $id('card-prize-1line').className = 'prize-pill-card won';
    } else {
      $id('badge-prize-1line').textContent = '⚡ EN JUEGO';
      $id('badge-prize-1line').className = 'ppc-badge';
      $id('prize-1line-winner').textContent = 'En competencia...';
      $id('card-prize-1line').className = 'prize-pill-card';
    }
  }

  // 2 Lines (14%)
  if ($id('prize-2lines-val')) $id('prize-2lines-val').textContent = `Bs ${p14}`;
  if ($id('card-prize-2lines')) {
    if (d.winner2LinesUserId) {
      $id('badge-prize-2lines').textContent = '✅ GANADO';
      $id('badge-prize-2lines').className = 'ppc-badge won';
      $id('prize-2lines-winner').textContent = `🏆 ${d.winner2LinesName || 'Jugador'}`;
      $id('card-prize-2lines').className = 'prize-pill-card won';
    } else {
      $id('badge-prize-2lines').textContent = '⚡ EN JUEGO';
      $id('badge-prize-2lines').className = 'ppc-badge';
      $id('prize-2lines-winner').textContent = 'En competencia...';
      $id('card-prize-2lines').className = 'prize-pill-card';
    }
  }

  // Full Card (57%)
  if ($id('prize-full-val')) $id('prize-full-val').textContent = `Bs ${p57}`;
  if ($id('card-prize-full')) {
    if (d.winnerFullCardUserId) {
      $id('badge-prize-full').textContent = '👑 BINGO GANADO';
      $id('badge-prize-full').className = 'ppc-badge won gold';
      $id('prize-full-winner').textContent = `🎉 ${d.winnerFullCardName || 'Jugador'}`;
      $id('card-prize-full').className = 'prize-pill-card gold-jackpot won';
    } else {
      $id('badge-prize-full').textContent = '👑 GRAN POZO';
      $id('badge-prize-full').className = 'ppc-badge gold';
      $id('prize-full-winner').textContent = '¡Máximo premio en juego!';
      $id('card-prize-full').className = 'prize-pill-card gold-jackpot';
    }
  }
}

function updateCountdowns(d) {
  const fmt = s => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const lt = $id('lobby-timer'), ls = $id('lobby-status');
  const rt = $id('room-timer'), rl = $id('room-timer-label');
  if (!lt || !rt) return;

  if (d.status === 'SELLING' && d.sellingStartedAt) {
    const elapsed = (Date.now() - new Date(d.sellingStartedAt).getTime()) / 1000;
    const rem = Math.max(0, Math.floor(d.sellingWindowSeconds - elapsed));
    if (rem > 0) {
      lt.textContent = fmt(rem); if (ls) ls.textContent = '🛒 VENTAS ABIERTAS';
      rt.textContent = fmt(rem); if (rl) rl.textContent = 'VENTAS ABIERTAS';
    } else {
      lt.textContent = '00:00'; if (ls) ls.textContent = '🔒 INICIANDO SORTEO...';
      rt.textContent = '00:00'; if (rl) rl.textContent = 'INICIANDO BOMBO...';
    }
  } else if (d.status === 'DRAWING') {
    const ballsCount = d.drawnBalls ? d.drawnBalls.length : 0;
    if (d.nextRoundScheduledAt) {
      const remNext = Math.max(0, Math.floor((new Date(d.nextRoundScheduledAt).getTime() - Date.now()) / 1000));
      lt.textContent = fmt(remNext); if (ls) ls.textContent = '🎲 PRÓXIMO BINGO (EN VIVO)';
    } else {
      lt.textContent = `${ballsCount}/75`; if (ls) ls.textContent = '🔴 EN VIVO CANTANDO';
    }
    rt.textContent = `${ballsCount}/75`; if (rl) rl.textContent = '🔴 CANTANDO EN VIVO';
  } else {
    const target = d.nextRoundScheduledAt || d.scheduledAt;
    if (target) {
      const rem = Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
      lt.textContent = fmt(rem); if (ls) ls.textContent = '⏳ PRÓXIMO JUEGO';
      rt.textContent = fmt(rem); if (rl) rl.textContent = 'INICIA PRONTO';
    } else {
      lt.textContent = '00:00'; if (ls) ls.textContent = '⏳ PREPARANDO';
      rt.textContent = '00:00'; if (rl) rl.textContent = 'PREPARANDO';
    }
  }
}

function onNewBall(ball) {
  const s = $id('active-ball');
  if (s) {
    s.className = `active-ball ball-${ball.column.toLowerCase()} drop-in`;
    setTimeout(() => s.classList.remove('drop-in'), 600);
  }
  if ($id('cb-col')) $id('cb-col').textContent = ball.column;
  if ($id('cb-num')) $id('cb-num').textContent = ball.number;
  if ($id('cb-lbl')) $id('cb-lbl').textContent = `${ball.column} - ${ball.number}`;

  $$('.bh').forEach(h => {
    h.className = 'bh';
    if (h.dataset.col === ball.column) h.classList.add('glow-' + ball.column.toLowerCase());
  });

  if (s) {
    const r = s.getBoundingClientRect();
    const cmap = { B: '#FFD700', I: '#00E5FF', N: '#00FF6A', G: '#D500F9', O: '#FF1744' };
    burst(r.left + r.width / 2, r.top + r.height / 2, cmap[ball.column] || '#FFD700', 30);
  }
  playPop();
  speakBall(ball.column, ball.number);
}

function renderHistory(balls) {
  const c = $id('history-balls');
  if (!c) return;
  c.innerHTML = '';
  balls.forEach(b => {
    const d = document.createElement('div');
    d.className = `hs-ball col-${b.column.toLowerCase()}`;
    d.textContent = b.number;
    c.appendChild(d);
  });
}

let bannerT = null;
function showBanner(title, msg) {
  const b = $id('winner-banner');
  if (!b) return;
  $id('wb-title').textContent = title;
  $id('wb-user').textContent = msg;
  b.classList.remove('hidden');
  if (bannerT) clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.add('hidden'), 6000);
}

let userCardsList = [];

// ═══ ROYAL WINNER SPOTLIGHT MODAL ═══
function findWinningCard(winType, dSet) {
  if (!userCardsList || !userCardsList.length) return null;
  if (winType === 'full') {
    return userCardsList.find(c => getMissingCount(c, dSet) === 0) || userCardsList[0];
  }
  return userCardsList.find(c => {
    let completed = 0;
    for (let r = 0; r < 5; r++) {
      let rowComplete = true;
      for (let ci = 0; ci < 5; ci++) {
        const n = c.grid[r][ci];
        if (!((r === 2 && ci === 2) || n === 0 || dSet.has(n))) { rowComplete = false; break; }
      }
      if (rowComplete) completed++;
    }
    return winType === '2line' ? completed >= 2 : completed >= 1;
  }) || userCardsList[0];
}

function openWinnerCelebration(title, winnerName, amountStr, cardObj) {
  const modal = $id('winner-celebration-modal');
  if (!modal) return;
  $id('rwb-title').textContent = title;
  $id('rwb-winner-name').textContent = `🏆 Ganador: ${winnerName}`;
  $id('rwb-amount-val').textContent = amountStr;

  const container = $id('rwb-card-container');
  container.innerHTML = '';
  if (cardObj) {
    const rendered = renderCard(cardObj, Array.from(drawnSet), true);
    container.appendChild(rendered);
  }

  modal.classList.remove('hidden');
  confetti(160);
  playPop();
}

const winCloseBtn = $id('btn-win-close');
if (winCloseBtn) {
  winCloseBtn.onclick = () => {
    const modal = $id('winner-celebration-modal');
    if (modal) modal.classList.add('hidden');
  };
}

// ═══ CARDS + AUTO-SORTING (BEST CARDS FIRST) ═══
function getMissingCount(card, dSet) {
  let miss = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      const free = (r === 2 && c === 2) || n === 0;
      if (!free && !dSet.has(n)) miss++;
    }
  }
  return miss;
}

let currentCardFilter = 'all';

$$('.cfb-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.cfb-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCardFilter = btn.dataset.filter || 'all';
    renderFilteredCards();
  };
});

const refreshCardsBtn = $id('btn-refresh-cards');
if (refreshCardsBtn) {
  refreshCardsBtn.onclick = () => { fetchCards(); };
}

async function fetchCards() {
  if (!phone) return;
  try {
    const d = await (await fetch(`/api/player/my-cards?phone=${phone}`)).json();
    userCardsList = d.cards || [];
    if ($id('card-count')) $id('card-count').textContent = userCardsList.length;
    
    const dSet = new Set(d.drawnNumbers || []);
    // DYNAMIC AUTO-SORTING: Cards closest to BINGO automatically rank FIRST!
    userCardsList.sort((a, b) => getMissingCount(a, dSet) - getMissingCount(b, dSet));

    // Update filter counts in realtime
    let cnt1tg = 0, cnt2tg = 0, cntWin = 0;
    userCardsList.forEach(c => {
      const m = getMissingCount(c, dSet);
      if (m === 0) cntWin++;
      else if (m === 1) cnt1tg++;
      else if (m === 2) cnt2tg++;
    });

    if ($id('cnt-all')) $id('cnt-all').textContent = userCardsList.length;
    if ($id('cnt-1tg')) $id('cnt-1tg').textContent = cnt1tg;
    if ($id('cnt-2tg')) $id('cnt-2tg').textContent = cnt2tg;
    if ($id('cnt-win')) $id('cnt-win').textContent = cntWin;

    renderFilteredCards(d.drawnNumbers || []);
  } catch {}
}

function renderFilteredCards(drawnList) {
  const z = $id('cards-zone');
  if (!z) return;
  if (!userCardsList.length) {
    z.innerHTML = '<div class="no-cards">Compra cartones a la derecha para comenzar a jugar 🎲</div>';
    return;
  }

  const dSet = new Set(drawnList || Array.from(drawnSet));
  let filtered = userCardsList;
  if (currentCardFilter === '1tg') {
    filtered = userCardsList.filter(c => getMissingCount(c, dSet) === 1);
  } else if (currentCardFilter === '2tg') {
    filtered = userCardsList.filter(c => getMissingCount(c, dSet) === 2);
  } else if (currentCardFilter === 'win') {
    filtered = userCardsList.filter(c => getMissingCount(c, dSet) === 0);
  }

  z.innerHTML = '';
  if (!filtered.length) {
    z.innerHTML = `<div class="no-cards">No tienes cartones en esta categoría</div>`;
    return;
  }
  filtered.forEach(c => z.appendChild(renderCard(c, Array.from(dSet))));
}

function renderCard(card, drawn, isSpotlight = false) {
  const dS = new Set(drawn), div = document.createElement('div');
  let miss = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      if (!((r === 2 && c === 2) || n === 0) && !dS.has(n)) miss++;
    }
  }

  // Detect completed horizontal rows (Filas 1 a 5)
  const completedRows = [];
  for (let r = 0; r < 5; r++) {
    let rowComplete = true;
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      const free = (r === 2 && c === 2) || n === 0;
      if (!free && !dS.has(n)) { rowComplete = false; break; }
    }
    if (rowComplete) completedRows.push(r);
  }

  // Check minimum missing balls for ANY uncompleted horizontal line (1-to-go Line)
  let minMissForUncompletedLine = 5;
  for (let r = 0; r < 5; r++) {
    if (completedRows.includes(r)) continue;
    let uncomp = 0;
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c];
      const free = (r === 2 && c === 2) || n === 0;
      if (!free && !dS.has(n)) uncomp++;
    }
    if (uncomp > 0 && uncomp < minMissForUncompletedLine) {
      minMissForUncompletedLine = uncomp;
    }
  }

  const hasWon1L = !!currentWinner1Line;
  const hasWon2L = !!currentWinner2Lines;

  let excitementClass = '';
  let badge = '';

  if (miss === 0) {
    excitementClass = 'winner-card';
    badge = '<span class="near-win-badge" style="border-color:#00E676;color:#00E676;background:rgba(0,230,118,0.25)">👑 ¡BINGO COMPLETO!</span>';
  } else if (miss === 1) {
    excitementClass = 'near-win-1';
    badge = '<span class="near-win-badge">🔥 ¡A 1 BOLA DE BINGO!</span>';
  } else if (miss === 2) {
    excitementClass = 'near-win-2';
    badge = '<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.15)">⚡ ¡A 2 BOLAS DE BINGO!</span>';
  } else if (!hasWon1L) {
    // ════ FASE 1: EN JUEGO 1 LÍNEA ════
    if (completedRows.length >= 1) {
      excitementClass = 'winner-card';
      badge = `<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.25)">🥇 1 LÍNEA (Fila ${completedRows[0]+1})</span>`;
    } else if (minMissForUncompletedLine === 1) {
      excitementClass = 'near-win-1';
      badge = '<span class="near-win-badge">🔥 ¡A 1 BOLA DE 1 LÍNEA!</span>';
    } else if (minMissForUncompletedLine === 2) {
      excitementClass = 'near-win-2';
      badge = '<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.15)">⚡ ¡A 2 BOLAS DE 1 LÍNEA!</span>';
    }
  } else if (!hasWon2L) {
    // ════ FASE 2: 1 LÍNEA YA OTORGADA -> EN JUEGO 2 LÍNEAS ════
    if (completedRows.length >= 2) {
      excitementClass = 'winner-card';
      badge = `<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.25)">✌️ 2 LÍNEAS (Filas ${completedRows.map(x=>x+1).join(' y ')})</span>`;
    } else if (completedRows.length === 1) {
      if (minMissForUncompletedLine === 1) {
        excitementClass = 'near-win-1';
        badge = '<span class="near-win-badge">🔥 ¡A 1 BOLA DE 2 LÍNEAS!</span>';
      } else if (minMissForUncompletedLine === 2) {
        excitementClass = 'near-win-2';
        badge = '<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.15)">⚡ ¡A 2 BOLAS DE 2 LÍNEAS!</span>';
      } else {
        badge = `<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.25)">🥇 1 LÍNEA (Fila ${completedRows[0]+1})</span>`;
      }
    }
  } else {
    // ════ FASE 3: 2 LÍNEAS YA OTORGADAS -> EN JUEGO BINGO COMPLETO ════
    if (completedRows.length >= 2) {
      badge = `<span class="near-win-badge" style="border-color:#FFD700;color:#FFD700;background:rgba(255,215,0,0.25)">✌️ ${completedRows.length} LÍNEAS</span>`;
    } else if (completedRows.length === 1) {
      badge = `<span class="near-win-badge" style="border-color:rgba(255,255,255,0.2);color:#AAA">🥇 1 LÍNEA</span>`;
    }
  }

  div.className = `bcard ${excitementClass}`;
  let h = `<div class="bcard-hdr"><span>🎟️ #${card.cardNumber} ${badge}</span><span>${card.hash.slice(0, 8)}</span></div>`;
  h += '<table><thead><tr><th>B</th><th>I</th><th>N</th><th>G</th><th>O</th></tr></thead><tbody>';
  for (let r = 0; r < 5; r++) {
    const isWinRow = completedRows.includes(r);
    h += '<tr>';
    for (let c = 0; c < 5; c++) {
      const n = card.grid[r][c], free = (r === 2 && c === 2) || n === 0, hit = free || dS.has(n);
      const k = `${card.id}-${r}-${c}`, was = prevDaub[k], isNew = hit && !was;
      if (!isSpotlight) prevDaub[k] = hit;
      
      const winGoldClass = isWinRow ? 'win-line-gold' : '';
      if (free) {
        h += `<td class="free ${winGoldClass}">★</td>`;
      } else if (hit) {
        h += `<td class="daubed ${isNew ? 'daubed-new' : ''} ${winGoldClass}">${n}</td>`;
        if (isNew && !isSpotlight) playDaub();
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

// ═══ EPIC 3D MECHANICAL DRUM ═══
let drumRunning = false;
function initDrum() {
  if (drumRunning) return;
  drumRunning = true;
  const cv = $id('drum-canvas');
  if (!cv) { drumRunning = false; return; }
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = 100;

  const balls = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, dist = Math.random() * (R - 16);
    balls.push({
      x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
      vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2,
      r: 9 + Math.random() * 3,
      hue: [40, 180, 140, 280, 350, 30, 200, 60, 320, 160][i % 10],
      num: Math.floor(Math.random() * 75) + 1
    });
  }

  let rot = 0, drumSpeed = .015;

  function frame() {
    ctx.clearRect(0, 0, W, H);
    rot += drumSpeed;

    const rimGrad = ctx.createRadialGradient(cx, cy, R - 6, cx, cy, R + 6);
    rimGrad.addColorStop(0, 'rgba(255,215,0,.1)');
    rimGrad.addColorStop(.5, 'rgba(255,215,0,.25)');
    rimGrad.addColorStop(1, 'rgba(255,215,0,.05)');
    ctx.fillStyle = rimGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();

    const bodyGrad = ctx.createRadialGradient(cx - 20, cy - 30, 10, cx, cy, R);
    bodyGrad.addColorStop(0, 'rgba(30,35,60,.6)');
    bodyGrad.addColorStop(.7, 'rgba(10,12,25,.8)');
    bodyGrad.addColorStop(1, 'rgba(5,6,16,.95)');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save(); ctx.translate(cx, cy);
    for (let ring = 0; ring < 4; ring++) {
      ctx.save();
      ctx.rotate(rot + ring * Math.PI / 4);
      ctx.strokeStyle = `rgba(255,215,0,${.08 + ring * .03})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.ellipse(0, 0, R - 2, R * .55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (let s = 0; s < 8; s++) {
      ctx.save();
      ctx.rotate(rot * 1.5 + s * Math.PI / 4);
      ctx.strokeStyle = 'rgba(255,215,0,.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R - 10, 0); ctx.stroke();
      ctx.restore();
    }

    const hubGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
    hubGrad.addColorStop(0, '#FFD700'); hubGrad.addColorStop(.5, '#B8860B'); hubGrad.addColorStop(1, 'rgba(100,70,20,.4)');
    ctx.fillStyle = hubGrad;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    for (const b of balls) {
      b.vy += .18; b.vx += Math.cos(rot * 4) * .2; b.vy += Math.sin(rot * 4) * .15;
      b.vx *= .995; b.vy *= .995; b.x += b.vx; b.y += b.vy;

      const dx = b.x - cx, dy = b.y - cy, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist + b.r > R - 6) {
        const nx = dx / dist, ny = dy / dist;
        b.x = cx + nx * (R - b.r - 6); b.y = cy + ny * (R - b.r - 6);
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx * .65; b.vy -= 2 * dot * ny * .65;
        b.vx *= .8; b.vy *= .8;
      }

      for (const b2 of balls) {
        if (b2 === b) continue;
        const ddx = b2.x - b.x, ddy = b2.y - b.y, d2 = Math.sqrt(ddx * ddx + ddy * ddy), minD = b.r + b2.r;
        if (d2 < minD && d2 > 0) {
          const ov = minD - d2, nnx = ddx / d2, nny = ddy / d2;
          b.x -= nnx * ov * .5; b.y -= nny * ov * .5;
          b2.x += nnx * ov * .5; b2.y += nny * ov * .5;
          const rel = (b.vx - b2.vx) * nnx + (b.vy - b2.vy) * nny;
          b.vx -= nnx * rel * .4; b.vy -= nny * rel * .4;
          b2.vx += nnx * rel * .4; b2.vy += nny * rel * .4;
        }
      }

      const g = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .35, b.r * .08, b.x, b.y, b.r);
      g.addColorStop(0, `hsl(${b.hue},85%,80%)`);
      g.addColorStop(.4, `hsl(${b.hue},80%,55%)`);
      g.addColorStop(.8, `hsl(${b.hue},70%,30%)`);
      g.addColorStop(1, `hsl(${b.hue},60%,15%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * .55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${b.hue},60%,25%)`;
      ctx.font = `bold ${Math.floor(b.r * .7)}px Orbitron`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.num, b.x, b.y + 1);

      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      ctx.ellipse(b.x - b.r * .22, b.y - b.r * .35, b.r * .3, b.r * .15, -.4, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }
  frame();
}
