// =========================================================
// IMPOSTAZIONI - Monarch Hoard
// =========================================================
async function fetchJSON(url, options) {
    const r = await fetch(url, options || {});
    if (!r.ok) {
        let msg = 'Errore';
        try { const d = await r.json(); msg = d.message || msg; } catch (e) {}
        throw new Error(msg);
    }
    return r.json();
}

function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = message;
    c.appendChild(t);
    setTimeout(function () {
        t.classList.add('toast-out');
        setTimeout(function () { t.remove(); }, 300);
    }, duration);
}

// Navigazione verso la home aprendo una vista
function goToView(view) {
    localStorage.setItem('lastView', view);
    location.href = '/';
}

// -------- Caricamento profilo --------
async function loadProfile() {
    try {
        const d = await fetchJSON('/api/settings/profile');
        document.getElementById('set-display-name').value = d.display_name || '';
        document.getElementById('set-email').value = d.email || '';
        const nameEl = document.querySelector('.player-name');
        if (nameEl && d.display_name) nameEl.innerText = d.display_name;
    } catch (e) {
        showToast(e.message || 'Errore nel caricamento del profilo.', 'error');
    }
}

// -------- Salva nome visualizzato --------
async function saveDisplayName() {
    const name = document.getElementById('set-display-name').value.trim();
    try {
        const d = await fetchJSON('/api/settings/display_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: name })
        });
        showToast('Nome aggiornato!', 'success');
        const nameEl = document.querySelector('.player-name');
        if (nameEl) nameEl.innerText = d.display_name;
    } catch (e) {
        showToast(e.message || 'Impossibile salvare il nome.', 'error');
    }
}

// -------- Cambio password --------
async function savePassword() {
    const oldp = document.getElementById('set-old-pwd').value;
    const newp = document.getElementById('set-new-pwd').value;
    const newp2 = document.getElementById('set-new-pwd2').value;
    if (newp !== newp2) {
        showToast('Le due nuove password non coincidono.', 'error');
        return;
    }
    try {
        await fetchJSON('/api/settings/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldp, new_password: newp })
        });
        showToast('Password aggiornata!', 'success');
        document.getElementById('set-old-pwd').value = '';
        document.getElementById('set-new-pwd').value = '';
        document.getElementById('set-new-pwd2').value = '';
        setCheckPwd();
    } catch (e) {
        showToast(e.message || 'Impossibile aggiornare la password.', 'error');
    }
}

// -------- Indicatore robustezza password --------
function setCheckPwd() {
    const pwd = document.getElementById('set-new-pwd').value;
    const fill = document.getElementById('set-pwd-fill');
    const msg = document.getElementById('set-pwd-msg');
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const levels = [
        { w: '0%',   c: 'transparent', t: '' },
        { w: '20%',  c: '#ff4d6d',     t: 'Molto debole' },
        { w: '40%',  c: '#ff8f4d',     t: 'Debole' },
        { w: '60%',  c: '#ffd166',     t: 'Media' },
        { w: '80%',  c: '#9bde6b',     t: 'Buona' },
        { w: '100%', c: '#4dff9b',     t: 'Forte' }
    ];
    const lvl = levels[score];
    fill.style.width = lvl.w;
    fill.style.background = lvl.c;
    msg.style.color = (lvl.c === 'transparent') ? '#9a8ab8' : lvl.c;
    msg.innerText = lvl.t;
}

// -------- Preferenza vista iniziale --------
function loadDefaultView() {
    const cur = localStorage.getItem('lastView') || 'COLLEZIONE';
    document.querySelectorAll('#set-default-view .settings-choice').forEach(function (b) {
        b.classList.toggle('active', b.dataset.view === cur);
    });
}

function setDefaultView(view) {
    localStorage.setItem('lastView', view);
    loadDefaultView();
    showToast('Vista iniziale impostata su ' + view.charAt(0) + view.slice(1).toLowerCase() + '.', 'success');
}

