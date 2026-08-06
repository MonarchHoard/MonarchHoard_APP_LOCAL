// =========================================================
// CLASSIFICHE - Monarch Hoard
// =========================================================

const LB_CONFIG = {
    memory: {
        label: 'Memory',
        endpoint: function (d) { return '/api/memory/leaderboard/' + d; },
        difficulties: [
            { value: 6,  label: 'Facile' },
            { value: 8,  label: 'Normale' },
            { value: 12, label: 'Difficile' },
            { value: 18, label: 'Monarca' }
        ],
        defaultDifficulty: 8,
        headScore: 'Mosse',
        headDetail: 'Tempo',
        score: function (row) { return row.moves + ' mosse'; },
        detail: function (row) { return formatTime(row.seconds); }
    },
    quiz: {
        label: 'Indovina la Carta',
        endpoint: function (d) { return '/api/games/leaderboard/quiz/' + d; },
        difficulties: [
            { value: 1, label: 'Facile' },
            { value: 2, label: 'Normale' },
            { value: 3, label: 'Monarca' }
        ],
        defaultDifficulty: 2,
        headScore: 'Punti',
        headDetail: 'Corrette',
        score: function (row) { return row.score + ' pt'; },
        detail: function (row) { return row.detail || '\u2014'; }
    }
};

let currentGame = 'memory';
let currentDifficulty = 8;
let myName = null;

// -------- Utility --------
async function fetchJSON(url, options) {
    const response = await fetch(url, options || {});
    if (!response.ok) throw new Error('Errore HTTP ' + response.status);
    return response.json();
}

