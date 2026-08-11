let allCardsData = [];
let currentView = localStorage.getItem('lastView') || 'COLLEZIONE';
let searchTimeout;
let currentModalCardCode = null; // Variabile per tracciare la carta aperta nella modale
let currentSortCard = 'id';
let currentSortSet = 'asc';
let savedCollapsedSets = localStorage.getItem('collapsedSets');
let collapsedSets = new Set(savedCollapsedSets ? JSON.parse(savedCollapsedSets) : []);

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`Errore HTTP ${response.status} su ${url}`);
    }

    return response.json();
}

document.addEventListener('click', (e) => {
	const btn = e.target.closest('.btn-qty');
	if (!btn) return;

	const code = btn.dataset.code;
	const change = parseInt(btn.dataset.change);

	changeQty(code, change, e);
});

async function loadStats() {
    try {
        const data = await fetchJSON('/api/stats');

        document.getElementById('total-cards').innerText = data.total;
        document.getElementById('owned-cards').innerText = data.owned;
        document.getElementById('total-copies').innerText = data.copies;

        const sets = await fetchJSON('/api/set_progress');

        const totalSets = sets.length;
        const completedSets = sets.filter(set => set.owned === set.total && set.total > 0).length;

        const completedSetsEl = document.getElementById('completed-sets');
        if (completedSetsEl) {
            completedSetsEl.innerText = `${completedSets} / ${totalSets}`;
        }

    } catch (error) {
        console.error(error);
        showToast("Errore nel caricamento delle statistiche.", 'error');
    }
}

