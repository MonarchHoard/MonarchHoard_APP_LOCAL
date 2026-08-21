// =========================================================
// VETRINA - Monarch Hoard
// =========================================================
const MAX_SHOWCASE_SLOTS = 9;

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

// -------- Caricamento vetrina --------
async function loadShowcase() {
    const grid = document.getElementById('showcase-grid');
    grid.innerHTML = '';
    try {
        const data = await fetchJSON('/api/showcase');
        const slots = data.slots || [];
        let filledCount = 0;

        for (let i = 0; i < MAX_SHOWCASE_SLOTS; i++) {
            const card = slots[i];
            if (card) filledCount++;
            grid.appendChild(buildSlotElement(card, i + 1));
        }

        document.getElementById('showcase-count').innerText = filledCount + ' / ' + MAX_SHOWCASE_SLOTS;
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div class="mh-empty-message">${t('showcase.load_error')}</div>`;
        showToast(t('showcase.load_error'), 'error');
    }
}

function buildSlotElement(card, position) {
    const slot = document.createElement('div');

    if (!card) {
        slot.className = 'showcase-slot empty';
        slot.innerHTML = `
            <button class="showcase-insert-btn" onclick="openPicker(${position})">
                <span class="showcase-insert-plus">+</span>
                <span>${t('showcase.insert_btn')}</span>
            </button>`;
        return slot;
    }

    slot.className = 'showcase-slot filled';
    slot.style.cursor = 'pointer';
    slot.onclick = function () { openSlotActions(position, card); };

    const safeName = escapeHTML(card.card_name);
    const safeCode = escapeHTML(card.card_code);
    const safeRarity = escapeHTML(card.rarity);

    slot.innerHTML = `
        <div class="collection-card-rarity ${(card.rarity_order || 0) >= 35 ? 'shine' : ''}">${safeRarity}</div>
        <div class="showcase-image-container">
            <img src="${card.image_url}" class="showcase-card-img" onerror="this.src='/static/cards/TRANSPARENT/No_Image_Available.webp';">
        </div>
        <div class="showcase-card-name">${safeName}</div>
        <div class="showcase-card-code">${safeCode}</div>
    `;

    return slot;
}

// -------- Azioni --------
async function removeShowcaseCard(cardCode) {
    try {
        const data = await fetchJSON('/api/showcase/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode })
        });
        if (data.status === 'success') {
            showToast(t('showcase.removed'), 'success');
            loadShowcase();
        } else {
            showToast(data.message || t('showcase.cannot_remove'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast(t('common.connection_error'), 'error');
    }
}

// -------- Avvio pagina --------
document.addEventListener('DOMContentLoaded', function () {
    loadUserInfo();
    loadShowcase();
});

// =========================================================
// PICKER VETRINA - scelta carta da inserire/sostituire
// =========================================================
let pickerSlot = null;
let pickerCards = [];
let pickerAllLoaded = false;
let pickerSelectedRarities = [];
let pickerSelectedSets = [];
let pickerSort = 'id';

async function ensurePickerCards() {
    if (pickerAllLoaded) return;
    const all = await fetchJSON('/api/cards');
    pickerCards = all.filter(function (c) { return c.quantity > 0; });
    pickerAllLoaded = true;
    buildPickerFilters();
}

async function openPicker(position) {
    pickerSlot = position;

    try {
        await ensurePickerCards();
    } catch (e) {
        console.error(e);
        showToast(t('toast.cards_load_error'), 'error');
        return;
    }

    document.getElementById('picker-title').innerText = `${t('showcase.picker_slot_word')} ${position} \u00B7 ${t('showcase.picker_title').toLowerCase()}`;
    document.getElementById('picker-search').value = '';
    pickerSelectedRarities = [];
    pickerSelectedSets = [];
    pickerSort = 'id';

    document.querySelectorAll('#picker-modal .filter-chip').forEach(function (c) { c.classList.remove('active'); });
    const idChip = document.querySelector('#picker-sort-filter .filter-chip');
    if (idChip) idChip.classList.add('active');
    document.getElementById('picker-sort-button').innerText = `${t('showcase.picker_sort_code')} \u25BC`;

    renderPicker();
    document.getElementById('picker-modal').classList.add('open');
}

function closePicker() {
    document.getElementById('picker-modal').classList.remove('open');
    pickerSlot = null;
}

function buildPickerFilters() {
    const rarityMap = new Map();
    const setMap = new Map();

    pickerCards.forEach(function (c) {
        if (c.rarity && !rarityMap.has(c.rarity)) rarityMap.set(c.rarity, c.rarity_Order != null ? c.rarity_Order : 999);
        if (c.set_name && !setMap.has(c.set_name)) setMap.set(c.set_name, c.set_order != null ? c.set_order : 999);
    });

    const rc = document.getElementById('picker-rarity-filter');
    rc.innerHTML = '';
    Array.from(rarityMap.entries()).sort(function (a, b) { return Number(a[1]) - Number(b[1]); })
        .forEach(function (entry) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerText = entry[0];
            chip.onclick = function () {
                chip.classList.toggle('active');
                pickerSelectedRarities = [].slice.call(document.querySelectorAll('#picker-rarity-filter .filter-chip.active')).map(function (x) { return x.innerText; });
                renderPicker();
            };
            rc.appendChild(chip);
        });

    const sc = document.getElementById('picker-set-filter');
    sc.innerHTML = '';
    Array.from(setMap.entries()).sort(function (a, b) { return Number(a[1]) - Number(b[1]); })
        .forEach(function (entry) {
            const chip = document.createElement('div');
            chip.className = 'filter-chip';
            chip.innerText = entry[0];
            chip.onclick = function () {
                chip.classList.toggle('active');
                pickerSelectedSets = [].slice.call(document.querySelectorAll('#picker-set-filter .filter-chip.active')).map(function (x) { return x.innerText; });
                renderPicker();
            };
            sc.appendChild(chip);
        });
}

function setPickerSort(value, label, ev) {
    pickerSort = value;
    document.querySelectorAll('#picker-sort-filter .filter-chip').forEach(function (c) { c.classList.remove('active'); });
    if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
    document.getElementById('picker-sort-button').innerText = label + ' \u25BC';
    document.getElementById('picker-sort-dropdown').classList.remove('open');
    renderPicker();
}

function renderPicker() {
    const grid = document.getElementById('picker-grid');
    const search = document.getElementById('picker-search').value.toLowerCase();

    let list = pickerCards.filter(function (c) {
        const ms = (c.card_name || '').toLowerCase().indexOf(search) !== -1 ||
                   (c.card_code || '').toLowerCase().indexOf(search) !== -1 ||
                   (c.rarity || '').toLowerCase().indexOf(search) !== -1 ||
                   (c.set_name || '').toLowerCase().indexOf(search) !== -1;
        const mr = pickerSelectedRarities.length === 0 || pickerSelectedRarities.indexOf(c.rarity) !== -1;
        const mt = pickerSelectedSets.length === 0 || pickerSelectedSets.indexOf(c.set_name) !== -1;
        return ms && mr && mt;
    });

    list.sort(function (a, b) {
        if (pickerSort === 'name') return (a.card_name || '').localeCompare(b.card_name || '');
        if (pickerSort === 'rarity-desc') return (b.rarity_Order || 0) - (a.rarity_Order || 0);
        if (pickerSort === 'rarity-asc') return (a.rarity_Order || 999) - (b.rarity_Order || 999);
        if (pickerSort === 'qty-desc') return (b.quantity || 0) - (a.quantity || 0);
        return (a.cards_display_order || '').localeCompare(b.cards_display_order || '');
    });

    grid.innerHTML = '';
    document.getElementById('picker-count').innerText = list.length;

    if (list.length === 0) {
        grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#9a8ab8; padding:30px;">${t('showcase.picker_no_match')}</p>`;
        return;
    }

    list.forEach(function (c) { grid.appendChild(buildPickerCard(c)); });
}

