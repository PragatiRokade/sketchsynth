
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
    const redoBtn = document.getElementById('redoBtn');
    const clearBtn = document.getElementById('clearBtn');
    const stopBeatsBtn = document.getElementById('stopBeatsBtn');
    const recordBtn = document.getElementById('recordBtn');
    const downloadBtn = document.getElementById('downloadBtn');
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
    
    // We separate Raw Strokes (drawing) from Transformed Objects (icons)
    let rawStrokes = []; 
    let detectedObjects = []; // Stores: { type, x, y, color, scale }
    let currentStroke = { x: [], y: [], color: '#FFFFFF' };

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
    // Global pulse value for animation (0.0 to 1.0)
    let globalPulse = 0; 

    // --- ICONS (FontAwesome Unicode) ---
    const ICONS = {
        drum: '\uf5d2',    // fa-drum
        bass: '\uf1b2',    // fa-cube (representing block/bass)
        cello: '\uf04b',   // fa-play (triangle shape)
        flute: '\uf001'    // fa-music
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
            destNode = audioCtx.createMediaStreamDestination();
            masterGain.connect(destNode); 

            delayNode = audioCtx.createDelay();
            delayNode.delayTime.value = 0.3;
            feedbackNode = audioCtx.createGain();
            feedbackNode.gain.value = 0.4;
            
            delayNode.connect(feedbackNode);
            feedbackNode.connect(delayNode);
            delayNode.connect(masterGain);

            startBeatLoop();
            // Start the Animation Loop
            requestAnimationFrame(animateCanvas);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // --- 2. INSTRUMENT SYNTHESIZER ---
    function playInstrument(instrument, yPercent, duration) {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const frequency = getQuantizedFreq(yPercent);

        osc.connect(gain);
        gain.connect(masterGain);
        if (echoActive) gain.connect(delayNode);

        if (instrument === 'flute') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
            gain.gain.linearRampToValueAtTime(0, t + duration + 0.2);
            osc.start(t); osc.stop(t + duration + 0.2);
        } 
        else if (instrument === 'cello') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(frequency / 2, t);
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            osc.disconnect(); osc.connect(filter); filter.connect(gain);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.4, t + 0.3);
            gain.gain.linearRampToValueAtTime(0, t + duration + 0.5);
            osc.start(t); osc.stop(t + duration + 0.5);
        } 
        else if (instrument === 'bass') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(frequency / 4, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.5, t + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t); osc.stop(t + 0.5);
        } 
        else if (instrument === 'drum') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            gain.gain.setValueAtTime(0.8, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t); osc.stop(t + 0.2);
        }
    }

    // --- 3. SHAPE DETECTION & TRANSFORMATION ---
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

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        });
        const width = maxX - minX;
        const height = maxY - minY;
        const bboxPerimeter = (width + height) * 2;
        const ratio = pathLen / bboxPerimeter;

        if (ratio > 0.85 && ratio < 1.3) return 'square'; 
        if (ratio > 0.6 && ratio <= 0.85) return 'circle'; 

        return 'triangle'; 
    }

    function getCentroid(stroke) {
        let sumX = 0, sumY = 0;
        stroke.x.forEach(x => sumX += x);
        stroke.y.forEach(y => sumY += y);
        return {
            x: sumX / stroke.x.length,
            y: sumY / stroke.y.length
        };
    }

    function analyzeAndPlay(stroke) {
        const shape = classifyShape(stroke);
        const center = getCentroid(stroke);
        
        // Pitch calculation
        const yPercent = center.y / canvas.height;
        const duration = Math.min(0.3 + (stroke.x.length / 300), 2.0);

        let instrument = 'default';
        let iconType = 'flute'; // Default

        // Determine Instrument
        if (shape === 'line') { instrument = 'flute'; iconType = 'flute'; }
        else if (shape === 'circle') { instrument = 'drum'; iconType = 'drum'; }
        else if (shape === 'triangle') { instrument = 'cello'; iconType = 'cello'; }
        else if (shape === 'square') { instrument = 'bass'; iconType = 'bass'; }

        // 1. Play Sound
        statusMsg.innerText = `Transformed: ${shape.toUpperCase()} -> ${instrument.toUpperCase()}`;
        statusMsg.style.color = stroke.color;
        playInstrument(instrument, yPercent, duration);

        // 2. Update Logic for Beats
        if (shape === 'circle') activeBeats.kick = true;
        if (shape === 'square') activeBeats.kick = true; // Bass also adds kick feel
        if (shape === 'triangle') activeBeats.snare = true;
        if (shape === 'line') activeBeats.hihat = true;
        updateBeatStatus();

        // 3. TRANSFORM: Create Object, Remove Stroke
        // We add the object to our detected list
        detectedObjects.push({
            type: iconType,
            x: center.x,
            y: center.y,
            color: stroke.color,
            baseSize: 40, // Base pixel size of icon
            pulse: 0
        });

        // We DO NOT add this stroke to rawStrokes, essentially "erasing" the line
        // and replacing it with the object in the detectedObjects array.
    }

    // --- 4. ANIMATION LOOP (The Heart of Visuals) ---
    function animateCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // A. Draw Raw Strokes (Currently being drawn or unrecognized)
        if (isDrawing && currentStroke.x.length > 0) {
            drawStroke(currentStroke);
        }
        rawStrokes.forEach(stroke => drawStroke(stroke));

        // B. Draw Transformed Instruments (Icons)
        ctx.font = "900 40px 'Font Awesome 6 Free'"; // Ensure FontAwesome is loaded
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        detectedObjects.forEach(obj => {
            // Logic: If this instrument is part of the beat, it pulses heavily
            // If not, it just glows slightly
            
            let scale = 1;
            
            // Check if this object contributes to the active beat
            let contributes = false;
            if ((obj.type === 'drum' || obj.type === 'bass') && activeBeats.kick) contributes = true;
            if (obj.type === 'cello' && activeBeats.snare) contributes = true;
            if (obj.type === 'flute' && activeBeats.hihat) contributes = true;

            if (contributes) {
                // Sync with global beat pulse
                scale = 1 + (globalPulse * 0.3); 
            }

            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.scale(scale, scale);
            
            // Glow Effect
            ctx.shadowBlur = 20 + (globalPulse * 20);
            ctx.shadowColor = obj.color;
            ctx.fillStyle = obj.color;
            
            // Draw Icon
            ctx.fillText(ICONS[obj.type], 0, 0);
            
            ctx.restore();
        });

        // Decay the global pulse
        globalPulse *= 0.9; 

        requestAnimationFrame(animateCanvas);
    }

    function drawStroke(stroke) {
        if(stroke.x.length < 1) return;
        ctx.beginPath();
        ctx.moveTo(stroke.x[0], stroke.y[0]);
        for (let i = 1; i < stroke.x.length; i++) ctx.lineTo(stroke.x[i], stroke.y[i]);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = currentBrushSize;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 5;
        ctx.shadowColor = stroke.color;
        ctx.stroke();
    }

    // --- 5. BEAT LOOP ---
    function playDrumSample(type) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);
        const t = audioCtx.currentTime;

        if (type === 'kick') {
            // Visual Pulse Trigger
            globalPulse = 1.0; 
            
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
            gain.gain.setValueAtTime(1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t); osc.stop(t + 0.5);
        } else if (type === 'snare') {
            if (globalPulse < 0.5) globalPulse = 0.6; // Smaller visual pulse

            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t); osc.stop(t + 0.2);
        } else if (type === 'hihat') {
             if (globalPulse < 0.2) globalPulse = 0.3; // Tiny visual pulse

            osc.type = 'square';
            osc.frequency.setValueAtTime(8000, t);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
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

    function updateBeatStatus() {
        let text = "";
        if (activeBeats.kick) text += "Kick ";
        if (activeBeats.snare) text += "Snare ";
        if (activeBeats.hihat) text += "Hi-Hat ";
        if (text === "") text = "No Beats Active";
        beatStatus.innerText = text;
    }

    // --- UI EVENTS ---
    
    // Standard resize, mouse tracking...
    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        // No need to call redraw, animation loop handles it
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('mousedown', (e) => {
        initAudio();
        isDrawing = true;
        ctx.beginPath();
        const pos = getMousePos(e);
        if (currentMode === 'pencil') currentStroke = { x: [pos.x], y: [pos.y], color: currentColor };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getMousePos(e);
        if (currentMode === 'pencil') {
            currentStroke.x.push(pos.x);
            currentStroke.y.push(pos.y);
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentMode === 'pencil' && currentStroke.x.length > 0) {
            analyzeAndPlay(currentStroke); // This converts it to an object
            // We do NOT push to rawStrokes here if analyzed successfully
            // If you wanted to keep unrecognized shapes as lines, you'd add logic here.
            // For now, we assume everything transforms.
            currentStroke = { x: [], y: [], color: currentColor };
        }
    });

    // Clear Button
    clearBtn.addEventListener('click', () => {
        detectedObjects = [];
        rawStrokes = [];
        activeBeats = { kick: false, snare: false, hihat: false }; 
        updateBeatStatus();
        statusMsg.innerText = "System Wipe Complete";
    });

    // Stop Beats
    stopBeatsBtn.addEventListener('click', () => {
        activeBeats = { kick: false, snare: false, hihat: false };
        updateBeatStatus();
    });

    // Color Selection
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

    // Recording Logic (Kept from previous)
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
                    a.download = 'sketch_synth_track.webm';
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
    
    // Sliders
    bpmSlider.addEventListener('input', (e) => {
        currentBPM = parseInt(e.target.value);
        bpmLabel.innerText = currentBPM;
        if (audioCtx) startBeatLoop();
    });
    echoToggle.addEventListener('change', (e) => echoActive = e.target.checked);
    brushSlider.addEventListener('input', (e) => currentBrushSize = e.target.value);
    
    pencilBtn.addEventListener('click', () => { currentMode = 'pencil'; pencilBtn.classList.add('active'); eraserBtn.classList.remove('active'); });
    eraserBtn.addEventListener('click', () => { currentMode = 'eraser'; eraserBtn.classList.add('active'); pencilBtn.classList.remove('active'); });
});