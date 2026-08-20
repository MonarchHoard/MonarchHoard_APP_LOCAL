import os
import sqlite3
from PIL import Image

# Individua le cartelle del tuo progetto
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_DIR = os.path.join(BASE_DIR, "static", "cards", "TRANSPARENT")
DB_PATH = os.path.join(BASE_DIR, "Database", "SoloLeveling.db")

def convert_images_and_update_db():
    if not os.path.exists(IMAGE_DIR):
        print(f"❌ Errore: La cartella {IMAGE_DIR} non esiste.")
        return

    print("🚀 Inizio conversione immagini in WebP (inclusa ricerca nelle sottocartelle)...\n")
    converted_count = 0

    # os.walk esplora la cartella principale e TUTTE le sue sottocartelle
    for root, dirs, files in os.walk(IMAGE_DIR):
        for filename in files:
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                old_path = os.path.join(root, filename)
                base_name, _ = os.path.splitext(filename)
                new_filename = f"{base_name}.webp"
                new_path = os.path.join(root, new_filename)

                try:
                    with Image.open(old_path) as img:
                        # Mantiene la trasparenza se la carta è un PNG trasparente
                        if img.mode in ("RGBA", "P"):
                            img = img.convert("RGBA")
                        
                        # Salva in WebP con qualità ottimizzata
                        img.save(new_path, "WEBP", quality=85, optimize=True)
                    
                    # Mostra il percorso relativo rispetto alla cartella TRANSPARENT
                    rel_path = os.path.relpath(new_path, IMAGE_DIR)
                    print(f"✅ Convertita: {rel_path}")
                    converted_count += 1
                    
                    # Rimuovi il commento (#) dalla riga sotto se vuoi cancellare i vecchi PNG/JPG
                    # os.remove(old_path)

                except Exception as e:
                    print(f"⚠️ Errore su {filename}: {e}")

    print(f"\n🎉 Totale immagini convertite: {converted_count}")

    # Aggiornamento nomi nel Database SQLite (tabella CardPool)
    if os.path.exists(DB_PATH):
        print("\n🗄️ Aggiornamento del Database SQLite in corso...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Sostituisce le estensioni .png, .jpg, .jpeg con .webp nella colonna image_name
        cursor.execute("""
            UPDATE CardPool 
            SET image_name = REPLACE(REPLACE(REPLACE(REPLACE(image_name, '.png', '.webp'), '.PNG', '.webp'), '.jpg', '.webp'), '.jpeg', '.webp')
        """)
        conn.commit()
        updated_rows = cursor.rowcount
        conn.close()

        print(f"✅ Record aggiornati nel Database: {updated_rows}")
    else:
        print(f"❌ Database non trovato in {DB_PATH}")

if __name__ == "__main__":
    convert_images_and_update_db()