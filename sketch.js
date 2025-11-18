window.addEventListener('load', () => {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    const statusMsg = document.getElementById('statusMessage');
    const aiStatus = document.getElementById('aiStatus');
    const beatStatus = document.getElementById('beatStatus');

    // UI Controls
    const pencilBtn = document.getElementById('pencilBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    const undoBtn = document.getElementById('undoBtn');
    // const redoBtn = document.getElementById('redoBtn');
    const clearBtn = document.getElementById('clearBtn');
    const stopBeatsBtn = document.getElementById('stopBeatsBtn');
    const recordBtn = document.getElementById('recordBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn'); // Added share button ref
    const brushSlider = document.getElementById('brushSize');
    const bpmSlider = document.getElementById('bpmSlider');
    const bpmLabel = document.getElementById('bpmLabel');
    const echoToggle = document.getElementById('echoToggle');
    const colorSwatches = document.querySelectorAll('.color-swatch');

    // --- STATE ---
    let isDrawing = false;
    let currentMode = 'pencil';
    let currentColor = '#FFFFFF';
    let currentBrushSize = 3;

    let rawStrokes = [];
    let detectedObjects = [];
    let currentStroke = { x: [], y: [], color: '#FFFFFF', mode: 'pencil' };

    // --- HISTORY STATE ---
    let historyStack = [];
    let redoStack = [];

    // --- AUDIO STATE ---
    let audioCtx = null;
    let masterGain, delayNode, feedbackNode;
    let destNode, mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let echoActive = false;

    // Beat State
    let activeBeats = { kick: false, snare: false, hihat: false };
    let beatInterval = null;
    let beatStep = 0;
    let currentBPM = 120;
    let globalPulse = 0;

    // --- ICONS ---
    const ICONS = {
        drum: '\uf5d2',
        bass: '\uf1b2',
        cello: '\uf04b',
        flute: '\uf001',
        dot: '\uf111'
    };

    // --- MUSICAL SCALE ---
    const SCALE_FREQS = [
        130.81, 155.56, 174.61, 196.00, 233.08,
        261.63, 311.13, 349.23, 392.00, 466.16,
        523.25, 622.25, 698.46, 783.99, 932.33
    ];

    function getQuantizedFreq(yPercent) {
        const index = Math.floor((1 - yPercent) * SCALE_FREQS.length);
        const safeIndex = Math.max(0, Math.min(index, SCALE_FREQS.length - 1));
        return SCALE_FREQS[safeIndex];
    }

    // --- 1. AUDIO ENGINE ---
    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();

            masterGain = audioCtx.createGain();
            masterGain.connect(audioCtx.destination);

            // Recorder Setup
            if (recordBtn) {
                destNode = audioCtx.createMediaStreamDestination();
                masterGain.connect(destNode);
            }

            delayNode = audioCtx.createDelay();
            delayNode.delayTime.value = 0.3;
            feedbackNode = audioCtx.createGain();
            feedbackNode.gain.value = 0.4;

            delayNode.connect(feedbackNode);
            feedbackNode.connect(delayNode);
            delayNode.connect(masterGain);

            startBeatLoop();
            requestAnimationFrame(animateCanvas);
        }
        // FIX: Resume the AudioContext if it's suspended (browser autoplay policy)
        if (audioCtx.state === 'suspended') audioCtx.resume();
        aiStatus.innerText = "Connected to AI";
    }
    
    // --- **NEW FIX** ---
    // Start the AudioContext on the very first user click
    document.addEventListener('click', () => {
        initAudio();
    }, { once: true });
    // --- **END NEW FIX** ---

    // --- [UPDATED] INSTRUMENT SYNTHESIZER (CONNECTED TO ML) ---
    function playInstrument(instrument, prediction, yPercent) {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const frequency = getQuantizedFreq(yPercent);

        // 1. Extract ML Parameters (Defaulting to basic parameters since AI is offline)
        // NOTE: These are simplified defaults since the backend fetch was removed.
        const decay = prediction.decay_time || 0.5;
        const filterFreq = prediction.filter_cutoff || 1200;
        const lfoRate = prediction.lfo_rate || 5;
        const lfoDepth = prediction.lfo_depth || 0;
        const gainMod = prediction.gain_mod || 0.5;

        // 2. Routing
        osc.connect(gain);
        gain.connect(masterGain);
        if (echoActive) gain.connect(delayNode);

        // 3. Apply Filter (Controlled by ML)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, t);

        // 4. Apply LFO (Vibrato - Controlled by ML)
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(lfoRate, t);
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.setValueAtTime(lfoDepth * 20, t); // Depth scales frequency
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + decay + 0.5);

        // 5. Instrument Logic
        if (instrument === 'flute') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, t);
            // Soft attack for flute
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(gainMod * 0.5, t + 0.1);
            gain.gain.linearRampToValueAtTime(0, t + decay + 0.2);
        }
        else if (instrument === 'cello') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(frequency / 2, t);
            // Insert Filter
            osc.disconnect(); osc.connect(filter); filter.connect(gain);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(gainMod * 0.6, t + 0.3);
            gain.gain.linearRampToValueAtTime(0, t + decay + 0.5);
        }
        else if (instrument === 'bass') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(frequency / 4, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(gainMod * 0.7, t + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, t + decay);
        }
        else if (instrument === 'drum') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            gain.gain.setValueAtTime(0.8, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        }

        osc.start(t);
        osc.stop(t + decay + 0.5);
    }

    // --- [UPDATED] SHAPE ANALYSIS & BACKEND CALL ---
    function classifyShape(stroke) {
        const points = stroke.x.map((x, i) => ({ x, y: stroke.y[i] }));
        if (points.length < 10) return 'dot';
        const start = points[0];
        const end = points[points.length - 1];

        let pathLen = 0;
        for(let i=1; i<points.length; i++) {
            pathLen += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
        }
        const distance = Math.hypot(end.x - start.x, end.y - start.y);

        if (distance > pathLen * 0.85) return 'line';

        let minX = Math.min(...stroke.x), maxX = Math.max(...stroke.x);
        let minY = Math.min(...stroke.y), maxY = Math.max(...stroke.y);
        const width = maxX - minX;
        const height = maxY - minY;
        const ratio = pathLen / ((width + height) * 2);

        if (ratio > 0.6 && ratio <= 0.85) return 'circle';
        if (ratio > 0.85) return 'square';
        return 'triangle';
    }

    function getCentroid(stroke) {
        let sumX = 0, sumY = 0;
        stroke.x.forEach(x => sumX += x);
        stroke.y.forEach(y => sumY += y);
        return { x: sumX / stroke.x.length, y: sumY / stroke.y.length };
    }


    // --- [REMOVED BACKEND CALL] SHAPE ANALYSIS & PLAY ---
    function analyzeAndPlay(stroke) {
        const shape = classifyShape(stroke);
        const center = getCentroid(stroke);
        const yPercent = center.y / canvas.height;

        // Default Instrument Mapping (Based on Heuristic Shape Classification)
        let instrument = 'default';
        let iconType = 'flute';

        if (shape === 'line') { instrument = 'flute'; iconType = 'flute'; }
        else if (shape === 'circle') { instrument = 'drum'; iconType = 'drum'; }
        else if (shape === 'triangle') { instrument = 'cello'; iconType = 'cello'; }
        else if (shape === 'square') { instrument = 'bass'; iconType = 'bass'; }
        else { return; } // Ignore dots

        // Since the backend call is removed, we use a simple default prediction object
        const prediction = {};

        statusMsg.innerText = `AI Offline: Using basic mode (${shape.toUpperCase()})`;
        statusMsg.style.color = stroke.color;

        // Play Sound
        playInstrument(instrument, prediction, yPercent);

        // Update Beats
        if (shape === 'circle') activeBeats.kick = true;
        if (shape === 'square') activeBeats.kick = true;
        if (shape === 'triangle') activeBeats.snare = true;
        if (shape === 'line') activeBeats.hihat = true;
        updateBeatStatus();

        // Save Visual
        saveStateToHistory();
        detectedObjects.push({
            type: iconType,
            x: center.x,
            y: center.y,
            color: stroke.color,
            pulse: 0 // Added pulse initialization
        });
    }

    // --- 4. ANIMATION & HISTORY ---
    function saveStateToHistory() {
        historyStack.push(JSON.parse(JSON.stringify(detectedObjects)));
        if (historyStack.length > 20) historyStack.shift();
        redoStack = [];
    }

    undoBtn.addEventListener('click', () => {
        if (historyStack.length > 0) {
            redoStack.push(JSON.parse(JSON.stringify(detectedObjects)));
            detectedObjects = historyStack.pop();
        }
    });

    // redoBtn.addEventListener('click', () => {
    //     if (redoStack.length > 0) {
    //         saveStateToHistory();
    //         detectedObjects = redoStack.pop();
    //     }
    // });

    function animateCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Icons
        ctx.font = "900 40px 'Font Awesome 6 Free'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        detectedObjects.forEach(obj => {
            let scale = 1 + (globalPulse * 0.3);
            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.scale(scale, scale);
            ctx.shadowBlur = 20 + (globalPulse * 20);
            ctx.shadowColor = obj.color;
            ctx.fillStyle = obj.color;
            if(ICONS[obj.type]) ctx.fillText(ICONS[obj.type], 0, 0);
            ctx.restore();
        });

        // Draw current stroke
        if (isDrawing && currentMode === 'pencil' && currentStroke.x.length > 0) {
            ctx.lineWidth = currentBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = currentColor;
            ctx.shadowBlur = 5;
            ctx.shadowColor = currentColor;
            ctx.globalCompositeOperation = 'source-over';

            ctx.beginPath();
            ctx.moveTo(currentStroke.x[0], currentStroke.y[0]);
            for (let i = 1; i < currentStroke.x.length; i++) {
                ctx.lineTo(currentStroke.x[i], currentStroke.y[i]);
            }
            ctx.stroke();
        }

        // Draw Eraser
        if (isDrawing && currentMode === 'eraser') {
             ctx.strokeStyle = 'rgba(255,255,255,0.5)';
             ctx.lineWidth = 2;
             ctx.beginPath();
             const lx = currentStroke.x[currentStroke.x.length-1];
             const ly = currentStroke.y[currentStroke.y.length-1];
             ctx.arc(lx, ly, currentBrushSize * 5, 0, Math.PI * 2);
             ctx.stroke();
        }

        canvas.style.boxShadow = `0 0 ${20 + globalPulse * 30}px ${currentColor}`;
        globalPulse *= 0.9;

        requestAnimationFrame(animateCanvas);
    }

    // --- 5. BEAT LOOP & UTILS ---
    function playDrumSample(type) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);
        const t = audioCtx.currentTime;
        globalPulse = type === 'kick' ? 1.0 : 0.6;

        if (type === 'kick') {
            osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
            gain.gain.setValueAtTime(1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t); osc.stop(t + 0.5);
        } else if (type === 'snare') {
            osc.type = 'triangle'; gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t); osc.stop(t + 0.2);
        } else if (type === 'hihat') {
            osc.type = 'square'; osc.frequency.setValueAtTime(8000, t); gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
            osc.start(t); osc.stop(t + 0.05);
        }
    }

    function startBeatLoop() {
        if (beatInterval) clearInterval(beatInterval);
        const intervalMs = 60000 / currentBPM / 4;
        beatInterval = setInterval(() => {
            if (activeBeats.kick && beatStep % 4 === 0) playDrumSample('kick');
            if (activeBeats.snare && beatStep % 8 === 4) playDrumSample('snare');
            if (activeBeats.hihat && beatStep % 2 === 0) playDrumSample('hihat');
            beatStep = (beatStep + 1) % 16;
        }, intervalMs);
    }

    // --- 6. INPUT HANDLERS ---
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('mousedown', (e) => {
        initAudio();
        isDrawing = true;
        if (currentMode === 'eraser') saveStateToHistory();
        const pos = getMousePos(e);
        currentStroke = { x: [pos.x], y: [pos.y], color: currentColor, mode: currentMode };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getMousePos(e);
        currentStroke.x.push(pos.x);
        currentStroke.y.push(pos.y);

        if (currentMode === 'eraser') {
            for (let i = detectedObjects.length - 1; i >= 0; i--) {
                const obj = detectedObjects[i];
                const dist = Math.hypot(pos.x - obj.x, pos.y - obj.y);
                if (dist < currentBrushSize * 5) {
                    detectedObjects.splice(i, 1);
                }
            }
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentMode === 'pencil' && currentStroke.x.length > 0) {
            analyzeAndPlay(currentStroke);
        }
        currentStroke = { x: [], y: [], color: currentColor, mode: 'pencil' };
    });

    // --- INITIALIZERS ---
    pencilBtn.addEventListener('click', () => { currentMode = 'pencil'; pencilBtn.classList.add('active'); eraserBtn.classList.remove('active'); });
    eraserBtn.addEventListener('click', () => { currentMode = 'eraser'; eraserBtn.classList.add('active'); pencilBtn.classList.remove('active'); });

    clearBtn.addEventListener('click', () => {
        saveStateToHistory();
        detectedObjects = [];
        activeBeats = { kick: false, snare: false, hihat: false };
        updateBeatStatus(); // Call to update the beat status text
        statusMsg.innerText = "System Wipe Complete";
    });

    stopBeatsBtn.addEventListener('click', () => { activeBeats = { kick: false, snare: false, hihat: false }; updateBeatStatus(); }); // Added update
    bpmSlider.addEventListener('input', (e) => { currentBPM = parseInt(e.target.value); bpmLabel.innerText = currentBPM; if (audioCtx) startBeatLoop(); });
    echoToggle.addEventListener('change', (e) => echoActive = e.target.checked);
    brushSlider.addEventListener('input', (e) => currentBrushSize = e.target.value);

    colorSwatches.forEach(s => {
        s.addEventListener('click', () => {
            colorSwatches.forEach(sw => sw.classList.remove('active'));
            s.classList.add('active');
            currentColor = s.dataset.color;
            currentMode = 'pencil';
            pencilBtn.classList.add('active');
            eraserBtn.classList.remove('active');
        });
    });

    if(recordBtn) {
        recordBtn.addEventListener('click', () => {
            initAudio();
            if (!isRecording) {
                mediaRecorder = new MediaRecorder(destNode.stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(audioChunks, { 'type' : 'audio/webm' });
                    const url = URL.createObjectURL(blob);
                    downloadBtn.disabled = false;
                    downloadBtn.onclick = () => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'sketch_track.webm';
                        a.click();
                    };
                };
                mediaRecorder.start();
                isRecording = true;
                recordBtn.classList.add('recording');
                recordBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
            } else {
                mediaRecorder.stop();
                isRecording = false;
                recordBtn.classList.remove('recording');
                recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i> Rec';
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            statusMsg.innerText = "Arrangement Shared: synth.app/id/" + Math.random().toString(36).substring(7);
        });
    }

    function updateBeatStatus() {
        let text = "";
        if (activeBeats.kick) text += "Kick ";
        if (activeBeats.snare) text += "Snare ";
        if (activeBeats.hihat) text += "Hi-Hat ";
        if (text === "") text = "No Beats Active";
        beatStatus.innerText = text;
    }

    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
});