import numpy as np
import math
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model 
from tensorflow.keras.metrics import MeanSquaredError # Required for fixing the load error

# --- FLASK SETUP ---
app = Flask(__name__)
CORS(app) 

# --- ML CONFIGURATION ---
N_STEPS = 50 
MODEL_PATH = 'curve_synth_model.h5' 
MODEL = None 

# --- 1. MODEL LOADING FUNCTION (FINAL FIX) ---
def load_keras_model():
    global MODEL
    try:
        if not os.path.exists(MODEL_PATH):
            print(f"ERROR: Model file not found at {MODEL_PATH}")
            return False

        # FIX: Pass MeanSquaredError() as custom_objects to resolve 'mse' error
        MODEL = load_model(
            MODEL_PATH,
            custom_objects={'mse': MeanSquaredError()}
        )
        print("--- ✅ ML Model loaded successfully! ---")
        return True
    except Exception as e:
        print(f"CRITICAL ERROR loading model: {e}")
        return False

# --- 2. PRE-PROCESSING FUNCTION (CRITICAL MATCH TO TRAINING DATA) ---
def preprocess_stroke(x_list, y_list, canvas_width, canvas_height):
    # ... (Preprocessing logic remains the same, crucial for correct input) ...
    normalized_points = []
    for x, y in zip(x_list, y_list):
        norm_x = x / canvas_width
        norm_y = 1.0 - (y / canvas_height) 
        normalized_points.append([norm_x, norm_y])

    num_raw_points = len(normalized_points)
    if num_raw_points < 2:
        return np.zeros((1, N_STEPS, 2), dtype=np.float32)

    resampled_points = []
    for i in range(N_STEPS):
        index = (i / (N_STEPS - 1)) * (num_raw_points - 1)
        
        idx1 = math.floor(index)
        idx2 = math.ceil(index)
        alpha = index - idx1

        p1 = normalized_points[idx1]
        p2 = normalized_points[idx2]

        interp_x = p1[0] * (1 - alpha) + p2[0] * alpha
        interp_y = p1[1] * (1 - alpha) + p2[1] * alpha
        resampled_points.append([interp_x, interp_y])

    input_tensor = np.array(resampled_points, dtype=np.float32).reshape(1, N_STEPS, 2)
    return input_tensor

# --- 3. API ENDPOINT ---
@app.route('/api/predict_sound', methods=['POST'])
def predict_sound():
    if MODEL is None:
        return jsonify({"error": "ML Model failed to load on server start."}), 500

    try:
        data = request.get_json()
        raw_x = data.get('x')
        raw_y = data.get('y')
        canvas_w = data.get('canvasWidth')
        canvas_h = data.get('canvasHeight')

        if not raw_x or not raw_y:
            return jsonify({"error": "Missing stroke data."}), 400

        input_tensor = preprocess_stroke(raw_x, raw_y, canvas_w, canvas_h)
        prediction_output = MODEL.predict(input_tensor, verbose=0)[0] 
        
        # Mapping numerical outputs to musical parameters (0-1 ranges expanded)
        response_data = {
            "instrument_type": "Synth Lead", 
            "decay_time": float(prediction_output[0]) * 1.5 + 0.1,
            "filter_cutoff": float(prediction_output[1]) * 1800 + 400,
            "lfo_depth": float(prediction_output[2]) * 0.7,
            "lfo_rate": float(prediction_output[3]) * 8 + 1,
            "gain_mod": float(prediction_output[4]) * 0.8 + 0.1
        }
        
        return jsonify(response_data)

    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({"error": f"An unexpected server error occurred: {str(e)}"}), 500

# --- 4. MAIN ENTRY POINT ---
if __name__ == '__main__':
    if load_keras_model():
        print("Starting Flask server on http://127.0.0.1:5000")
        app.run(debug=True, port=5000)