function buildPickerCard(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.cursor = 'pointer';
    el.onclick = function () { selectPickerCard(card.card_code); };

    const dup = card.quantity > 1 ? '<div class="duplicate-badge">x' + card.quantity + '</div>' : '';

    el.innerHTML = `
        <div class="collection-card-rarity">${escapeHTML(card.rarity)}</div>
        ${dup}
        <div class="card-image-container">
            <img src="${card.image_url}" class="card-img" onerror="this.src='/static/cards/TRANSPARENT/No_Image_Available.webp';">
        </div>
        <div class="card-code">${escapeHTML(card.card_code)}</div>
        <div class="card-name">${escapeHTML(card.card_name)}</div>
    `;

    return el;
}

async function selectPickerCard(cardCode) {
    if (!pickerSlot) return;

    try {
        const data = await fetchJSON('/api/showcase/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode, slot_position: pickerSlot })
        });
        if (data.status === 'success') {
            showToast(t('showcase.updated'), 'success');
            closePicker();
            loadShowcase();
        } else {
            showToast(data.message || t('showcase.cannot_update'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast(t('common.connection_error'), 'error');
    }
}

function pickerToggleDropdown(id) {
    document.querySelectorAll('#picker-modal .dropdown-content').forEach(function (m) {
        if (m.id !== id) m.classList.remove('open');
    });
    document.getElementById(id).classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', function () {
    const pm = document.getElementById('picker-modal');
    if (pm) {
        pm.addEventListener('click', function (e) {
            if (e.target.id === 'picker-modal') closePicker();
        });
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('.dropdown-filter')) return;
        document.querySelectorAll('#picker-modal .dropdown-content').forEach(function (m) { m.classList.remove('open'); });
    });
});

