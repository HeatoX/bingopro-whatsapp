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
        'settings': loadSettings,
        'raffles': loadRaffles
    };

    if (loaders[pageId]) {
        loaders[pageId]();
        // Set auto-refresh
        if (pageId === 'dashboard' || pageId === 'deposits' || pageId === 'withdrawals' || pageId === 'raffles') {
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
        document.getElementById('cfg-pct-1line').value = s.prize1LinePercentage ?? 10;
        document.getElementById('cfg-pct-2lines').value = s.prize2LinesPercentage ?? 15;
        document.getElementById('cfg-pct-full').value = s.prizeFullCardPercentage ?? 50;
        document.getElementById('cfg-pct-seed').value = s.reserveSeedPercentage ?? 5;
        document.getElementById('cfg-pct-house').value = s.housePercentage ?? 20;

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

// ============================================
// RAFFLE MANAGEMENT (10,000 NÚMEROS / SUPERGANA 10:00 PM)
// ============================================
let currentRafflesList = [];

async function loadRaffles() {
    const grid = document.getElementById('raffles-admin-grid');
    if (!grid) return;

    try {
        currentRafflesList = await apiCall('/raffles');
        renderRafflesAdmin(currentRafflesList);
        fetchSuperGanaLiveAdmin();
    } catch (err) {
        grid.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error al cargar rifas: ${err.message}</div>`;
    }
}

function renderRafflesAdmin(raffles) {
    const grid = document.getElementById('raffles-admin-grid');
    if (!grid) return;

    if (!raffles || raffles.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed var(--border);">
                <div style="font-size: 40px; margin-bottom: 12px;">🎟️</div>
                <h3 style="color: #FFF; margin-bottom: 6px;">No hay rifas creadas todavía</h3>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Crea tu primera rifa de 10,000 números con sorteo de SuperGana.</p>
                <button class="btn btn-primary" onclick="openCreateRaffleModal()" style="background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; font-weight: 700;">➕ Crear Rifa</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = raffles.map(r => {
        const isDrawn = r.status === 'DRAWN';
        const isCancelled = r.status === 'CANCELLED';
        const statusBadge = isDrawn 
            ? `<span class="badge badge-success" style="background: rgba(16, 185, 129, 0.2); color: #10B981; border: 1px solid #10B981;">🏆 FINALIZADA</span>`
            : isCancelled 
            ? `<span class="badge badge-danger">CANCELADA</span>`
            : `<span class="badge badge-warning" style="background: rgba(255, 215, 0, 0.2); color: #FFD700; border: 1px solid #FFD700;">🟢 EN VENTA</span>`;

        const fallbackImg = 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80';
        const imgUrl = r.imageUrl || fallbackImg;

        return `
            <div class="glass-panel" style="border-radius: 16px; overflow: hidden; border: 1px solid ${isDrawn ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 215, 0, 0.25)'}; display: flex; flex-direction: column; background: #151528;">
                <div style="height: 180px; width: 100%; position: relative; overflow: hidden; background: #000;">
                    <img src="${imgUrl}" alt="${r.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='${fallbackImg}'">
                    <div style="position: absolute; top: 12px; left: 12px;">${statusBadge}</div>
                    <div style="position: absolute; bottom: 12px; right: 12px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #FFD700; border: 1px solid rgba(255,215,0,0.3);">
                        Bs ${r.ticketPrice.toFixed(2)} / boleto
                    </div>
                </div>

                <div style="padding: 18px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <h3 style="margin: 0 0 8px 0; color: #FFF; font-size: 16px; font-weight: 700; line-height: 1.3;">${r.title}</h3>
                        <p style="margin: 0 0 14px 0; color: var(--text-secondary); font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${r.description || 'Rifa oficial con sorteo de SuperGana (10:00 PM).'}
                        </p>

                        <!-- Progress Bar (10,000 Numbers) -->
                        <div style="margin-bottom: 14px; background: rgba(255,255,255,0.05); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;">
                                <span style="color: var(--text-secondary);">Boletos Vendidos:</span>
                                <span style="font-weight: 700; color: #00E5FF;">${r.soldCount.toLocaleString('es-VE')} / 10,000 (${r.soldPercentage}%)</span>
                            </div>
                            <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.5); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${Math.min(100, Math.max(2, r.soldPercentage))}%; height: 100%; background: linear-gradient(90deg, #00E5FF, #FFD700); border-radius: 4px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 6px; color: var(--text-secondary);">
                                <span>Recaudado: <strong style="color: #10B981;">Bs ${r.totalRevenue.toLocaleString('es-VE', {minimumFractionDigits: 2})}</strong></span>
                                <span>Meta: Bs ${r.potentialRevenue.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>

                        ${isDrawn ? `
                            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10B981; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 12px; color: #FFF;">👑 Boleto Ganador:</span>
                                    <span style="font-size: 20px; font-weight: 800; color: #FFD700; font-family: monospace; letter-spacing: 2px;">#${r.winningNumber}</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                    Ganador: <strong style="color: #FFF;">${r.winnerName || 'Boleto No Vendido (Vacante)'}</strong> ${r.winnerPhone ? `(${r.winnerPhone})` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Actions -->
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; border-top: 1px solid var(--border); padding-top: 12px;">
                        ${!isDrawn ? `
                            <button class="btn btn-sm" onclick="openDrawRaffleModal('${r.id}')" style="flex: 1; background: linear-gradient(135deg, #00E5FF, #00B4D8); color: #000; font-weight: 700;">
                                👑 Sorteo / Ganador
                            </button>
                        ` : ''}
                        <button class="btn btn-sm" onclick="openViewRaffleTickets('${r.id}')" style="background: rgba(255,255,255,0.08); color: #FFF;">
                            📋 Boletos (${r.soldCount})
                        </button>
                        <button class="btn btn-sm" onclick="openEditRaffleModal('${r.id}')" style="background: rgba(255,255,255,0.08); color: #FFD700;">
                            ✏️
                        </button>
                        <button class="btn btn-sm" onclick="deleteRaffle('${r.id}', '${r.title.replace(/'/g, "\\'")}')" style="background: rgba(239, 68, 68, 0.15); color: #EF4444;">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Fetch SuperGana 10:00 PM result in admin
async function fetchSuperGanaLiveAdmin() {
    try {
        const data = await apiCall('/raffles/supergana');
        const numEl = document.getElementById('sg-win-num');
        const signoEl = document.getElementById('sg-win-signo');
        if (data && data.success && data.winningNumber) {
            if (numEl) numEl.textContent = data.winningNumber;
            if (signoEl) signoEl.textContent = data.signo ? `${data.signo} (10:00 PM)` : 'SuperGana 10:00 PM';
        } else {
            if (numEl) numEl.textContent = 'Pendiente';
            if (signoEl) signoEl.textContent = '10:00 PM Hoy';
        }
    } catch (err) {
        console.warn('SuperGana scraper status:', err.message);
    }
}

const btnRefreshSG = document.getElementById('btn-refresh-sg');
if (btnRefreshSG) {
    btnRefreshSG.addEventListener('click', () => {
        btnRefreshSG.disabled = true;
        btnRefreshSG.textContent = '⏳...';
        fetchSuperGanaLiveAdmin().finally(() => {
            btnRefreshSG.disabled = false;
            btnRefreshSG.textContent = '🔄 Actualizar';
            showToast('Resultados de SuperGana actualizados', 'info');
        });
    });
}

const btnSyncTop = document.getElementById('btn-sync-supergana-top');
if (btnSyncTop) {
    btnSyncTop.addEventListener('click', () => {
        btnSyncTop.disabled = true;
        fetchSuperGanaLiveAdmin().then(() => {
            showToast('SuperGana 10:00 PM verificado con éxito', 'success');
        }).finally(() => {
            btnSyncTop.disabled = false;
        });
    });
}

// --- Create & Edit Raffle Modal Handlers ---
window.openCreateRaffleModal = function() {
    const modal = document.getElementById('modal-raffle');
    if (!modal) return;
    document.getElementById('modal-raffle-title').textContent = '➕ Crear Nueva Rifa Millonaria (10k)';
    document.getElementById('form-raffle').reset();
    document.getElementById('raffle-edit-id').value = '';
    document.getElementById('raf-lottery').value = 'SuperGana 10:00 PM';
    document.getElementById('raf-img-preview').style.display = 'none';
    document.getElementById('raf-img-placeholder').style.display = 'block';
    modal.classList.remove('hidden');
};

const btnOpenCreate = document.getElementById('btn-open-create-raffle');
if (btnOpenCreate) btnOpenCreate.addEventListener('click', openCreateRaffleModal);

window.openEditRaffleModal = function(raffleId) {
    const r = currentRafflesList.find(x => x.id === raffleId);
    if (!r) return;

    const modal = document.getElementById('modal-raffle');
    if (!modal) return;

    document.getElementById('modal-raffle-title').textContent = '✏️ Editar Rifa Millonaria';
    document.getElementById('raffle-edit-id').value = r.id;
    document.getElementById('raf-title').value = r.title;
    document.getElementById('raf-desc').value = r.description || '';
    document.getElementById('raf-price').value = r.ticketPrice;
    document.getElementById('raf-lottery').value = r.lotteryName || 'SuperGana 10:00 PM';
    document.getElementById('raf-img-url').value = r.imageUrl || '';

    const imgPreview = document.getElementById('raf-img-preview');
    const placeholder = document.getElementById('raf-img-placeholder');
    if (r.imageUrl) {
        imgPreview.src = r.imageUrl;
        imgPreview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        imgPreview.style.display = 'none';
        placeholder.style.display = 'block';
    }

    modal.classList.remove('hidden');
};

const btnCloseRaffleModal = document.getElementById('btn-close-raffle-modal');
const btnCancelRaffle = document.getElementById('btn-cancel-raffle');
if (btnCloseRaffleModal) btnCloseRaffleModal.addEventListener('click', () => document.getElementById('modal-raffle').classList.add('hidden'));
if (btnCancelRaffle) btnCancelRaffle.addEventListener('click', () => document.getElementById('modal-raffle').classList.add('hidden'));

// Image Upload From Local PC
const btnUploadRafImg = document.getElementById('btn-upload-raf-img');
const rafFileInput = document.getElementById('raf-file-input');
const rafImgUrlInput = document.getElementById('raf-img-url');

if (btnUploadRafImg && rafFileInput) {
    btnUploadRafImg.addEventListener('click', () => rafFileInput.click());

    rafFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            try {
                showToast('Subiendo imagen de premio...', 'info');
                const res = await apiCall('/raffles/upload-image', 'POST', { base64Data, filename: file.name });
                if (res.success && res.imageUrl) {
                    rafImgUrlInput.value = res.imageUrl;
                    const preview = document.getElementById('raf-img-preview');
                    preview.src = res.imageUrl;
                    preview.style.display = 'block';
                    document.getElementById('raf-img-placeholder').style.display = 'none';
                    showToast('✅ Foto subida exitosamente', 'success');
                }
            } catch (err) {
                showToast('Error al subir imagen: ' + err.message, 'error');
            }
        };
        reader.readAsDataURL(file);
    });
}

if (rafImgUrlInput) {
    rafImgUrlInput.addEventListener('input', () => {
        const url = rafImgUrlInput.value.trim();
        const preview = document.getElementById('raf-img-preview');
        const placeholder = document.getElementById('raf-img-placeholder');
        if (url) {
            preview.src = url;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
    });
}

// Form Submit (Create / Edit)
const formRaffle = document.getElementById('form-raffle');
if (formRaffle) {
    formRaffle.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('raffle-edit-id').value;
        const title = document.getElementById('raf-title').value.trim();
        const description = document.getElementById('raf-desc').value.trim();
        const ticketPrice = parseFloat(document.getElementById('raf-price').value);
        const lotteryName = document.getElementById('raf-lottery').value.trim();
        const imageUrl = document.getElementById('raf-img-url').value.trim();

        const payload = { title, description, ticketPrice, lotteryName, imageUrl };

        try {
            if (editId) {
                await apiCall(`/raffles/${editId}`, 'PUT', payload);
                showToast('✅ Rifa actualizada con éxito', 'success');
            } else {
                await apiCall('/raffles', 'POST', payload);
                showToast('🎉 Nueva Rifa creada exitosamente (10,000 números)', 'success');
            }
            document.getElementById('modal-raffle').classList.add('hidden');
            loadRaffles();
        } catch (err) {
            console.error(err);
        }
    });
}

// Delete Raffle
window.deleteRaffle = async function(raffleId, title) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la rifa "${title}"?`)) return;
    try {
        await apiCall(`/raffles/${raffleId}`, 'DELETE');
        showToast('Rifa eliminada correctamente', 'info');
        loadRaffles();
    } catch (err) {
        console.error(err);
    }
};

// --- Draw Winner Modal (SuperGana 10:00 PM) ---
window.openDrawRaffleModal = function(raffleId) {
    const r = currentRafflesList.find(x => x.id === raffleId);
    if (!r) return;

    const modal = document.getElementById('modal-draw-raffle');
    if (!modal) return;

    document.getElementById('draw-raffle-id').value = r.id;
    document.getElementById('draw-target-title').textContent = r.title;
    document.getElementById('draw-target-sold').textContent = `Boletos Vendidos: ${r.soldCount.toLocaleString('es-VE')} / 10,000 (${r.soldPercentage}%)`;
    document.getElementById('draw-target-revenue').textContent = `Recaudado: Bs ${r.totalRevenue.toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    document.getElementById('draw-winning-number').value = '';
    document.getElementById('draw-sg-result-info').innerHTML = `Lotería: <strong>${r.lotteryName || 'SuperGana 10:00 PM'}</strong>`;

    modal.classList.remove('hidden');
};

const btnCloseDrawModal = document.getElementById('btn-close-draw-modal');
const btnCancelDraw = document.getElementById('btn-cancel-draw');
if (btnCloseDrawModal) btnCloseDrawModal.addEventListener('click', () => document.getElementById('modal-draw-raffle').classList.add('hidden'));
if (btnCancelDraw) btnCancelDraw.addEventListener('click', () => document.getElementById('modal-draw-raffle').classList.add('hidden'));

const btnFetchSgIntoDraw = document.getElementById('btn-fetch-sg-into-draw');
if (btnFetchSgIntoDraw) {
    btnFetchSgIntoDraw.addEventListener('click', async () => {
        btnFetchSgIntoDraw.disabled = true;
        btnFetchSgIntoDraw.textContent = '⏳ Consultando supergana.com.ve...';
        try {
            const data = await apiCall('/raffles/supergana');
            if (data && data.success && data.winningNumber) {
                document.getElementById('draw-winning-number').value = data.winningNumber;
                document.getElementById('draw-sg-result-info').innerHTML = `
                    <div style="color: #10B981; font-weight: 700;">✅ Resultado Oficial Extraído: <strong>${data.winningNumber}</strong> (${data.signo || ''} - 10:00 PM)</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">Combina: ${data.combina4Digits || '--'} | TriNapa: ${data.triNapa3Digits || '--'}</div>
                `;
                showToast(`Número oficial extraído: ${data.winningNumber}`, 'success');
            } else {
                document.getElementById('draw-sg-result-info').innerHTML = `<span style="color: var(--accent-amber);">⚠️ No se encontró número publicado aún para las 10:00 PM. Puedes ingresarlo manualmente.</span>`;
            }
        } catch (err) {
            document.getElementById('draw-sg-result-info').innerHTML = `<span style="color: var(--accent-red);">Error al consultar SuperGana: ${err.message}</span>`;
        } finally {
            btnFetchSgIntoDraw.disabled = false;
            btnFetchSgIntoDraw.textContent = '🔄 Consultar Número Oficial de SuperGana (10:00 PM)';
        }
    });
}

const btnSubmitDrawWinner = document.getElementById('btn-submit-draw-winner');
if (btnSubmitDrawWinner) {
    btnSubmitDrawWinner.addEventListener('click', async () => {
        const raffleId = document.getElementById('draw-raffle-id').value;
        const num = document.getElementById('draw-winning-number').value.trim();

        if (!num || !/^\d{1,4}$/.test(num)) {
            return showToast('Ingresa un número ganador válido de 4 cifras (ej: 2266 o 0729)', 'error');
        }

        const paddedNum = num.padStart(4, '0');
        if (!confirm(`¿Confirmas que el número ganador oficial es el #${paddedNum}?`)) return;

        btnSubmitDrawWinner.disabled = true;
        btnSubmitDrawWinner.textContent = '⏳ Declarando Ganador...';

        try {
            const res = await apiCall(`/raffles/${raffleId}/draw`, 'POST', { winningNumber: paddedNum, isAutoVerified: true });
            if (res.hasWinner) {
                showToast(`👑 ¡GANADOR ENCONTRADO! ${res.winnerTicket.user.name} ganó con el boleto #${paddedNum}`, 'success');
            } else {
                showToast(`Sorteo completado con #${paddedNum} (Boleto no fue vendido - Vacante)`, 'info');
            }
            document.getElementById('modal-draw-raffle').classList.add('hidden');
            loadRaffles();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btnSubmitDrawWinner.disabled = false;
            btnSubmitDrawWinner.textContent = '🏆 Confirmar y Declarar Ganador';
        }
    });
}

// --- View Sold Tickets Modal ---
window.openViewRaffleTickets = async function(raffleId) {
    const r = currentRafflesList.find(x => x.id === raffleId);
    if (!r) return;

    const modal = document.getElementById('modal-raffle-tickets');
    if (!modal) return;

    document.getElementById('tickets-modal-raffle-title').textContent = `📋 Boletos Vendidos — ${r.title}`;
    const tbody = document.getElementById('raffle-tickets-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 20px;">Cargando lista de boletos...</td></tr>';

    modal.classList.remove('hidden');

    try {
        const details = await apiCall(`/raffles/${raffleId}`);
        const tickets = details.tickets || details.recentTickets || r.recentTickets || [];

        if (tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 30px;">Aún no se han vendido boletos para esta rifa.</td></tr>';
            return;
        }

        tbody.innerHTML = tickets.map(t => `
            <tr>
                <td style="font-family: monospace; font-size: 15px; font-weight: 800; color: #FFD700;">#${t.ticketNumber}</td>
                <td style="font-weight: 600; color: #FFF;">${t.buyerName || 'Jugador'}</td>
                <td style="color: var(--text-secondary);">${t.buyerPhone || '--'}</td>
                <td style="color: var(--text-secondary);">${t.buyerCedula || '--'}</td>
                <td style="color: var(--text-secondary); font-size: 12px;">${formatDate(t.purchasedAt)}</td>
                <td>
                    ${t.isWinner ? '<span class="badge badge-success">👑 GANADOR</span>' : '<span class="badge" style="background: rgba(255,255,255,0.08); color: #FFF;">EN JUEGO</span>'}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-red); text-align: center;">Error al cargar boletos: ${err.message}</td></tr>`;
    }
};

const btnCloseTicketsModal = document.getElementById('btn-close-tickets-modal');
if (btnCloseTicketsModal) btnCloseTicketsModal.addEventListener('click', () => document.getElementById('modal-raffle-tickets').classList.add('hidden'));

// Boot
init();

