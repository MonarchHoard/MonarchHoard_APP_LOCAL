// =========================================================
// CLASSIFICHE - Monarch Hoard
// =========================================================
function getLbConfig() {
    return {
        memory: {
            label: t('nav.memory'),
            endpoint: function (d) { return '/api/memory/leaderboard/' + d; },
            difficulties: [
                { value: 6,  label: t('games.difficulty_easy') },
                { value: 8,  label: t('games.difficulty_normal') },
                { value: 12, label: t('games.difficulty_hard') },
                { value: 18, label: t('games.difficulty_monarch') }
            ],
            defaultDifficulty: 8,
            headScore: t('games.leaderboard_col_moves'),
            headDetail: t('games.leaderboard_col_time'),
            score: function (row) { return row.moves + ' ' + t('games.unit_moves'); },
            detail: function (row) { return formatTime(row.seconds); }
        },
        quiz: {
            label: t('nav.quiz'),
            endpoint: function (d) { return '/api/games/leaderboard/quiz/' + d; },
            difficulties: [
                { value: 1, label: t('games.difficulty_easy') },
                { value: 2, label: t('games.difficulty_normal') },
                { value: 3, label: t('games.difficulty_monarch') }
            ],
            defaultDifficulty: 2,
            headScore: t('games.leaderboard_col_score'),
            headDetail: t('games.leaderboard_col_correct'),
            score: function (row) { return row.score + ' ' + t('games.unit_points'); },
            detail: function (row) { return row.detail || '\u2014'; }
        }
    };
}

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
    const cfg = getLbConfig();
    if (!cfg[game]) return;

    currentGame = game;
    currentDifficulty = cfg[game].defaultDifficulty;

    document.getElementById('tab-memory').classList.toggle('active', game === 'memory');
    document.getElementById('tab-quiz').classList.toggle('active', game === 'quiz');

    document.getElementById('lb-head-score').innerText = cfg[game].headScore;
    document.getElementById('lb-head-detail').innerText = cfg[game].headDetail;

    renderDifficultyChips();
    loadLeaderboard();
}

function renderDifficultyChips() {
    const cfg = getLbConfig();
    const wrap = document.getElementById('lb-difficulty-list');
    wrap.innerHTML = '';
    cfg[currentGame].difficulties.forEach(function (d) {
        const chip = document.createElement('div');
        chip.className = 'filter-chip' + (d.value === currentDifficulty ? ' active' : '');
        chip.innerText = d.label;
        chip.onclick = function () { setDifficulty(d.value, d.label); };
        wrap.appendChild(chip);
    });
    updateDifficultyButton();
}

function updateDifficultyButton() {
    const cfg = getLbConfig();
    const d = cfg[currentGame].difficulties.find(function (x) {
        return x.value === currentDifficulty;
    });
    document.getElementById('lb-difficulty-button').innerText =
        t('games.difficulty_label') + ': ' + (d ? d.label : '?') + ' \u25BC';
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
    rowsEl.innerHTML = `<div class="lb-loading">${t('common.loading')}</div>`;
    podiumEl.innerHTML = '';

    const cfg = getLbConfig()[currentGame];

    try {
        const data = await fetchJSON(cfg.endpoint(currentDifficulty));
        document.getElementById('lb-count').innerText = data.length;

        if (!Array.isArray(data) || data.length === 0) {
            rowsEl.innerHTML =
                `<div class="lb-empty">${t('games.leaderboard_empty')}</div>`;
            document.getElementById('lb-myrank').innerText = '\u2014';
            return;
        }

        renderPodium(data, cfg);
        renderRows(data, cfg);
        renderMyRank(data);
    } catch (e) {
        console.error(e);
        rowsEl.innerHTML = `<div class="lb-empty">${t('games.leaderboard_load_error')}</div>`;
        showToast(t('games.leaderboard_load_error'), 'error');
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
    el.innerText = idx === -1 ? t('games.leaderboard_out_of_rank') : ('#' + (idx + 1));
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