// =========================================================
// SFONDI VETRINA (salvati sull'account utente)
// =========================================================
// Per aggiungere un nuovo sfondo: metti il file in /static/wallpaper/,
// aggiungi una riga qui E aggiungi il suo id in VALID_SHOWCASE_BG (app.py).
function getShowcaseBackgrounds() {
    return [
        { id: 'none',   name: t('showcase.bg_none'),   url: null },
        { id: 'nebula', name: t('showcase.bg_nebula'), url: '/static/wallpaper/showcase_bg_nebula.jpg' }
    ];
}

let currentShowcaseBg = 'none';

// Carica dal server lo sfondo scelto dall'utente e lo applica
async function loadShowcaseBg() {
    try {
        const data = await fetchJSON('/api/showcase/bg');
        currentShowcaseBg = (data && data.bg) ? data.bg : 'none';
    } catch (e) {
        console.error(e);
        currentShowcaseBg = 'none';
    }
    applyShowcaseBg();
}

function applyShowcaseBg() {
    const frame = document.querySelector('.showcase-frame');
    if (!frame) return;

    const chosen = getShowcaseBackgrounds().find(function (b) { return b.id === currentShowcaseBg; });
    if (chosen && chosen.url) {
        frame.style.backgroundImage =
            "linear-gradient(rgba(5,4,14,0.55), rgba(5,4,14,0.75)), url('" + chosen.url + "')";
        frame.style.backgroundSize = 'cover';
        frame.style.backgroundPosition = 'center';
        frame.classList.add('has-custom-bg');
    } else {
        frame.style.backgroundImage = '';
        frame.classList.remove('has-custom-bg');
    }
}

