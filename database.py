import sqlite3
import os
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "Database", "SoloLeveling.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


@contextmanager
def get_cursor(commit=False):
    """Apre una connessione, restituisce il cursore e la chiude SEMPRE,
    anche in caso di errore. Se commit=True esegue il commit prima di chiudere."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        yield cursor
        if commit:
            conn.commit()
    finally:
        conn.close()


def check_db_schema():
    with get_cursor(commit=True) as cursor:
        # Crea la tabella se non esiste (nuovo formato multi-utente)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Cards (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                CardCode TEXT NOT NULL,
                UserId INTEGER NOT NULL,
                Quantity INTEGER DEFAULT 0,
                Wishlist INTEGER DEFAULT 0,
                UpdatedAt TEXT,
                UNIQUE(CardCode, UserId)
            )
        """)
        # Sicurezza: aggiungi colonne se mancanti (per DB vecchi)
        cursor.execute("PRAGMA table_info(Cards)")
        columns = [row[1] for row in cursor.fetchall()]
        if "Wishlist" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Wishlist INTEGER DEFAULT 0")
        if "UpdatedAt" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN UpdatedAt TEXT")
        if "UserId" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN UserId INTEGER")
        if "Serials" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Serials TEXT")
        if "Notes" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Notes TEXT")
        if "Graded" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Graded INTEGER DEFAULT 0")
        if "Grader" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Grader TEXT")
        if "Grade" not in columns:
            cursor.execute("ALTER TABLE Cards ADD COLUMN Grade TEXT")


check_db_schema()


def get_all_cards(user_id):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT
                cp.CardCode AS CardCode,
                cp.CardName AS CardName,
                cp.Rarity AS Rarity,
                COALESCE(c.Quantity, 0) AS Quantity,
                cp.image_name AS image_name,
                COALESCE(c.Wishlist, 0) AS Wishlist,
                c.UpdatedAt AS UpdatedAt,
                c.Serials AS Serials,
                c.Notes AS Notes,
                c.Graded AS Graded,
                c.Grader AS Grader,
                c.Grade AS Grade,
                cp.SetName AS SetName,
                s.DisplayOrder AS DisplayOrder,
                r.rarity_Order AS rarity_Order,
                cp.cards_Display_Order AS cards_Display_Order,
                cp.cards_ID AS cards_ID
            FROM CardPool cp
            LEFT JOIN Cards c
                ON cp.CardCode = c.CardCode AND c.UserId = ?
            LEFT JOIN Sets s
                ON cp.SetName = s.SetName
            LEFT JOIN Rarities r
                ON cp.Rarity = r.rarity_Description
        """, (user_id,))
        return cursor.fetchall()


def get_collection_stats(user_id):
    with get_cursor() as cursor:
        # 1. Il totale delle carte disponibili nel gioco (CardPool) e' uguale per tutti
        cursor.execute("SELECT COUNT(*) FROM CardPool")
        total_cards = cursor.fetchone()[0]
        # 2. Contiamo le carte possedute SOLO dall'utente loggato
        cursor.execute("SELECT COUNT(*) FROM Cards WHERE Quantity > 0 AND UserId = ?", (user_id,))
        owned_cards = cursor.fetchone()[0]
        # 3. Sommiamo le copie totali SOLO dell'utente loggato
        cursor.execute("SELECT COALESCE(SUM(Quantity),0) FROM Cards WHERE UserId = ?", (user_id,))
        total_copies = cursor.fetchone()[0]
        # 4. Contiamo le carte in wishlist SOLO dell'utente loggato
        cursor.execute("SELECT COUNT(*) FROM Cards WHERE Wishlist = 1 AND UserId = ?", (user_id,))
        wishlist = cursor.fetchone()[0]
        return total_cards, owned_cards, total_copies, wishlist


def update_card_quantity(user_id, card_code, quantity):
    with get_cursor(commit=True) as cursor:
        # Controlla se l'utente ha gia' una riga per questa carta
        cursor.execute("SELECT 1 FROM Cards WHERE CardCode = ? AND UserId = ?", (card_code, user_id))
        exists = cursor.fetchone()

        if exists:
            cursor.execute("""
                UPDATE Cards
                SET Quantity = ?, UpdatedAt = datetime('now')
                WHERE CardCode = ? AND UserId = ?
            """, (quantity, card_code, user_id))
        else:
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Quantity, UpdatedAt)
                VALUES (?, ?, ?, datetime('now'))
            """, (card_code, user_id, quantity))


