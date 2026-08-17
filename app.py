from flask import Flask, render_template, jsonify, request, redirect, url_for, session, Response
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta, datetime
import database
import os
import csv
import io
import secrets
import re
import email_sender

app = Flask(__name__)

app.secret_key = os.environ.get("MH_SECRET_KEY")
if not app.secret_key:
    if os.environ.get("MH_ENV") == "production":
        raise RuntimeError("MH_SECRET_KEY mancante in produzione!")
    app.secret_key = "monarch-hoard-local-test-key"

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("MH_ENV") == "production",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30)
)

def login_required(route_function):
    @wraps(route_function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Login richiesto"}), 401
            return redirect(url_for("login"))
        return route_function(*args, **kwargs)
    return wrapper


def create_default_user():
    admin_password = os.environ.get("MH_ADMIN_PASSWORD")
    if not admin_password:
        return  # nessun admin creato se la variabile non è impostata
    existing_user = database.get_user_by_username("admin")
    if not existing_user:
        password_hash = generate_password_hash(admin_password)
        database.create_user("admin", password_hash, "Hunter", is_verified=1)

create_default_user()

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()

        user = database.get_user_by_username(username)

        if user and check_password_hash(user["PasswordHash"], password):
            if not user["IsVerified"]:
                error = "Devi prima confermare la tua email. Controlla la posta."
                return render_template('login.html', error=error)
            session["user_id"] = user["Id"]
            session.permanent = True
            session["username"] = user["Username"]
            session["display_name"] = user["DisplayName"] or user["Username"]
            return redirect(url_for("index"))
        error = "Username o password non validi"

    return render_template('login.html', error=error)

@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        username = email
        display_name = request.form.get('display_name', '').strip()
        password = request.form.get('password', '').strip()
        password2 = request.form.get('password2', '').strip()

        if not email or not password:
            error = "Email e password sono obbligatori"
        elif not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            error = "Indirizzo email non valido"
        elif password != password2:
            error = "Le due password non coincidono"
        elif len(password) < 8:
            error = "La password deve avere almeno 8 caratteri"
        elif not re.search(r"[A-Z]", password):
            error = "La password deve contenere almeno una lettera maiuscola"
        elif not re.search(r"[a-z]", password):
            error = "La password deve contenere almeno una lettera minuscola"
        elif not re.search(r"[0-9]", password):
            error = "La password deve contenere almeno un numero"
        elif not re.search(r"[^A-Za-z0-9]", password):
            error = "La password deve contenere almeno un carattere speciale (es. ! ? @ #)"
        elif database.get_user_by_username(username):
            error = "Username gia' esistente"
        elif database.get_user_by_email(email):
            error = "Email gia' registrata"
        else:
            password_hash = generate_password_hash(password)
            token = secrets.token_urlsafe(32)
            created = database.create_user(
                username, password_hash, display_name or username, email, token
            )
            if created:
                verify_link = url_for('verify_email', token=token, _external=True)
                sent = email_sender.send_verification_email(email, verify_link)
                if sent:
                    return render_template('register.html', success=True)
                else:
                    # Se l'invio fallisce, mostriamo comunque il link a schermo
                    # cosi' l'utente puo' confermare lo stesso.
                    return render_template('register.html', success=True, verify_link=verify_link)
            error = "Registrazione non riuscita, riprova"
    return render_template('register.html', error=error)

@app.route('/verify/<token>', methods=['GET', 'POST'])
def verify_email(token):
    user = database.get_user_by_token(token)
    if not user:
        return render_template('login.html', error="Link di conferma non valido o gia' usato")
    database.set_user_verified(user["Id"])
    return render_template('login.html', success="Email confermata! Ora puoi accedere.")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route('/api/me')
@login_required
def get_current_user():
    return jsonify({
        "username": session.get("username"),
        "display_name": session.get("display_name")
    })

@app.route('/api/cards')
@login_required
def get_cards():
    user_id = session["user_id"]
    rows = database.get_all_cards(user_id)
    cards = []
    for row in rows:
        image_filename = row["image_name"]
        cards.append({
            "card_code": row["CardCode"],
            "card_name": row["CardName"],
            "rarity": row["Rarity"],
            "quantity": row["Quantity"],
            "image_url": f"/static/cards/TRANSPARENT/{image_filename}",
            "is_wishlisted": bool(row["Wishlist"]),
            "updated_at": row["UpdatedAt"],
            "set_name": row["SetName"],
            "set_order": row["DisplayOrder"],
            "rarity_Order": row["rarity_Order"],
            "serials": row["Serials"] or "",
            "cards_display_order": row["cards_display_order"],
            "cards_id": row["cards_ID"]
        })
    return jsonify(cards)

@app.route('/api/stats')
@login_required
def get_stats():
    # Recuperiamo l'ID dell'utente dalla sessione attiva
    user_id = session["user_id"] 
    
    # Passiamo user_id alla funzione del database
    total, owned, copies, wishlist = database.get_collection_stats(user_id)

    percentage = round((owned / total) * 100, 1) if total else 0

    return jsonify({
        "total": total,
        "owned": owned,
        "copies": copies,
        "wishlist": wishlist,
        "percentage": percentage
    })
    

@app.route('/api/set_progress')
@login_required
def get_set_progress():
    user_id = session["user_id"]
    rows = database.get_set_progress(user_id)
    result = []


    for row in rows:
        percentage = round((row["OwnedCards"] / row["TotalCards"]) * 100, 1) if row["TotalCards"] else 0

        result.append({
            "set_name": row["SetName"],
            "total": row["TotalCards"],
            "owned": row["OwnedCards"],
            "percentage": percentage
        })

    return jsonify(result)

@app.route('/api/update_quantity', methods=['POST'])
@login_required
def update_quantity():
    user_id = session["user_id"] # Recuperiamo l'utente loggato
    data = request.json
    card_code = data.get('card_code')
    raw_quantity = data.get('quantity') 
    
    try:
        new_quantity = int(raw_quantity)
        if new_quantity < 0:
            return jsonify({"status": "error", "message": "Quantità negativa"}), 400
    except (TypeError, ValueError): 
        return jsonify({"status": "error", "message": "Quantità non valida"}), 400
    
    if card_code is not None:
        # Passiamo user_id come primo parametro
        database.update_card_quantity(user_id, card_code, new_quantity)
        return jsonify({"status": "success"})
        
    return jsonify({"status": "error", "message": "Dati mancanti"}), 400

@app.route('/api/toggle_wishlist', methods=['POST'])
@login_required
def toggle_wishlist():
    user_id = session["user_id"] # Recuperiamo l'utente loggato
    data = request.json
    card_code = data.get('card_code')
    is_wishlisted = data.get('is_wishlisted')
    
    if card_code is not None and is_wishlisted is not None:
        # Passiamo user_id come primo parametro
        database.update_wishlist(user_id, card_code, is_wishlisted)
        return jsonify({"status": "success"})
        
    return jsonify({"status": "error", "message": "Dati mancanti"}), 400

@app.route('/api/update_serials', methods=['POST'])
@login_required
def update_serials():
    user_id = session["user_id"]
    data = request.json or {}
    card_code = data.get('card_code')
    serials = data.get('serials', [])

    if not card_code or not isinstance(serials, list):
        return jsonify({"status": "error", "message": "Dati mancanti"}), 400

    clean = []
    for s in serials:
        s = str(s).strip()
        if not s:
            clean.append("")
            continue
        if not s.isdigit():
            return jsonify({"status": "error", "message": f"'{s}' non è un numero valido"}), 400
        n = int(s)
        if n < 1 or n > 300:
            return jsonify({"status": "error", "message": "Il numero deve essere tra 001 e 300"}), 400
        clean.append(f"{n:03d}")

    filled = [c for c in clean if c]
    if len(set(filled)) != len(filled):
        return jsonify({"status": "error", "message": "Hai inserito due volte lo stesso numero"}), 400

    serials_text = ",".join(clean)
    database.update_serials(user_id, card_code, serials_text)
    return jsonify({"status": "success", "serials": serials_text})

@app.route('/games/memory')
@login_required
def game_memory():
    return render_template('memory.html')

VALID_DIFFICULTIES = (6, 8, 12, 18)


@app.route('/api/memory/best')
@login_required
def memory_best():
    user_id = session["user_id"]
    rows = database.get_memory_bests(user_id)
    result = {}
    for row in rows:
        result[str(row["Difficulty"])] = {
            "moves": row["Moves"],
            "seconds": row["Seconds"],
            "created_at": row["CreatedAt"]
        }
    return jsonify(result)


@app.route('/api/memory/score', methods=['POST'])
@login_required
def memory_score():
    user_id = session["user_id"]
    data = request.json or {}

    try:
        difficulty = int(data.get("difficulty"))
        moves = int(data.get("moves"))
        seconds = int(data.get("seconds"))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Dati non validi"}), 400

    if difficulty not in VALID_DIFFICULTIES:
        return jsonify({"status": "error", "message": "Difficolta' non valida"}), 400
    if moves < difficulty or moves > 9999:
        return jsonify({"status": "error", "message": "Numero di mosse non valido"}), 400
    if seconds < 0 or seconds > 86400:
        return jsonify({"status": "error", "message": "Tempo non valido"}), 400

    is_record, best_moves, best_seconds = database.save_memory_score(
        user_id, difficulty, moves, seconds
    )

    return jsonify({
        "status": "success",
        "is_record": is_record,
        "best": {"moves": best_moves, "seconds": best_seconds}
    })


@app.route('/api/memory/leaderboard/<int:difficulty>')
@login_required
def memory_leaderboard(difficulty):
    if difficulty not in VALID_DIFFICULTIES:
        return jsonify({"status": "error", "message": "Difficolta' non valida"}), 400

    rows = database.get_memory_leaderboard(difficulty)
    result = []
    for row in rows:
        result.append({
            "player": row["DisplayName"] or row["Username"],
            "moves": row["Moves"],
            "seconds": row["Seconds"],
            "created_at": row["CreatedAt"]
        })
    return jsonify(result)

# =========================================================
# SNIPPET DA AGGIUNGERE IN app.py
# INCOLLARE PRIMA DI:   if __name__ == '__main__':
# =========================================================

VALID_GAME_TYPES = ('quiz',)


@app.route('/games/quiz')
@login_required
def game_quiz():
    return render_template('quiz.html')


@app.route('/api/games/best/<game_type>')
@login_required
def games_best(game_type):
    if game_type not in VALID_GAME_TYPES:
        return jsonify({"status": "error", "message": "Gioco non valido"}), 400

    rows = database.get_game_bests(session["user_id"], game_type)
    result = {}
    for row in rows:
        result[str(row["Difficulty"])] = {
            "score": row["Score"],
            "detail": row["Detail"],
            "created_at": row["CreatedAt"]
        }
    return jsonify(result)


@app.route('/api/games/score', methods=['POST'])
@login_required
def games_score():
    data = request.json or {}
    game_type = data.get("game_type")

    if game_type not in VALID_GAME_TYPES:
        return jsonify({"status": "error", "message": "Gioco non valido"}), 400

    try:
        difficulty = int(data.get("difficulty"))
        score = int(data.get("score"))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Dati non validi"}), 400

    if difficulty not in (1, 2, 3):
        return jsonify({"status": "error", "message": "Difficolta' non valida"}), 400
    if score < 0 or score > 100000:
        return jsonify({"status": "error", "message": "Punteggio non valido"}), 400

    detail = str(data.get("detail", ""))[:40]

    is_record, best_score, best_detail = database.save_game_score(
        session["user_id"], game_type, difficulty, score, detail
    )

    return jsonify({
        "status": "success",
        "is_record": is_record,
        "best": {"score": best_score, "detail": best_detail}
    })


@app.route('/api/games/leaderboard/<game_type>/<int:difficulty>')
@login_required
def games_leaderboard(game_type, difficulty):
    if game_type not in VALID_GAME_TYPES or difficulty not in (1, 2, 3):
        return jsonify({"status": "error", "message": "Parametri non validi"}), 400

    rows = database.get_game_leaderboard(game_type, difficulty)
    return jsonify([{
        "player": row["DisplayName"] or row["Username"],
        "score": row["Score"],
        "detail": row["Detail"],
        "created_at": row["CreatedAt"]
    } for row in rows])

@app.route('/games/leaderboard')
@login_required
def game_leaderboard():
    return render_template('leaderboard.html')


MAX_IMPORT_BYTES = 2 * 1024 * 1024   # 2 MB


def _normalize_serials(raw_value):
    """Ritorna (serials_text, errore). Accetta '001,045' oppure '1, 45'."""
    raw_value = str(raw_value or "").strip()
    if not raw_value:
        return "", None
    parts = [p.strip() for p in raw_value.replace("#", "").split(",")]
    clean = []
    for p in parts:
        if not p:
            clean.append("")
            continue
        if not p.isdigit():
            return None, f"numerazione '{p}' non valida"
        n = int(p)
        if n < 1 or n > 300:
            return None, f"numerazione '{p}' fuori range 001-300"
        clean.append(f"{n:03d}")
    filled = [c for c in clean if c]
    if len(set(filled)) != len(filled):
        return None, "numerazione duplicata"
    return ",".join(clean), None


@app.route('/api/export/csv')
@login_required
def export_csv():
    rows = database.get_export_rows(session["user_id"])

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';', lineterminator='\r\n')
    writer.writerow([
        "CardCode", "CardName", "SetName", "Rarity",
        "Quantity", "Wishlist", "Serials", "UpdatedAt"
    ])
    for row in rows:
        writer.writerow([
            row["CardCode"],
            row["CardName"],
            row["SetName"] or "",
            row["Rarity"] or "",
            row["Quantity"],
            row["Wishlist"],
            row["Serials"] or "",
            row["UpdatedAt"] or ""
        ])

    data = output.getvalue().encode("utf-8-sig")
    filename = "monarch_hoard_%s_%s.csv" % (
        session.get("username", "hunter"),
        datetime.now().strftime("%Y%m%d")
    )

    return Response(
        data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="%s"' % filename}
    )

