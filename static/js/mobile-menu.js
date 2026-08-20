// =========================================================
// MENU HAMBURGER MOBILE + SIDEBAR UNIFICATA - Monarch Hoard (v5)
// ---------------------------------------------------------
// - Su smartphone: bottone "3 righe" che apre un cassetto,
//   clonando l'INTERO contenuto della sidebar (logo, profilo,
//   menu, logout: ora sono tutti gia' dentro alla sidebar,
//   quindi non serve piu' "spostarli" da nessuna parte).
// - Su desktop: gestisce la puntina che fissa/comprime la
//   sidebar, ricordando la preferenza anche dopo aver
//   ricaricato la pagina.
// =========================================================
(function () {
    let savedScrollY = 0;
    let drawer, overlay;

    function buildMenu() {
        const topBarLeft = document.querySelector('.top-bar-left');
        const sidebar = document.querySelector('.sidebar');
        if (!topBarLeft || !sidebar) return;

        // -------- Bottone hamburger --------
        if (!document.getElementById('mobile-menu-btn')) {
            const burger = document.createElement('button');
            burger.id = 'mobile-menu-btn';
            burger.className = 'mobile-menu-btn';
            burger.type = 'button';
            burger.setAttribute('aria-label', 'Apri menu');
            burger.innerHTML = '<span></span><span></span><span></span>';
            topBarLeft.insertBefore(burger, topBarLeft.firstChild);
            burger.addEventListener('click', openDrawer);
        }

        // -------- Sfondo scuro dietro al cassetto --------
        overlay = document.getElementById('mobile-menu-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'mobile-menu-overlay';
            overlay.className = 'mobile-menu-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', closeDrawer);
        }

        // -------- Cassetto (contenitore vuoto: viene riempito
        //          ad ogni apertura clonando la sidebar) --------
        drawer = document.getElementById('mobile-menu-drawer');
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'mobile-menu-drawer';
            drawer.className = 'mobile-menu-drawer';
            document.body.appendChild(drawer);
            // Chiude il cassetto quando si clicca una voce di menu
            // (o il logout, che comunque porta via dalla pagina)
            drawer.addEventListener('click', function (e) {
                if (e.target.closest('button') || e.target.closest('a')) {
                    closeDrawer();
                }
            });
        }
    }

    // -------- Blocco scroll pagina "a prova di iPhone" --------
    function lockBodyScroll() {
        savedScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = (-savedScrollY) + 'px';
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        document.body.classList.add('mobile-menu-locked');
    }

    function unlockBodyScroll() {
        document.body.classList.remove('mobile-menu-locked');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, savedScrollY);
    }

    function openDrawer() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar || !drawer || !overlay) return;
        // Clona TUTTO il contenuto reale della sidebar (logo, puntina,
        // profilo, menu, logout): sono sempre gli stessi elementi che
        // vedi su desktop, qui semplicemente ricopiati nel cassetto.
        // Viene rigenerato ad ogni apertura, cosi' la voce "attiva"
        // del menu resta sempre aggiornata alla vista corrente.
        const closeBtn = '<button type="button" class="mobile-menu-close" aria-label="Chiudi menu">&times;</button>';
        drawer.innerHTML = closeBtn + sidebar.innerHTML;
        const cb = drawer.querySelector('.mobile-menu-close');
        if (cb) cb.addEventListener('click', closeDrawer);
        drawer.classList.add('open');
        overlay.classList.add('open');
        lockBodyScroll();
    }

    function closeDrawer() {
        if (drawer) drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        unlockBodyScroll();
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeDrawer();
    });

    // Blocca lo scroll mentre il menu e' aperto (eccezione: se il
    // cassetto stesso e' piu' lungo dello schermo, lo lascia scrollare)
    document.addEventListener('touchmove', function (e) {
        if (!document.body.classList.contains('mobile-menu-locked')) return;
        const insideDrawer = drawer && e.target.closest('.mobile-menu-drawer');
        const drawerNeedsScroll = drawer && drawer.scrollHeight > drawer.clientHeight + 2;
        if (insideDrawer && drawerNeedsScroll) return;
        e.preventDefault();
    }, { passive: false });

    // Se si allarga la finestra oltre la soglia mobile, chiude
    // il cassetto (la sidebar vera torna visibile da sola via CSS)
    window.addEventListener('resize', function () {
        if (window.innerWidth > 1024) closeDrawer();
    });

    // -------- Puntina: fissa/comprime la sidebar su desktop --------
    function applySavedCollapseState() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        const saved = localStorage.getItem('sidebarCollapsed');
        if (saved === 'true') sidebar.classList.add('collapsed');
    }

    function initPinButton() {
        const btn = document.getElementById('sidebar-pin-btn');
        const sidebar = document.querySelector('.sidebar');
        if (!btn || !sidebar) return;
        btn.addEventListener('click', function () {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        buildMenu();
        applySavedCollapseState();
        initPinButton();
    });
})();