def update_wishlist(user_id, card_code, is_wishlisted):
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT 1 FROM Cards WHERE CardCode = ? AND UserId = ?", (card_code, user_id))
        exists = cursor.fetchone()

        val = 1 if is_wishlisted else 0
        if exists:
            cursor.execute("""
                UPDATE Cards
                SET Wishlist = ?
                WHERE CardCode = ? AND UserId = ?
            """, (val, card_code, user_id))
        else:
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Wishlist)
                VALUES (?, ?, ?)
            """, (card_code, user_id, val))


def update_serials(user_id, card_code, serials_text):
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT 1 FROM Cards WHERE CardCode = ? AND UserId = ?", (card_code, user_id))
        exists = cursor.fetchone()
        if exists:
            cursor.execute("""
                UPDATE Cards SET Serials = ?, UpdatedAt = datetime('now')
                WHERE CardCode = ? AND UserId = ?
            """, (serials_text, card_code, user_id))
        else:
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Quantity, Serials, UpdatedAt)
                VALUES (?, ?, 0, ?, datetime('now'))
            """, (card_code, user_id, serials_text))

def update_notes(user_id, card_code, notes_text):
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT 1 FROM Cards WHERE CardCode = ? AND UserId = ?", (card_code, user_id))
        exists = cursor.fetchone()
        if exists:
            cursor.execute("""
                UPDATE Cards SET Notes = ?, UpdatedAt = datetime('now')
                WHERE CardCode = ? AND UserId = ?
            """, (notes_text, card_code, user_id))
        else:
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Quantity, Notes, UpdatedAt)
                VALUES (?, ?, 0, ?, datetime('now'))
            """, (card_code, user_id, notes_text))

def update_grading(user_id, card_code, graded, grader, grade):
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT 1 FROM Cards WHERE CardCode = ? AND UserId = ?", (card_code, user_id))
        exists = cursor.fetchone()
        if exists:
            cursor.execute("""
                UPDATE Cards SET Graded = ?, Grader = ?, Grade = ?, UpdatedAt = datetime('now')
                WHERE CardCode = ? AND UserId = ?
            """, (graded, grader, grade, card_code, user_id))
        else:
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Quantity, Graded, Grader, Grade, UpdatedAt)
                VALUES (?, ?, 0, ?, ?, ?, datetime('now'))
            """, (card_code, user_id, graded, grader, grade))


def get_set_progress(user_id):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT
                cp.SetName,
                COUNT(cp.CardCode) AS TotalCards,
                COUNT(CASE WHEN c.Quantity > 0 THEN 1 END) AS OwnedCards,
                s.DisplayOrder AS DisplayOrder
            FROM CardPool cp
            LEFT JOIN Cards c
                ON cp.CardCode = c.CardCode AND c.UserId = ?
            LEFT JOIN Sets s
                ON cp.SetName = s.SetName
            GROUP BY cp.SetName
            ORDER BY s.DisplayOrder
        """, (user_id,))
        return cursor.fetchall()


def check_users_schema():
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Users (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Username TEXT NOT NULL UNIQUE,
                PasswordHash TEXT NOT NULL,
                DisplayName TEXT
            )
        """)
        # Aggiunge le colonne nuove se mancano (per DB gia' esistenti)
        cursor.execute("PRAGMA table_info(Users)")
        columns = [row[1] for row in cursor.fetchall()]
        if "Email" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN Email TEXT")
        if "IsVerified" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN IsVerified INTEGER DEFAULT 0")
            # Gli utenti gia' esistenti vengono considerati gia' verificati
            cursor.execute("UPDATE Users SET IsVerified = 1")
        if "VerificationToken" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN VerificationToken TEXT")
        if "TokenCreatedAt" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN TokenCreatedAt TEXT")
        if "CreatedAt" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN CreatedAt TEXT")
        if "ShowcasePublic" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN ShowcasePublic INTEGER DEFAULT 0")
        if "ShowcaseSlug" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN ShowcaseSlug TEXT")
        if "ShowcaseBg" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN ShowcaseBg TEXT DEFAULT 'none'")
        if "IsDeleted" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN IsDeleted INTEGER DEFAULT 0")
        if "PreferredLang" not in columns:
            cursor.execute("ALTER TABLE Users ADD COLUMN PreferredLang TEXT")


