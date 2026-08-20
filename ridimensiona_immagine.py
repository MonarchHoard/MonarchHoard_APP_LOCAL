#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NORMALIZZA IMMAGINI CARTE - Monarch Hoard
==========================================
Cosa fa:
  Le immagini .webp delle carte (cartella TRANSPARENT) hanno tutte
  dimensioni "canvas" simili, ma il disegno vero e proprio dentro al
  file occupa piu' o meno spazio a seconda della carta: alcune hanno
  poco margine trasparente attorno, altre di piu'. Per questo, nella
  modale del sito, alcune carte sembrano piu' grandi di altre anche
  se il riquadro e' identico.

  Questo script:
    1. Apre ogni immagine .webp
    2. Trova il "bounding box" del disegno reale (ignora i pixel
       completamente trasparenti attorno)
    3. Ritaglia solo quella parte
    4. La incolla al centro di un nuovo canvas di dimensioni fisse,
       con lo stesso margine percentuale per tutte le carte
    5. Salva il risultato in una cartella SEPARATA (non tocca mai
       gli originali), mantenendo la stessa struttura di sottocartelle

Uso tipico (test su UNA sola immagine):
  python normalize_card_images.py --single "SOLO_LEVELING/SL1E/SL1E-001_TRANSPARENT.webp"

Uso su TUTTA la cartella (dopo aver controllato il test):
  python normalize_card_images.py --all

