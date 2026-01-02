const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const hudPoints = document.getElementById('hud-points');
const hudSpeed = document.getElementById('hud-speed');
const hudCenter = document.getElementById('hud-center');
const hudAudio = document.getElementById('hud-audio');
const recordBtn = document.getElementById('record-btn');
const recInd = document.getElementById('rec-ind');
const resetBtn = document.getElementById('reset-btn');
const toggleHudBtn = document.getElementById('toggle-hud');

const audioFileInput = document.getElementById('audio-file');
const audioPlayerWrap = document.getElementById('audio-player-wrap');
const audioStatus = document.getElementById('audio-status');
const volumeSlider = document.getElementById('volume-slider');

const pointsSlider = document.getElementById('points-slider');
const speedSlider = document.getElementById('speed-slider');
const centerXSlider = document.getElementById('centerX-slider');
const centerYSlider = document.getElementById('centerY-slider');

let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 600, H = 600;
function resize() {
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const size = Math.min(window.innerWidth, window.innerHeight) * 0.92;
  W = Math.round(size); H = Math.round(size);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
resize();

const config = {
  centerX: 0.5,
  centerY: 0.5,
  points: 200,
  speed: 0.05,
  baseRadiusFactor: 0.06,
  spacing: 0.6,
  pointSize: 4,
  fadeAlpha: 0.12
};

let angle = 0;
let lastTime = 0;
let running = true;

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let gainNode = null;
let destNode = null; 
let freqData = null;
let audioElement = null;
let audioEnabled = false;

async function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  if (!gainNode) {
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 1;
  }

  if (!destNode) {
    destNode = audioCtx.createMediaStreamDestination();
  }

  try {
    try { analyser.disconnect(); } catch (e) {  }
    analyser.connect(audioCtx.destination);
    try { analyser.connect(destNode); } catch (e) {  }
  } catch (err) {
    console.warn('ensureAudio connect error', err);
  }
}

function updateHUD() {
  hudPoints.textContent = config.points;
  hudSpeed.textContent = config.speed.toFixed(3);
  hudCenter.textContent = `${config.centerX.toFixed(2)}, ${config.centerY.toFixed(2)}`;
}

function safeDisconnect(node) {
  if (!node) return;
  try { node.disconnect(); } catch (e) {  }
}

function attachSourceFromElement(el) {
  if (!audioCtx) return null;
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) {  }
    sourceNode = null;
  }

  try {
    sourceNode = audioCtx.createMediaElementSource(el);
  } catch (err) {
    console.warn('createMediaElementSource failed', err);
    sourceNode = null;
    return null;
  }

  try {
    safeDisconnect(gainNode);
    safeDisconnect(analyser);
    sourceNode.connect(gainNode);
    gainNode.connect(analyser);
    try { analyser.connect(audioCtx.destination); } catch (e) {  }
    try { analyser.connect(destNode); } catch (e) {  }
  } catch (err) {
    console.warn('attachSourceFromElement connect error', err);
  }

  return sourceNode;
}

audioFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (audioElement) {
    try { audioElement.pause(); audioElement.src = ''; audioElement.remove(); } catch (e) {  }
    audioElement = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (e) {  }
    sourceNode = null;
  }
  audioEnabled = false;

  audioElement = document.createElement('audio');
  audioElement.controls = true;
  audioElement.className = 'audio-player';
  audioElement.src = URL.createObjectURL(file);
  audioElement.crossOrigin = 'anonymous';
  audioPlayerWrap.innerHTML = '';
  audioPlayerWrap.appendChild(audioElement);
  audioStatus.textContent = `Loaded: ${file.name}`;

  await ensureAudio();

  const attached = attachSourceFromElement(audioElement);
  if (!attached) {
    audioStatus.textContent = `Loaded: ${file.name} (analyzer unavailable)`;
    audioEnabled = false;
  } else {
    audioEnabled = true;
  }

  audioElement.volume = volumeSlider.value / 100;

  try {
    if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
    await audioElement.play();
    audioStatus.textContent = `Playing: ${file.name}`;
  } catch (err) {
    audioStatus.textContent = `Loaded: ${file.name} (tap play)`;
    console.warn('audio play error', err);
  }
});