@app.route('/api/export/template')
@login_required
def export_template():
    """Modello vuoto: tutte le carte del CardPool con Quantity a 0."""
    rows = database.get_cardpool_rows()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';', lineterminator='\r\n')
    writer.writerow([
        "CardCode", "CardName", "SetName", "Rarity",
        "Quantity", "Wishlist", "Serials"
    ])
    for row in rows:
        writer.writerow([
            row["CardCode"],
            row["CardName"],
            row["SetName"] or "",
            row["Rarity"] or "",
            0,
            0,
            ""
        ])

    data = output.getvalue().encode("utf-8-sig")

    return Response(
        data,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                'attachment; filename="monarch_hoard_modello.csv"'
        }
    )


@app.route('/api/import/csv', methods=['POST'])
@login_required
def import_csv():
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({"status": "error", "message": "Nessun file selezionato"}), 400

    raw = uploaded.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        return jsonify({"status": "error", "message": "File troppo grande (max 2 MB)"}), 413
    if not raw:
        return jsonify({"status": "error", "message": "File vuoto"}), 400

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    sample = text[:4000]
    delimiter = ';' if sample.count(';') >= sample.count(',') else ','

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        return jsonify({"status": "error", "message": "CSV senza intestazione"}), 400

    headers = {}
    for name in reader.fieldnames:
        headers[(name or "").strip().lower()] = name

    if "cardcode" not in headers:
        return jsonify({
            "status": "error",
            "message": "Colonna 'CardCode' mancante nel CSV"
        }), 400

    col_code = headers["cardcode"]
    col_qty = headers.get("quantity")
    col_wish = headers.get("wishlist")
    col_ser = headers.get("serials")

    valid_codes = database.get_valid_card_codes()

    records = []
    seen = set()
    errors = []
    unknown = 0
    line = 1

    for row in reader:
        line += 1
        if len(records) > 20000:
            errors.append("Troppe righe: import interrotto")
            break

        code = str(row.get(col_code) or "").strip()
        if not code:
            continue
        if code not in valid_codes:
            unknown += 1
            continue
        if code in seen:
            continue
        seen.add(code)

        quantity = None
        if col_qty is not None:
            raw_qty = str(row.get(col_qty) or "").strip()
            if raw_qty:
                try:
                    quantity = int(float(raw_qty.replace(",", ".")))
                except ValueError:
                    errors.append(f"Riga {line}: quantita' '{raw_qty}' non valida")
                    continue
                if quantity < 0 or quantity > 9999:
                    errors.append(f"Riga {line}: quantita' fuori range")
                    continue

        wishlist = None
        if col_wish is not None:
            raw_wish = str(row.get(col_wish) or "").strip().lower()
            if raw_wish:
                if raw_wish in ("1", "true", "si", "sì", "yes", "x"):
                    wishlist = 1
                elif raw_wish in ("0", "false", "no", ""):
                    wishlist = 0
                else:
                    errors.append(f"Riga {line}: wishlist '{raw_wish}' non valida")
                    continue

        serials = None
        if col_ser is not None:
            serials, ser_error = _normalize_serials(row.get(col_ser))
            if ser_error:
                errors.append(f"Riga {line}: {ser_error}")
                continue

        records.append({
            "code": code,
            "quantity": quantity,
            "wishlist": wishlist,
            "serials": serials
        })

    if not records:
        if unknown > 0 and not errors:
            message = (
                "Nessun CardCode del file corrisponde a una carta esistente "
                f"({unknown} codici sconosciuti). Se hai usato il CSV di esempio, "
                "ricorda che i suoi codici sono inventati: scarica il CSV della tua "
                "collezione e modifica quello."
            )
        else:
            message = "Nessuna riga valida da importare"
        return jsonify({
            "status": "error",
            "message": message,
            "unknown": unknown,
            "errors": errors[:10]
        }), 400

    updated = database.bulk_upsert_cards(session["user_id"], records)

    return jsonify({
        "status": "success",
        "updated": updated,
        "unknown": unknown,
        "errors": errors[:10],
        "error_count": len(errors)
    })


