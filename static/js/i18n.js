// =========================================================
// SISTEMA DI TRADUZIONE (i18n) - lato JavaScript
// =========================================================
// Usa lo stesso identico dizionario e la stessa convenzione a "chiavi
// puntate" (es. "common.close") gia' usata lato server nei template
// (funzione t() dentro app.py).
//
// window.MH_LANG viene popolato da un piccolo script inline che ogni
// pagina HTML include PRIMA di questo file (vedi istruzioni fornite
// separatamente per i template).
//
// USO:
//   t('common.close')                          -> "Chiudi"
//   t('collection.results_showing', {shown: 5, total: 20})
//                                               -> "Mostrando 5 di 20 carte"

function t(key, params) {
    const parts = key.split('.');
    let node = window.MH_LANG || {};
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (node && typeof node === 'object' && p in node) {
            node = node[p];
        } else {
            console.warn('[i18n] Chiave di traduzione mancante:', key);
            return key; // fallback: mostra la chiave stessa, mai una pagina rotta
        }
    }
    if (typeof node === 'string' && params) {
        return node.replace(/\{(\w+)\}/g, function (match, name) {
            return (params[name] !== undefined) ? params[name] : match;
        });
    }
    return node;
}