def get_user_by_username(username):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Id, Username, PasswordHash, DisplayName, Email, IsVerified
            FROM Users
            WHERE Username = ?
        """, (username,))
        return cursor.fetchone()


def create_user(username, password_hash, display_name, email=None, token=None, is_verified=0):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Users
                (Username, PasswordHash, DisplayName, Email, IsVerified, VerificationToken, TokenCreatedAt, CreatedAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (username, password_hash, display_name, email, is_verified, token))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def get_user_by_email(email):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Id, Username, PasswordHash, DisplayName, Email, IsVerified
            FROM Users
            WHERE Email = ?
        """, (email,))
        return cursor.fetchone()


def get_user_by_token(token):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Id, Username, TokenCreatedAt FROM Users WHERE VerificationToken = ?
        """, (token,))
        return cursor.fetchone()


def set_user_verified(user_id):
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            UPDATE Users
            SET IsVerified = 1, VerificationToken = NULL
            WHERE Id = ?
        """, (user_id,))


check_users_schema()


def check_memory_schema():
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS MemoryScores (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                UserId INTEGER NOT NULL,
                Difficulty INTEGER NOT NULL,
                Moves INTEGER NOT NULL,
                Seconds INTEGER NOT NULL,
                CreatedAt TEXT,
                UNIQUE(UserId, Difficulty)
            )
        """)


check_memory_schema()


def get_memory_bests(user_id):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Difficulty, Moves, Seconds, CreatedAt
            FROM MemoryScores
            WHERE UserId = ?
        """, (user_id,))
        return cursor.fetchall()


def save_memory_score(user_id, difficulty, moves, seconds):
    """Salva solo se e' un nuovo record. Ritorna (is_record, best_moves, best_seconds)."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            SELECT Moves, Seconds FROM MemoryScores
            WHERE UserId = ? AND Difficulty = ?
        """, (user_id, difficulty))
        current = cursor.fetchone()

        is_record = False
        if current is None:
            is_record = True
        elif moves < current["Moves"]:
            is_record = True
        elif moves == current["Moves"] and seconds < current["Seconds"]:
            is_record = True

        if is_record:
            cursor.execute("""
                INSERT INTO MemoryScores (UserId, Difficulty, Moves, Seconds, CreatedAt)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(UserId, Difficulty) DO UPDATE SET
                    Moves = excluded.Moves,
                    Seconds = excluded.Seconds,
                    CreatedAt = excluded.CreatedAt
            """, (user_id, difficulty, moves, seconds))
            best_moves, best_seconds = moves, seconds
        else:
            best_moves, best_seconds = current["Moves"], current["Seconds"]

        return is_record, best_moves, best_seconds


def get_memory_leaderboard(difficulty, limit=10):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT u.DisplayName, u.Username, m.Moves, m.Seconds, m.CreatedAt
            FROM MemoryScores m
            JOIN Users u ON u.Id = m.UserId
            WHERE m.Difficulty = ?
            ORDER BY m.Moves ASC, m.Seconds ASC
            LIMIT ?
        """, (difficulty, limit))
        return cursor.fetchall()


def check_gamescores_schema():
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS GameScores (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                UserId INTEGER NOT NULL,
                GameType TEXT NOT NULL,
                Difficulty INTEGER NOT NULL,
                Score INTEGER NOT NULL,
                Detail TEXT,
                CreatedAt TEXT,
                UNIQUE(UserId, GameType, Difficulty)
            )
        """)


check_gamescores_schema()


def get_game_bests(user_id, game_type):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Difficulty, Score, Detail, CreatedAt
            FROM GameScores
            WHERE UserId = ? AND GameType = ?
        """, (user_id, game_type))
        return cursor.fetchall()


def save_game_score(user_id, game_type, difficulty, score, detail):
    """Punteggio piu' alto = migliore. Ritorna (is_record, best_score, best_detail)."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            SELECT Score, Detail FROM GameScores
            WHERE UserId = ? AND GameType = ? AND Difficulty = ?
        """, (user_id, game_type, difficulty))
        current = cursor.fetchone()

        is_record = current is None or score > current["Score"]
        if is_record:
            cursor.execute("""
                INSERT INTO GameScores (UserId, GameType, Difficulty, Score, Detail, CreatedAt)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(UserId, GameType, Difficulty) DO UPDATE SET
                    Score = excluded.Score,
                    Detail = excluded.Detail,
                    CreatedAt = excluded.CreatedAt
            """, (user_id, game_type, difficulty, score, detail))
            best_score, best_detail = score, detail
        else:
            best_score, best_detail = current["Score"], current["Detail"]

        return is_record, best_score, best_detail


def get_game_leaderboard(game_type, difficulty, limit=10):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT u.DisplayName, u.Username, g.Score, g.Detail, g.CreatedAt
            FROM GameScores g
            JOIN Users u ON u.Id = g.UserId
            WHERE g.GameType = ? AND g.Difficulty = ?
            ORDER BY g.Score DESC
            LIMIT ?
        """, (game_type, difficulty, limit))
        return cursor.fetchall()