// -------- Avvio --------
document.addEventListener('DOMContentLoaded', function () {
    loadProfile();
    loadDefaultView();
});

// =========================================================
// DATI / BACKUP (riusa le stesse API della Collezione)
// =========================================================
let setCsvFile = null;

function escapeHTMLset(v) {
    return String(v == null ? '' : v)
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function exportBackupCsv() {
    window.location.href = '/api/export/csv';
    showToast('Download del backup avviato.', 'success');
}

function downloadBackupTemplate() {
    window.location.href = '/api/export/template';
    showToast('Download del modello avviato.', 'success');
}

function triggerBackupPicker() {
    document.getElementById('set-csv-input').click();
}

function setBackupFileLabel(name) {
    const el = document.getElementById('set-csv-file-name');
    if (!el) return;
    if (name) { el.innerText = name; el.classList.add('has-file'); }
    else { el.innerText = 'Nessun file selezionato'; el.classList.remove('has-file'); }
}

async function importBackupCsv() {
    if (!setCsvFile) return;
    const btn = document.getElementById('set-csv-import-btn');
    const report = document.getElementById('set-csv-report');
    btn.disabled = true;
    btn.innerText = 'Importazione...';
    report.className = 'csv-report';
    report.innerHTML = '<div class="csv-report-line">Elaborazione del file in corso...</div>';
    const fd = new FormData();
    fd.append('file', setCsvFile);
    try {
        const res = await fetch('/api/import/csv', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
            report.className = 'csv-report error';
            let html = '<div class="csv-report-line">' + escapeHTMLset(data.message || 'Import non riuscito.') + '</div>';
            if (data.errors && data.errors.length) html += renderBackupErrors(data.errors, data.error_count);
            report.innerHTML = html;
            showToast('Import non riuscito.', 'error');
            return;
        }
        report.className = 'csv-report ok';
        let html = '<div class="csv-report-line strong">' + data.updated + ' carte aggiornate</div>';
        if (data.unknown > 0) html += '<div class="csv-report-line warn">' + data.unknown + ' codici sconosciuti, ignorati</div>';
        if (data.errors && data.errors.length) html += renderBackupErrors(data.errors, data.error_count);
        report.innerHTML = html;
        showToast(data.updated + ' carte aggiornate.', 'success');
    } catch (e) {
        console.error(e);
        report.className = 'csv-report error';
        report.innerHTML = '<div class="csv-report-line">Errore di connessione.</div>';
        showToast('Errore di connessione.', 'error');
    } finally {
        btn.innerText = 'Importa';
        btn.disabled = !setCsvFile;
    }
}

function renderBackupErrors(errors, total) {
    let html = '<div class="csv-report-line warn">Righe scartate' +
        (total && total > errors.length ? ' (' + total + ' totali, prime ' + errors.length + '):' : ':') +
        '</div><ul class="csv-error-list">';
    errors.forEach(function (err) { html += '<li>' + escapeHTMLset(err) + '</li>'; });
    return html + '</ul>';
}

// Collega input + drag&drop (parte all'avvio pagina)
document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('set-csv-input');
    if (input) {
        input.addEventListener('change', function (e) {
            const f = e.target.files && e.target.files[0];
            if (!f) { setCsvFile = null; setBackupFileLabel(null); document.getElementById('set-csv-import-btn').disabled = true; return; }
            if (!/\.csv$/i.test(f.name)) { showToast('Seleziona un file .csv', 'error'); e.target.value = ''; return; }
            setCsvFile = f; setBackupFileLabel(f.name); document.getElementById('set-csv-import-btn').disabled = false;
        });
    }
    const drop = document.getElementById('set-csv-dropzone');
    if (drop) {
        ['dragenter', 'dragover'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragging'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragging'); });
        });
        drop.addEventListener('drop', function (e) {
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            if (!/\.csv$/i.test(f.name)) { showToast('Seleziona un file .csv', 'error'); return; }
            setCsvFile = f; setBackupFileLabel(f.name); document.getElementById('set-csv-import-btn').disabled = false;
        });
    }
});