# =========================================================
# VETRINA - Monarch Hoard
# =========================================================
@app.route('/showcase')
@login_required
def showcase_page():
    return render_template('showcase.html')

@app.route('/api/showcase')
@login_required
def api_get_showcase():
    user_id = session["user_id"]
    rows = database.get_showcase(user_id)
    slots = [None] * database.MAX_SHOWCASE_SLOTS
    for row in rows:
        pos = row["SlotPosition"]
        if 1 <= pos <= database.MAX_SHOWCASE_SLOTS:
            slots[pos - 1] = {
                "card_code": row["CardCode"],
                "card_name": row["CardName"],
                "rarity": row["Rarity"],
                "rarity_order": row["rarity_Order"],
                "set_name": row["SetName"],
                "image_url": f"/static/cards/TRANSPARENT/{row['image_name']}"
            }
    return jsonify({"slots": slots})

@app.route('/api/showcase/add', methods=['POST'])
@login_required
def api_showcase_add():
    user_id = session["user_id"]
    data = request.json or {}
    card_code = data.get('card_code')
    if not card_code:
        return jsonify({"status": "error", "message": "Codice mancante"}), 400
    owned_rows = database.get_all_cards(user_id)
    owned_codes = {r["CardCode"] for r in owned_rows if r["Quantity"] > 0}
    if card_code not in owned_codes:
        return jsonify({"status": "error", "message": "Devi possedere la carta per aggiungerla"}), 400
    ok, result = database.add_to_showcase(user_id, card_code)
    if not ok:
        return jsonify({"status": "error", "message": result}), 400
    return jsonify({"status": "success", "slot": result})