function escapeHTML(value) {
    return String(value === null || value === undefined ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatTime(s) {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return m + ':' + sec;
}

function formatDate(value) {
    if (!value) return '\u2014';
    const d = new Date(value.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// -------- Dropdown --------
function toggleDropdown(id) {
    document.querySelectorAll('.dropdown-content').forEach(function (m) {
        if (m.id !== id) m.classList.remove('open');
    });
    document.getElementById(id).classList.toggle('open');
}

document.addEventListener('click', function (e) {
    if (e.target.closest('.dropdown-filter')) return;
    document.querySelectorAll('.dropdown-content').forEach(function (m) {
        m.classList.remove('open');
    });
});

// -------- Selezione gioco / difficolta' --------
function selectGame(game) {
    if (!LB_CONFIG[game]) return;
    currentGame = game;
    currentDifficulty = LB_CONFIG[game].defaultDifficulty;

    document.getElementById('tab-memory').classList.toggle('active', game === 'memory');
    document.getElementById('tab-quiz').classList.toggle('active', game === 'quiz');

    document.getElementById('lb-head-score').innerText = LB_CONFIG[game].headScore;
    document.getElementById('lb-head-detail').innerText = LB_CONFIG[game].headDetail;

    renderDifficultyChips();
    loadLeaderboard();
}

function renderDifficultyChips() {
    const wrap = document.getElementById('lb-difficulty-list');
    wrap.innerHTML = '';
    LB_CONFIG[currentGame].difficulties.forEach(function (d) {
        const chip = document.createElement('div');
        chip.className = 'filter-chip' + (d.value === currentDifficulty ? ' active' : '');
        chip.innerText = d.label;
        chip.onclick = function () { setDifficulty(d.value, d.label); };
        wrap.appendChild(chip);
    });
    updateDifficultyButton();
}

function updateDifficultyButton() {
    const d = LB_CONFIG[currentGame].difficulties.find(function (x) {
        return x.value === currentDifficulty;
    });
    document.getElementById('lb-difficulty-button').innerText =
        'Difficolta\': ' + (d ? d.label : '?') + ' \u25BC';
}

function setDifficulty(value, label) {
    currentDifficulty = value;
    document.getElementById('lb-difficulty-dropdown').classList.remove('open');
    renderDifficultyChips();
    loadLeaderboard();
}

// -------- Caricamento classifica --------
async function loadLeaderboard() {
    const rowsEl = document.getElementById('lb-rows');
    const podiumEl = document.getElementById('lb-podium');
    rowsEl.innerHTML = '<div class="lb-loading">Caricamento...</div>';
    podiumEl.innerHTML = '';

    const cfg = LB_CONFIG[currentGame];

    try {
        const data = await fetchJSON(cfg.endpoint(currentDifficulty));

        document.getElementById('lb-count').innerText = data.length;

        if (!Array.isArray(data) || data.length === 0) {
            rowsEl.innerHTML =
                '<div class="lb-empty">Nessun record per questa difficolta\'. Sii il primo!</div>';
            document.getElementById('lb-myrank').innerText = '\u2014';
            return;
        }

        renderPodium(data, cfg);
        renderRows(data, cfg);
        renderMyRank(data);
    } catch (e) {
        console.error(e);
        rowsEl.innerHTML = '<div class="lb-empty">Errore nel caricamento della classifica.</div>';
        showToast('Impossibile caricare la classifica.', 'error');
    }
}

function renderPodium(data, cfg) {
    const podiumEl = document.getElementById('lb-podium');
    const top = data.slice(0, 3);
    const order = [1, 0, 2]; // secondo - primo - terzo
    let html = '';

    order.forEach(function (i) {
        if (!top[i]) return;
        const row = top[i];
        const place = i + 1;
        const isMe = myName && row.player === myName;
        html +=
            '<div class="lb-podium-slot place-' + place + (isMe ? ' is-me' : '') + '">' +
                '<div class="lb-podium-medal">' + place + '</div>' +
                '<div class="lb-podium-name">' + escapeHTML(row.player) + '</div>' +
                '<div class="lb-podium-score">' + escapeHTML(cfg.score(row)) + '</div>' +
                '<div class="lb-podium-detail">' + escapeHTML(cfg.detail(row)) + '</div>' +
            '</div>';
    });

    podiumEl.innerHTML = html;
}

function renderRows(data, cfg) {
    const rowsEl = document.getElementById('lb-rows');
    let html = '';

    data.forEach(function (row, i) {
        const pos = i + 1;
        const isMe = myName && row.player === myName;
        html +=
            '<div class="lb-row' + (isMe ? ' is-me' : '') + (pos <= 3 ? ' top' : '') + '">' +
                '<div class="lb-col-pos">' + pos + '</div>' +
                '<div class="lb-col-player">' + escapeHTML(row.player) + '</div>' +
                '<div class="lb-col-score">' + escapeHTML(cfg.score(row)) + '</div>' +
                '<div class="lb-col-detail">' + escapeHTML(cfg.detail(row)) + '</div>' +
                '<div class="lb-col-date">' + escapeHTML(formatDate(row.created_at)) + '</div>' +
            '</div>';
    });

    rowsEl.innerHTML = html;
}

function renderMyRank(data) {
    const el = document.getElementById('lb-myrank');
    if (!myName) {
        el.innerText = '\u2014';
        return;
    }
    const idx = data.findIndex(function (r) { return r.player === myName; });
    el.innerText = idx === -1 ? 'Fuori classifica' : ('#' + (idx + 1));
}

// -------- Nome utente --------
async function loadUserInfo() {
    try {
        const data = await fetchJSON('/api/me');
        if (data && data.display_name) {
            myName = data.display_name;
            const el = document.querySelector('.player-name');
            if (el) el.innerText = data.display_name;
        }
    } catch (e) {
        console.error(e);
    }
}

// -------- Toast --------
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
        toast.classList.add('toast-out');
        setTimeout(function () { toast.remove(); }, 300);
    }, duration);
}

// -------- Avvio pagina --------
document.addEventListener('DOMContentLoaded', async function () {
    await loadUserInfo();
    selectGame('memory');
});
