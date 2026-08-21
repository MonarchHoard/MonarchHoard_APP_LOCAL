// =========================================================
// SELETTORE LINGUA - Monarch Hoard
// =========================================================
// Componente indipendente: funziona su tutte le pagine, incluse
// login.html e register.html che non caricano main.js/memory.js/ecc.
// Non e' in conflitto con le funzioni toggleDropdown(id) definite
// nelle altre pagine: usa un nome suo proprio.

function toggleLangDropdown() {
    const dd = document.getElementById('lang-switcher-dropdown');
    if (!dd) return;
    dd.classList.toggle('open');
}

// Chiude il menu cliccando fuori (utile soprattutto su login/register,
// che non hanno gia' un listener globale per chiudere i dropdown)
document.addEventListener('click', function (e) {
    if (e.target.closest('.lang-switcher-wrap')) return;
    const dd = document.getElementById('lang-switcher-dropdown');
    if (dd) dd.classList.remove('open');
});