@app.route('/api/showcase/remove', methods=['POST'])
@login_required
def api_showcase_remove():
    user_id = session["user_id"]
    data = request.json or {}
    card_code = data.get('card_code')
    if not card_code:
        return jsonify({"status": "error", "message": "Codice mancante"}), 400
    database.remove_from_showcase(user_id, card_code)
    return jsonify({"status": "success"})

@app.route('/api/showcase/move', methods=['POST'])
@login_required
def api_showcase_move():
    user_id = session["user_id"]
    data = request.json or {}
    card_code = data.get('card_code')
    try:
        direction = int(data.get('direction'))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Direzione non valida"}), 400
    if direction not in (-1, 1, -3, 3):
        return jsonify({"status": "error", "message": "Direzione non valida"}), 400
    if not card_code:
        return jsonify({"status": "error", "message": "Codice mancante"}), 400
    ok, result = database.move_showcase(user_id, card_code, direction)
    if not ok:
        return jsonify({"status": "error", "message": result}), 400
    return jsonify({"status": "success", "slot": result})

@app.route('/api/showcase/set', methods=['POST'])
@login_required
def api_showcase_set():
    user_id = session["user_id"]
    data = request.json or {}
    card_code = data.get('card_code')
    try:
        slot_position = int(data.get('slot_position'))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Posizione non valida"}), 400
    if not card_code:
        return jsonify({"status": "error", "message": "Codice mancante"}), 400
    owned_rows = database.get_all_cards(user_id)
    owned_codes = {r["CardCode"] for r in owned_rows if r["Quantity"] > 0}
    if card_code not in owned_codes:
        return jsonify({"status": "error", "message": "Devi possedere la carta per aggiungerla"}), 400
    ok, result = database.set_showcase_slot(user_id, card_code, slot_position)
    if not ok:
        return jsonify({"status": "error", "message": result}), 400
    return jsonify({"status": "success", "slot": result})