# =========================================================
# EXPORT / IMPORT
# =========================================================
def get_export_rows(user_id):
    """Tutte le carte del CardPool con i dati dell'utente, gia' ordinate."""
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT
                cp.CardCode AS CardCode,
                cp.CardName AS CardName,
                cp.SetName AS SetName,
                cp.Rarity AS Rarity,
                COALESCE(c.Quantity, 0) AS Quantity,
                COALESCE(c.Wishlist, 0) AS Wishlist,
                COALESCE(c.Serials, '') AS Serials,
                COALESCE(c.Graded, 0) AS Graded,
                COALESCE(c.Grader, '') AS Grader,
                COALESCE(c.Grade, '') AS Grade,
                c.UpdatedAt AS UpdatedAt
            FROM CardPool cp
            LEFT JOIN Cards c
                ON cp.CardCode = c.CardCode AND c.UserId = ?
            LEFT JOIN Sets s
                ON cp.SetName = s.SetName
            ORDER BY s.DisplayOrder, cp.cards_Display_Order
        """, (user_id,))
        return cursor.fetchall()


def get_valid_card_codes():
    """Set con tutti i CardCode esistenti nel CardPool."""
    with get_cursor() as cursor:
        cursor.execute("SELECT CardCode FROM CardPool")
        return {row["CardCode"] for row in cursor.fetchall()}


def user_owns_card(user_id, card_code):
    """True se l'utente possiede almeno una copia della carta.
    Query mirata: non carica tutto il CardPool."""
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT 1 FROM Cards
            WHERE UserId = ? AND CardCode = ? AND Quantity > 0
            LIMIT 1
        """, (user_id, card_code))
        return cursor.fetchone() is not None


def bulk_upsert_cards(user_id, records):
    """
    records: lista di dict {code, quantity, wishlist, serials, graded, grader, grade}.
    I valori None non vengono toccati (resta il valore attuale).
    Ritorna il numero di righe scritte.
    """
    with get_cursor(commit=True) as cursor:
        written = 0
        for rec in records:
            code = rec["code"]
            cursor.execute("""
                SELECT Quantity, Wishlist, Serials, Graded, Grader, Grade
                FROM Cards
                WHERE CardCode = ? AND UserId = ?
            """, (code, user_id))
            current = cursor.fetchone()
            if current:
                quantity = rec["quantity"] if rec.get("quantity") is not None else current["Quantity"]
                wishlist = rec["wishlist"] if rec.get("wishlist") is not None else current["Wishlist"]
                serials = rec["serials"] if rec.get("serials") is not None else current["Serials"]
                graded = rec["graded"] if rec.get("graded") is not None else current["Graded"]
                grader = rec["grader"] if rec.get("grader") is not None else current["Grader"]
                grade = rec["grade"] if rec.get("grade") is not None else current["Grade"]
                cursor.execute("""
                    UPDATE Cards
                    SET Quantity = ?, Wishlist = ?, Serials = ?, Graded = ?, Grader = ?, Grade = ?, UpdatedAt = datetime('now')
                    WHERE CardCode = ? AND UserId = ?
                """, (quantity, wishlist, serials, graded, grader, grade, code, user_id))
            else:
                quantity = rec["quantity"] if rec.get("quantity") is not None else 0
                wishlist = rec["wishlist"] if rec.get("wishlist") is not None else 0
                serials = rec["serials"] if rec.get("serials") is not None else ""
                graded = rec["graded"] if rec.get("graded") is not None else 0
                grader = rec["grader"] if rec.get("grader") is not None else ""
                grade = rec["grade"] if rec.get("grade") is not None else ""
                cursor.execute("""
                    INSERT INTO Cards (CardCode, UserId, Quantity, Wishlist, Serials, Graded, Grader, Grade, UpdatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (code, user_id, quantity, wishlist, serials, graded, grader, grade))
            written += 1
        return written


def get_cardpool_rows():
    """Tutte le carte del CardPool, senza dati utente, gia' ordinate."""
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT
                cp.CardCode AS CardCode,
                cp.CardName AS CardName,
                cp.SetName AS SetName,
                cp.Rarity AS Rarity
            FROM CardPool cp
            LEFT JOIN Sets s
                ON cp.SetName = s.SetName
            ORDER BY s.DisplayOrder, cp.cards_Display_Order
        """)
        return cursor.fetchall()


# =========================================================
# VETRINA - Monarch Hoard
# =========================================================
def check_showcase_schema():
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Showcase (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                UserId INTEGER NOT NULL,
                CardCode TEXT NOT NULL,
                SlotPosition INTEGER NOT NULL,
                UNIQUE(UserId, SlotPosition),
                UNIQUE(UserId, CardCode)
            )
        """)


