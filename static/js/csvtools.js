// =========================================================
// BACKUP CSV - Monarch Hoard
// Richiede main.js (usa showToast, loadStats, loadCards)
// =========================================================
let csvSelectedFile = null;

// -------- Apertura / chiusura modale --------
function openCsvModal() {
    resetCsvModal();
    document.getElementById('csv-modal').classList.add('open');
}

function closeCsvModal() {
    document.getElementById('csv-modal').classList.remove('open');
}

function resetCsvModal() {
    csvSelectedFile = null;
    const input = document.getElementById('csv-file-input');
    if (input) input.value = '';
    setCsvFileLabel(null);
    const report = document.getElementById('csv-report');
    report.innerHTML = '';
    report.className = 'csv-report';
    document.getElementById('csv-import-btn').disabled = true;
}

function setCsvFileLabel(name) {
    const el = document.getElementById('csv-file-name');
    if (!el) return;
    if (name) {
        el.innerText = name;
        el.classList.add('has-file');
    } else {
        el.innerText = t('csv.no_file_selected');
        el.classList.remove('has-file');
    }
}

// -------- Export --------
function exportCsv() {
    window.location.href = '/api/export/csv';
    showToast(t('csv.download_started'), 'success');
}

// -------- Selezione file --------
function handleCsvFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        csvSelectedFile = null;
        setCsvFileLabel(null);
        document.getElementById('csv-import-btn').disabled = true;
        return;
    }

    if (!/\.csv$/i.test(file.name)) {
        showToast(t('csv.select_csv_only'), 'error');
        event.target.value = '';
        return;
    }

    csvSelectedFile = file;
    setCsvFileLabel(file.name);
    document.getElementById('csv-import-btn').disabled = false;
}

function triggerCsvFilePicker() {
    document.getElementById('csv-file-input').click();
}

// -------- Import --------
async function importCsv() {
    if (!csvSelectedFile) return;

    const btn = document.getElementById('csv-import-btn');
    const report = document.getElementById('csv-report');

    btn.disabled = true;
    btn.innerText = t('csv.importing');
    report.className = 'csv-report';
    report.innerHTML = `<div class="csv-report-line">${t('csv.processing')}</div>`;

    const formData = new FormData();
    formData.append('file', csvSelectedFile);

    try {
        const response = await fetch('/api/import/csv', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || data.status !== 'success') {
            report.className = 'csv-report error';
            let html = '<div class="csv-report-line">' +
                escapeHTML(data.message || t('csv.import_failed')) + '</div>';
            if (data.errors && data.errors.length) {
                html += renderCsvErrors(data.errors, data.error_count);
            }
            report.innerHTML = html;
            showToast(t('csv.import_failed'), 'error');
            return;
        }

        report.className = 'csv-report ok';
        let html = '<div class="csv-report-line strong">' +
            t('csv.cards_updated', { n: data.updated }) + '</div>';
        if (data.unknown > 0) {
            html += '<div class="csv-report-line warn">' +
                t('csv.unknown_codes', { n: data.unknown }) + '</div>';
        }
        if (data.errors && data.errors.length) {
            html += renderCsvErrors(data.errors, data.error_count);
        }
        report.innerHTML = html;

        showToast(t('csv.cards_updated', { n: data.updated }), 'success');

        // Ricarica collezione e statistiche
        if (typeof loadCards === 'function') loadCards();
        if (typeof loadStats === 'function') loadStats();
    } catch (e) {
        console.error(e);
        report.className = 'csv-report error';
        report.innerHTML = `<div class="csv-report-line">${t('common.connection_error')}</div>`;
        showToast(t('csv.import_connection_error'), 'error');
    } finally {
        btn.innerText = t('csv.import_btn');
        btn.disabled = !csvSelectedFile;
    }
}

function renderCsvErrors(errors, total) {
    let html = '<div class="csv-report-line warn">' + t('csv.rows_discarded') +
        (total && total > errors.length ? ' ' + t('csv.rows_discarded_detail', { total: total, shown: errors.length }) : ':') +
        '</div><ul class="csv-error-list">';
    errors.forEach(function (err) {
        html += '<li>' + escapeHTML(err) + '</li>';
    });
    html += '</ul>';
    return html;
}

// -------- Chiusura cliccando fuori --------
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('csv-modal');
    if (!modal) return;

    modal.addEventListener('click', function (e) {
        if (e.target.id === 'csv-modal') closeCsvModal();
    });

    const input = document.getElementById('csv-file-input');
    if (input) input.addEventListener('change', handleCsvFileChange);

    // Drag & drop sull'area di upload
    const drop = document.getElementById('csv-dropzone');
    if (drop) {
        ['dragenter', 'dragover'].forEach(function (evt) {
            drop.addEventListener(evt, function (e) {
                e.preventDefault();
                drop.classList.add('dragging');
            });
        });
        ['dragleave', 'drop'].forEach(function (evt) {
            drop.addEventListener(evt, function (e) {
                e.preventDefault();
                drop.classList.remove('dragging');
            });
        });
        drop.addEventListener('drop', function (e) {
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) return;
            if (!/\.csv$/i.test(file.name)) {
                showToast(t('csv.select_csv_only'), 'error');
                return;
            }
            csvSelectedFile = file;
            setCsvFileLabel(file.name);
            document.getElementById('csv-import-btn').disabled = false;
        });
    }
});

function downloadExampleCsv() {
    window.location.href = '/api/export/template';
    showToast(t('csv.template_download_started'), 'success');
}
