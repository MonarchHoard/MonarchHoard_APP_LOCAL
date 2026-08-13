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
        grid.innerHTML = '<div class="mh-empty-message">Errore nel caricamento della vetrina.</div>';
        showToast('Impossibile caricare la vetrina.', 'error');
    }
}

function buildSlotElement(card, position) {
    const slot = document.createElement('div');
    if (!card) {
        slot.className = 'showcase-slot empty';
        slot.innerHTML = '<div class="showcase-empty-text">Slot vuoto</div>';
        return slot;
    }
    slot.className = 'showcase-slot filled';
    const safeName = escapeHTML(card.card_name);
    const safeCode = escapeHTML(card.card_code);
    const safeRarity = escapeHTML(card.rarity);

    const row = Math.floor((position - 1) / 3);
    const col = (position - 1) % 3;
    const canLeft = col > 0;
    const canRight = col < 2;
    const canUp = row > 0;
    const canDown = row < 2;

    slot.innerHTML = `
        <button class="showcase-remove-btn" title="Rimuovi dalla vetrina" onclick="removeShowcaseCard('${safeCode}')">&times;</button>
        <div class="collection-card-rarity ${(card.rarity_order || 0) >= 35 ? 'shine' : ''}">${safeRarity}</div>
        <div class="showcase-image-container">
            <img src="${card.image_url}" class="showcase-card-img" onerror="this.src='/static/cards/TRANSPARENT/No_Image_Available.webp';">
        </div>
        <div class="showcase-card-name">${safeName}</div>
        <div class="showcase-card-code">${safeCode}</div>
        <div class="showcase-dpad">
            <button class="showcase-dpad-btn dpad-up" ${canUp ? '' : 'disabled'} onclick="moveShowcaseCard('${safeCode}', -3)">&#9650;</button>
            <button class="showcase-dpad-btn dpad-left" ${canLeft ? '' : 'disabled'} onclick="moveShowcaseCard('${safeCode}', -1)">&#9664;</button>
            <button class="showcase-dpad-btn dpad-right" ${canRight ? '' : 'disabled'} onclick="moveShowcaseCard('${safeCode}', 1)">&#9654;</button>
            <button class="showcase-dpad-btn dpad-down" ${canDown ? '' : 'disabled'} onclick="moveShowcaseCard('${safeCode}', 3)">&#9660;</button>
        </div>
    `;
    return slot;
}

// -------- Azioni --------
async function moveShowcaseCard(cardCode, direction) {
    try {
        const data = await fetchJSON('/api/showcase/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode, direction: direction })
        });
        if (data.status === 'success') {
            loadShowcase();
        } else {
            showToast(data.message || 'Impossibile spostare la carta.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione.', 'error');
    }
}

async function removeShowcaseCard(cardCode) {
    try {
        const data = await fetchJSON('/api/showcase/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode })
        });
        if (data.status === 'success') {
            showToast('Carta rimossa dalla vetrina.', 'success');
            loadShowcase();
        } else {
            showToast(data.message || 'Impossibile rimuovere la carta.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Errore di connessione.', 'error');
    }
}

// -------- Avvio pagina --------
document.addEventListener('DOMContentLoaded', function () {
    loadUserInfo();
    loadShowcase();
});