check_showcase_schema()

MAX_SHOWCASE_SLOTS = 9


def get_showcase(user_id):
    """Le carte attualmente in vetrina, con i dati del CardPool."""
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT
                sc.SlotPosition AS SlotPosition,
                cp.CardCode AS CardCode,
                cp.CardName AS CardName,
                cp.Rarity AS Rarity,
                cp.image_name AS image_name,
                cp.SetName AS SetName,
                r.rarity_Order AS rarity_Order
            FROM Showcase sc
            JOIN CardPool cp ON cp.CardCode = sc.CardCode
            LEFT JOIN Rarities r ON cp.Rarity = r.rarity_Description
            WHERE sc.UserId = ?
            ORDER BY sc.SlotPosition
        """, (user_id,))
        return cursor.fetchall()


def add_to_showcase(user_id, card_code):
    """Aggiunge una carta nel primo slot libero. Ritorna (ok, risultato).
    In caso di errore, 'risultato' e' un CODICE breve (non testo tradotto):
    e' app.py a tradurlo con translate('server.' + codice)."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT 1 FROM Showcase WHERE UserId = ? AND CardCode = ?", (user_id, card_code))
        if cursor.fetchone():
            return False, "already_in_showcase"
        cursor.execute("SELECT SlotPosition FROM Showcase WHERE UserId = ?", (user_id,))
        occupied = {row["SlotPosition"] for row in cursor.fetchall()}
        if len(occupied) >= MAX_SHOWCASE_SLOTS:
            return False, "showcase_full"


def remove_from_showcase(user_id, card_code):
    with get_cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM Showcase WHERE UserId = ? AND CardCode = ?", (user_id, card_code))


