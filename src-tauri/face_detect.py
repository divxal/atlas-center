#!/usr/bin/env python3
"""
Detección y reconocimiento facial para Atlas Center.
Sigue exactamente el mismo enfoque que howdy-view:
- Lee frames JPEG en base64 desde stdin (uno por línea)
- Emite JSON por stdout con las caras detectadas
"""
import sys
import json
import base64
import builtins
import configparser
import time

import cv2
import dlib
import numpy as np

sys.path.insert(0, "/usr/lib/howdy")
import paths_factory

# Necesario para que paths_factory.user_model_path() funcione
builtins.howdy_user = "atlas"

# ── Configuración de howdy ────────────────────────────────────────────────────

config = configparser.ConfigParser()
config.read(paths_factory.config_file_path())

video_certainty = config.getfloat("video", "certainty", fallback=3.5) / 10
dark_threshold  = config.getfloat("video", "dark_threshold", fallback=90)
use_cnn         = config.getboolean("core", "use_cnn", fallback=False)

# ── Modelos dlib ──────────────────────────────────────────────────────────────

if use_cnn:
    face_detector = dlib.cnn_face_detection_model_v1(paths_factory.mmod_human_face_detector_path())
else:
    face_detector = dlib.get_frontal_face_detector()

pose_predictor = dlib.shape_predictor(paths_factory.shape_predictor_5_face_landmarks_path())
face_encoder   = dlib.face_recognition_model_v1(paths_factory.dlib_face_recognition_resnet_model_v1_path())

# ── Encodings conocidos de howdy ──────────────────────────────────────────────

encodings   = []
enc_labels  = []   # etiqueta correspondiente a cada fila de encodings
models_data = None
try:
    models_data = json.load(open(paths_factory.user_model_path("atlas")))
    for model in models_data:
        for enc in model["data"]:
            encodings.append(enc)
            enc_labels.append(model["label"])
    encodings = np.array(encodings) if encodings else np.empty((0, 128))
except FileNotFoundError:
    encodings = np.empty((0, 128))

clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

# ── Bucle principal ───────────────────────────────────────────────────────────

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        img_bytes = base64.b64decode(line)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)

        # Decodificar como grayscale para detección, igual que howdy
        gray = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if gray is None:
            print(json.dumps([]), flush=True)
            continue

        # CLAHE (igual que howdy)
        frame = clahe.apply(gray)

        # Para pose_predictor y face_encoder necesitamos 3 canales
        orig_frame = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        # Detección (upsample=0: más rápido, suficiente para 640x360)
        raw_locs = face_detector(frame, 0)
        results = []

        for loc in raw_locs:
            if use_cnn:
                loc = loc.rect

            name = "Desconocido"
            certainty_val = None
            recognized = False

            if len(encodings) > 0:
                face_landmark = pose_predictor(orig_frame, loc)
                face_encoding = np.array(face_encoder.compute_face_descriptor(orig_frame, face_landmark, 1))
                matches = np.linalg.norm(encodings - face_encoding, axis=1)
                match_index = int(np.argmin(matches))
                match = float(matches[match_index])
                certainty_val = round(match * 10, 2)

                if 0 < match < video_certainty:
                    name = enc_labels[match_index]
                    recognized = True

            results.append({
                "top":        loc.top(),
                "right":      loc.right(),
                "bottom":     loc.bottom(),
                "left":       loc.left(),
                "name":       name,
                "recognized": recognized,
                "certainty":  certainty_val,
            })

        print(json.dumps(results), flush=True)

    except Exception:
        print(json.dumps([]), flush=True)
