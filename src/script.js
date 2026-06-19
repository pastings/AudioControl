const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const lockToggle = document.getElementById('lock-toggle');
const lockIcon = document.getElementById('lock-icon');
const settingsToggle = document.getElementById('settings-toggle');
const widgetContainer = document.getElementById('widget-container');
const playerInterface = document.getElementById('player-interface');
const configInterface = document.getElementById('config-interface');
const swatches = document.querySelectorAll('.color-swatch');

const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const playIcon = document.getElementById('play-icon');

const trackTitleEl = document.getElementById('track-title');
const trackArtistEl = document.getElementById('track-artist');
const albumArtEl = document.getElementById('album-art');
const albumFallbackEl = document.getElementById('album-fallback');

let isLocked = false;
let isConfigOpen = false;
let isPlaying = false; 
let flatlineTimeout = null;

const root = document.documentElement;
const savedColor = localStorage.getItem('ac-color') || '#ffffff';
const savedGlow = localStorage.getItem('ac-glow') || 'rgba(255, 255, 255, 0.4)';

root.style.setProperty('--accent', savedColor);
root.style.setProperty('--accent-glow', savedGlow);

swatches.forEach(swatch => {
    if(swatch.dataset.hex === savedColor) swatch.classList.add('active');
});

settingsToggle.addEventListener('click', () => {
    isConfigOpen = !isConfigOpen;
    playerInterface.classList.toggle('active', !isConfigOpen);
    configInterface.classList.toggle('active', isConfigOpen);
    settingsToggle.classList.toggle('active', isConfigOpen);
});

lockToggle.addEventListener('click', () => {
    isLocked = !isLocked;
    widgetContainer.classList.toggle('locked', isLocked);
    lockIcon.className = isLocked ? 'ri-lock-fill' : 'ri-lock-unlock-line';
});

swatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        const hex = e.target.dataset.hex;
        const glow = e.target.dataset.glow;
        root.style.setProperty('--accent', hex);
        root.style.setProperty('--accent-glow', glow);
        localStorage.setItem('ac-color', hex);
        localStorage.setItem('ac-glow', glow);
        swatches.forEach(s => s.classList.remove('active'));
        e.target.classList.add('active');
    });
});

const VK_MEDIA_NEXT_TRACK = 176;
const VK_MEDIA_PREV_TRACK = 177;
const VK_MEDIA_PLAY_PAUSE = 179;

function triggerOSMedia(keyCode) {
    const command = `powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys([char]${keyCode})"`;
    exec(command, (error) => {
        if (error) console.error(error);
    });
}

btnPlay.addEventListener('click', () => {
    triggerOSMedia(VK_MEDIA_PLAY_PAUSE);
    btnPlay.style.transform = 'scale(0.92)';
    setTimeout(() => btnPlay.style.transform = 'scale(1)', 100);
});

btnNext.addEventListener('click', () => {
    triggerOSMedia(VK_MEDIA_NEXT_TRACK);
    btnNext.style.color = '#ffffff';
    setTimeout(() => btnNext.style.color = '', 150);
});

btnPrev.addEventListener('click', () => {
    triggerOSMedia(VK_MEDIA_PREV_TRACK);
    btnPrev.style.color = '#ffffff';
    setTimeout(() => btnPrev.style.color = '', 150);
});

const canvas = document.getElementById('audio-canvas');
const ctx = canvas.getContext('2d');

canvas.width = 140 * window.devicePixelRatio;
canvas.height = 24 * window.devicePixelRatio;
ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

let audioContext;
let analyser;
let dataArray;

async function initVisualizer() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64; 
        analyser.smoothingTimeConstant = 0.8; 
        source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        drawVisualizer();
    } catch (err) {
        drawIdleState();
    }
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);
    
    ctx.clearRect(0, 0, 140, 24);
    
    const barWidth = 4;
    const gap = 2;
    const totalBars = Math.floor(140 / (barWidth + gap));
    
    const computedStyle = getComputedStyle(document.documentElement);
    const themeColor = computedStyle.getPropertyValue('--accent').trim();
    
    let isCurrentlyMakingSound = false;
    
    for (let i = 0; i < totalBars; i++) {
        const dataIndex = Math.floor(i * (dataArray.length / totalBars));
        const value = dataArray[dataIndex];
        
        if (value > 8) {
            isCurrentlyMakingSound = true;
        }
        
        const percent = value / 255;
        const barHeight = Math.max(2, percent * 24); 
        
        const x = i * (barWidth + gap);
        const y = 12 - (barHeight / 2); 
        
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
    }
    
    if (isCurrentlyMakingSound) {
        isPlaying = true;
        playIcon.className = 'ri-pause-mini-fill';
        if (flatlineTimeout) {
            clearTimeout(flatlineTimeout);
            flatlineTimeout = null;
        }
    } else {
        if (!flatlineTimeout && isPlaying) {
            flatlineTimeout = setTimeout(() => {
                isPlaying = false;
                playIcon.className = 'ri-play-mini-fill';
            }, 800);
        }
    }
}

function drawIdleState() {
    ctx.clearRect(0, 0, 140, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(0, 11, 140, 2, 1);
    ctx.fill();
}

const tempCoverPath = path.join(process.env.TEMP || process.env.TMPDIR, 'ac_art.png').replace(/\\/g, '\\\\');

const metaCommand = `powershell -Command "[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control.Provider,ContentType=WindowsRuntime]; $mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetResults(); $session = $mgr.GetCurrentSession(); if ($session) { $props = $session.TryGetMediaPropertiesAsync().GetResults(); if ($props) { $thumb = $props.Thumbnail; $hasArt = 'false'; if ($thumb) { $stream = $thumb.OpenReadAsync().GetResults(); $reader = New-Object Windows.Storage.Streams.DataReader($stream); [void]$reader.LoadAsync($stream.Size).GetResults(); $bytes = New-Object Byte[] $stream.Size; $reader.ReadBytes($bytes); [System.IO.File]::WriteAllBytes('${tempCoverPath}', $bytes); $hasArt = 'true'; }; @{Title=$props.Title; Artist=$props.Artist; HasArt=$hasArt} | ConvertTo-Json -Compress } } else { @{Title='AUDIOCONTROL'; Artist='GLOBAL MUSIC CONTROL'; HasArt='false'} | ConvertTo-Json -Compress }"`;

function updateTrackMetadata() {
    exec(metaCommand, (error, stdout) => {
        if (error) return;
        try {
            const data = JSON.parse(stdout.trim());
            trackTitleEl.textContent = data.Title || "AUDIOCONTROL";
            trackArtistEl.textContent = data.Artist || "GLOBAL MUSIC CONTROL";
            if (data.HasArt === 'true' && fs.existsSync(tempCoverPath)) {
                const fileBuffer = fs.readFileSync(tempCoverPath);
                albumArtEl.src = `data:image/png;base64,${fileBuffer.toString('base64')}`;
                albumArtEl.classList.remove('hidden');
                albumFallbackEl.style.display = 'none';
            } else {
                albumArtEl.classList.add('hidden');
                albumFallbackEl.style.display = 'block';
            }
        } catch (e) {
            trackTitleEl.textContent = "AUDIOCONTROL";
            trackArtistEl.textContent = "GLOBAL MUSIC CONTROL";
            albumArtEl.classList.add('hidden');
            albumFallbackEl.style.display = 'block';
        }
    });
}

setInterval(updateTrackMetadata, 2000);
window.addEventListener('DOMContentLoaded', () => {
    initVisualizer();
    updateTrackMetadata();
});