Le impostazioni di default (percorsi, dimensione canvas, margine)
sono gia' pronte per la struttura del progetto Monarch Hoard: non
serve modificare nulla per iniziare a fare il test.
"""

import argparse
import os
from pathlib import Path
from PIL import Image

# =========================================================
# IMPOSTAZIONI (gia' pronte per Monarch Hoard, modifica solo
# se il tuo percorso reale e' diverso da questo)
# =========================================================

# Cartella di partenza con le immagini originali (NON viene mai modificata)
INPUT_ROOT = Path("static/cards/TRANSPARENT")

# Cartella dove vengono salvate le immagini normalizzate (nuova, separata)
OUTPUT_ROOT = Path("static/cards/TRANSPARENT_NORMALIZED")

# Dimensione del canvas finale (larghezza, altezza) in pixel.
# 1000x1400 mantiene le proporzioni tipiche di una carta da gioco (5:7).
CANVAS_SIZE = (1000, 1400)

# Margine vuoto attorno al disegno, in percentuale rispetto al canvas.
# Es. 0.04 = 4% di spazio vuoto su ogni lato.
MARGIN_PERCENT = 0.04

# Soglia di trasparenza sotto la quale un pixel viene considerato
# "vuoto" per calcolare il bounding box (0 = totalmente trasparente,
# 255 = totalmente opaco). Alzarla un po' aiuta se ci sono bordi
# leggermente sfumati che altrimenti allargherebbero il bbox.
ALPHA_THRESHOLD = 8

# Estensioni di file da processare
VALID_EXTENSIONS = {".webp", ".png"}


def get_content_bbox(img: Image.Image, threshold: int = ALPHA_THRESHOLD):
    """Ritorna il bounding box (left, top, right, bottom) del contenuto
    non trasparente. Se l'immagine non ha canale alpha, ritorna
    l'intera immagine (nessun ritaglio possibile)."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    alpha = img.split()[-1]
    # Pixel con alpha sopra la soglia = contenuto vero
    mask = alpha.point(lambda a: 255 if a > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        # Immagine completamente trasparente: nessun contenuto trovato
        return None
    return bbox


def normalize_image(src_path: Path, dst_path: Path,
                     canvas_size=CANVAS_SIZE, margin_percent=MARGIN_PERCENT):
    """Normalizza una singola immagine e la salva in dst_path."""
    img = Image.open(src_path).convert("RGBA")

    bbox = get_content_bbox(img)
    if bbox is None:
        print(f"  [ATTENZIONE] Nessun contenuto trovato in {src_path.name}: copiata invariata.")
        cropped = img
    else:
        cropped = img.crop(bbox)

    canvas_w, canvas_h = canvas_size
    margin_w = int(canvas_w * margin_percent)
    margin_h = int(canvas_h * margin_percent)
    max_w = canvas_w - (margin_w * 2)
    max_h = canvas_h - (margin_h * 2)

    # Ridimensiona il contenuto ritagliato per stare dentro allo
    # spazio disponibile, mantenendo le proporzioni originali
    src_w, src_h = cropped.size
    scale = min(max_w / src_w, max_h / src_h)
    new_w = max(1, round(src_w * scale))
    new_h = max(1, round(src_h * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    # Crea il canvas finale trasparente e incolla il contenuto centrato
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    offset_x = (canvas_w - new_w) // 2
    offset_y = (canvas_h - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    if dst_path.suffix.lower() == ".webp":
        canvas.save(dst_path, "WEBP", lossless=True)
    else:
        canvas.save(dst_path)


def process_all(input_root=INPUT_ROOT, output_root=OUTPUT_ROOT):
    """Processa tutte le immagini trovate ricorsivamente in input_root."""
    if not input_root.exists():
        print(f"ERRORE: cartella non trovata: {input_root.resolve()}")
        return

    files = [
        p for p in input_root.rglob("*")
        if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS
    ]
    total = len(files)
    if total == 0:
        print(f"Nessuna immagine trovata in {input_root.resolve()}")
        return

    print(f"Trovate {total} immagini. Salvataggio in: {output_root.resolve()}\n")
    for i, src in enumerate(files, start=1):
        rel = src.relative_to(input_root)
        dst = output_root / rel
        print(f"[{i}/{total}] {rel}")
        try:
            normalize_image(src, dst)
        except Exception as e:
            print(f"  [ERRORE] {rel}: {e}")

    print("\nCompletato.")
    print(f"Le immagini normalizzate sono in: {output_root.resolve()}")
    print("Gli originali NON sono stati modificati.")


def process_single(rel_path: str, input_root=INPUT_ROOT, output_root=OUTPUT_ROOT):
    """Processa una singola immagine, indicata come percorso relativo
    a INPUT_ROOT (es. 'SOLO_LEVELING/SL1E/SL1E-001_TRANSPARENT.webp')."""
    src = input_root / rel_path
    if not src.exists():
        print(f"ERRORE: file non trovato: {src.resolve()}")
        return
    dst = output_root / rel_path
    print(f"Elaborazione di: {src}")
    normalize_image(src, dst)
    print(f"Salvata in: {dst.resolve()}")
    print("Apri entrambe le immagini (originale e normalizzata) per confrontarle.")


def main():
    parser = argparse.ArgumentParser(
        description="Normalizza le dimensioni delle immagini carte di Monarch Hoard."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--single", metavar="PERCORSO_RELATIVO",
        help="Elabora una sola immagine per fare un test. "
             "Esempio: --single \"SOLO_LEVELING/SL1E/SL1E-001_TRANSPARENT.webp\""
    )
    group.add_argument(
        "--all", action="store_true",
        help="Elabora TUTTE le immagini trovate nella cartella TRANSPARENT."
    )
    parser.add_argument(
        "--input", default=str(INPUT_ROOT),
        help=f"Cartella di partenza con gli originali (default: {INPUT_ROOT})"
    )
    parser.add_argument(
        "--output", default=str(OUTPUT_ROOT),
        help=f"Cartella dove salvare le immagini normalizzate (default: {OUTPUT_ROOT})"
    )
    args = parser.parse_args()

    input_root = Path(args.input)
    output_root = Path(args.output)

    if args.single:
        process_single(args.single, input_root, output_root)
    else:
        process_all(input_root, output_root)


if __name__ == "__main__":
    main()