volumeSlider.addEventListener('input', () => {
  const vol = volumeSlider.value / 100;
  if (audioElement) {
    audioElement.volume = vol;
  }
  if (gainNode) gainNode.gain.value = vol;
});

function getAudioLevel() {
  if (!analyser || !freqData) return 0;
  analyser.getByteFrequencyData(freqData);
  const start = Math.floor(freqData.length * 0.02);
  const end = Math.floor(freqData.length * 0.25);
  let sum = 0;
  for (let i = start; i < end; i++) sum += freqData[i];
  const avg = sum / Math.max(1, (end - start));
  return avg / 255;
}

function drawRadial(audioLevel) {
  const cx = W * config.centerX;
  const cy = H * config.centerY;
  const base = Math.min(W, H) * config.baseRadiusFactor;
  const radiusBase = base + audioLevel * Math.min(W, H) * 0.12;
  const points = config.points;
  const angleStep = (Math.PI * 8) / Math.max(120, points);
  for (let i = 0; i < points; i++) {
    const a = angle + i * angleStep;
    const r = radiusBase + i * config.spacing;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const hue = (i * 360 / points + audioLevel * 120) % 360;
    ctx.fillStyle = `hsl(${hue},82%,60%)`;
    const s = config.pointSize * (1 - i / (points * 1.2));
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
}

function draw(now) {
  if (!lastTime) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  ctx.fillStyle = `rgba(0,0,0,${config.fadeAlpha})`;
  ctx.fillRect(0, 0, W, H);

  let audioLevel = 0;
  if (audioEnabled && analyser) audioLevel = getAudioLevel();
  hudAudio.textContent = audioLevel.toFixed(2);

  drawRadial(audioLevel);

  const speedBoost = 1 + audioLevel * 2.5;
  angle += config.speed * speedBoost * dt * 60;

  updateHUD();
  if (running) requestAnimationFrame(draw);
}

let lastTap = 0;
const touchState = {
  dragging: false, dragId: null, startX: 0, startY: 0,
  startCenterX: 0, startCenterY: 0, pinch: false, pinchDist: 0,
  pinchPointsStart: 0, twoFingerStartY: null
};

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1) {
    const t = touches[0];
    const now = performance.now();
    if (now - lastTap < 300) document.getElementById('hud').classList.toggle('hidden');
    lastTap = now;
    touchState.dragging = true; touchState.dragId = t.identifier;
    touchState.startX = t.clientX; touchState.startY = t.clientY;
    touchState.startCenterX = config.centerX; touchState.startCenterY = config.centerY;
  } else if (touches.length === 2) {
    touchState.pinch = true;
    const a = touches[0], b = touches[1];
    touchState.pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    touchState.pinchPointsStart = config.points;
    touchState.twoFingerStartY = (a.clientY + b.clientY) / 2;
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1 && touchState.dragging) {
    const t = touches[0];
    if (t.identifier !== touchState.dragId) return;
    const dx = t.clientX - touchState.startX;
    const dy = t.clientY - touchState.startY;
    const rect = canvas.getBoundingClientRect();
    config.centerX = Math.max(0.05, Math.min(0.95, touchState.startCenterX + dx / rect.width));
    config.centerY = Math.max(0.05, Math.min(0.95, touchState.startCenterY + dy / rect.height));

    centerXSlider.value = config.centerX;
    centerYSlider.value = config.centerY;
  } else if (touches.length === 2 && touchState.pinch) {
    const a = touches[0], b = touches[1];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = d / (touchState.pinchDist || d);
    config.points = Math.round(Math.max(40, Math.min(1200, touchState.pinchPointsStart * ratio)));
    pointsSlider.value = config.points;
    const midY = (a.clientY + b.clientY) / 2;
    const dy = midY - touchState.twoFingerStartY;
    config.speed = Math.max(0.005, Math.min(2, 0.05 + (-dy / 300)));
    speedSlider.value = config.speed;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 0) {
    touchState.dragging = false; touchState.dragId = null; touchState.pinch = false; touchState.twoFingerStartY = null;
  } else if (touches.length === 1) {
    const t = touches[0];
    touchState.dragging = true; touchState.dragId = t.identifier;
    touchState.startX = t.clientX; touchState.startY = t.clientY;
    touchState.startCenterX = config.centerX; touchState.startCenterY = config.centerY;
    touchState.pinch = false;
  }
}, { passive: false });