# Elenco degli id sfondo validi (deve combaciare con la lista nel JS)
VALID_SHOWCASE_BG = ('none', 'nebula')

@app.route('/api/showcase/bg', methods=['GET'])
@login_required
def api_showcase_bg_get():
    bg = database.get_showcase_bg(session["user_id"])
    return jsonify({"status": "success", "bg": bg})

@app.route('/api/showcase/bg', methods=['POST'])
@login_required
def api_showcase_bg_set():
    data = request.json or {}
    bg_id = str(data.get('bg') or '').strip()
    if bg_id not in VALID_SHOWCASE_BG:
        return jsonify({"status": "error", "message": "Sfondo non valido"}), 400
    database.set_showcase_bg(session["user_id"], bg_id)
    return jsonify({"status": "success", "bg": bg_id})

@app.route('/settings')
@login_required
def settings_page():
    return render_template('settings.html')

@app.route('/api/settings/profile', methods=['GET'])
@login_required
def api_settings_profile():
    user = database.get_user_by_id(session["user_id"])
    if not user:
        return jsonify({"status": "error", "message": "Utente non trovato"}), 404
    return jsonify({
        "status": "success",
        "email": user["Email"] or "",
        "display_name": user["DisplayName"] or user["Username"]
    })

@app.route('/api/settings/display_name', methods=['POST'])
@login_required
def api_settings_display_name():
    data = request.json or {}
    name = str(data.get('display_name') or '').strip()
    if len(name) < 2:
        return jsonify({"status": "error", "message": "Il nome deve avere almeno 2 caratteri"}), 400
    if len(name) > 40:
        return jsonify({"status": "error", "message": "Il nome è troppo lungo (max 40)"}), 400
    database.update_display_name(session["user_id"], name)
    session["display_name"] = name
    return jsonify({"status": "success", "display_name": name})