async function loadCards() {
    // Mostra skeleton mentre carica
    const container = document.getElementById('sets-container');
    let skeletonHTML = '<div class="skeleton-grid">';
    for (let i = 0; i < 12; i++) {
        skeletonHTML += '<div class="skeleton-card"></div>';
    }
    skeletonHTML += '</div>';
    container.innerHTML = skeletonHTML;

    try {
        const cards = await fetchJSON('/api/cards');
        allCardsData = cards;

        if (savedCollapsedSets === null) {
            const allSetNames = [...new Set(
                allCardsData
                    .map(card => card.set_name)
                    .filter(Boolean)
            )];
            collapsedSets = new Set(allSetNames);
            localStorage.setItem('collapsedSets', JSON.stringify([...collapsedSets]));
        }

        populateDropdowns();
        renderCards(allCardsData);
		updateResultsCounter(allCardsData.length);
		updateHunterProgress();
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="mh-empty-message">Errore nel caricamento delle carte.</div>`;
        showToast("Impossibile caricare le carte.", 'error');
    }
}

function populateDropdowns() {
	const rarityMap = new Map();
	const setMap = new Map();

	allCardsData.forEach(card => {
		if (card.rarity && !rarityMap.has(card.rarity)) {
			rarityMap.set(card.rarity, card.rarity_Order ?? 999);
		}
	
		if (card.set_name && !setMap.has(card.set_name)) {
			setMap.set(card.set_name, card.set_order ?? 999);
		}
	});


	// --------------------------
	// RARITA'
	// --------------------------
	const rarityContainer = document.getElementById("rarity-filter");
	rarityContainer.innerHTML = "";
	Array.from(rarityMap.entries())
    .sort((a, b) => {
        const orderA = Number(a[1] ?? 999);
        const orderB = Number(b[1] ?? 999);

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return a[0].localeCompare(b[0]);
    })
    .forEach(([rarity]) => {
		const chip = document.createElement("div");
		chip.className = "filter-chip";
		chip.dataset.value = rarity;
		chip.innerText = rarity;
		chip.onclick = () => {
			chip.classList.toggle("active");
			updateDropdownTitles();
			filterCards();
		};
		rarityContainer.appendChild(chip);
	});

	// --------------------------
	// SET
	// --------------------------
	const setContainer = document.getElementById("set-filter");
	setContainer.innerHTML = "";
	Array.from(setMap.entries())
    .sort((a, b) => {
        const orderA = Number(a[1] ?? 999);
        const orderB = Number(b[1] ?? 999);

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return a[0].localeCompare(b[0]);
    })
    .forEach(([setName]) => {
		const chip = document.createElement("div");
		chip.className = "filter-chip";
		chip.dataset.value = setName;
		chip.innerText = setName;
		chip.onclick = () => {
			chip.classList.toggle("active");
			updateDropdownTitles();
			filterCards();
		};
		setContainer.appendChild(chip);
	});

	// --------------------------
	// POSSEDUTE (Manteniamo le 3 diciture standard)
	// --------------------------
	const ownedContainer = document.getElementById("owned-filter");
	ownedContainer.innerHTML = "";
	
	const ownedOptions = [
		{ value: 'ALL', label: 'Tutte' },
		{ value: 'OWNED', label: 'Possedute' },
		{ value: 'NOT_OWNED', label: 'Mancanti' },
		{ value: 'DUPLICATES', label: 'Doppioni' }
	];

	ownedOptions.forEach(opt => {
		const chip = document.createElement("div");
		chip.className = "filter-chip";
		chip.dataset.value = opt.value;
		chip.innerText = opt.label;
		chip.onclick = () => {
			// Se vuoi mantenere il comportamento esclusivo (clicchi uno, si deseleziona l'altro), 
			// puoi farlo agendo solo su questo contenitore:
			document.querySelectorAll("#owned-filter .filter-chip").forEach(c => c.classList.remove("active"));
			chip.classList.toggle("active");
			updateDropdownTitles();
			// Opzionale: chiude il dropdown se ti piaceva l'interazione precedente
			document.getElementById("owned-dropdown").classList.remove("open");
			filterCards();
		};
		ownedContainer.appendChild(chip);
	});

	updateDropdownTitles();
	
	// Assegnamo di default "Tutte" attiva all'avvio
	const allChip = document.querySelector('#owned-filter .filter-chip[data-value="ALL"]');
	if (allChip) allChip.classList.add("active");
	updateDropdownTitles();
}

//--------------------------------------------------
// APERTURA MENU
//--------------------------------------------------

function toggleDropdown(id){

	document
		.querySelectorAll(".dropdown-content")
		.forEach(menu=>{

			if(menu.id!==id)
				menu.classList.remove("open");

		});

	document
		.getElementById(id)
		.classList.toggle("open");

}

//--------------------------------------------------
// CHIUSURA MENU CLIC FUORI
//--------------------------------------------------

document.addEventListener("click",function(e){

	if(e.target.closest(".dropdown-filter"))
		return;

	document
		.querySelectorAll(".dropdown-content")
		.forEach(menu=>menu.classList.remove("open"));

});

function updateDropdownTitles() {
	const raritySelected = document.querySelectorAll("#rarity-filter .filter-chip.active").length;
	const setSelected = document.querySelectorAll("#set-filter .filter-chip.active").length;
	
	// Per "Possedute", se "Tutte" è selezionato mostra "Tutte", altrimenti conta le attive
	const ownedChips = [...document.querySelectorAll("#owned-filter .filter-chip")];
	const activeOwned = ownedChips.filter(c => c.classList.contains("active"));

	document.getElementById("rarity-button").innerText = 
		raritySelected > 0 ? `Rarità (${raritySelected}) ▼` : "Rarità ▼";

	document.getElementById("set-button").innerText = 
		setSelected > 0 ? `Set (${setSelected}) ▼` : "Set ▼";

	// Mostra il testo dell'elemento attivo per le possedute, o "Stato ▼" di default
	let ownedText = "Stato ▼";
	if (activeOwned.length === 1) {
		ownedText = activeOwned[0].textContent.trim() + " ▼";
	} else if (activeOwned.length === 0 || activeOwned.find(c => c.dataset.value === 'ALL')) {
		ownedText = "Tutte ▼";
	}
	document.getElementById("owned-button").innerText = ownedText;
}

function filterCards() {
	const searchText = document.getElementById('search-input').value.toLowerCase();
	const selectedRarities = [...document.querySelectorAll("#rarity-filter .filter-chip.active")].map(chip => chip.dataset.value);
	const selectedSets = [...document.querySelectorAll("#set-filter .filter-chip.active")].map(chip => chip.dataset.value);
	
	// Leggiamo i valori selezionati dal filtro possedute unificato
	const selectedOwned = [...document.querySelectorAll("#owned-filter .filter-chip.active")].map(chip => chip.dataset.value);

	const filtered = allCardsData.filter(card => {
		const matchesSearch =
			(card.card_name || '').toLowerCase().includes(searchText) ||
			(card.card_code || '').toLowerCase().includes(searchText) ||
			(card.rarity || '').toLowerCase().includes(searchText) ||
			(card.serials || '').toLowerCase().includes(searchText) ||
			(card.set_name || '').toLowerCase().includes(searchText);
		const matchesRarity = selectedRarities.length === 0 || selectedRarities.includes(card.rarity);
		const matchesSet = selectedSets.length === 0 || selectedSets.includes(card.set_name);
		
		let matchesOwned = true;
		
		if (selectedOwned.length > 0 && !selectedOwned.includes('ALL')) {
			const isOwned = card.quantity > 0;
			const isNotOwned = card.quantity === 0;
			const isDuplicate = card.quantity > 1;
		
			matchesOwned =
				(selectedOwned.includes('OWNED') && isOwned) ||
				(selectedOwned.includes('NOT_OWNED') && isNotOwned) ||
				(selectedOwned.includes('DUPLICATES') && isDuplicate);
		}

		const matchesView = (currentView === 'COLLEZIONE') || 
							(currentView === 'WISHLIST' && card.is_wishlisted);
		
		return matchesSearch && matchesRarity && matchesSet && matchesOwned && matchesView;
	});

	renderCards(filtered);
	updateResultsCounter(filtered.length);
}

function selectAllInDropdown(containerId){

	document
		.querySelectorAll(`#${containerId} .filter-chip`)
		.forEach(chip=>chip.classList.add("active"));

	updateDropdownTitles();

	filterCards();

}

function clearFilters() {

	const searchEl = document.getElementById('search-input');
	if (searchEl) searchEl.value = '';

	document.querySelectorAll(".filter-chip")
		.forEach(chip => chip.classList.remove("active"));

	// reset owned su "ALL"
	document.querySelectorAll("#owned-filter .filter-chip")
		.forEach(c => c.classList.remove("active"));

	const allChip = document.querySelector('#owned-filter .filter-chip[data-value="ALL"]');
	if (allChip) allChip.classList.add("active");

	// Reset Ordinamento Carte a ID
	document.querySelectorAll("#sort-cards-filter .filter-chip").forEach(c => c.classList.remove("active"));
	const sortCardIdChip = document.querySelector('#sort-cards-filter .filter-chip[data-value="id"]');
	if (sortCardIdChip) sortCardIdChip.classList.add("active");
	const sortCardsButton = document.getElementById("sort-cards-button");
	if (sortCardsButton) sortCardsButton.innerText = "Ordina Carte: ID ▼";
	currentSortCard = 'id';
	
	// Reset Ordinamento Set a Crescente
	document.querySelectorAll("#sort-set-filter .filter-chip").forEach(c => c.classList.remove("active"));
	const sortSetAscChip = document.querySelector('#sort-set-filter .filter-chip[data-value="asc"]');
	if (sortSetAscChip) sortSetAscChip.classList.add("active");
	const sortSetButton = document.getElementById("sort-set-button");
	if (sortSetButton) sortSetButton.innerText = "Ordina Set: Crescente ▼";
	currentSortSet = 'asc';

	updateDropdownTitles();
	filterCards();
}

function switchView(viewName) {
    currentView = viewName;
	localStorage.setItem('lastView', viewName);

    document.getElementById('btn-view-dashboard').classList.toggle('active', viewName === 'DASHBOARD');
    document.getElementById('btn-view-collezione').classList.toggle('active', viewName === 'COLLEZIONE');
    document.getElementById('btn-view-wishlist').classList.toggle('active', viewName === 'WISHLIST');

    const dashboard = document.getElementById('dashboard-container');
    const collection = document.getElementById('sets-container');
    const heroPanel = document.querySelector('.hero-panel');
    const searchBar = document.querySelector('.search-bar');

    const isDashboard = viewName === 'DASHBOARD';

    if (heroPanel) heroPanel.classList.toggle('hidden', isDashboard);
    if (searchBar) searchBar.classList.toggle('hidden', isDashboard);

    dashboard.classList.toggle('hidden', !isDashboard);
    collection.classList.toggle('hidden', isDashboard);

    if (isDashboard) {
        renderDashboard();
        updateResultsCounter(0); // nasconde il contatore in dashboard
    } else {
        filterCards();
    }
}


function handleSearch() {
	clearTimeout(searchTimeout);
	searchTimeout = setTimeout(() => {
		filterCards();
	}, 300);
}

function highlightText(text, search) {
    const safeText = escapeHTML(text);

    if (!search) return safeText;

    const escapedSearch = escapeHTML(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'ig');

    return safeText.replace(regex, '<span class="search-highlight">$1</span>');
}

function renderCards(cardsToRender) {
	const container = document.getElementById('sets-container');
	container.innerHTML = '';

	if (cardsToRender.length === 0) {
		container.innerHTML = `<p style="text-align:center; color:#64748b; margin-top:40px;">Nessuna carta corrisponde ai criteri correnti.</p>`;
		return;
	}

	// 1. Ordinamento delle CARTE
	const sortedCards = [...cardsToRender];
	const sortBy = currentSortCard || 'id';
	sortedCards.sort((a, b) => {
		if (sortBy === 'name') {
			return (a.card_name || '').localeCompare(b.card_name || '');
		} else if (sortBy === 'qty-desc') {
			return (b.quantity || 0) - (a.quantity || 0);
		}  else if (sortBy === 'qty-asc') {
			return (a.quantity || 0) - (b.quantity || 0);
		} else if (sortBy === 'rarity-asc') {
			return (a.rarity_Order || 999) - (b.rarity_Order || 999);
		} else if (sortBy === 'rarity-desc') {
			return (b.rarity_Order || 999) - (a.rarity_Order || 999);
		} else if (sortBy === 'id') {
			return (a.cards_display_order || '').localeCompare(b.cards_display_order || '');
		}
		return 0;
	});

	// Raggruppamento per Set
	const groups = {};
	sortedCards.forEach(card => {
		const setCode = card.set_name || "Altri";
		if (!groups[setCode]) groups[setCode] = [];
		groups[setCode].push(card);
	});

	// 2. Ordinamento dei SET (NUOVA PARTE)
	const sortBySet = currentSortSet || 'asc';
	const sortedSetCodes = Object.keys(groups).sort((a, b) => {
	
		const orderA = groups[a][0].set_order || 999;
		const orderB = groups[b][0].set_order || 999;
	
		if (currentSortSet === 'desc') {
			return orderB - orderA;
		}
	
		return orderA - orderB;
	
	});

	// Ora cicliamo usando l'array ordinato dei set, invece del vecchio "for...in"
	sortedSetCodes.forEach(setCode => {
		const setSection = document.createElement('div');
		setSection.className = 'set-section';
		
		if (collapsedSets.has(setCode)) {
			setSection.classList.add('collapsed');
		}
		
		// Calcoliamo qui le statistiche del set
		const setCards = groups[setCode];
		const totalInSet = setCards.length;
		const ownedInSet = setCards.filter(card => card.quantity > 0).length;

		const progressPercent = totalInSet > 0
			? Math.round((ownedInSet / totalInSet) * 100)
			: 0;

		const wallpaperName = `sfondo_${setCode.toUpperCase()}.png`;
		setSection.style.backgroundImage = `url('/static/wallpaper/${wallpaperName}')`;
		
		const header = document.createElement('div');
		header.className = 'set-header';
		
		setSection.style.backgroundSize = 'cover';
		setSection.style.backgroundPosition = 'center';
		setSection.style.backgroundRepeat = 'no-repeat';
		
		const setImgName = `pacchetto_${setCode.toUpperCase()}.png`;
		
		header.innerHTML = `
			<div style="display:flex; align-items:center; gap:15px; width:100%;">
		
				<img src="/static/wallpaper/${setImgName}"
					alt="${setCode}"
					style="width:60px; height:60px; object-fit:contain; border-radius:4px;"
					onerror="this.style.display='none';">
		
				<div style="flex:1;">
		
					<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
		
						<span class="set-title-text set-count" data-set-code="${setCode}">
							Set: ${setCode} (${ownedInSet}/${totalInSet})
						</span>

						<span class="set-percent" style="color:white; font-weight:bold;">
							${progressPercent}%
						</span>

		
					</div>
		
					<div style="height:10px; background:#222; border-radius:10px; overflow:hidden;">
		
						<div class="set-progress-fill" style="
							width:${progressPercent}%;
							height:100%;
							background:linear-gradient(90deg, #bf00ff, #00d2ff);
						"></div>

		
					</div>
		
				</div>
		
				<span style="color:white; background:black; padding:6px 8px; border-radius:4px; border:1px solid #444; font-size:0.8rem;">
					▼
				</span>
		
			</div>
		`;
		header.onclick = () => {
			setSection.classList.toggle('collapsed');
			
			if (setSection.classList.contains('collapsed')) {
				collapsedSets.add(setCode);
			} else {
				collapsedSets.delete(setCode);
			}
		
			localStorage.setItem('collapsedSets', JSON.stringify([...collapsedSets]));
			observeImages();
		};
		const grid = document.createElement('div');
		grid.className = 'set-grid';

		groups[setCode].forEach(card => {
			
			const searchText = document.getElementById('search-input').value.trim();
			
			const safeName = escapeHTML(card.card_name);
			const safeCode = escapeHTML(card.card_code);
			const safeRarity = escapeHTML(card.rarity);

			const highlightedName = highlightText(card.card_name, searchText);
			const highlightedCode = highlightText(card.card_code, searchText);
			const cardEl = document.createElement('div');
			cardEl.className = `card ${card.quantity === 0 ? 'not-owned' : ''}`;
			cardEl.id = `card-${card.card_code}`;
			
			cardEl.addEventListener('click', (e) => {
				const isInteractive =
					e.target.closest('.quantity-control') ||
					e.target.tagName === 'INPUT' ||
					e.target.classList.contains('btn-qty') ||
					e.target.closest('.wishlist-btn'); // Aggiunta questa riga per il cuore!
			
				if (isInteractive) return;
			
				openModal(card);
			});

			cardEl.innerHTML = `
				<div class="collection-card-rarity ${card.quantity > 0 && (card.rarity_Order || 0) >= 35 ? 'shine' : ''}">${safeRarity}</div>
				
				${card.quantity > 1 ? `<div class="duplicate-badge">x${card.quantity}</div>` : ''}
				<div class="card-image-container">
					<img data-src="${card.image_url}" class="card-img" decoding="async" onerror="this.src='/static/No_Image_Available.jpg';">
				</div>
			
				<div class="card-code">${highlightedCode}</div>
				<div class="card-name">${highlightedName}</div>
			
				<div class="card-wishlist-row">
					<button class="wishlist-btn ${card.is_wishlisted ? 'active' : ''}" data-code="${card.card_code}" onclick="toggleWishlist('${card.card_code}', event)">
						${card.is_wishlisted ? '❤️' : '🤍'}
					</button>
				</div>
			
				<div class="quantity-control">
					<button class="btn-qty" data-code="${card.card_code}" data-change="-1">-</button>
					<input class="qty-input" id="qty-${card.card_code}" type="number" min="0" value="${card.quantity}" onchange="setQty('${card.card_code}', this.value)">
					<button class="btn-qty" data-code="${card.card_code}" data-change="1">+</button>
				</div>
			`;
			updateSerialTag(card.card_code, cardEl);
			grid.appendChild(cardEl);
		});

		setSection.appendChild(header);
		setSection.appendChild(grid);
		container.appendChild(setSection);
	}); // <-- NOTA: questa chiusura è cambiata rispetto alla tua per via del forEach
	
	observeImages();
}

async function changeQty(cardCode, change, event) {
    if (event) event.stopPropagation();

    const qtyElement = document.getElementById(`qty-${cardCode}`);
    if (!qtyElement) return;

    const buttons = document.querySelectorAll(`.btn-qty[data-code="${cardCode}"]`);

    let currentQty = parseInt(qtyElement.value || "0");
    let newQty = currentQty + change;

    if (newQty < 0) newQty = 0;

    qtyElement.value = newQty;

    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'wait';
    });

    try {
        const data = await fetchJSON('/api/update_quantity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                card_code: cardCode,
                quantity: newQty
            })
        });

        if (data.status === 'success') {
            const cardIndex = allCardsData.findIndex(c => c.card_code === cardCode);

			if (cardIndex !== -1) {
				allCardsData[cardIndex].quantity = newQty;
			
				if (newQty > 0) {
					allCardsData[cardIndex].updated_at = new Date().toISOString();
				}
			}

			updateCardVisual(cardCode, newQty);
			// Feedback visivo +1 / -1 sul bottone cliccato
			if (event && event.target) {
				showFloatFeedback(event.target, change);
			}
			updateSetHeaderForCard(cardCode);
			loadStats();
			
			if (currentView === 'DASHBOARD') {
				renderDashboard();
			} else {
				const selectedOwned = [...document.querySelectorAll("#owned-filter .filter-chip.active")]
					.map(chip => chip.dataset.value);
			
				const card = allCardsData.find(c => c.card_code === cardCode);
			
				const shouldDisappear =
					card &&
					(
						selectedOwned.includes('OWNED') && newQty === 0 ||
						selectedOwned.includes('NOT_OWNED') && newQty > 0 ||
						selectedOwned.includes('DUPLICATES') && newQty <= 1
					);
			
				if (shouldDisappear) {
					filterCards();
				}
			}


        } else {
            showToast("Errore durante l'aggiornamento della quantità.", 'error');
            qtyElement.value = currentQty;
        }
    } catch (error) {
        console.error(error);
        showToast("Errore di connessione. Riprova.", 'error');
        qtyElement.value = currentQty;
    } finally {
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
}

