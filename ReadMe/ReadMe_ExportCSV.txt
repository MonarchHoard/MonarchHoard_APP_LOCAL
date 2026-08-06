=========================================================
COME FUNZIONA
=========================================================

EXPORT
  Scarica un CSV con separatore ";" e codifica UTF-8 con BOM,
  quindi si apre correttamente con Excel italiano.
  Colonne: CardCode; CardName; SetName; Rarity; Quantity;
           Wishlist; Serials; UpdatedAt
  Vengono esportate TUTTE le carte del CardPool, anche quelle
  con quantita' 0: cosi' il file esportato e' anche il modello
  perfetto da ricompilare e reimportare.

IMPORT
  - Separatore ";" o "," riconosciuto in automatico.
  - Obbligatoria la colonna CardCode.
  - Facoltative: Quantity, Wishlist, Serials.
    Le colonne assenti non vengono toccate.
    Se una colonna c'e' ma la cella e' vuota, quel valore resta
    invariato.
  - Wishlist accetta: 1/0, si/no, true/false, x
  - Serials accetta "001,045" oppure "1, 45" (normalizzati a 3 cifre,
    range 001-300, niente duplicati).
  - I codici non presenti nel CardPool vengono ignorati e contati.
  - Le righe con errori vengono scartate una a una: il resto
    dell'import va comunque a buon fine.
  - Limite file: 2 MB, massimo 20.000 righe.
  - I valori del file SOSTITUISCONO quelli attuali (non si sommano).

NOTA
  L'import scrive direttamente sul DB. Prima di un import grosso
  conviene fare un export come backup: bastano due clic nella
  stessa finestra.

=========================================================
NOTE
=========================================================

- Il file scaricato si chiama monarch_hoard_esempio.csv
- Ha il BOM UTF-8 e separatore ";", quindi si apre gia'
  incolonnato in Excel italiano.
- I codici SL-001, SL-002 ecc. sono inventati: servono solo
  a far vedere il formato. Vanno sostituiti con i CardCode
  reali della tua collezione.
- Se vuoi cambiare le righe di esempio, modifica l'array
  CSV_EXAMPLE_ROWS in cima allo snippet.

Piccola precisazione sull'export: anche con collezione vuota
il "Scarica CSV" NON produce un file vuoto, perche' esporta
tutte le carte del CardPool con Quantity a 0. Resta comunque
utile avere il bottone esempio, che e' molto piu' leggero.

---------------------------------------------------------
2) COME FARE UN IMPORT VERO
---------------------------------------------------------
a) Apri "Backup CSV" e clicca "Scarica CSV".
   Ottieni un file con TUTTE le carte del tuo CardPool,
   con i codici corretti e Quantity a 0 dove non possiedi nulla.

b) Apri il file con Excel, compila la colonna Quantity
   (e se vuoi Wishlist e Serials). Non toccare CardCode.

c) Salva mantenendo il formato "CSV (delimitato dal separatore
   di elenco)" e reimportalo.

Il CSV di esempio serve SOLO a capire come sono fatte le colonne,
non e' importabile.


---------------------------------------------------------
3) SE INVECE IL MESSAGGIO E' UN ALTRO
---------------------------------------------------------
"Colonna 'CardCode' mancante nel CSV"
   -> Excel ha salvato con separatore diverso oppure hai
      cancellato la riga di intestazione. Riapri il file con
      Blocco note e controlla che la prima riga sia:
      CardCode;CardName;SetName;Rarity;Quantity;Wishlist;Serials

"Nessun file selezionato"
   -> il file non e' arrivato al server, riprova la selezione.

"CSV senza intestazione"
   -> il file e' vuoto o ha solo righe bianche.

=========================================================
DIFFERENZA TRA I DUE DOWNLOAD
=========================================================

"Scarica CSV" (sezione Esporta)
   Backup della TUA collezione: stesse carte, ma con le tue
   quantita', wishlist e numerazioni gia' dentro.

"Scarica modello vuoto" (sezione Importa)
   Stesse carte, ma tutto azzerato. Utile la prima volta o se
   vuoi ricompilare da capo senza vedere i dati vecchi.

Entrambi hanno codici REALI, quindi entrambi sono reimportabili.


=========================================================
NOTA
=========================================================
Non serve piu' il file static/esempio_import.csv, se l'avevi
caricato puoi cancellarlo.
