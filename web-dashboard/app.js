const API_URL = '/api/admin';

// --- State & Auth ---
let token = localStorage.getItem('bingopro_admin_token');
let currentInterval = null;

// --- Elements ---
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('btn-logout');
const toastContainer = document.getElementById('toast-container');
const liveIndicator = document.getElementById('live-indicator');
const currentPageTitle = document.getElementById('current-page-title');

// --- Initialization ---
function init() {
    if (token) {
        showApp();
        setupRouter();
    } else {
        showLogin();
    }
}

// --- UI Helpers ---
function showLogin() {
    loginScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
}

function showApp() {
    loginScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatCurrency(amount) {
    return `Bs ${Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString('es-VE');
}

// --- API Client ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        if (response.status === 401 || response.status === 403) {
            handleLogout();
            throw new Error('Sesión expirada. Inicie sesión nuevamente.');
        }
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error en la solicitud');
        
        return data;
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// --- Auth flows ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const btn = loginForm.querySelector('button');
    
    try {
        btn.textContent = 'Cargando...';
        btn.disabled = true;
        
        const data = await apiCall('/login', 'POST', { username, password });
        token = data.token;
        localStorage.setItem('bingopro_admin_token', token);
        showApp();
        setupRouter();
    } catch (err) {
        loginError.textContent = err.message;
    } finally {
        btn.textContent = 'Ingresar al Sistema';
        btn.disabled = false;
    }
});

function handleLogout() {
    token = null;
    localStorage.removeItem('bingopro_admin_token');
    if (currentInterval) clearInterval(currentInterval);
    showLogin();
}

logoutBtn.addEventListener('click', handleLogout);

// --- Router ---
function setupRouter() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    function navigate(hash) {
        const pageId = hash.replace('#', '') || 'dashboard';
        
        // Update nav
        navItems.forEach(item => {
            if (item.dataset.page === pageId) {
                item.classList.add('active');
                currentPageTitle.textContent = item.querySelector('span:last-child').textContent;
            } else {
                item.classList.remove('active');
            }
        });

        // Update pages
        pages.forEach(page => {
            if (page.id === `page-${pageId}`) {
                page.classList.remove('hidden');
            } else {
                page.classList.add('hidden');
            }
        });

        // Load data
        loadPageData(pageId);
    }

    window.addEventListener('hashchange', () => navigate(window.location.hash));
    navigate(window.location.hash);
}

// --- Data Loaders ---
function loadPageData(pageId) {
    if (currentInterval) clearInterval(currentInterval);

    const loaders = {
        'dashboard': loadDashboard,
        'users': loadUsers,
        'games': loadGames,
        'deposits': loadDeposits,
        'withdrawals': loadWithdrawals,
        'finance': loadFinance,
        'settings': loadSettings
    };

    if (loaders[pageId]) {
        loaders[pageId]();
        // Set auto-refresh
        if (pageId === 'dashboard' || pageId === 'deposits' || pageId === 'withdrawals') {
             currentInterval = setInterval(loaders[pageId], 10000);
        }
    }
}

// --- Dashboard ---
async function loadDashboard() {
    try {
        const stats = await apiCall('/stats');
        document.getElementById('stat-users').textContent = stats.totalUsers;
        document.getElementById('stat-revenue').textContent = formatCurrency(stats.totalRevenue);
        
        const statusEl = document.getElementById('stat-game-status');
        const activeGameDetails = document.getElementById('active-game-details');
        
        if (stats.activeGame) {
            statusEl.textContent = getStatusText(stats.activeGame.status);
            liveIndicator.classList.remove('hidden');
            activeGameDetails.innerHTML = `
                <div style="margin-top: 1rem;">
                    <p><strong>Ronda:</strong> #${stats.activeGame.roundNumber}</p>
                    <p><strong>Cartones:</strong> ${stats.activeGame.totalCards}</p>
                    <p><strong>Pool:</strong> ${formatCurrency(stats.activeGame.prizePool)}</p>
                </div>
            `;
        } else {
            statusEl.textContent = 'En Espera';
            statusEl.className = 'stat-value text-secondary';
            liveIndicator.classList.add('hidden');
            activeGameDetails.innerHTML = `<div class="empty-state">No hay partida activa en este momento.</div>`;
        }

        // Check badges
        updateBadges();
    } catch (e) { console.error(e); }
}

async function updateBadges() {
    try {
        const [dep, wit] = await Promise.all([
            apiCall('/deposits'),
            apiCall('/withdrawals')
        ]);
        
        const depBadge = document.getElementById('badge-deposits');
        if (dep.length > 0) {
            depBadge.textContent = dep.length;
            depBadge.classList.remove('hidden');
        } else {
            depBadge.classList.add('hidden');
        }

        const witBadge = document.getElementById('badge-withdrawals');
        if (wit.length > 0) {
            witBadge.textContent = wit.length;
            witBadge.classList.remove('hidden');
        } else {
            witBadge.classList.add('hidden');
        }
    } catch(e) {}
}

// --- Users ---
async function loadUsers() {
    try {
        const users = await apiCall('/users');
        const tbody = document.getElementById('tbody-users');
        tbody.innerHTML = '';
        
        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay usuarios registrados</td></tr>`;
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.phone}</td>
                <td>${user.name || '--'}</td>
                <td class="text-green font-weight-bold">${formatCurrency(user.balance)}</td>
                <td>${formatDate(user.registeredAt)}</td>
                <td><span class="badge-status ${user.isBlocked ? 'status-error' : 'status-active'}">${user.isBlocked ? 'Bloqueado' : 'Activo'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn ${user.isBlocked ? 'btn-success' : 'btn-danger'}" onclick="toggleUserBlock('${user.id}', ${!user.isBlocked})">
                            ${user.isBlocked ? 'Desbloquear' : 'Bloquear'}
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

window.toggleUserBlock = async function(id, block) {
    if (!confirm(`¿Estás seguro de que deseas ${block ? 'bloquear' : 'desbloquear'} a este usuario?`)) return;
    try {
        await apiCall(`/users/${id}/block`, 'POST', { block });
        showToast(`Usuario ${block ? 'bloqueado' : 'desbloqueado'} con éxito`, 'success');
        loadUsers();
    } catch (e) { console.error(e); }
}

// --- Games ---
function getStatusClass(status) {
    const map = {
        'WAITING': 'status-waiting',
        'SELLING': 'status-info',
        'DRAWING': 'status-active',
        'PAUSED': 'status-warning',
        'FINISHED': 'status-waiting',
        'CANCELLED': 'status-error'
    };
    return map[status] || 'status-waiting';
}

function getStatusText(status) {
    const map = {
        'WAITING': 'Esperando',
        'SELLING': 'Vendiendo',
        'DRAWING': 'En Juego',
        'PAUSED': 'Pausado',
        'FINISHED': 'Finalizado',
        'CANCELLED': 'Cancelado'
    };
    return map[status] || status;
}

async function loadGames() {
    try {
        const games = await apiCall('/games');
        const tbody = document.getElementById('tbody-games');
        tbody.innerHTML = '';
        
        let hasActive = false;
        let hasPaused = false;

        games.forEach(game => {
            if (['WAITING', 'SELLING', 'DRAWING'].includes(game.status)) hasActive = true;
            if (game.status === 'PAUSED') hasPaused = true;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${game.roundNumber}</td>
                <td><span class="badge-status ${getStatusClass(game.status)}">${getStatusText(game.status)}</span></td>
                <td>${game.totalCards}</td>
                <td class="text-amber">${formatCurrency(game.prizePool)}</td>
                <td class="text-green">${formatCurrency(game.houseRake)}</td>
                <td>${formatDate(game.createdAt)}</td>
            `;
            tbody.appendChild(tr);
        });

        const btnPause = document.getElementById('btn-pause-game');
        const btnResume = document.getElementById('btn-resume-game');
        
        btnPause.classList.toggle('hidden', !hasActive);
        btnResume.classList.toggle('hidden', !hasPaused);

    } catch (e) { console.error(e); }
}

document.getElementById('btn-pause-game').addEventListener('click', async () => {
    if (!confirm('¿Pausar la partida actual?')) return;
    try {
        await apiCall('/games/pause', 'POST');
        showToast('Partida pausada', 'success');
        loadGames();
    } catch(e) {}
});

document.getElementById('btn-resume-game').addEventListener('click', async () => {
    if (!confirm('¿Reanudar la partida?')) return;
    try {
        await apiCall('/games/resume', 'POST');
        showToast('Partida reanudada', 'success');
        loadGames();
    } catch(e) {}
});


// --- Deposits ---
async function loadDeposits() {
    try {
        const deposits = await apiCall('/deposits');
        const tbody = document.getElementById('tbody-deposits');
        tbody.innerHTML = '';
        
        if (deposits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay depósitos pendientes</td></tr>`;
            return;
        }

        deposits.forEach(dep => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>ID: ${dep.userId.substring(0,8)}...</td>
                <td><strong>${dep.referenceCode}</strong></td>
                <td class="text-green font-weight-bold">${formatCurrency(dep.amount)}</td>
                <td>${dep.bankCode} / ${dep.phoneNumber}</td>
                <td>${formatDate(dep.createdAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-success" onclick="handleDeposit('${dep.id}', 'approve')">Aprobar</button>
                        <button class="btn btn-danger" onclick="handleDeposit('${dep.id}', 'reject')">Rechazar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        updateBadges();
    } catch (e) { console.error(e); }
}

window.handleDeposit = async function(id, action) {
    if (!confirm(`¿Estás seguro de que deseas ${action === 'approve' ? 'APROBAR' : 'RECHAZAR'} este depósito?`)) return;
    try {
        await apiCall(`/deposits/${id}/${action}`, 'POST');
        showToast(`Depósito ${action === 'approve' ? 'aprobado' : 'rechazado'} exitosamente`, 'success');
        loadDeposits();
    } catch (e) { console.error(e); }
}

// --- Withdrawals ---
async function loadWithdrawals() {
    try {
        const withdrawals = await apiCall('/withdrawals');
        const tbody = document.getElementById('tbody-withdrawals');
        tbody.innerHTML = '';
        
        if (withdrawals.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay retiros pendientes</td></tr>`;
            return;
        }

        withdrawals.forEach(wit => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>ID: ${wit.userId.substring(0,8)}...</td>
                <td class="text-red font-weight-bold">${formatCurrency(wit.amount)}</td>
                <td>${wit.bankCode} / CI: ${wit.cedulaNumber}</td>
                <td>${wit.phoneNumber}</td>
                <td>${formatDate(wit.createdAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-primary" onclick="handleWithdrawal('${wit.id}')">Marcar Procesado</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        updateBadges();
    } catch (e) { console.error(e); }
}

window.handleWithdrawal = async function(id) {
    if (!confirm(`¿Confirmas que ya transferiste el dinero y deseas marcar este retiro como procesado?`)) return;
    try {
        await apiCall(`/withdrawals/${id}/process`, 'POST');
        showToast('Retiro procesado exitosamente', 'success');
        loadWithdrawals();
    } catch (e) { console.error(e); }
}

// --- Finance ---
async function loadFinance() {
    try {
        const stats = await apiCall('/finance');
        document.getElementById('fin-deposits').textContent = formatCurrency(stats.totalDeposits);
        document.getElementById('fin-withdrawals').textContent = formatCurrency(stats.totalWithdrawals);
        document.getElementById('fin-revenue').textContent = formatCurrency(stats.houseRevenue);
    } catch (e) { console.error(e); }
}

// --- Settings ---
async function loadSettings() {
    try {
        const s = await apiCall('/settings');
        
        // Rooms
        document.getElementById('cfg-room-bronce').value = s.roomBroncePriceBs ?? 50;
        document.getElementById('cfg-room-clasica').value = s.roomClasicaPriceBs ?? 100;
        document.getElementById('cfg-room-oro').value = s.roomOroPriceBs ?? 250;
        document.getElementById('cfg-room-diamante').value = s.roomDiamantePriceBs ?? 500;

        // Prizes (%)
        document.getElementById('cfg-pct-1line').value = s.prize1LinePercentage ?? 9;
        document.getElementById('cfg-pct-2lines').value = s.prize2LinesPercentage ?? 14;
        document.getElementById('cfg-pct-full').value = s.prizeFullCardPercentage ?? 57;
        document.getElementById('cfg-pct-seed').value = s.reserveSeedPercentage ?? 5;
        document.getElementById('cfg-pct-house').value = s.housePercentage ?? 15;

        // Times
        document.getElementById('cfg-game-interval').value = s.gameIntervalMinutes ?? 3;
        document.getElementById('cfg-selling-window').value = s.sellingWindowSeconds ?? 120;
        document.getElementById('cfg-draw-interval').value = s.ballDrawIntervalSeconds ?? 4;
        document.getElementById('cfg-max-cards').value = s.maxCardsPerPlayer ?? 50;

        // Pago Movil
        document.getElementById('cfg-pm-banco').value = s.pagoMovilBanco || '0102';
        document.getElementById('cfg-pm-cedula').value = s.pagoMovilCedula || 'V-12345678';
        document.getElementById('cfg-pm-telefono').value = s.pagoMovilTelefono || '0412-1234567';

        updateTotalPercentageBadge();
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function updateTotalPercentageBadge() {
    const l1 = parseFloat(document.getElementById('cfg-pct-1line')?.value) || 0;
    const l2 = parseFloat(document.getElementById('cfg-pct-2lines')?.value) || 0;
    const full = parseFloat(document.getElementById('cfg-pct-full')?.value) || 0;
    const seed = parseFloat(document.getElementById('cfg-pct-seed')?.value) || 0;
    const house = parseFloat(document.getElementById('cfg-pct-house')?.value) || 0;

    const total = l1 + l2 + full + seed + house;
    const badge = document.getElementById('cfg-total-pct-badge');
    const val = document.getElementById('cfg-total-pct-val');

    if (val) val.textContent = `${total.toFixed(1)}%`;
    if (badge) {
        if (Math.abs(total - 100) <= 0.01) {
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.color = '#10B981';
        } else {
            badge.style.background = 'rgba(239, 68, 68, 0.2)';
            badge.style.color = '#EF4444';
        }
    }
}

// Live calculation listeners
['cfg-pct-1line', 'cfg-pct-2lines', 'cfg-pct-full', 'cfg-pct-seed', 'cfg-pct-house'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateTotalPercentageBadge);
});

// Settings Form Submit
const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-settings');
        btn.disabled = true;
        btn.textContent = '⏳ Guardando...';

        const payload = {
            roomBroncePriceBs: parseFloat(document.getElementById('cfg-room-bronce').value),
            roomClasicaPriceBs: parseFloat(document.getElementById('cfg-room-clasica').value),
            roomOroPriceBs: parseFloat(document.getElementById('cfg-room-oro').value),
            roomDiamantePriceBs: parseFloat(document.getElementById('cfg-room-diamante').value),

            prize1LinePercentage: parseFloat(document.getElementById('cfg-pct-1line').value),
            prize2LinesPercentage: parseFloat(document.getElementById('cfg-pct-2lines').value),
            prizeFullCardPercentage: parseFloat(document.getElementById('cfg-pct-full').value),
            reserveSeedPercentage: parseFloat(document.getElementById('cfg-pct-seed').value),
            housePercentage: parseFloat(document.getElementById('cfg-pct-house').value),

            gameIntervalMinutes: parseInt(document.getElementById('cfg-game-interval').value),
            sellingWindowSeconds: parseInt(document.getElementById('cfg-selling-window').value),
            ballDrawIntervalSeconds: parseInt(document.getElementById('cfg-draw-interval').value),
            maxCardsPerPlayer: parseInt(document.getElementById('cfg-max-cards').value),

            pagoMovilBanco: document.getElementById('cfg-pm-banco').value.trim(),
            pagoMovilCedula: document.getElementById('cfg-pm-cedula').value.trim(),
            pagoMovilTelefono: document.getElementById('cfg-pm-telefono').value.trim()
        };

        try {
            await apiCall('/settings', 'POST', payload);
            showToast('✅ Configuración guardada y actualizada en vivo', 'success');
            loadSettings();
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Guardar Configuración';
        }
    });
}

const btnResetSettings = document.getElementById('btn-reset-settings');
if (btnResetSettings) {
    btnResetSettings.addEventListener('click', () => {
        loadSettings();
        showToast('Valores restablecidos desde el servidor', 'info');
    });
}

// Boot
init();