function updateCardVisual(cardCode, newQty) {
    updateHunterProgress();
    const cardEl = document.getElementById(`card-${cardCode}`);
    if (!cardEl) return;

    if (newQty > 0) {
        cardEl.classList.remove('not-owned');
    } else {
        cardEl.classList.add('not-owned');
    }

    const oldBadge = cardEl.querySelector('.duplicate-badge');
    if (oldBadge) oldBadge.remove();

	if (newQty > 1) {
		const badge = document.createElement('div');
		badge.className = 'duplicate-badge';
		badge.innerText = `x${newQty}`;
		cardEl.appendChild(badge);
	}
	
	const rarityBadge = cardEl.querySelector('.collection-card-rarity');
	const cardData = allCardsData.find(c => c.card_code === cardCode);
	if (rarityBadge && cardData) {
		if (newQty > 0 && (cardData.rarity_Order || 0) >= 35) {
			rarityBadge.classList.add('shine');
		} else {
			rarityBadge.classList.remove('shine');
		}
	}
}

function updateSetHeaderForCard(cardCode) {
    const card = allCardsData.find(c => c.card_code === cardCode);
    if (!card) return;
    const setCode = card.set_name || "Altri";
    const setCards = allCardsData.filter(c => (c.set_name || "Altri") === setCode);
    const totalInSet = setCards.length;
    const ownedInSet = setCards.filter(c => c.quantity > 0).length;
    const progressPercent = totalInSet > 0 ? Math.round((ownedInSet / totalInSet) * 100) : 0;

    const countEl = document.querySelector(`.set-count[data-set-code="${setCode}"]`);
    if (countEl) {
        countEl.innerText = `Set: ${setCode} (${ownedInSet}/${totalInSet})`;
    }

    const section = countEl ? countEl.closest(".set-section") : null;
    if (section) {
        const percentEl = section.querySelector(".set-percent");
        const progressFill = section.querySelector(".set-progress-fill");
        if (percentEl) {
            percentEl.innerText = `${progressPercent}%`;
        }
        if (progressFill) {
            progressFill.style.width = `${progressPercent}%`;
        }
    }
}


