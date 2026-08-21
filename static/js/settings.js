// =========================================================
// IMPOSTAZIONI - Monarch Hoard
// =========================================================
async function fetchJSON(url, options) {
    const r = await fetch(url, options || {});
    if (!r.ok) {
        let msg = t('common.generic_error');
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

    const t2 = document.createElement('div');
    t2.className = 'toast toast-' + type;
    t2.textContent = message;
    c.appendChild(t2);

    setTimeout(function () {
        t2.classList.add('toast-out');
        setTimeout(function () { t2.remove(); }, 300);
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
        showToast(e.message || t('settings.profile_load_error'), 'error');
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
        showToast(t('settings.display_name_updated'), 'success');
        const nameEl = document.querySelector('.player-name');
        if (nameEl) nameEl.innerText = d.display_name;
    } catch (e) {
        showToast(e.message || t('settings.display_name_save_error'), 'error');
    }
}

// -------- Cambio password --------
async function savePassword() {
    const oldp = document.getElementById('set-old-pwd').value;
    const newp = document.getElementById('set-new-pwd').value;
    const newp2 = document.getElementById('set-new-pwd2').value;

    if (newp !== newp2) {
        showToast(t('settings.password_mismatch'), 'error');
        return;
    }

    try {
        await fetchJSON('/api/settings/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldp, new_password: newp })
        });
        showToast(t('settings.password_updated'), 'success');
        document.getElementById('set-old-pwd').value = '';
        document.getElementById('set-new-pwd').value = '';
        document.getElementById('set-new-pwd2').value = '';
        setCheckPwd();
    } catch (e) {
        showToast(e.message || t('settings.password_update_error'), 'error');
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
        { w: '0%',   c: 'transparent', tKey: null },
        { w: '20%',  c: '#ff4d6d',     tKey: 'auth.password_strength_very_weak' },
        { w: '40%',  c: '#ff8f4d',     tKey: 'auth.password_strength_weak' },
        { w: '60%',  c: '#ffd166',     tKey: 'auth.password_strength_medium' },
        { w: '80%',  c: '#9bde6b',     tKey: 'auth.password_strength_good' },
        { w: '100%', c: '#4dff9b',     tKey: 'auth.password_strength_strong' }
    ];

    const lvl = levels[score];
    fill.style.width = lvl.w;
    fill.style.background = lvl.c;
    msg.style.color = (lvl.c === 'transparent') ? '#9a8ab8' : lvl.c;
    msg.innerText = lvl.tKey ? t(lvl.tKey) : '';
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
    const viewLabelKey = view === 'DASHBOARD' ? 'nav.dashboard' : (view === 'WISHLIST' ? 'nav.wishlist' : 'nav.collection');
    showToast(t('settings.default_view_set', { view: t(viewLabelKey) }), 'success');
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
    showToast(t('csv.download_started'), 'success');
}

function downloadBackupTemplate() {
    window.location.href = '/api/export/template';
    showToast(t('csv.template_download_started'), 'success');
}

function triggerBackupPicker() {
    document.getElementById('set-csv-input').click();
}

function setBackupFileLabel(name) {
    const el = document.getElementById('set-csv-file-name');
    if (!el) return;
    if (name) { el.innerText = name; el.classList.add('has-file'); }
    else { el.innerText = t('csv.no_file_selected'); el.classList.remove('has-file'); }
}

async function importBackupCsv() {
    if (!setCsvFile) return;

    const btn = document.getElementById('set-csv-import-btn');
    const report = document.getElementById('set-csv-report');

    btn.disabled = true;
    btn.innerText = t('csv.importing');
    report.className = 'csv-report';
    report.innerHTML = `<div class="csv-report-line">${t('csv.processing')}</div>`;

    const fd = new FormData();
    fd.append('file', setCsvFile);

    try {
        const res = await fetch('/api/import/csv', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            report.className = 'csv-report error';
            let html = '<div class="csv-report-line">' + escapeHTMLset(data.message || t('csv.import_failed')) + '</div>';
            if (data.errors && data.errors.length) html += renderBackupErrors(data.errors, data.error_count);
            report.innerHTML = html;
            showToast(t('csv.import_failed'), 'error');
            return;
        }

        report.className = 'csv-report ok';
        let html = '<div class="csv-report-line strong">' + t('csv.cards_updated', { n: data.updated }) + '</div>';
        if (data.unknown > 0) html += '<div class="csv-report-line warn">' + t('csv.unknown_codes', { n: data.unknown }) + '</div>';
        if (data.errors && data.errors.length) html += renderBackupErrors(data.errors, data.error_count);
        report.innerHTML = html;

        showToast(t('csv.cards_updated', { n: data.updated }), 'success');
    } catch (e) {
        console.error(e);
        report.className = 'csv-report error';
        report.innerHTML = `<div class="csv-report-line">${t('common.connection_error')}</div>`;
        showToast(t('common.connection_error'), 'error');
    } finally {
        btn.innerText = t('csv.import_btn');
        btn.disabled = !setCsvFile;
    }
}

function renderBackupErrors(errors, total) {
    let html = '<div class="csv-report-line warn">' + t('csv.rows_discarded') +
        (total && total > errors.length ? ' ' + t('csv.rows_discarded_detail', { total: total, shown: errors.length }) : ':') +
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
            if (!/\.csv$/i.test(f.name)) { showToast(t('csv.select_csv_only'), 'error'); e.target.value = ''; return; }
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
            if (!/\.csv$/i.test(f.name)) { showToast(t('csv.select_csv_only'), 'error'); return; }
            setCsvFile = f; setBackupFileLabel(f.name); document.getElementById('set-csv-import-btn').disabled = false;
        });
    }
});

// -------- Apertura / chiusura modale --------
function openDeleteModal() {
    document.getElementById('delete-step-1').style.display = 'block';
    document.getElementById('delete-step-2').style.display = 'none';
    document.getElementById('delete-pwd').value = '';
    document.getElementById('delete-modal').classList.add('open');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('open');
}

// -------- Passaggio allo step 2 (conferma finale) --------
function deleteGoStep2() {
    document.getElementById('delete-step-1').style.display = 'none';
    document.getElementById('delete-step-2').style.display = 'block';
}

// -------- Eliminazione definitiva --------
async function confirmDeleteAccount() {
    const pwd = document.getElementById('delete-pwd').value;
    if (!pwd) {
        showToast(t('settings.delete_password_required'), 'error');
        return;
    }

    try {
        await fetchJSON('/api/settings/delete_account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd })
        });
        showToast(t('settings.account_deleted'), 'success');
        setTimeout(function () { location.href = '/login'; }, 1500);
    } catch (e) {
        showToast(e.message || t('settings.delete_account_error'), 'error');
    }
}

// -------- Chiusura cliccando fuori dalla modale --------
document.addEventListener('DOMContentLoaded', function () {
    const m = document.getElementById('delete-modal');
    if (m) {
        m.addEventListener('click', function (e) {
            if (e.target.id === 'delete-modal') closeDeleteModal();
        });
    }
});