let mouseState = { dragging: false, startX: 0, startY: 0, startCenterX: 0, startCenterY: 0 };

canvas.addEventListener('mousedown', (e) => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {  });
  }
  mouseState.dragging = true;
  mouseState.startX = e.clientX; mouseState.startY = e.clientY;
  mouseState.startCenterX = config.centerX; mouseState.startCenterY = config.centerY;
});

window.addEventListener('mousemove', (e) => {
  if (!mouseState.dragging) return;
  const dx = e.clientX - mouseState.startX;
  const dy = e.clientY - mouseState.startY;
  const rect = canvas.getBoundingClientRect();
  config.centerX = Math.max(0.05, Math.min(0.95, mouseState.startCenterX + dx / rect.width));
  config.centerY = Math.max(0.05, Math.min(0.95, mouseState.startCenterY + dy / rect.height));
  centerXSlider.value = config.centerX;
  centerYSlider.value = config.centerY;
});

window.addEventListener('mouseup', () => { mouseState.dragging = false; });

canvas.addEventListener('click', async () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch (e) {  }
  }
  if (audioElement && audioElement.paused) {
    try { await audioElement.play(); audioStatus.textContent = 'Playing'; } catch (e) { audioStatus.textContent = 'Tap play on audio player'; }
  }
  running = !running;
  if (running) { lastTime = 0; requestAnimationFrame(draw); }
});

canvas.addEventListener('dblclick', () => {
  const hud = document.getElementById('hud');
  const audioRow = document.getElementById('audio-row');
  const hint = document.querySelector('.hint');

  const hidden = !hud.classList.contains('hidden');
  hud.classList.toggle('hidden', hidden);
  audioRow.classList.toggle('hidden', hidden);
  hint.classList.toggle('hidden', hidden);
});

window.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) return;
  config.points = Math.max(40, Math.min(1200, config.points + Math.sign(e.deltaY) * 10));
  pointsSlider.value = config.points;
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); running = !running; if (running) { lastTime = 0; requestAnimationFrame(draw); } }
  if (e.key === 'r') {
    config.points = 200; config.speed = 0.05; config.centerX = 0.5; config.centerY = 0.5; angle = 0;
    pointsSlider.value = config.points; speedSlider.value = config.speed; centerXSlider.value = config.centerX; centerYSlider.value = config.centerY;
    updateHUD();
  }
  if (e.key === 'ArrowUp') { config.speed = Math.min(2, config.speed + 0.01); speedSlider.value = config.speed; }
  if (e.key === 'ArrowDown') { config.speed = Math.max(0, config.speed - 0.01); speedSlider.value = config.speed; }
});

let mediaRecorder = null;
let recordedBlobs = [];
let recordingTimeout = null;

async function ensureAudioForRecording() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (!destNode) destNode = audioCtx.createMediaStreamDestination();
  try {
    try { analyser.disconnect(); } catch (e) {  }
    analyser.connect(audioCtx.destination);
    try { analyser.connect(destNode); } catch (e) {  }
  } catch (err) {
    console.warn('ensureAudioForRecording connect error', err);
  }
}