async function setQty(cardCode, value) {
    const qtyElement = document.getElementById(`qty-${cardCode}`);

    let newQty = parseInt(value);

    if (isNaN(newQty) || newQty < 0) {
        newQty = 0;
    }

    if (qtyElement) {
        qtyElement.value = newQty;
    }

    try {
        const data = await fetchJSON('/api/update_quantity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                card_code: cardCode,
                quantity: newQty
            })
        });

        if (data.status === 'success') {
            const cardIndex = allCardsData.findIndex(c => c.card_code === cardCode);

			if (cardIndex !== -1) {
				allCardsData[cardIndex].quantity = newQty;
			
				if (newQty > 0) {
					allCardsData[cardIndex].updated_at = new Date().toISOString();
				}
			}

			updateCardVisual(cardCode, newQty);
			loadStats();
			
			if (currentView === 'DASHBOARD') {
				renderDashboard();
			} else {
				filterCards();
			}

        } else {
            showToast("Errore durante il salvataggio.", 'error');
        }
    } catch (error) {
        console.error(error);
        showToast("Errore di connessione. Riprova.", 'error');
    }
}

function openModal(card) {
    const fullCardData = allCardsData.find(c => c.card_code === card.card_code) || card;
    const modalImg = document.getElementById('modal-card-img');
    currentModalCardCode = fullCardData.card_code;

    const qtyInput = document.getElementById(`qty-${fullCardData.card_code}`);
    const currentQty = qtyInput ? parseInt(qtyInput.value || "0") : fullCardData.quantity || 0;

    if (currentQty === 0) {
        modalImg.style.filter = 'grayscale(80%)';
        modalImg.style.opacity = '0.45';
    } else {
        modalImg.style.filter = 'none';
        modalImg.style.opacity = '1';
    }
    modalImg.src = fullCardData.image_url;
    document.getElementById('modal-card-name').innerText = fullCardData.card_name;
    document.getElementById('modal-card-code').innerText = `Codice: ${fullCardData.card_code}`;
	const rarityEl = document.getElementById('modal-card-rarity');
	rarityEl.innerText = fullCardData.rarity;
	if (currentQty > 0 && (fullCardData.rarity_Order || 0) >= 35) {
		rarityEl.classList.add('shine');
	} else {
		rarityEl.classList.remove('shine');
	}
    // Badge doppioni
    const dupBadge = document.getElementById('modal-duplicate-badge');
    if (currentQty > 1) {
        dupBadge.innerText = `x${currentQty}`;
        dupBadge.style.display = 'block';
    } else {
        dupBadge.style.display = 'none';
    }

    // Input quantità
    document.getElementById('modal-qty-input').value = currentQty;

    // Wishlist
    const modalWishBtn = document.getElementById('modal-wishlist-btn');
    if (fullCardData.is_wishlisted) {
        modalWishBtn.classList.add('active');
        modalWishBtn.innerText = '❤️';
    } else {
        modalWishBtn.classList.remove('active');
        modalWishBtn.innerText = '🤍';
    }

    document.getElementById('card-modal').classList.add('open');

	// Togli il focus da eventuali input esterni per far funzionare le frecce
	if (document.activeElement && document.activeElement.blur) {
		document.activeElement.blur();
	}

	renderSerialInputs(fullCardData, currentQty);
}

