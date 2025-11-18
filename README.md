🎵 SketchSynth: AI Studio
SketchSynth is an interactive web application that transforms hand-drawn sketches into synthesized music using Deep Learning. It uses an LSTM Neural Network to analyze the geometry of your strokes and predicts musical parameters (decay, filter cutoff, vibrato) to generate unique sounds in real-time.

📂 Project Structure
index.html: The main user interface.

style.css: Styling for the neon UI and animations.

sketch.js: Frontend logic (Canvas drawing, Audio Engine, API calls).

app.py: The Flask Backend API that serves the ML model.

train_and_save_model.py: The script to train and generate the AI model.

⚙️ Prerequisites
Ensure you have Python (3.8+) installed on your system.

1. Install Dependencies
Open your terminal/command prompt and install the required Python libraries:

Bash

pip install flask flask-cors tensorflow numpy scikit-learn
🚀 How to Run (Step-by-Step)
Follow these steps in order to launch the application.

Step 1: Train the AI Model
Before the server can run, it needs a trained model file.

Open your terminal in the project folder.

Run the training script:

Bash

python train_and_save_model.py
Wait until it finishes. It will generate a file named curve_synth_model.h5 in your folder.

Step 2: Start the Backend Server
In the same terminal, run the Flask app:

Bash

python app.py
Keep this terminal open! You should see a message saying Running on http://127.0.0.1:5000.

Step 3: Launch the Frontend
Go to your project folder.

Double-click index.html to open it in your web browser (Chrome/Edge recommended).

Optional: For the best experience, use "Open with Live Server" in VS Code.

🤖 What happens after running app.py?
When you run python app.py, the following occurs:

Server Initialization: Flask starts a local web server on Port 5000.

Model Loading: The app immediately searches for and loads curve_synth_model.h5 into memory.

Listening Mode: The terminal will hang/pause. This is normal. It is now waiting for "POST" requests.

Once you draw on the canvas in the browser:

The JavaScript sends your stroke coordinates to the Python server.

The Server calculates the curve data and feeds it into the LSTM Neural Network.

The AI predicts 5 musical parameters (Filter Frequency, LFO Rate, Decay Time, etc.).

The Server sends these numbers back to the browser.

Result: The browser synthesizes a sound based on those numbers and transforms your drawing into a glowing icon.

🎨 Usage Guide
Draw Shapes:

Line = Flute / Hi-Hat

Circle = Drum / Kick

Triangle = Cello / Snare

Square = Bass

Controls:

Rec: Records your session to a .webm audio file.

Echo: Toggles a cyber-delay effect.

BPM: Changes the speed of the background beat loop.

Eraser: Remove specific instruments from the mix.

🛠 Troubleshooting
"Connection Failed / AI Offline": Ensure the terminal running app.py is still open and shows no errors.

"Module not found": Run the pip install command in the Prerequisites section again.

No Sound: Click anywhere on the page once to initialize the Audio Context (browsers block auto-playing audio).