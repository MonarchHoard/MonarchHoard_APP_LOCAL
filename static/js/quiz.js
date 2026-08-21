// =========================================================
// INDOVINA LA CARTA - Monarch Hoard
// =========================================================
const QUESTIONS_PER_GAME = 10;
const SECONDS_PER_QUESTION = 15;

let quizCards = [];        // pool di carte utilizzabili
let questions = [];        // domande della partita corrente
let currentIndex = 0;
let score = 0;
let streak = 0;
let bestStreak = 0;
let correctCount = 0;
let difficulty = 2;        // 1 = facile, 2 = normale, 3 = monarca
let bestScores = {};
let questionTimer = null;
let timeLeft = 0;
let answering = false;

// Stati possibili: 'idle' | 'running' | 'paused' | 'ended'
let gameState = 'idle';

// Timeout in sospeso (per poterli annullare su stop/pausa)
let pendingTimeouts = [];

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

function escapeHTML(value) {
    return String(value === null || value === undefined ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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

function setQuizDifficulty(event, level, label) {
    difficulty = level;
    document.querySelectorAll('#quiz-difficulty-dropdown .filter-chip').forEach(function (c) {
        c.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    document.getElementById('quiz-difficulty-button').innerText = t('games.difficulty_label') + ': ' + label + ' \u25BC';
    document.getElementById('quiz-difficulty-dropdown').classList.remove('open');

    // Cambiare difficolta' annulla la partita in corso
    resetToIdle();
    renderBest();
}

// -------- Record dal server --------
async function fetchBests() {
    try {
        bestScores = await fetchJSON('/api/games/best/quiz');
    } catch (e) {
        console.error(e);
        bestScores = {};
    }
    renderBest();
}

function renderBest() {
    const el = document.getElementById('quiz-best');
    const best = bestScores[String(difficulty)];
    el.innerText = best ? (best.score + ' ' + t('games.unit_points')) : '\u2014';
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
    const stage = document.getElementById('quiz-stage');

    btnPause.disabled = (gameState !== 'running' && gameState !== 'paused');
    btnStop.disabled = (gameState === 'idle');

    btnPause.innerText = (gameState === 'paused') ? t('games.resume') : t('games.pause');
    btnPause.classList.toggle('active', gameState === 'paused');

    stage.classList.toggle('blurred', gameState === 'paused');
}

// -------- Caricamento carte --------
async function loadQuizCards() {
    const all = await fetchJSON('/api/cards');
    const owned = all.filter(function (c) { return c.quantity > 0; });
    const pool = owned.length >= 20 ? owned : all;

    // Servono nome e immagine validi, e nomi distinti per non creare
    // due opzioni identiche nella stessa domanda
    const seen = new Set();
    quizCards = pool.filter(function (c) {
        const name = (c.card_name || '').trim();
        if (!name || !c.image_url) return false;
        if (seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
    });
}

// -------- Costruzione domande --------
function buildQuestions() {
    const total = Math.min(QUESTIONS_PER_GAME, quizCards.length);
    const picked = shuffle(quizCards).slice(0, total);

    return picked.map(function (card) {
        const distractors = shuffle(
            quizCards.filter(function (c) { return c.card_code !== card.card_code; })
        ).slice(0, 3);

        const options = shuffle([card].concat(distractors)).map(function (c) {
            return { name: c.card_name, code: c.card_code };
        });

        return {
            card: card,
            options: options,
            answer: card.card_code
        };
    });
}

// -------- Stato iniziale --------
function resetToIdle() {
    clearPending();
    clearInterval(questionTimer);
    questionTimer = null;

    gameState = 'idle';
    answering = false;
    questions = [];
    currentIndex = 0;
    score = 0;
    streak = 0;
    bestStreak = 0;
    correctCount = 0;

    document.getElementById('quiz-progress').innerText = '0 / ' + QUESTIONS_PER_GAME;
    document.getElementById('quiz-score').innerText = '0';
    document.getElementById('quiz-streak').innerText = 'x1';
    document.getElementById('quiz-options').innerHTML = '';
    document.getElementById('quiz-feedback').innerText = '';
    document.getElementById('quiz-feedback').className = 'quiz-feedback';
    document.getElementById('quiz-hint').innerText = '';
    document.getElementById('quiz-card-img').src = '';
    document.getElementById('quiz-card-img').className = 'quiz-card-img';
    document.getElementById('quiz-timer-fill').style.width = '100%';
    document.getElementById('quiz-timer-fill').classList.remove('low');
    document.getElementById('quiz-win').classList.remove('open');

    showOverlay(
        t('games.quiz_title'),
        t('games.quiz_intro'),
        t('games.new_game'),
        startQuiz,
        '&#9670;'
    );

    updateControls();
}

// -------- Avvio partita --------
function startQuiz() {
    if (quizCards.length < 4) {
        showOverlay(
            t('games.quiz_not_enough_cards_title'),
            t('games.quiz_not_enough_cards_text'),
            null,
            null,
            '&#9888;'
        );
        return;
    }

    clearPending();
    clearInterval(questionTimer);
    hideOverlay();
    document.getElementById('quiz-win').classList.remove('open');

    questions = buildQuestions();
    currentIndex = 0;
    score = 0;
    streak = 0;
    bestStreak = 0;
    correctCount = 0;
    gameState = 'running';

    document.getElementById('quiz-score').innerText = '0';
    document.getElementById('quiz-streak').innerText = 'x1';
    document.getElementById('quiz-feedback').innerText = '';
    document.getElementById('quiz-feedback').className = 'quiz-feedback';

    updateControls();
    showQuestion();
}

// -------- Ferma partita --------
function stopQuiz() {
    if (gameState === 'idle') return;
    const wasPlaying = (gameState === 'running' || gameState === 'paused');
    resetToIdle();
    if (wasPlaying) {
        showToast(t('games.game_cancelled'), 'info');
    }
}

// -------- Pausa --------
function togglePause() {
    if (gameState === 'running') {
        gameState = 'paused';
        clearInterval(questionTimer);
        questionTimer = null;
        clearPending();

        showOverlay(
            t('games.memory_paused_title'),
            t('games.quiz_paused_text'),
            t('games.resume'),
            togglePause,
            '&#10074;&#10074;'
        );
        updateControls();
    } else if (gameState === 'paused') {
        gameState = 'running';
        hideOverlay();
        updateControls();

        // Riprende il conto alla rovescia da dove si era fermato
        if (answering) {
            resumeQuestionTimer();
        } else {
            // La pausa e' arrivata durante la fase di rivelazione:
            // riprende passando alla domanda successiva
            schedule(showQuestion, 900);
        }
    }
}

// -------- Domanda --------
function showQuestion() {
    if (gameState !== 'running') return;

    if (currentIndex >= questions.length) {
        endQuiz();
        return;
    }

    answering = true;
    const q = questions[currentIndex];

    document.getElementById('quiz-progress').innerText =
        (currentIndex + 1) + ' / ' + questions.length;

    // Immagine mascherata in base alla difficolta'
    const img = document.getElementById('quiz-card-img');
    img.className = 'quiz-card-img mask-' + difficulty;
	if (difficulty === 3) {
		const x = 25 + Math.floor(Math.random() * 50);
		const y = 25 + Math.floor(Math.random() * 50);
		img.style.transformOrigin = x + '% ' + y + '%';
	} else {
		img.style.transformOrigin = 'center center';
	}
    img.src = q.card.image_url;
    img.alt = '';
    img.onerror = function () {
        this.onerror = null;
        this.src = '/static/cards/TRANSPARENT/No_Image_Available.webp';
    };

    // Indizio: rarita' e set sono gia' nei dati
    const hint = document.getElementById('quiz-hint');
    if (difficulty === 1) {
        hint.innerText = t('games.hint_set_word') + ': ' + (q.card.set_name || '?') + ' \u00B7 ' + t('games.hint_rarity_word') + ': ' + (q.card.rarity || '?');
    } else if (difficulty === 2) {
        hint.innerText = t('games.hint_set_word') + ': ' + (q.card.set_name || '?');
    } else {
        hint.innerText = '';
    }

    // Opzioni
    const wrap = document.getElementById('quiz-options');
    wrap.innerHTML = '';
    q.options.forEach(function (opt) {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.type = 'button';
        btn.dataset.code = opt.code;
        btn.innerHTML = escapeHTML(opt.name);
        btn.addEventListener('click', function () { answer(opt.code, btn); });
        wrap.appendChild(btn);
    });

    document.getElementById('quiz-feedback').innerText = '';
    document.getElementById('quiz-feedback').className = 'quiz-feedback';

    timeLeft = SECONDS_PER_QUESTION * 10; // decimi di secondo
    resumeQuestionTimer();
}

// -------- Timer della domanda --------
function resumeQuestionTimer() {
    clearInterval(questionTimer);
    const fill = document.getElementById('quiz-timer-fill');
    const maxTime = SECONDS_PER_QUESTION * 10;

    fill.style.width = ((timeLeft / maxTime) * 100) + '%';
    fill.classList.toggle('low', (timeLeft / maxTime) * 100 <= 30);

    questionTimer = setInterval(function () {
        if (gameState !== 'running') return;
        timeLeft--;
        const pct = (timeLeft / maxTime) * 100;
        fill.style.width = pct + '%';
        if (pct <= 30) fill.classList.add('low');

        if (timeLeft <= 0) {
            clearInterval(questionTimer);
            questionTimer = null;
            answer(null, null);
        }
    }, 100);
}

// -------- Risposta --------
function answer(code, buttonEl) {
    if (!answering || gameState !== 'running') return;
    answering = false;
    clearInterval(questionTimer);
    questionTimer = null;

    const q = questions[currentIndex];
    const isCorrect = code === q.answer;

    // Rivela l'immagine
    document.getElementById('quiz-card-img').className = 'quiz-card-img revealed';
    document.getElementById('quiz-hint').innerText =
        q.card.card_name + ' \u00B7 ' + (q.card.card_code || '');

    // Colora le opzioni
    document.querySelectorAll('.quiz-option').forEach(function (btn) {
        btn.disabled = true;
        if (btn.dataset.code === q.answer) btn.classList.add('correct');
    });
    if (!isCorrect && buttonEl) buttonEl.classList.add('wrong');

    const feedback = document.getElementById('quiz-feedback');

    if (isCorrect) {
        correctCount++;
        streak++;
        if (streak > bestStreak) bestStreak = streak;

        const multiplier = Math.min(1 + Math.floor(streak / 3) * 0.5, 3);
        const timeBonus = Math.round((timeLeft / 10) * 5);
        const diffBonus = difficulty === 3 ? 60 : (difficulty === 2 ? 30 : 0);
        const gained = Math.round((100 + timeBonus + diffBonus) * multiplier);
        score += gained;

        feedback.innerText = t('games.quiz_correct') + '  +' + gained + ' ' + t('games.unit_points');
        feedback.className = 'quiz-feedback ok';
    } else {
        streak = 0;
        feedback.innerText = code === null ? t('games.quiz_time_out') : t('games.quiz_wrong');
        feedback.className = 'quiz-feedback ko';
    }

    document.getElementById('quiz-score').innerText = score;
    document.getElementById('quiz-streak').innerText =
        'x' + Math.min(1 + Math.floor(streak / 3) * 0.5, 3);

    currentIndex++;
    schedule(showQuestion, 1600);
}

// -------- Fine partita --------
async function endQuiz() {
    clearInterval(questionTimer);
    questionTimer = null;
    gameState = 'ended';
    updateControls();

    const accuracy = Math.round((correctCount / questions.length) * 100);
    let title;
    if (accuracy === 100) title = t('games.quiz_result_perfect');
    else if (accuracy >= 70) title = t('games.quiz_result_great');
    else if (accuracy >= 40) title = t('games.quiz_result_ok');
    else title = t('games.quiz_result_bad');

    document.getElementById('quiz-win-title').innerText = title;
    document.getElementById('quiz-win-stats').innerText = score + ' ' + t('games.unit_points');
    document.getElementById('quiz-win-detail').innerHTML =
        correctCount + ' / ' + questions.length + ' ' + t('games.quiz_win_correct_word') + ' &middot; ' +
        accuracy + '% &middot; ' + t('games.quiz_win_streak_word') + ' x' + bestStreak;
    document.getElementById('quiz-win-record').style.display = 'none';

    try {
        const res = await fetchJSON('/api/games/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_type: 'quiz',
                difficulty: difficulty,
                score: score,
                detail: correctCount + '/' + questions.length
            })
        });

        if (res.status === 'success') {
            bestScores[String(difficulty)] = res.best;
            renderBest();
            document.getElementById('quiz-win-record').style.display =
                res.is_record ? 'block' : 'none';
        }
    } catch (e) {
        console.error(e);
        showToast(t('games.quiz_score_not_saved'), 'error');
    }

    schedule(function () {
        document.getElementById('quiz-win').classList.add('open');
    }, 600);
}

function closeQuizModal() {
    document.getElementById('quiz-win').classList.remove('open');
}

// -------- Scorciatoie da tastiera --------
document.addEventListener('keydown', function (e) {
    // Barra spaziatrice = pausa / riprendi
    if (e.code === 'Space' && (gameState === 'running' || gameState === 'paused')) {
        e.preventDefault();
        togglePause();
        return;
    }
    // ESC = ferma partita
    if (e.key === 'Escape' && gameState !== 'idle') {
        stopQuiz();
        return;
    }
    // 1-4 = risposta rapida
    if (!answering || gameState !== 'running') return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
        const btns = document.querySelectorAll('.quiz-option');
        if (btns[n - 1]) btns[n - 1].click();
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
        await loadQuizCards();
        await fetchBests();
        resetToIdle();
    } catch (e) {
        console.error(e);
        showOverlay(
            t('common.generic_error'),
            t('toast.cards_load_error'),
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