function closeModal() {
    autoSaveSerials();   // salva eventuali modifiche pendenti (es. chiusura con ESC)
    document.getElementById('card-modal').classList.remove('open');
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('card-modal');
    const modalOpen = modal && modal.classList.contains('open');
    const searchInput = document.getElementById('search-input');
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    // ESC → chiude modale
    if (e.key === 'Escape') {
        closeModal();
        return;
    }

    // "/" → focus sulla barra di ricerca (solo se non stai già scrivendo)
    if (e.key === '/' && !isTyping && !modalOpen) {
        e.preventDefault();
        if (searchInput) searchInput.focus();
        return;
    }

	// Frecce ← → nella modale → carta precedente/successiva dello stesso set
	if (modalOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
		// Blocca SOLO se stai scrivendo nell'input quantità della modale stessa
		const ae = document.activeElement;
		if (ae && (ae.id === 'modal-qty-input' || ae.classList.contains('serial-input'))) return;
		e.preventDefault();
		navigateModal(e.key === 'ArrowRight' ? 1 : -1);
		return;
	}

});

document.getElementById('card-modal').addEventListener('click', (e) => {
    if (e.target.id === 'card-modal') {
        closeModal();
    }
});

function toggleWishlist(cardCode, event) {
	if (event) event.stopPropagation();
	
	const cardIndex = allCardsData.findIndex(c => c.card_code === cardCode);
	if (cardIndex === -1) return;
	
	const currentStatus = allCardsData[cardIndex].is_wishlisted;
	const newStatus = !currentStatus;
	
	// Aggiorna i dati in memoria e graficamente (cambia cuore)
	allCardsData[cardIndex].is_wishlisted = newStatus;
	const btn = document.querySelector(`.wishlist-btn[data-code="${cardCode}"]`);
	if (btn) {
		btn.classList.toggle('active', newStatus);
		btn.innerText = newStatus ? '❤️' : '🤍';
		if (newStatus) {
			btn.classList.remove('pulse-once');
			void btn.offsetWidth; // forza il reset dell'animazione
			btn.classList.add('pulse-once');
		} else {
			btn.classList.remove('pulse-once');
		}
	}

	
	// Se siamo in vista Wishlist e leviamo il cuore, ricarichiamo i filtri per toglierla dalla vista
	if (currentView === 'WISHLIST' && !newStatus) {
		filterCards();
	}

	// Invia l'aggiornamento al backend
	fetchJSON('/api/toggle_wishlist', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			card_code: cardCode,
			is_wishlisted: newStatus
		})
	}).catch(error => {
		console.error(error);
		showToast("Errore durante l'aggiornamento della wishlist.", 'error');
	
		allCardsData[cardIndex].is_wishlisted = currentStatus;
	
		const btn = document.querySelector(`.wishlist-btn[data-code="${cardCode}"]`);
		if (btn) {
			btn.classList.toggle('active', newStatus);
			btn.innerText = newStatus ? '❤️' : '🤍';
			if (newStatus) {
				btn.classList.remove('pulse-once');
				void btn.offsetWidth; // forza il reset dell'animazione
				btn.classList.add('pulse-once');
			} else {
				btn.classList.remove('pulse-once');
			}
		}

	});
}

function clearDropdown(containerId){

	document
		.querySelectorAll(`#${containerId} .filter-chip`)
		.forEach(chip=>chip.classList.remove("active"));

	updateDropdownTitles();

	filterCards();

}

function resetAllFilters() {
	clearFilters();
}

function openAllSets() {
    collapsedSets.clear();
    localStorage.setItem('collapsedSets', JSON.stringify([]));

    if (currentView === 'COLLEZIONE' || currentView === 'WISHLIST') {
        filterCards();
    }
}

function closeAllSets() {
    const allSetNames = [...new Set(
        allCardsData
            .map(card => card.set_name)
            .filter(Boolean)
    )];

    collapsedSets = new Set(allSetNames);
    localStorage.setItem('collapsedSets', JSON.stringify([...collapsedSets]));

    if (currentView === 'COLLEZIONE' || currentView === 'WISHLIST') {
        filterCards();
    }
}

function toggleWishlistFromModal() {
    if (!currentModalCardCode) return;
    toggleWishlist(currentModalCardCode, null);
    const cardData = allCardsData.find(c => c.card_code === currentModalCardCode);
    const modalWishBtn = document.getElementById('modal-wishlist-btn');
    if (cardData && modalWishBtn) {
        modalWishBtn.classList.toggle('active', cardData.is_wishlisted);
        modalWishBtn.innerText = cardData.is_wishlisted ? '❤️' : '🤍';

        if (cardData.is_wishlisted) {
            modalWishBtn.classList.remove('pulse-once');
            void modalWishBtn.offsetWidth;
            modalWishBtn.classList.add('pulse-once');
        } else {
            modalWishBtn.classList.remove('pulse-once');
        }
    }
    if (currentView === 'DASHBOARD') {
        renderDashboard();
    }
}

function selectSortCard(event, value, labelText) {
    document.querySelectorAll("#sort-cards-filter .filter-chip")
        .forEach(c => c.classList.remove("active"));

    event.currentTarget.classList.add("active");

    currentSortCard = value;
    document.getElementById("sort-cards-button").innerText = labelText + " ▼";
    document.getElementById("sort-cards-dropdown").classList.remove("open");

    filterCards();
}

function selectSortSet(event, value, labelText) {
    document.querySelectorAll("#sort-set-filter .filter-chip")
        .forEach(c => c.classList.remove("active"));

    event.currentTarget.classList.add("active");

    currentSortSet = value;
    document.getElementById("sort-set-button").innerText = labelText + " ▼";
    document.getElementById("sort-set-dropdown").classList.remove("open");

    filterCards();
}