@app.route('/api/settings/password', methods=['POST'])
@login_required
def api_settings_password():
    data = request.json or {}
    old = str(data.get('old_password') or '')
    new = str(data.get('new_password') or '')
    user = database.get_user_by_id(session["user_id"])
    if not user or not check_password_hash(user["PasswordHash"], old):
        return jsonify({"status": "error", "message": "Password attuale errata"}), 400
    if len(new) < 8:
        return jsonify({"status": "error", "message": "La nuova password deve avere almeno 8 caratteri"}), 400
    if not re.search(r"[A-Z]", new):
        return jsonify({"status": "error", "message": "Serve almeno una lettera maiuscola"}), 400
    if not re.search(r"[a-z]", new):
        return jsonify({"status": "error", "message": "Serve almeno una lettera minuscola"}), 400
    if not re.search(r"[0-9]", new):
        return jsonify({"status": "error", "message": "Serve almeno un numero"}), 400
    if not re.search(r"[^A-Za-z0-9]", new):
        return jsonify({"status": "error", "message": "Serve almeno un carattere speciale"}), 400
    database.update_password(session["user_id"], generate_password_hash(new))
    return jsonify({"status": "success"})



if __name__ == '__main__':
    app.run(debug=os.environ.get("MH_ENV") != "production", host='0.0.0.0')