function startRecording(durationMs = 5000) {
  ensureAudioForRecording().then(() => {
    const canvasStream = canvas.captureStream(60);
    let audioTracks = [];
    if (audioElement && audioElement.captureStream) {
      try {
        const aStream = audioElement.captureStream();
        if (aStream && aStream.getAudioTracks().length) audioTracks = aStream.getAudioTracks();
      } catch (e) {  }
    }

    if (audioTracks.length === 0 && destNode && destNode.stream) audioTracks = destNode.stream.getAudioTracks();

    const combined = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
    audioTracks.forEach(t => combined.addTrack(t));

    recordedBlobs = [];
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8' };
    try {
      mediaRecorder = new MediaRecorder(combined, options);
    } catch (err) {
      try { mediaRecorder = new MediaRecorder(combined); } catch (e) { console.error('MediaRecorder not supported', e); return; }
    }
    mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) recordedBlobs.push(ev.data); };
    mediaRecorder.onstop = () => {
      recInd.classList.remove('recording');
      if (!recordedBlobs.length) return;
      const blob = new Blob(recordedBlobs, { type: recordedBlobs[0]?.type || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.style.display = 'none'; a.href = url;
      a.download = `radial_visual_${Date.now()}.webm`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    };
    mediaRecorder.start();
    recInd.classList.add('recording');
    recordingTimeout = setTimeout(() => stopRecording(), durationMs);
  }).catch(err => {
    console.warn('startRecording error', err);
  });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
}


recordBtn.addEventListener('click', () => {
  recordBtn.disabled = true;
  startRecording(5000);
  setTimeout(() => { recordBtn.disabled = false; }, 5200);
});

resetBtn.addEventListener('click', () => {

  config.points = 200;
  config.speed = 0.05;
  config.centerX = 0.5;
  config.centerY = 0.5;
  angle = 0;


  pointsSlider.value = 200;
  speedSlider.value = 0.05;
  centerXSlider.value = 0.5;
  centerYSlider.value = 0.5;


  updateHUD();
});


toggleHudBtn.addEventListener('click', () => {
  const hud = document.getElementById('hud');
  const audioRow = document.getElementById('audio-row');
  const hint = document.querySelector('.hint');

  const hidden = hud.classList.toggle('hidden');
  audioRow.classList.toggle('hidden', hidden);
  hint.classList.toggle('hidden', hidden);
});


const collapseHudBtn = document.getElementById('collapse-hud');
if (collapseHudBtn) {
  collapseHudBtn.addEventListener('click', () => {
    const hudEl = document.getElementById('hud');
    hudEl.classList.toggle('collapsed');
    collapseHudBtn.setAttribute('aria-pressed', hudEl.classList.contains('collapsed'));
  });
}
const collapseAudioBtn = document.getElementById('collapse-audio');
if (collapseAudioBtn) {
  collapseAudioBtn.addEventListener('click', () => {
    const audioEl = document.getElementById('audio-row');
    audioEl.classList.toggle('collapsed');
    collapseAudioBtn.setAttribute('aria-pressed', audioEl.classList.contains('collapsed'));
  });
}

pointsSlider.addEventListener('input', () => {
  config.points = parseInt(pointsSlider.value, 10);
  hudPoints.textContent = config.points;
});
speedSlider.addEventListener('input', () => {
  config.speed = parseFloat(speedSlider.value);
  hudSpeed.textContent = config.speed.toFixed(3);
});
centerXSlider.addEventListener('input', () => {
  config.centerX = parseFloat(centerXSlider.value);
  hudCenter.textContent = `${config.centerX.toFixed(2)}, ${config.centerY.toFixed(2)}`;
});
centerYSlider.addEventListener('input', () => {
  config.centerY = parseFloat(centerYSlider.value);
  hudCenter.textContent = `${config.centerX.toFixed(2)}, ${config.centerY.toFixed(2)}`;
});

updateHUD();
requestAnimationFrame(draw);