async function renderDashboard() {
    try {
        const stats = await fetchJSON('/api/stats');

        if (!allCardsData || allCardsData.length === 0) {
            allCardsData = await fetchJSON('/api/cards');
        }

        const container = document.getElementById("dashboard-container");

        const percentage = Number(stats.percentage || 0);
        const missing = stats.total - stats.owned;

		const ownedCards = allCardsData.filter(card => card.quantity > 0);
		const wishlistCards = allCardsData.filter(card => card.is_wishlisted);
		
		const latestCards = [...ownedCards]
			.sort((a, b) => {
				const dateA = new Date(a.updated_at || 0);
				const dateB = new Date(b.updated_at || 0);
				return dateB - dateA;
			})
			.slice(0, 5);
		
		const wishlistPreview = wishlistCards.slice(0, 4);

        container.innerHTML = `
            <div class="mh-dashboard-grid">

                <section class="mh-panel mh-collection-progress">
                    <div class="mh-panel-title">Collection Progress</div>

                    <div class="mh-progress-content">
                        <div class="mh-progress-ring" style="--progress:${percentage};">
                            <div class="mh-progress-inner">
                                <div class="mh-progress-number">${percentage}%</div>
                                <div class="mh-progress-sub">${stats.owned} / ${stats.total}</div>
                                <div class="mh-progress-label">Carte</div>
                            </div>
                        </div>

                        <div class="mh-progress-creature"></div>
                    </div>

                    <div class="mh-mini-stats">
                        <div class="mh-mini-stat">
						<div class="mh-mini-icon">
							<img src="/static/wallpaper/icon_collection_progress_carte.png">
						</div>
                            <div class="mh-mini-value">${stats.owned}</div>
                            <div class="mh-mini-label">Carte</div>
                        </div>

                        <div class="mh-mini-stat">
						<div class="mh-mini-icon">
							<img src="/static/wallpaper/icon_collection_progress_copie.png">
						</div>
                            <div class="mh-mini-value">${stats.copies}</div>
                            <div class="mh-mini-label">Copie</div>
                        </div>

                        <div class="mh-mini-stat">
						<div class="mh-mini-icon">
							<img src="/static/wallpaper/icon_collection_progress_wishlist.png">
						</div>
                            <div class="mh-mini-value">${stats.wishlist}</div>
                            <div class="mh-mini-label">Wishlist</div>
                        </div>

                        <div class="mh-mini-stat">
						<div class="mh-mini-icon">
							<img src="/static/wallpaper/icon_collection_progress_mancanti.png">
						</div>
                            <div class="mh-mini-value">${missing}</div>
                            <div class="mh-mini-label">Mancanti</div>
                        </div>
                    </div>
                </section>

                <section class="mh-panel mh-set-panel">
                    <div class="mh-panel-header">
                        <div class="mh-panel-title">Progressione Set</div>
                        <button class="mh-link-btn" onclick="switchView('COLLEZIONE')">Vedi tutti</button>
                    </div>

                    <div id="dashboard-set-progress" class="mh-set-list"></div>
                </section>

                <section class="mh-panel mh-latest-panel">
                    <div class="mh-panel-title">Ultime Carte Aggiunte</div>
                    <div class="mh-card-row">
                        ${latestCards.length > 0 ? latestCards.map(card => renderDashboardSmallCard(card)).join('') : `
                            <div class="mh-empty-message">Nessuna carta posseduta.</div>
                        `}
                    </div>

                    <button class="mh-wide-btn" onclick="switchView('COLLEZIONE')">
                        Vedi tutte le carte →
                    </button>
                </section>

                <section class="mh-panel mh-wishlist-panel">
                    <div class="mh-panel-header">
                        <div class="mh-panel-title">Wishlist</div>
                        <button class="mh-link-btn" onclick="switchView('WISHLIST')">Vedi tutto</button>
                    </div>

                    <div class="mh-card-row compact">
                        ${wishlistPreview.length > 0 ? wishlistPreview.map(card => renderDashboardSmallCard(card)).join('') : `
                            <div class="mh-empty-message">Wishlist vuota.</div>
                        `}
                    </div>
                </section>

            </div>
        `;

        loadDashboardSets();

    } catch (error) {
        console.error(error);
        const container = document.getElementById("dashboard-container");
        container.innerHTML = `
            <div class="mh-panel">
                Errore nel caricamento della dashboard.
            </div>
        `;
    }
	
	observeImages();
}

function renderDashboardSmallCard(card) {
    const safeName = escapeHTML(card.card_name);
    const safeCode = escapeHTML(card.card_code);
    const safeRarity = escapeHTML(card.rarity);

    return `
        <div class="mh-small-card" onclick="openModalByCode('${safeCode}')">
            <div class="mh-small-rarity">${safeRarity}</div>
            <img data-src="${card.image_url}" alt="${safeName}" decoding="async" onerror="this.src='/static/No_Image_Available.jpg';">
            <div class="mh-small-card-name">${safeName}</div>
            <div class="mh-small-card-code">${safeCode}</div>
        </div>
    `;
}

function openModalByCode(cardCode) {
    const card = allCardsData.find(c => c.card_code === cardCode);
    if (card) {
        openModal(card);
    }
}

