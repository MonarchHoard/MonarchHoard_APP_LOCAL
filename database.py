import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "Database", "SoloLeveling.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def check_db_schema():
    conn = get_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

check_db_schema()

def get_all_cards(user_id):
    conn = get_connection()
    cursor = conn.cursor()

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
            cp.SetName AS SetName,
            s.DisplayOrder AS DisplayOrder,
            r.rarity_Order AS rarity_Order,
            cp.cards_Display_Order AS cards_Display_Order  -- <-- AGGIUNGI QUESTA LINEA
        FROM CardPool cp
        LEFT JOIN Cards c
            ON cp.CardCode = c.CardCode AND c.UserId = ?
        LEFT JOIN Sets s
            ON cp.SetName = s.SetName
        LEFT JOIN Rarities r
            ON cp.Rarity = r.rarity_Description

    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()
    return rows

    
def get_collection_stats(user_id):
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Il totale delle carte disponibili nel gioco (CardPool) è uguale per tutti
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

    conn.close()

    return total_cards, owned_cards, total_copies, wishlist

def update_card_quantity(user_id, card_code, quantity):
    conn = get_connection()
    cursor = conn.cursor()
    
    # Controlla se l'utente ha già una riga per questa carta
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
        
    conn.commit()
    conn.close()

def update_wishlist(user_id, card_code, is_wishlisted):
    conn = get_connection()
    cursor = conn.cursor()
    
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
        
    conn.commit()
    conn.close()

def update_serials(user_id, card_code, serials_text):
    conn = get_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

def get_set_progress(user_id):
    conn = get_connection()
    cursor = conn.cursor()

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

    rows = cursor.fetchall()
    conn.close()
    return rows

def check_users_schema():
    conn = get_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()


def get_user_by_username(username):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Id, Username, PasswordHash, DisplayName, Email, IsVerified
        FROM Users
        WHERE Username = ?
    """, (username,))
    user = cursor.fetchone()
    conn.close()
    return user


def create_user(username, password_hash, display_name, email=None, token=None, is_verified=0):
    conn = get_connection()
    cursor = conn.cursor()
    try:
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
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Id, Username, PasswordHash, DisplayName, Email, IsVerified
        FROM Users
        WHERE Email = ?
    """, (email,))
    user = cursor.fetchone()
    conn.close()
    return user

def get_user_by_token(token):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Id, Username FROM Users WHERE VerificationToken = ?
    """, (token,))
    user = cursor.fetchone()
    conn.close()
    return user

def set_user_verified(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE Users
        SET IsVerified = 1, VerificationToken = NULL
        WHERE Id = ?
    """, (user_id,))
    conn.commit()
    conn.close()

check_users_schema()

def check_memory_schema():
    conn = get_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

check_memory_schema()


def get_memory_bests(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Difficulty, Moves, Seconds, CreatedAt
        FROM MemoryScores
        WHERE UserId = ?
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows


def save_memory_score(user_id, difficulty, moves, seconds):
    """Salva solo se e' un nuovo record. Ritorna (is_record, best_moves, best_seconds)."""
    conn = get_connection()
    cursor = conn.cursor()

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
        conn.commit()
        best_moves, best_seconds = moves, seconds
    else:
        best_moves, best_seconds = current["Moves"], current["Seconds"]

    conn.close()
    return is_record, best_moves, best_seconds


def get_memory_leaderboard(difficulty, limit=10):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.DisplayName, u.Username, m.Moves, m.Seconds, m.CreatedAt
        FROM MemoryScores m
        JOIN Users u ON u.Id = m.UserId
        WHERE m.Difficulty = ?
        ORDER BY m.Moves ASC, m.Seconds ASC
        LIMIT ?
    """, (difficulty, limit))
    rows = cursor.fetchall()
    conn.close()
    return rows

def check_gamescores_schema():
    conn = get_connection()
    cursor = conn.cursor()
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
    conn.commit()
    conn.close()

check_gamescores_schema()


def get_game_bests(user_id, game_type):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Difficulty, Score, Detail, CreatedAt
        FROM GameScores
        WHERE UserId = ? AND GameType = ?
    """, (user_id, game_type))
    rows = cursor.fetchall()
    conn.close()
    return rows


