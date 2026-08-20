// =========================================================
// MEMORY - Monarch Hoard
// =========================================================

let memoryCards = [];
let deck = [];
let flipped = [];
let matched = 0;
let moves = 0;
let pairsCount = 8;
let lockBoard = false;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;

// Stati possibili: 'idle' | 'running' | 'paused' | 'ended'
let gameState = 'idle';

// Timeout in sospeso (per poterli annullare su stop/pausa)
let pendingTimeouts = [];

const CARD_BACK = '/static/wallpaper/logo_monarchhoard.png';

// -------- Utility --------
async function fetchJSON(url, options) {
    const response = await fetch(url, options || {});
    if (!response.ok) throw new Error('Errore HTTP ' + response.status);
    return response.json();
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function formatTime(s) {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return m + ':' + sec;
}

function schedule(fn, delay) {
    const id = setTimeout(function () {
        pendingTimeouts = pendingTimeouts.filter(function (t) { return t !== id; });
        fn();
    }, delay);
    pendingTimeouts.push(id);
    return id;
}

function clearPending() {
    pendingTimeouts.forEach(clearTimeout);
    pendingTimeouts = [];
}

// -------- Dropdown difficolta' --------
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

function setDifficulty(event, pairs, label) {
    pairsCount = pairs;
    document.querySelectorAll('#difficulty-dropdown .filter-chip').forEach(function (c) {
        c.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    document.getElementById('difficulty-button').innerText = 'Difficolta\': ' + label + ' \u25BC';
    document.getElementById('difficulty-dropdown').classList.remove('open');

    // Cambiare difficolta' annulla la partita in corso
    resetToIdle();
    renderBest();
}

// -------- Record dal server --------
let bestScores = {};

async function fetchBests() {
    try {
        bestScores = await fetchJSON('/api/memory/best');
    } catch (e) {
        console.error(e);
        bestScores = {};
    }
    renderBest();
}

function renderBest() {
    const el = document.getElementById('memory-best');
    const best = bestScores[String(pairsCount)];
    if (!best) {
        el.innerText = '\u2014';
        return;
    }
    el.innerText = best.moves + ' mosse \u00B7 ' + formatTime(best.seconds);
}

// -------- Timer --------
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
        seconds++;
        document.getElementById('memory-time').innerText = formatTime(seconds);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// -------- Overlay e stato pulsanti --------
function showOverlay(title, text, buttonLabel, buttonAction, icon) {
    const overlay = document.getElementById('game-overlay');
    document.getElementById('overlay-icon').innerHTML = icon || '&#9670;';
    document.getElementById('overlay-title').innerText = title;
    document.getElementById('overlay-text').innerText = text;

    const btn = document.getElementById('overlay-btn');
    if (buttonLabel) {
        btn.style.display = 'inline-block';
        btn.innerText = buttonLabel;
        btn.onclick = buttonAction;
    } else {
        btn.style.display = 'none';
    }

    overlay.classList.add('visible');
}

function hideOverlay() {
    document.getElementById('game-overlay').classList.remove('visible');
}

function updateControls() {
    const btnPause = document.getElementById('btn-pause');
    const btnStop = document.getElementById('btn-stop');
    const board = document.getElementById('memory-board');

    btnPause.disabled = (gameState !== 'running' && gameState !== 'paused');
    btnStop.disabled = (gameState === 'idle');
    btnPause.innerText = (gameState === 'paused') ? 'Riprendi' : 'Pausa';
    btnPause.classList.toggle('active', gameState === 'paused');

    board.classList.toggle('blurred', gameState === 'paused');
}

// -------- Caricamento carte --------
async function loadMemoryCards() {
    const all = await fetchJSON('/api/cards');
    const owned = all.filter(function (c) { return c.quantity > 0; });
    memoryCards = owned.length >= 18 ? owned : all;
}

// -------- Stato iniziale --------
function resetToIdle() {
    clearPending();
    stopTimer();

    gameState = 'idle';
    gameStarted = false;
    deck = [];
    flipped = [];
    matched = 0;
    moves = 0;
    seconds = 0;
    lockBoard = false;

    document.getElementById('memory-board').innerHTML = '';
    document.getElementById('memory-moves').innerText = '0';
    document.getElementById('memory-time').innerText = '00:00';
    document.getElementById('memory-pairs').innerText = '0 / ' + pairsCount;
    document.getElementById('memory-win').classList.remove('open');

    showOverlay(
        'Memory',
        'Scegli la difficolta\' e premi Nuova partita per iniziare.',
        'Nuova partita',
        startGame,
        '&#9670;'
    );
    updateControls();
}

// -------- Avvio partita --------
function startGame() {
    if (memoryCards.length === 0) return;

    clearPending();
    stopTimer();
    hideOverlay();
    document.getElementById('memory-win').classList.remove('open');

    const available = Math.min(pairsCount, memoryCards.length);
    const picked = shuffle(memoryCards).slice(0, available);

    deck = shuffle([...picked, ...picked].map(function (card, i) {
        return {
            uid: i,
            code: card.card_code,
            name: card.card_name,
            img: card.image_url
        };
    }));

    flipped = [];
    matched = 0;
    moves = 0;
    seconds = 0;
    lockBoard = false;
    gameStarted = false;
    gameState = 'running';

    document.getElementById('memory-moves').innerText = '0';
    document.getElementById('memory-time').innerText = '00:00';
    document.getElementById('memory-pairs').innerText = '0 / ' + available;
    renderBest();

    renderBoard();
    updateControls();
}

// -------- Ferma partita --------
function stopGame() {
    if (gameState === 'idle') return;

    const wasPlaying = (gameState === 'running' || gameState === 'paused');
    resetToIdle();

    if (wasPlaying) {
        showToast('Partita annullata.', 'info');
    }
}

// -------- Pausa --------
function togglePause() {
    if (gameState === 'running') {
        gameState = 'paused';
        stopTimer();
        clearPending();
        lockBoard = true;

        showOverlay(
            'Partita in Pausa',
            'Il tempo e\' fermo e il tavolo e\' oscurato.',
            'Riprendi',
            togglePause,
            '&#10074;&#10074;'
        );
        updateControls();

    } else if (gameState === 'paused') {
        gameState = 'running';
        hideOverlay();
        lockBoard = false;

        // Se erano rimaste due carte girate, le richiude
        if (flipped.length === 2) {
            lockBoard = true;
            const a = flipped[0];
            const b = flipped[1];
            schedule(function () {
                a.classList.remove('flipped', 'shake');
                b.classList.remove('flipped', 'shake');
                flipped = [];
                lockBoard = false;
            }, 400);
        }

        if (gameStarted) startTimer();
        updateControls();
    }
}

// -------- Tavolo --------
function renderBoard() {
    const board = document.getElementById('memory-board');
    board.innerHTML = '';

    deck.forEach(function (item) {
        const tile = document.createElement('div');
        tile.className = 'memory-tile';
        tile.dataset.uid = item.uid;
        tile.dataset.code = item.code;

        const inner = document.createElement('div');
        inner.className = 'memory-tile-inner';

        const back = document.createElement('div');
        back.className = 'memory-face memory-back';
        const backImg = document.createElement('img');
        backImg.src = CARD_BACK;
        backImg.alt = '';
        back.appendChild(backImg);

        const front = document.createElement('div');
        front.className = 'memory-face memory-front';
        const frontImg = document.createElement('img');
        frontImg.src = item.img;
        frontImg.alt = item.name || '';
        frontImg.onerror = function () {
            this.onerror = null;
            this.src = '/static/cards/TRANSPARENT/No_Image_Available.webp';
        };
        front.appendChild(frontImg);

        inner.appendChild(back);
        inner.appendChild(front);
        tile.appendChild(inner);

        tile.addEventListener('click', function () { flipTile(tile); });
        board.appendChild(tile);
    });

    layoutBoard();
}

// Calcola quante colonne servono perche' tutte le carte
// stiano nello schermo senza scroll
function layoutBoard() {
    const board = document.getElementById('memory-board');
    if (!board || deck.length === 0) return;

    const n = deck.length;
    const gap = 14;
    const padding = 20;

    const boardTop = board.getBoundingClientRect().top;
    const availW = board.clientWidth - (padding * 2);
    const availH = window.innerHeight - boardTop - (padding * 2) - 20;

    let bestCols = 1;
    let bestSize = 0;

    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const wByWidth = (availW - gap * (cols - 1)) / cols;
        const wByHeight = ((availH - gap * (rows - 1)) / rows) * (3 / 4);
        const w = Math.min(wByWidth, wByHeight);
        if (w > bestSize) {
            bestSize = w;
            bestCols = cols;
        }
    }

    bestSize = Math.max(52, Math.floor(bestSize));

    board.style.gridTemplateColumns = 'repeat(' + bestCols + ', ' + bestSize + 'px)';
    board.style.gap = gap + 'px';
    board.style.padding = padding + 'px';
}

window.addEventListener('resize', layoutBoard);

// Rotazione schermo: le dimensioni reali arrivano con un ritardo
// variabile a seconda del telefono, quindi ricalcoliamo piu' volte.
window.addEventListener('orientationchange', function () {
    setTimeout(layoutBoard, 50);
    setTimeout(layoutBoard, 250);
    setTimeout(layoutBoard, 600);
});

// Rete di sicurezza extra per iOS Safari, che a volte non aggiorna
// window.innerHeight in tempo neanche dopo 'orientationchange'.
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', layoutBoard);
}


// -------- Gioco --------
function flipTile(tile) {
    if (gameState !== 'running') return;
    if (lockBoard) return;
    if (tile.classList.contains('flipped') || tile.classList.contains('matched')) return;

    if (!gameStarted) {
        gameStarted = true;
        startTimer();
    }

    tile.classList.add('flipped');
    flipped.push(tile);

    if (flipped.length < 2) return;

    moves++;
    document.getElementById('memory-moves').innerText = moves;
    lockBoard = true;

    const a = flipped[0];
    const b = flipped[1];

    if (a.dataset.code === b.dataset.code) {
        schedule(function () {
            a.classList.add('matched');
            b.classList.add('matched');
            flipped = [];
            lockBoard = false;
            matched++;
            const total = deck.length / 2;
            document.getElementById('memory-pairs').innerText = matched + ' / ' + total;
            if (matched === total) endGame();
        }, 420);
    } else {
        schedule(function () {
            a.classList.add('shake');
            b.classList.add('shake');
            schedule(function () {
                a.classList.remove('flipped', 'shake');
                b.classList.remove('flipped', 'shake');
                flipped = [];
                lockBoard = false;
            }, 320);
        }, 700);
    }
}

// -------- Fine partita --------
async function endGame() {
    stopTimer();
    gameState = 'ended';
    updateControls();

    document.getElementById('memory-win-stats').innerText =
        moves + ' mosse in ' + formatTime(seconds);
    document.getElementById('memory-win-record').style.display = 'none';

    try {
        const res = await fetchJSON('/api/memory/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                difficulty: pairsCount,
                moves: moves,
                seconds: seconds
            })
        });

        if (res.status === 'success') {
            bestScores[String(pairsCount)] = res.best;
            renderBest();
            document.getElementById('memory-win-record').style.display =
                res.is_record ? 'block' : 'none';
        }
    } catch (e) {
        console.error(e);
        showToast('Record non salvato: errore di connessione.', 'error');
    }

    schedule(function () {
        document.getElementById('memory-win').classList.add('open');
    }, 500);
}

function closeWinModal() {
    document.getElementById('memory-win').classList.remove('open');
}

// -------- Scorciatoie da tastiera --------
document.addEventListener('keydown', function (e) {
    // Barra spaziatrice = pausa / riprendi
    if (e.code === 'Space' && (gameState === 'running' || gameState === 'paused')) {
        e.preventDefault();
        togglePause();
    }
    // ESC = ferma partita
    if (e.key === 'Escape' && gameState !== 'idle') {
        stopGame();
    }
});

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
    try {
		loadUserInfo();
        await loadMemoryCards();
        await fetchBests();
        resetToIdle();
    } catch (e) {
        console.error(e);
        showOverlay(
            'Errore',
            'Impossibile caricare le carte. Ricarica la pagina.',
            null,
            null,
            '&#9888;'
        );
    }
});

async function loadUserInfo() {
    try {
        const data = await fetchJSON('/api/me');
        if (data && data.display_name) {
            const el = document.querySelector('.player-name');
            if (el) el.innerText = data.display_name;
        }
    } catch (e) {
        console.error(e);
    }
}