async function loadDashboardSets() {
    try {
        const sets = await fetchJSON("/api/set_progress");
        const container = document.getElementById("dashboard-set-progress");

        let html = "";

        sets.slice(0, 4).forEach(set => {
            const percentage = Number(set.percentage || 0);
            const safeSetName = escapeHTML(set.set_name);

            html += `
                <div class="mh-set-progress-item">
                    <div class="mh-set-thumb">
                        <img src="/static/wallpaper/pacchetto_${safeSetName.toUpperCase()}.png" 
                             alt="${safeSetName}" 
                             onerror="this.style.display='none';">
                    </div>

                    <div class="mh-set-info">
                        <div class="mh-set-name">${safeSetName}</div>
                        <div class="mh-set-sub">Set</div>

                        <div class="mh-set-bar">
                            <div class="mh-set-fill" style="width:${percentage}%;"></div>
                        </div>
                    </div>

                    <div class="mh-set-numbers">
                        <div>${set.owned} / ${set.total}</div>
                        <span>${percentage}%</span>
                    </div>
                </div>
            `;
        });

        html += `
            <button class="mh-wide-btn" onclick="switchView('COLLEZIONE')">
                Vedi tutti i set →
            </button>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error(error);
        const container = document.getElementById("dashboard-set-progress");
        container.innerHTML = `
            <div class="mh-empty-message">Errore nel caricamento dei set.</div>
        `;
    }
}

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function loadUserInfo() {
    try {
        // Sfruttiamo la tua funzione fetchJSON già esistente
        const data = await fetchJSON('/api/me');
        
        if (data && data.display_name) {
            // Cerchiamo l'elemento HTML con la classe 'player-name'
            const playerNameEl = document.querySelector('.player-name');
            
            if (playerNameEl) {
                // Sostituiamo "Hunter" con il vero nome dell'utente
                playerNameEl.innerText = data.display_name;
            }
        }
    } catch (error) {
        console.error("Errore nel caricamento dei dati utente:", error);
    }
}

// -------- Gestione +/- e input quantità nella modale --------
async function updateQtyFromModal(newQty, triggerButton = null) {
    const cardCode = currentModalCardCode;
    if (!cardCode) return;
    if (isNaN(newQty) || newQty < 0) newQty = 0;
	
    // Calcola differenza rispetto alla quantità attuale
    const oldQty = parseInt(document.getElementById('modal-qty-input').value || "0");
    const change = newQty - oldQty;


    try {
        const data = await fetchJSON('/api/update_quantity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode, quantity: newQty })
        });
        if (data.status === 'success') {
            const idx = allCardsData.findIndex(c => c.card_code === cardCode);
            if (idx !== -1) {
                allCardsData[idx].quantity = newQty;
                if (newQty > 0) allCardsData[idx].updated_at = new Date().toISOString();
            }

            document.getElementById('modal-qty-input').value = newQty;
            renderSerialInputs(allCardsData[idx], newQty, true);

            const dupBadge = document.getElementById('modal-duplicate-badge');
            if (newQty > 1) {
                dupBadge.innerText = `x${newQty}`;
                dupBadge.style.display = 'block';
            } else {
                dupBadge.style.display = 'none';
            }

            // Shine rarità in tempo reale
            const rarityEl = document.getElementById('modal-card-rarity');
            const cardObj = allCardsData.find(c => c.card_code === cardCode);
            if (rarityEl && cardObj) {
                if (newQty > 0 && (cardObj.rarity_Order || 0) >= 35) {
                    rarityEl.classList.add('shine');
                } else {
                    rarityEl.classList.remove('shine');
                }
            }

            const modalImg = document.getElementById('modal-card-img');
            if (newQty === 0) {
                modalImg.style.filter = 'grayscale(80%)';
                modalImg.style.opacity = '0.45';
            } else {
                modalImg.style.filter = 'none';
                modalImg.style.opacity = '1';
            }

            // sincronizza la carta piccola sottostante
            const qtyEl = document.getElementById(`qty-${cardCode}`);
            if (qtyEl) qtyEl.value = newQty;
            updateCardVisual(cardCode, newQty);

             // Feedback visivo +1 / -1 nella modale
             if (triggerButton && change !== 0) {
                 showFloatFeedback(triggerButton, change);
             }

            updateSetHeaderForCard(cardCode);
            loadStats();
            if (currentView === 'DASHBOARD') renderDashboard();
        }
    } catch (err) {
        console.error(err);
        showToast("Errore durante l'aggiornamento della quantità.", 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Caricamento iniziale dati
    loadUserInfo();
    loadStats();
    loadCards();

    // Ripristina l'ultima vista usata (se diversa da COLLEZIONE, che è il default)
    const savedView = localStorage.getItem('lastView');
    if (savedView && savedView !== 'COLLEZIONE') {
        switchView(savedView);
    }

    // Listener bottoni +/- e input quantità nella modale
    const btnPlus = document.getElementById('modal-btn-plus');
    const btnMinus = document.getElementById('modal-btn-minus');
    const qtyIn = document.getElementById('modal-qty-input');

	if (btnPlus) btnPlus.addEventListener('click', (e) => {
		const v = parseInt(qtyIn.value || "0") + 1;
		updateQtyFromModal(v, e.currentTarget);
	});
	if (btnMinus) btnMinus.addEventListener('click', (e) => {
		const v = Math.max(0, parseInt(qtyIn.value || "0") - 1);
		updateQtyFromModal(v, e.currentTarget);
	});
    if (qtyIn) qtyIn.addEventListener('change', (e) => {
        updateQtyFromModal(parseInt(e.target.value || "0"));
    });
	
	// Salvataggio automatico numerazione SG
    const serialWrap = document.getElementById('modal-serial-inputs');
    if (serialWrap) {
        // Solo cifre, massimo 3
        serialWrap.addEventListener('input', (e) => {
            const inp = e.target.closest('.serial-input');
            if (inp) inp.value = inp.value.replace(/\D/g, '').slice(0, 3);
        });

        // Uscita dal campo → salva
        serialWrap.addEventListener('focusout', (e) => {
            const inp = e.target.closest('.serial-input');
            if (inp) autoSaveSerials(inp);
        });

        // Enter → esce dal campo (e quindi salva) · Tab funziona già da solo
        serialWrap.addEventListener('keydown', (e) => {
            const inp = e.target.closest('.serial-input');
            if (!inp) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                inp.blur();
            }
        });
    }
});

// -------- Sistema di notifiche toast --------
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// -------- Feedback fluttuante +1 / -1 --------
function showFloatFeedback(anchorElement, change) {
    if (!anchorElement || change === 0) return;

    const feedback = document.createElement('div');
    feedback.className = `float-feedback ${change > 0 ? 'positive' : 'negative'}`;
    feedback.textContent = change > 0 ? `+${change}` : `${change}`;

    // Posiziona il feedback rispetto al bottone
    const rect = anchorElement.getBoundingClientRect();
    feedback.style.left = (rect.left + rect.width / 2) + 'px';
    feedback.style.top = (rect.top - 5) + 'px';
    feedback.style.position = 'fixed';

    document.body.appendChild(feedback);

    // Rimuovi dopo l'animazione
    setTimeout(() => feedback.remove(), 900);
}

// -------- Navigazione tra carte nella modale (← →) --------
function navigateModal(direction) {
    if (!currentModalCardCode) return;

    const currentCard = allCardsData.find(c => c.card_code === currentModalCardCode);
    if (!currentCard) return;

    // Prendi tutte le carte dello stesso set, ordinate come nella griglia
    const setCards = allCardsData
        .filter(c => (c.set_name || "Altri") === (currentCard.set_name || "Altri"))
        .sort((a, b) => {
            const sortBy = currentSortCard || 'id';
            if (sortBy === 'name')        return (a.card_name || '').localeCompare(b.card_name || '');
            if (sortBy === 'qty-desc')    return (b.quantity || 0) - (a.quantity || 0);
            if (sortBy === 'qty-asc')     return (a.quantity || 0) - (b.quantity || 0);
            if (sortBy === 'rarity-asc')  return (a.rarity_Order || 999) - (b.rarity_Order || 999);
            if (sortBy === 'rarity-desc') return (b.rarity_Order || 999) - (a.rarity_Order || 999);
            return (a.cards_display_order || '').localeCompare(b.cards_display_order || '');
        });

    const currentIndex = setCards.findIndex(c => c.card_code === currentModalCardCode);
    if (currentIndex === -1) return;

    // Calcola il nuovo indice (con wrap-around: dopo l'ultima → prima)
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = setCards.length - 1;
    if (newIndex >= setCards.length) newIndex = 0;

    openModal(setCards[newIndex]);
}

// -------- Contatore risultati filtrati --------
function updateResultsCounter(shownCount) {
    const el = document.getElementById('results-counter');
    if (!el) return;

    const total = (currentView === 'WISHLIST')
    ? allCardsData.filter(c => c.is_wishlisted).length
    : allCardsData.length;

    // Se siamo in dashboard, non mostrare il contatore
    if (currentView === 'DASHBOARD') {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'block';

	// Mostra il contatore SOLO se ci sono filtri attivi (shownCount < total)
    if (shownCount === total) {
        el.style.display = 'none';
        el.classList.remove('filtered');
    } else {
        el.style.display = 'block';
        el.classList.add('filtered');
        el.innerHTML = `Mostrando <span class="counter-highlight">${shownCount}</span> di <span class="counter-highlight">${total}</span> carte`;
    }
}


// -------- Numerazione carte SG --------
function isSGCard(card) {
    return String(card?.rarity || '').trim().toUpperCase() === 'SG';
}

function renderSerialInputs(card, qtyOverride = null, preserveTyped = false) {
    const block = document.getElementById('modal-serial-block');
    const wrap  = document.getElementById('modal-serial-inputs');
    if (!block || !wrap) return;

    if (!card || !isSGCard(card)) {
        block.style.display = 'none';
        wrap.innerHTML = '';
        return;
    }

    block.style.display = 'block';

    // La quantità arriva dal chiamante: nessun ritardo di lettura dal DOM
    const qty = (qtyOverride !== null && !isNaN(qtyOverride))
        ? qtyOverride
        : parseInt(document.getElementById('modal-qty-input').value || "0");

    if (qty <= 0) {
        wrap.innerHTML = `<div class="serial-empty">Aggiungi almeno una copia per inserire la numerazione.</div>`;
        return;
    }

    const saved = String(card.serials || '').split(',').map(s => s.trim());

    // Non perde i numeri appena digitati ma non ancora salvati
    const typed = preserveTyped
        ? [...wrap.querySelectorAll('.serial-input')].map(i => i.value.trim())
        : [];

    let html = '';
    for (let i = 0; i < qty; i++) {
        const raw = (typed[i] !== undefined) ? typed[i] : (saved[i] || '');
        const val = escapeHTML(raw);
        html += `
        <div class="serial-item">
            <span class="serial-index">Copia ${i + 1}</span>
            <span class="serial-hash">#</span>
            <input type="text" class="serial-input" inputmode="numeric" maxlength="3" placeholder="000" value="${val}">
        </div>`;
    }
    wrap.innerHTML = html;
}

let serialSaveInProgress = false;

// Verifica se ci sono modifiche non salvate (evita chiamate inutili al server)
function serialsAreDirty() {
    const inputs = [...document.querySelectorAll('#modal-serial-inputs .serial-input')];
    if (inputs.length === 0 || !currentModalCardCode) return false;

    const card = allCardsData.find(c => c.card_code === currentModalCardCode);
    if (!card) return false;

    const saved = String(card.serials || '').split(',').map(s => s.trim());

    return inputs.some((inp, i) => {
        const v = inp.value.trim();
        const norm = /^\d+$/.test(v) ? String(parseInt(v, 10)).padStart(3, '0') : v;
        return norm !== (saved[i] || '');
    });
}

// Salvataggio automatico: non ricostruisce il DOM, quindi non ruba il focus
async function autoSaveSerials(focusedInput = null) {
    if (!currentModalCardCode || serialSaveInProgress) return;
    if (!serialsAreDirty()) return;

    const wrap = document.getElementById('modal-serial-inputs');
    if (!wrap) return;

    const inputs = [...wrap.querySelectorAll('.serial-input')];
    const serials = inputs.map(i => i.value.trim());
    const cardCode = currentModalCardCode;

    serialSaveInProgress = true;
    try {
        const res = await fetch('/api/update_serials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_code: cardCode, serials })
        });
        const data = await res.json();

        if (!res.ok || data.status !== 'success') {
            showToast(data.message || "Errore nel salvataggio.", 'error');
            flashSerialInput(focusedInput, 'error');
            return;
        }

        const idx = allCardsData.findIndex(c => c.card_code === cardCode);
        if (idx !== -1) allCardsData[idx].serials = data.serials;

        // Normalizza a 3 cifre solo i campi non in uso
        const norm = String(data.serials || '').split(',');
        inputs.forEach((inp, i) => {
            if (inp !== document.activeElement) inp.value = (norm[i] || '').trim();
        });

        updateSerialTag(cardCode);
        flashSerialInput(focusedInput, 'ok');

    } catch (err) {
        console.error(err);
        showToast("Errore di connessione.", 'error');
        flashSerialInput(focusedInput, 'error');
    } finally {
        serialSaveInProgress = false;
    }
}

function flashSerialInput(input, type) {
    if (!input) return;
    input.classList.remove('saved-ok', 'saved-error');
    void input.offsetWidth;
    input.classList.add(type === 'ok' ? 'saved-ok' : 'saved-error');
    setTimeout(() => input.classList.remove('saved-ok', 'saved-error'), 900);
}

function updateSerialTag(cardCode, element = null) {
    const cardEl = element || document.getElementById(`card-${cardCode}`);
    const card = allCardsData.find(c => c.card_code === cardCode);
    if (!cardEl || !card) return;

    const old = cardEl.querySelector('.serial-tag');
    if (old) old.remove();
    if (!isSGCard(card)) return;

    const list = String(card.serials || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return;

    const tag = document.createElement('div');
    tag.className = 'serial-tag';
    tag.innerText = list.length === 1 ? `#${list[0]}` : `#${list[0]} +${list.length - 1}`;
    tag.title = list.map(s => '#' + s).join(' · ');
    cardEl.appendChild(tag);
}

// -------- Rank / Livello / XP dell'Hunter --------
function updateHunterProgress() {
    if (!allCardsData || allCardsData.length === 0) return;

    const total = allCardsData.length;
    const owned = allCardsData.filter(c => c.quantity > 0).length;
    const percentage = total > 0 ? (owned / total) * 100 : 0;

    // Rank in base alla percentuale di completamento
    let rank = 'E';
    if (percentage >= 100)     rank = 'S+';
    else if (percentage >= 85) rank = 'S';
    else if (percentage >= 65) rank = 'A';
    else if (percentage >= 45) rank = 'B';
    else if (percentage >= 25) rank = 'C';
    else if (percentage >= 10) rank = 'D';

    // XP: ogni carta posseduta vale 100 XP, si sale di livello ogni 1.000 XP
    const XP_PER_LEVEL = 1000;
    const xpTotal   = owned * 100;
    const level     = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
    const xpInLevel = xpTotal % XP_PER_LEVEL;
    const fillPct   = (xpInLevel / XP_PER_LEVEL) * 100;

    const fmt = n => n.toLocaleString('it-IT');

    const rankEl  = document.getElementById('player-rank');
    const lvlEl   = document.getElementById('player-level');
    const xpEl    = document.getElementById('player-xp-text');
    const fillEl  = document.getElementById('xp-fill');

    if (rankEl) rankEl.innerText = `Rank ${rank}`;
    if (lvlEl)  lvlEl.innerText  = `Lv. ${level}`;
    if (xpEl)   xpEl.innerText   = `${fmt(xpInLevel)} / ${fmt(XP_PER_LEVEL)} XP`;
    if (fillEl) fillEl.style.width = `${fillPct}%`;
}

// -------- Caricamento immagini controllato --------
const imgObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        }
        obs.unobserve(img);
    });
}, { rootMargin: '900px 0px', threshold: 0 });

function observeImages() {
    document.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
}

// =========================================================
//  SWIPE MODALE CARTA (mobile)  ·  Monarch Hoard
//  ---------------------------------------------------------
//  DOVE: incolla questo blocco IN FONDO al file
//        static/js/main.js  (e' un file .js, nessun tag da rompere)
//
//  COSA FA: nella modale di una carta, su telefono/tablet
//  scorri con il dito verso SINISTRA = carta successiva,
//  verso DESTRA = carta precedente. Usa la funzione
//  navigateModal() che hai gia'.
// =========================================================
(function () {
    const modal = document.getElementById('card-modal');
    if (!modal) return;

    let startX = 0, startY = 0, tracking = false;

    modal.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;      // ignora pinch/zoom
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });

    modal.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;

        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;

        // swipe valido: spostamento > 50px e piu' orizzontale che verticale
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) {
                navigateModal(1);    // dito verso sinistra -> successiva
            } else {
                navigateModal(-1);   // dito verso destra  -> precedente
            }
        }
    }, { passive: true });
})();