function openBgPicker() {
    const grid = document.getElementById('bg-grid');
    if (!grid) return;
    grid.innerHTML = '';

    getShowcaseBackgrounds().forEach(function (bg) {
        const item = document.createElement('div');
        item.className = 'bg-option' + (bg.id === currentShowcaseBg ? ' active' : '');
        item.onclick = function () { selectBg(bg.id); };

        const preview = bg.url
            ? "background-image:url('" + bg.url + "'); background-size:cover; background-position:center;"
            : "background:linear-gradient(145deg, rgba(13,9,31,0.95), rgba(5,4,14,0.98));";

        item.innerHTML =
            '<div class="bg-option-preview" style="' + preview + '"></div>' +
            '<div class="bg-option-name">' + escapeHTML(bg.name) + '</div>';

        grid.appendChild(item);
    });

    document.getElementById('bg-modal').classList.add('open');
}

function closeBgPicker() {
    document.getElementById('bg-modal').classList.remove('open');
}

async function selectBg(id) {
    const previous = currentShowcaseBg;
    currentShowcaseBg = id;   // applica subito (ottimistico)
    applyShowcaseBg();
    closeBgPicker();

    try {
        const res = await fetch('/api/showcase/bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bg: id })
        });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            currentShowcaseBg = previous;   // rollback in caso di errore
            applyShowcaseBg();
            showToast(data.message || t('showcase.bg_save_error'), 'error');
            return;
        }

        showToast(t('showcase.bg_updated'), 'success');
    } catch (e) {
        console.error(e);
        currentShowcaseBg = previous;
        applyShowcaseBg();
        showToast(t('common.connection_error'), 'error');
    }
}

// Applica lo sfondo all'avvio + chiusura modale cliccando fuori
document.addEventListener('DOMContentLoaded', function () {
    loadShowcaseBg();
    const modal = document.getElementById('bg-modal');
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target.id === 'bg-modal') closeBgPicker();
        });
    }
});

// Vai alla pagina principale aprendo la vista desiderata
function goToView(view) {
    localStorage.setItem('lastView', view);
    location.href = '/';
}

// =========================================================
// POPUP AZIONI CARTA (vetrina)
// =========================================================
let saSlot = null;      // posizione slot corrente (1..9)
let saCode = null;      // codice carta corrente

function openSlotActions(position, card) {
    saSlot = position;
    saCode = card.card_code;

    document.getElementById('slot-actions-title').innerText = card.card_name || t('common.card_generic');
    document.getElementById('slot-actions-code').innerText = card.card_code || '';

    // Abilita/disabilita le frecce in base alla posizione nella griglia 3x3
    const row = Math.floor((position - 1) / 3);
    const col = (position - 1) % 3;

    setDpad('sa-up',    row > 0);
    setDpad('sa-down',  row < 2);
    setDpad('sa-left',  col > 0);
    setDpad('sa-right', col < 2);

    document.getElementById('slot-actions-modal').classList.add('open');
}

function setDpad(cls, enabled) {
    const btn = document.querySelector('.' + cls);
    if (btn) btn.disabled = !enabled;
}

function closeSlotActions() {
    document.getElementById('slot-actions-modal').classList.remove('open');
    saSlot = null;
    saCode = null;
}

function slotActionReplace() {
    const pos = saSlot;
    closeSlotActions();
    openPicker(pos);   // riusa il picker gia' esistente
}

async function slotActionRemove() {
    if (!saCode) return;
    const code = saCode;
    closeSlotActions();
    await removeShowcaseCard(code);   // funzione gia' esistente
}

async function slotActionMove(direction) {
    if (!saCode) return;

    try {
        const data = await fetchJSON('/api/showcase/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: saCode, direction: direction })
        });
        if (data.status === 'success') {
            closeSlotActions();
            loadShowcase();
        } else {
            showToast(data.message || t('showcase.cannot_update'), 'error');
        }
    } catch (e) {
        console.error(e);
        showToast(t('common.connection_error'), 'error');
    }
}

// Chiudi cliccando fuori dal popup
document.addEventListener('DOMContentLoaded', function () {
    const m = document.getElementById('slot-actions-modal');
    if (m) {
        m.addEventListener('click', function (e) {
            if (e.target.id === 'slot-actions-modal') closeSlotActions();
        });
    }
});