def move_showcase(user_id, card_code, direction):
    """direction: -1 sinistra, +1 destra, -3 su, +3 giu' (griglia 3x3)."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("SELECT SlotPosition FROM Showcase WHERE UserId = ? AND CardCode = ?", (user_id, card_code))
        current = cursor.fetchone()
        if not current:
            return False, "card_not_in_showcase"
        current_pos = current["SlotPosition"]
        row = (current_pos - 1) // 3
        col = (current_pos - 1) % 3
        if direction == -1 and col == 0:
            return False, "at_left_edge"
        if direction == 1 and col == 2:
            return False, "at_right_edge"
        if direction == -3 and row == 0:
            return False, "at_top_row"
        if direction == 3 and row == 2:
            return False, "at_bottom_row"
        target_pos = current_pos + direction
        cursor.execute("SELECT CardCode FROM Showcase WHERE UserId = ? AND SlotPosition = ?", (user_id, target_pos))
        target = cursor.fetchone()
        if target:
            # Scambio: passa per lo slot 0 per evitare conflitti con il vincolo UNIQUE
            cursor.execute("UPDATE Showcase SET SlotPosition = 0 WHERE UserId = ? AND SlotPosition = ?", (user_id, current_pos))
            cursor.execute("UPDATE Showcase SET SlotPosition = ? WHERE UserId = ? AND CardCode = ?", (current_pos, user_id, target["CardCode"]))
            cursor.execute("UPDATE Showcase SET SlotPosition = ? WHERE UserId = ? AND SlotPosition = 0", (target_pos, user_id))
        else:
            cursor.execute("UPDATE Showcase SET SlotPosition = ? WHERE UserId = ? AND CardCode = ?", (target_pos, user_id, card_code))
        return True, target_pos


def set_showcase_slot(user_id, card_code, slot_position):
    """Inserisce o sostituisce una carta in uno slot SPECIFICO."""
    if slot_position < 1 or slot_position > MAX_SHOWCASE_SLOTS:
        return False, "invalid_position"
    with get_cursor(commit=True) as cursor:
        # La carta e' gia' in un ALTRO slot? -> niente doppioni
        cursor.execute(
            "SELECT SlotPosition FROM Showcase WHERE UserId = ? AND CardCode = ?",
            (user_id, card_code)
        )
        existing = cursor.fetchone()
        if existing and existing["SlotPosition"] != slot_position:
            return False, "already_in_other_slot"
        # Svuota lo slot scelto (se aveva gia' una carta) e inserisce la nuova
        cursor.execute(
            "DELETE FROM Showcase WHERE UserId = ? AND SlotPosition = ?",
            (user_id, slot_position)
        )
        cursor.execute(
            "INSERT INTO Showcase (UserId, CardCode, SlotPosition) VALUES (?, ?, ?)",
            (user_id, card_code, slot_position)
        )
        return True, slot_position


def get_showcase_bg(user_id):
    with get_cursor() as cursor:
        cursor.execute("SELECT ShowcaseBg FROM Users WHERE Id = ?", (user_id,))
        row = cursor.fetchone()
        if row and row["ShowcaseBg"]:
            return row["ShowcaseBg"]
        return "none"


def set_showcase_bg(user_id, bg_id):
    with get_cursor(commit=True) as cursor:
        cursor.execute("UPDATE Users SET ShowcaseBg = ? WHERE Id = ?", (bg_id, user_id))


def get_user_by_id(user_id):
    with get_cursor() as cursor:
        cursor.execute("""
            SELECT Id, Username, PasswordHash, DisplayName, Email, IsVerified
            FROM Users WHERE Id = ?
        """, (user_id,))
        return cursor.fetchone()


def update_display_name(user_id, display_name):
    with get_cursor(commit=True) as cursor:
        cursor.execute("UPDATE Users SET DisplayName = ? WHERE Id = ?", (display_name, user_id))


def update_password(user_id, password_hash):
    with get_cursor(commit=True) as cursor:
        cursor.execute("UPDATE Users SET PasswordHash = ? WHERE Id = ?", (password_hash, user_id))

def get_user_language(user_id):
    """Ritorna la lingua salvata sull'account (None se l'utente non ne
    ha mai scelta una: in quel caso si usa il default del sito)."""
    with get_cursor() as cursor:
        cursor.execute("SELECT PreferredLang FROM Users WHERE Id = ?", (user_id,))
        row = cursor.fetchone()
        if row and row["PreferredLang"]:
            return row["PreferredLang"]
        return None

def set_user_language(user_id, lang_code):
    """Salva sull'account la lingua scelta, cosi' verra' riproposta
    automaticamente ad ogni futuro accesso, anche da un altro dispositivo."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("UPDATE Users SET PreferredLang = ? WHERE Id = ?", (lang_code, user_id))

# =========================================================
# ELIMINA ACCOUNT (GDPR)
# =========================================================
def delete_user_account(user_id):
    """
    Elimina l'account rispettando il GDPR:
    - CANCELLA i dati personali della collezione (carte, vetrina, wishlist)
    - ANONIMIZZA l'anagrafica: la riga in Users resta (cosi' i punteggi
      nelle classifiche non spariscono) ma viene svuotata dei dati personali.
    - Email e Username vengono liberati per una futura riregistrazione.
    I punteggi Memory/Quiz restano collegati e appaiono come "Hunter Eliminato".
    """
    with get_cursor(commit=True) as cursor:
        # 1) Dati personali/collezione: eliminati del tutto
        cursor.execute("DELETE FROM Cards WHERE UserId = ?", (user_id,))
        cursor.execute("DELETE FROM Showcase WHERE UserId = ?", (user_id,))
        # 2) Anonimizzazione dell'anagrafica (la riga resta viva ma "vuota")
        cursor.execute("""
            UPDATE Users SET
                Username = ?,
                Email = NULL,
                PasswordHash = '',
                DisplayName = 'Hunter Eliminato',
                VerificationToken = NULL,
                IsVerified = 0,
                IsDeleted = 1
            WHERE Id = ?
        """, ("deleted_user_" + str(user_id), user_id))


def set_verification_token(user_id, token):
    """Aggiorna il token di verifica (usato dal reinvio email)."""
    with get_cursor(commit=True) as cursor:
        cursor.execute("""
            UPDATE Users
            SET VerificationToken = ?, TokenCreatedAt = datetime('now')
            WHERE Id = ?
        """, (token, user_id))
