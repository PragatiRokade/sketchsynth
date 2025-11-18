# import numpy as np
# from tensorflow.keras.models import Sequential
# from tensorflow.keras.layers import LSTM, Dense
# from tensorflow.keras.optimizers import Adam
# from sklearn.model_selection import train_test_split

# # --- ML CONFIGURATION (MUST MATCH app.py) ---
# N_STEPS = 50     # Length of the stroke sequence (X, Y points)
# N_FEATURES = 2   # X and Y coordinates
# N_OUTPUTS = 5    # The musical parameters to predict
# MODEL_FILENAME = 'curve_synth_model.h5'
# NUM_SAMPLES = 1000

# # --- 1. DATA GENERATION (Synthetic Dataset) ---
# def generate_synthetic_data(num_samples_per_class=NUM_SAMPLES):
#     # ... (Synthetic data generation code remains the same) ...
#     X = [] 
#     Y = [] 

#     gestures = [
#         (lambda x: np.full_like(x, 0.5), [0.8, 0.2, 0.1, 0.1, 0.9]),
#         (lambda x: x * 0.8 + 0.1, [0.4, 0.9, 0.3, 0.5, 0.6]),
#         (lambda x: 0.8 * np.sin(x * np.pi) + 0.1, [0.6, 0.1, 0.2, 0.3, 0.8]),
#         (lambda x: 0.5 + 0.4 * np.sin(x * np.pi * 6), [0.7, 0.5, 0.9, 0.9, 0.5]),
#     ]

#     x_base = np.linspace(0, 1, N_STEPS)

#     for func, target_y in gestures:
#         for _ in range(num_samples_per_class):
#             y_base = func(x_base) + np.random.normal(0, 0.05, N_STEPS)
#             y_base = np.clip(y_base, 0, 1)

#             input_sequence = np.stack([x_base, y_base], axis=1)
#             X.append(input_sequence)
            
#             noise_y = np.array(target_y) + np.random.normal(0, 0.05, N_OUTPUTS)
#             Y.append(np.clip(noise_y, 0, 1))

#     return np.array(X), np.array(Y)

# # --- 2. FINAL ROBUST MODEL DEFINITION ---
# def create_lstm_model():
#     model = Sequential()
#     model.add(LSTM(128, activation='tanh', recurrent_dropout=0.2, input_shape=(N_STEPS, N_FEATURES), return_sequences=True))
#     model.add(LSTM(64, activation='tanh', recurrent_dropout=0.2))
#     model.add(Dense(32, activation='relu'))
#     model.add(Dense(N_OUTPUTS, activation='sigmoid')) 
    
#     model.compile(optimizer=Adam(learning_rate=0.001), loss='mse')
#     return model

# # --- 3. EXECUTION ---
# # if __name__ == '__main__':
# #     print("1. Generating synthetic dataset...")
# #     X, Y = generate_synthetic_data(num_samples_per_class=NUM_SAMPLES)
    
# #     X_train, X_val, Y_train, Y_val = train_test_split(X, Y, test_size=0.2, random_state=42)

# #     print("2. Defining and compiling LSTM model...")
# #     model = create_lstm_model()
    
# #     print("3. Starting model training (This may take a minute)...")
# #     model.fit(X_train, Y_train, epochs=30, batch_size=32, validation_data=(X_val, Y_val), verbose=1)
    
# #     print(f"\n4. Saving model as '{MODEL_FILENAME}'...")
# #     model.save(MODEL_FILENAME)
    
# #     print(f"\n✅ Training complete! The file '{MODEL_FILENAME}' is ready.")