def save_game_score(user_id, game_type, difficulty, score, detail):
    """Punteggio piu' alto = migliore. Ritorna (is_record, best_score, best_detail)."""
    conn = get_connection()
    cursor = conn.cursor()

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
        conn.commit()
        best_score, best_detail = score, detail
    else:
        best_score, best_detail = current["Score"], current["Detail"]

    conn.close()
    return is_record, best_score, best_detail


def get_game_leaderboard(game_type, difficulty, limit=10):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.DisplayName, u.Username, g.Score, g.Detail, g.CreatedAt
        FROM GameScores g
        JOIN Users u ON u.Id = g.UserId
        WHERE g.GameType = ? AND g.Difficulty = ?
        ORDER BY g.Score DESC
        LIMIT ?
    """, (game_type, difficulty, limit))
    rows = cursor.fetchall()
    conn.close()
    return rows

# =========================================================
# SNIPPET DA AGGIUNGERE IN FONDO A database.py
# =========================================================


def get_export_rows(user_id):
    """Tutte le carte del CardPool con i dati dell'utente, gia' ordinate."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            cp.CardCode AS CardCode,
            cp.CardName AS CardName,
            cp.SetName AS SetName,
            cp.Rarity AS Rarity,
            COALESCE(c.Quantity, 0) AS Quantity,
            COALESCE(c.Wishlist, 0) AS Wishlist,
            COALESCE(c.Serials, '') AS Serials,
            c.UpdatedAt AS UpdatedAt
        FROM CardPool cp
        LEFT JOIN Cards c
            ON cp.CardCode = c.CardCode AND c.UserId = ?
        LEFT JOIN Sets s
            ON cp.SetName = s.SetName
        ORDER BY s.DisplayOrder, cp.cards_Display_Order
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_valid_card_codes():
    """Set con tutti i CardCode esistenti nel CardPool."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT CardCode FROM CardPool")
    codes = {row["CardCode"] for row in cursor.fetchall()}
    conn.close()
    return codes


def bulk_upsert_cards(user_id, records):
    """
    records: lista di dict {code, quantity, wishlist, serials}.
    I valori None non vengono toccati (resta il valore attuale).
    Ritorna il numero di righe scritte.
    """
    conn = get_connection()
    cursor = conn.cursor()
    written = 0

    for rec in records:
        code = rec["code"]

        cursor.execute("""
            SELECT Quantity, Wishlist, Serials
            FROM Cards
            WHERE CardCode = ? AND UserId = ?
        """, (code, user_id))
        current = cursor.fetchone()

        if current:
            quantity = rec["quantity"] if rec["quantity"] is not None else current["Quantity"]
            wishlist = rec["wishlist"] if rec["wishlist"] is not None else current["Wishlist"]
            serials = rec["serials"] if rec["serials"] is not None else current["Serials"]
            cursor.execute("""
                UPDATE Cards
                SET Quantity = ?, Wishlist = ?, Serials = ?, UpdatedAt = datetime('now')
                WHERE CardCode = ? AND UserId = ?
            """, (quantity, wishlist, serials, code, user_id))
        else:
            quantity = rec["quantity"] if rec["quantity"] is not None else 0
            wishlist = rec["wishlist"] if rec["wishlist"] is not None else 0
            serials = rec["serials"] if rec["serials"] is not None else ""
            cursor.execute("""
                INSERT INTO Cards (CardCode, UserId, Quantity, Wishlist, Serials, UpdatedAt)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
            """, (code, user_id, quantity, wishlist, serials))

        written += 1

    conn.commit()
    conn.close()
    return written

def get_cardpool_rows():
    """Tutte le carte del CardPool, senza dati utente, gia' ordinate."""
    conn = get_connection()
    cursor = conn.cursor()
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
    rows = cursor.fetchall()
    conn.close()
    return rows
