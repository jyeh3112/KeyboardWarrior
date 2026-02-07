// ============================================
// KEYMAGEDDON - Main Game File
// ============================================

// Canvas setup - fixed size, CSS scales to fit
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1920;
canvas.height = 1080;

// ============================================
// GLOBAL LEADERBOARD SYSTEM (Firebase)
// ============================================

const MAX_LEADERBOARD_ENTRIES = 10;

// Cache for leaderboard data (loaded from Firebase)
let leaderboardCache = {
    music: [],
    typing: []
};

// Flag to track if Firebase is available
let firebaseAvailable = typeof firebase !== 'undefined' && firebase.database;

// Get Firebase database path for leaderboard
function getLeaderboardPath(mode) {
    return `leaderboards/${mode}`;
}

// Fetch leaderboard from Firebase (async)
async function fetchLeaderboardFromFirebase(mode = 'music') {
    if (!firebaseAvailable) return [];
    
    try {
        const snapshot = await database.ref(getLeaderboardPath(mode))
            .orderByChild('score')
            .limitToLast(MAX_LEADERBOARD_ENTRIES)
            .once('value');
        
        const data = snapshot.val();
        if (!data) return [];
        
        // Convert object to array and sort by score descending
        const leaderboard = Object.values(data).sort((a, b) => b.score - a.score);
        
        // Update cache
        leaderboardCache[mode] = leaderboard;
        return leaderboard;
    } catch (e) {
        console.warn('Could not fetch leaderboard from Firebase:', e);
        return leaderboardCache[mode] || [];
    }
}

// Get cached leaderboard (synchronous, for immediate display)
function getLeaderboard(mode = 'music') {
    return leaderboardCache[mode] || [];
}

// Add score to Firebase leaderboard
async function addToLeaderboardAsync(name, score, wave, maxCombo, mode = 'music', difficulty = 'normal') {
    const entry = {
        name: (name || '').trim().substring(0, 12) || 'ANONYMOUS',
        score: score,
        wave: wave,
        maxCombo: maxCombo,
        difficulty: difficulty,
        date: Date.now()
    };
    
    if (!firebaseAvailable) {
        // Fallback: just update local cache
        leaderboardCache[mode].push(entry);
        leaderboardCache[mode].sort((a, b) => b.score - a.score);
        leaderboardCache[mode] = leaderboardCache[mode].slice(0, MAX_LEADERBOARD_ENTRIES);
        return leaderboardCache[mode];
    }
    
    try {
        // Add to Firebase
        const newRef = database.ref(getLeaderboardPath(mode)).push();
        await newRef.set(entry);
        
        // Fetch updated leaderboard
        const leaderboard = await fetchLeaderboardFromFirebase(mode);
        
        // Clean up: remove entries beyond top 10
        const snapshot = await database.ref(getLeaderboardPath(mode))
            .orderByChild('score')
            .once('value');
        
        const allData = snapshot.val();
        if (allData) {
            const allEntries = Object.entries(allData)
                .map(([key, value]) => ({ key, ...value }))
                .sort((a, b) => b.score - a.score);
            
            // Remove entries beyond MAX_LEADERBOARD_ENTRIES
            for (let i = MAX_LEADERBOARD_ENTRIES; i < allEntries.length; i++) {
                await database.ref(`${getLeaderboardPath(mode)}/${allEntries[i].key}`).remove();
            }
        }
        
        return leaderboard;
    } catch (e) {
        console.warn('Could not save to Firebase:', e);
        // Fallback to cache
        leaderboardCache[mode].push(entry);
        leaderboardCache[mode].sort((a, b) => b.score - a.score);
        leaderboardCache[mode] = leaderboardCache[mode].slice(0, MAX_LEADERBOARD_ENTRIES);
        return leaderboardCache[mode];
    }
}

// Synchronous wrapper for backward compatibility
function addToLeaderboard(name, score, wave, maxCombo, mode = 'music', difficulty = 'normal') {
    // Fire async operation but don't wait
    addToLeaderboardAsync(name, score, wave, maxCombo, mode, difficulty);
    
    // Immediately update local cache for display
    const entry = {
        name: (name || '').trim().substring(0, 12) || 'ANONYMOUS',
        score: score,
        wave: wave,
        maxCombo: maxCombo,
        difficulty: difficulty,
        date: Date.now()
    };
    
    leaderboardCache[mode].push(entry);
    leaderboardCache[mode].sort((a, b) => b.score - a.score);
    leaderboardCache[mode] = leaderboardCache[mode].slice(0, MAX_LEADERBOARD_ENTRIES);
    
    return leaderboardCache[mode];
}

// Check if score qualifies for leaderboard
function getLeaderboardPosition(score, mode = 'music') {
    const leaderboard = getLeaderboard(mode);
    
    // Find where this score would rank
    for (let i = 0; i < leaderboard.length; i++) {
        if (score > leaderboard[i].score) {
            return i + 1; // 1-indexed position
        }
    }
    
    // If leaderboard isn't full, player makes it
    if (leaderboard.length < MAX_LEADERBOARD_ENTRIES) {
        return leaderboard.length + 1;
    }
    
    return -1; // Didn't make leaderboard
}

// Initialize: fetch leaderboards from Firebase on load
async function initializeLeaderboards() {
    if (firebaseAvailable) {
        console.log('Loading global leaderboards from Firebase...');
        await Promise.all([
            fetchLeaderboardFromFirebase('music'),
            fetchLeaderboardFromFirebase('typing')
        ]);
        console.log('Leaderboards loaded!');
    }
}

// Call initialization
initializeLeaderboards();

// Difficulty colors for leaderboard display
const DIFFICULTY_COLORS = {
    'easy': '#4dff88',
    'normal': '#4dffff',
    'hard': '#ffa94d',
    'crazy': '#ff4444'
};

const DIFFICULTY_LABELS = {
    'easy': 'EASY',
    'normal': 'NORMAL',
    'hard': 'HARD',
    'crazy': 'CRAZY!'
};

function displayLeaderboardList(listElement, leaderboard, highlightScore = -1) {
    if (!listElement) return;
    
    listElement.innerHTML = '';
    
    if (leaderboard.length === 0) {
        listElement.innerHTML = '<li style="justify-content: center; color: #666;">No scores yet!</li>';
        return;
    }
    
    leaderboard.forEach((entry, index) => {
        const li = document.createElement('li');
        const isHighlight = (entry.score === highlightScore);
        
        if (isHighlight) {
            li.classList.add('highlight');
        }
        
        // Get difficulty info (default to 'normal' for old entries)
        const diff = entry.difficulty || 'normal';
        const diffColor = DIFFICULTY_COLORS[diff] || DIFFICULTY_COLORS['normal'];
        const diffLabel = DIFFICULTY_LABELS[diff] || 'NORMAL';
        
        li.innerHTML = `
            <span class="rank">${index + 1}.</span>
            <span class="name">${escapeHtml(entry.name)}</span>
            <span class="difficulty" style="color: ${diffColor}; text-shadow: 0 0 5px ${diffColor};">${diffLabel}</span>
            <span class="score">${entry.score.toLocaleString()}</span>
        `;
        
        listElement.appendChild(li);
    });
}

async function displayLeaderboards(highlightScore = -1) {
    const currentMode = gameState.gameMode || 'music';
    const otherMode = currentMode === 'music' ? 'typing' : 'music';
    
    // Refresh from Firebase first
    if (firebaseAvailable) {
        await Promise.all([
            fetchLeaderboardFromFirebase(currentMode),
            fetchLeaderboardFromFirebase(otherMode)
        ]);
    }
    
    // Get leaderboards for both modes (from cache)
    const currentLeaderboard = getLeaderboard(currentMode);
    const otherLeaderboard = getLeaderboard(otherMode);
    
    // Display main (current mode) leaderboard
    const mainList = document.getElementById('leaderboard-main-list');
    const mainTitle = document.getElementById('leaderboard-main-title');
    if (mainTitle) {
        mainTitle.textContent = currentMode === 'music' ? '🎹 MUSIC MODE - GLOBAL' : '⌨️ TYPING MODE - GLOBAL';
    }
    displayLeaderboardList(mainList, currentLeaderboard, highlightScore);
    
    // Display secondary (other mode) leaderboard
    const secondaryList = document.getElementById('leaderboard-secondary-list');
    const secondaryTitle = document.getElementById('leaderboard-secondary-title');
    if (secondaryTitle) {
        secondaryTitle.textContent = otherMode === 'music' ? '🎹 MUSIC MODE - GLOBAL' : '⌨️ TYPING MODE - GLOBAL';
    }
    displayLeaderboardList(secondaryList, otherLeaderboard, -1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let pendingScore = null; // Store score waiting for name entry

// ============================================
// AUDIO SYSTEM - Piano Notes & Music
// ============================================

let audioContext = null;
let musicPlaying = false;
let backgroundMusic = null;
const NOTE_FREQUENCIES = {
    'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
    'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
};

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playAudioNote(note, duration = 0.3) {
    if (!audioContext) return;
    
    // Handle notes with octave (e.g., "C4" -> "C" with octave adjustment)
    const baseNote = getBaseNoteName(note);
    const octaveMatch = note.match(/(\d+)$/);
    const octave = octaveMatch ? parseInt(octaveMatch[1]) : 4;
    
    let freq = NOTE_FREQUENCIES[baseNote];
    if (!freq) return;
    
    // Adjust frequency for octave (4 is the reference octave)
    freq = freq * Math.pow(2, octave - 4);
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Piano-like tone (combination of waves)
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    
    // ADSR envelope for piano-like sound
    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.35, now + 0.1); // Decay
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration); // Release
    
    oscillator.start(now);
    oscillator.stop(now + duration);
}

// ============================================
// SOUND EFFECTS
// ============================================

function playLaserSound(note) {
    if (!audioContext) return;
    
    // Handle notes with octave (e.g., "C4")
    const baseNoteName = getBaseNoteName(note);
    // Get the base frequency from the note - use lower octave for deeper sound
    const baseFreq = (NOTE_FREQUENCIES[baseNoteName] || 440) / 2;
    
    const now = audioContext.currentTime;
    
    // Deep bass thump oscillator
    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bassOsc.connect(bassGain);
    bassGain.connect(audioContext.destination);
    
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(baseFreq * 0.5, now);
    bassOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.25, now + 0.2);
    
    bassGain.gain.setValueAtTime(0.7, now);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    
    bassOsc.start(now);
    bassOsc.stop(now + 0.25);
    
    // Mid punch oscillator 
    const midOsc = audioContext.createOscillator();
    const midGain = audioContext.createGain();
    const midFilter = audioContext.createBiquadFilter();
    midOsc.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(audioContext.destination);
    
    midOsc.type = 'sawtooth';
    midOsc.frequency.setValueAtTime(baseFreq, now);
    midOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.15);
    
    midFilter.type = 'lowpass';
    midFilter.frequency.setValueAtTime(baseFreq * 4, now);
    midFilter.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.1);
    
    midGain.gain.setValueAtTime(0.5, now);
    midGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    midOsc.start(now);
    midOsc.stop(now + 0.2);
    
    // Attack click/transient for impact
    const clickOsc = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    clickOsc.connect(clickGain);
    clickGain.connect(audioContext.destination);
    
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(baseFreq * 2, now);
    clickOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.05);
    
    clickGain.gain.setValueAtTime(0.6, now);
    clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    
    clickOsc.start(now);
    clickOsc.stop(now + 0.08);
    
    // Sub-bass rumble for extra weight
    const subOsc = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    subOsc.connect(subGain);
    subGain.connect(audioContext.destination);
    
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(40, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.15);
    
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    subOsc.start(now);
    subOsc.stop(now + 0.2);
}

function playImpactSound() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const noiseGain = audioContext.createGain();
    const oscillatorGain = audioContext.createGain();
    
    // Low thump
    oscillator.connect(oscillatorGain);
    oscillatorGain.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    
    oscillatorGain.gain.setValueAtTime(0.6, now);
    oscillatorGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    oscillator.start(now);
    oscillator.stop(now + 0.15);
    
    // Add noise burst for crunch
    const bufferSize = audioContext.sampleRate * 0.1;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    noiseGain.gain.setValueAtTime(0.35, now);
    noise.start(now);
}

function playHitSound() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Painful buzz
    oscillator.type = 'square';
    const now = audioContext.currentTime;
    oscillator.frequency.setValueAtTime(100, now);
    oscillator.frequency.setValueAtTime(80, now + 0.05);
    oscillator.frequency.setValueAtTime(60, now + 0.1);
    
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.linearRampToValueAtTime(0.6, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    oscillator.start(now);
    oscillator.stop(now + 0.2);
}

function playBossHitSound() {
    if (!audioContext) return;
    
    // Deep impact for boss
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    
    const now = audioContext.currentTime;
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(80, now);
    osc1.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(200, now);
    osc2.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
}

// ============================================
// BOSS CHARGING SOUND EFFECT
// ============================================

let bossChargingSound = null;

function startBossChargingSound() {
    if (!audioContext || bossChargingSound) return;
    
    const now = audioContext.currentTime;
    
    // Create the charging sound components
    const lowDrone = audioContext.createOscillator();
    const lowGain = audioContext.createGain();
    lowDrone.connect(lowGain);
    lowGain.connect(audioContext.destination);
    
    lowDrone.type = 'sine';
    lowDrone.frequency.setValueAtTime(40, now);
    
    lowGain.gain.setValueAtTime(0.05, now); // Start very soft
    
    const midTone = audioContext.createOscillator();
    const midGain = audioContext.createGain();
    midTone.connect(midGain);
    midGain.connect(audioContext.destination);
    
    midTone.type = 'triangle';
    midTone.frequency.setValueAtTime(80, now);
    
    midGain.gain.setValueAtTime(0.02, now);
    
    const highWhine = audioContext.createOscillator();
    const highGain = audioContext.createGain();
    const highFilter = audioContext.createBiquadFilter();
    highWhine.connect(highFilter);
    highFilter.connect(highGain);
    highGain.connect(audioContext.destination);
    
    highWhine.type = 'sawtooth';
    highWhine.frequency.setValueAtTime(200, now);
    
    highFilter.type = 'lowpass';
    highFilter.frequency.setValueAtTime(400, now);
    
    highGain.gain.setValueAtTime(0.01, now);
    
    lowDrone.start(now);
    midTone.start(now);
    highWhine.start(now);
    
    bossChargingSound = {
        lowDrone, lowGain,
        midTone, midGain,
        highWhine, highGain, highFilter,
        startTime: now
    };
}

function updateBossChargingSound(chargePercent) {
    if (!bossChargingSound || !audioContext) return;
    
    const now = audioContext.currentTime;
    const { lowDrone, lowGain, midTone, midGain, highWhine, highGain, highFilter } = bossChargingSound;
    
    // Increase volume and pitch as charge increases
    const intensity = Math.pow(chargePercent, 1.5); // Exponential growth
    
    // Low drone gets louder
    lowGain.gain.setTargetAtTime(0.05 + intensity * 0.35, now, 0.1);
    lowDrone.frequency.setTargetAtTime(40 + intensity * 30, now, 0.1);
    
    // Mid tone rises in pitch and volume
    midGain.gain.setTargetAtTime(0.02 + intensity * 0.25, now, 0.1);
    midTone.frequency.setTargetAtTime(80 + intensity * 120, now, 0.1);
    
    // High whine becomes more prominent near full charge
    const highIntensity = Math.max(0, (chargePercent - 0.4) * 1.67); // Kicks in after 40%
    highGain.gain.setTargetAtTime(0.01 + highIntensity * 0.2, now, 0.1);
    highWhine.frequency.setTargetAtTime(200 + intensity * 400, now, 0.1);
    highFilter.frequency.setTargetAtTime(400 + intensity * 1500, now, 0.1);
}

function stopBossChargingSound() {
    if (!bossChargingSound || !audioContext) return;
    
    const now = audioContext.currentTime;
    const { lowDrone, lowGain, midTone, midGain, highWhine, highGain } = bossChargingSound;
    
    // Quick fade out
    lowGain.gain.setTargetAtTime(0.001, now, 0.05);
    midGain.gain.setTargetAtTime(0.001, now, 0.05);
    highGain.gain.setTargetAtTime(0.001, now, 0.05);
    
    // Stop after fade
    setTimeout(() => {
        try {
            lowDrone.stop();
            midTone.stop();
            highWhine.stop();
        } catch (e) {}
    }, 100);
    
    bossChargingSound = null;
}

// ============================================
// BOSS ENTRANCE SOUND EFFECTS
// ============================================

function playBossEntranceSound() {
    if (!audioContext) return;
    
    try {
        const now = audioContext.currentTime;
        
        // Deep, ominous rumble that builds
        const rumble = audioContext.createOscillator();
        const rumbleGain = audioContext.createGain();
        rumble.type = 'sawtooth';
        rumble.frequency.setValueAtTime(35, now);
        rumble.frequency.linearRampToValueAtTime(50, now + 2);
        rumbleGain.gain.setValueAtTime(0, now);
        rumbleGain.gain.linearRampToValueAtTime(0.3, now + 0.5);
        rumbleGain.gain.linearRampToValueAtTime(0.4, now + 1.5);
        rumbleGain.gain.linearRampToValueAtTime(0, now + 3);
        
        const rumbleFilter = audioContext.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(100, now);
        
        rumble.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(audioContext.destination);
        rumble.start(now);
        rumble.stop(now + 3);
        
        // Eerie high tone
        const eerie = audioContext.createOscillator();
        const eerieGain = audioContext.createGain();
        eerie.type = 'sine';
        eerie.frequency.setValueAtTime(800, now);
        eerie.frequency.linearRampToValueAtTime(600, now + 2);
        eerieGain.gain.setValueAtTime(0, now);
        eerieGain.gain.linearRampToValueAtTime(0.08, now + 1);
        eerieGain.gain.linearRampToValueAtTime(0, now + 2.5);
        eerie.connect(eerieGain);
        eerieGain.connect(audioContext.destination);
        eerie.start(now);
        eerie.stop(now + 2.5);
        
        // Heartbeat-like thuds
        for (let i = 0; i < 4; i++) {
            const thud = audioContext.createOscillator();
            const thudGain = audioContext.createGain();
            const thudTime = now + 0.5 + i * 0.6;
            thud.type = 'sine';
            thud.frequency.setValueAtTime(60, thudTime);
            thud.frequency.exponentialRampToValueAtTime(30, thudTime + 0.15);
            thudGain.gain.setValueAtTime(0.35 + i * 0.05, thudTime);
            thudGain.gain.exponentialRampToValueAtTime(0.01, thudTime + 0.2);
            thud.connect(thudGain);
            thudGain.connect(audioContext.destination);
            thud.start(thudTime);
            thud.stop(thudTime + 0.25);
        }
    } catch (e) {
        console.error('Error playing boss entrance sound:', e);
    }
}

function playBossDeathSound() {
    if (!audioContext) return;
    
    try {
        const now = audioContext.currentTime;
        
        // Deep explosion
        const explosion = audioContext.createOscillator();
        const explosionGain = audioContext.createGain();
        explosion.type = 'sawtooth';
        explosion.frequency.setValueAtTime(100, now);
        explosion.frequency.exponentialRampToValueAtTime(20, now + 1.5);
        explosionGain.gain.setValueAtTime(0.5, now);
        explosionGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
        explosion.connect(explosionGain);
        explosionGain.connect(audioContext.destination);
        explosion.start(now);
        explosion.stop(now + 1.5);
        
        // White noise burst
        const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.8, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 2);
        }
        const noise = audioContext.createBufferSource();
        const noiseGain = audioContext.createGain();
        noise.buffer = noiseBuffer;
        noiseGain.gain.setValueAtTime(0.4, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        noise.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        noise.start(now);
        
        // Rising then falling tone (dramatic)
        const dramatic = audioContext.createOscillator();
        const dramaticGain = audioContext.createGain();
        dramatic.type = 'sine';
        dramatic.frequency.setValueAtTime(200, now);
        dramatic.frequency.linearRampToValueAtTime(600, now + 0.3);
        dramatic.frequency.exponentialRampToValueAtTime(50, now + 1.2);
        dramaticGain.gain.setValueAtTime(0.3, now);
        dramaticGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
        dramatic.connect(dramaticGain);
        dramaticGain.connect(audioContext.destination);
        dramatic.start(now);
        dramatic.stop(now + 1.2);
    } catch (e) {
        console.error('Error playing boss death sound:', e);
    }
}

function playBossRevealSound() {
    if (!audioContext) return;
    
    try {
        const now = audioContext.currentTime;
        
        // Big impact/boom
        const boom = audioContext.createOscillator();
        const boomGain = audioContext.createGain();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(80, now);
        boom.frequency.exponentialRampToValueAtTime(25, now + 0.4);
        boomGain.gain.setValueAtTime(0.6, now);
        boomGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        boom.connect(boomGain);
        boomGain.connect(audioContext.destination);
        boom.start(now);
        boom.stop(now + 0.5);
        
        // Dramatic rising tone
        const rise = audioContext.createOscillator();
        const riseGain = audioContext.createGain();
        rise.type = 'sawtooth';
        rise.frequency.setValueAtTime(100, now);
        rise.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        rise.frequency.exponentialRampToValueAtTime(200, now + 0.6);
        riseGain.gain.setValueAtTime(0.2, now);
        riseGain.gain.linearRampToValueAtTime(0.3, now + 0.15);
        riseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        
        const riseFilter = audioContext.createBiquadFilter();
        riseFilter.type = 'lowpass';
        riseFilter.frequency.setValueAtTime(300, now);
        riseFilter.frequency.linearRampToValueAtTime(1000, now + 0.3);
        
        rise.connect(riseFilter);
        riseFilter.connect(riseGain);
        riseGain.connect(audioContext.destination);
        rise.start(now);
        rise.stop(now + 0.6);
        
        // Shimmering high frequencies for the "reveal"
        const shimmer = audioContext.createOscillator();
        const shimmerGain = audioContext.createGain();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(1200, now + 0.1);
        shimmer.frequency.linearRampToValueAtTime(800, now + 0.8);
        shimmerGain.gain.setValueAtTime(0, now);
        shimmerGain.gain.linearRampToValueAtTime(0.15, now + 0.2);
        shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
        shimmer.connect(shimmerGain);
        shimmerGain.connect(audioContext.destination);
        shimmer.start(now + 0.1);
        shimmer.stop(now + 1);
        
        // White noise burst
        const bufferSize = audioContext.sampleRate * 0.3;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
        }
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = audioContext.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(1000, now);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        noise.start(now);
    } catch (e) {
        console.error('Error playing boss reveal sound:', e);
    }
}

// BOSS ATTACK SOUND EFFECTS
// ============================================

function playBossAttackSound(attackType) {
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    
    switch (attackType) {
        case 'meteor':
            playMeteorSound(now);
            break;
        case 'voidBeam':
            playVoidBeamSound(now);
            break;
        case 'iceSpike':
            playIceSpikeSound(now);
            break;
        case 'lightning':
            playLightningAttackSound(now);
            break;
        case 'blackHole':
            playBlackHoleSound(now);
            break;
        case 'laserBeam':
            playLaserBeamSound(now);
            break;
        case 'toxicCloud':
            playToxicCloudSound(now);
            break;
        case 'bloodOrb':
            playBloodOrbSound(now);
            break;
        default:
            playMeteorSound(now);
    }
}

function playMeteorSound(now) {
    // Deep explosive whoosh + impact
    const bass = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bass.connect(bassGain);
    bassGain.connect(audioContext.destination);
    
    bass.type = 'sine';
    bass.frequency.setValueAtTime(80, now);
    bass.frequency.exponentialRampToValueAtTime(25, now + 0.5);
    
    bassGain.gain.setValueAtTime(0.7, now);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    bass.start(now);
    bass.stop(now + 0.6);
    
    // Crackling fire
    const noise = audioContext.createOscillator();
    const noiseGain = audioContext.createGain();
    const noiseFilter = audioContext.createBiquadFilter();
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(150, now);
    noise.frequency.exponentialRampToValueAtTime(50, now + 0.4);
    
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    noise.start(now);
    noise.stop(now + 0.5);
    
    // Whoosh
    const whoosh = audioContext.createOscillator();
    const whooshGain = audioContext.createGain();
    whoosh.connect(whooshGain);
    whooshGain.connect(audioContext.destination);
    
    whoosh.type = 'sine';
    whoosh.frequency.setValueAtTime(400, now);
    whoosh.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    
    whooshGain.gain.setValueAtTime(0.3, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    
    whoosh.start(now);
    whoosh.stop(now + 0.35);
}

function playVoidBeamSound(now) {
    // Dark, ominous sustained beam
    const drone = audioContext.createOscillator();
    const droneGain = audioContext.createGain();
    drone.connect(droneGain);
    droneGain.connect(audioContext.destination);
    
    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(60, now);
    drone.frequency.linearRampToValueAtTime(50, now + 1.5);
    
    droneGain.gain.setValueAtTime(0.5, now);
    droneGain.gain.linearRampToValueAtTime(0.6, now + 0.3);
    droneGain.gain.linearRampToValueAtTime(0.4, now + 1.2);
    droneGain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);
    
    drone.start(now);
    drone.stop(now + 1.8);
    
    // Eerie warble
    const warble = audioContext.createOscillator();
    const warbleGain = audioContext.createGain();
    const warbleFilter = audioContext.createBiquadFilter();
    warble.connect(warbleFilter);
    warbleFilter.connect(warbleGain);
    warbleGain.connect(audioContext.destination);
    
    warble.type = 'sine';
    warble.frequency.setValueAtTime(200, now);
    warble.frequency.linearRampToValueAtTime(150, now + 1.5);
    
    warbleFilter.type = 'bandpass';
    warbleFilter.frequency.setValueAtTime(300, now);
    warbleFilter.Q.setValueAtTime(5, now);
    
    warbleGain.gain.setValueAtTime(0.3, now);
    warbleGain.gain.exponentialRampToValueAtTime(0.01, now + 1.6);
    
    warble.start(now);
    warble.stop(now + 1.6);
    
    // Sub rumble
    const sub = audioContext.createOscillator();
    const subGain = audioContext.createGain();
    sub.connect(subGain);
    subGain.connect(audioContext.destination);
    
    sub.type = 'sine';
    sub.frequency.setValueAtTime(30, now);
    
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    
    sub.start(now);
    sub.stop(now + 1.5);
}

function playIceSpikeSound(now) {
    // Crystalline shatter + cold wind
    const crystal = audioContext.createOscillator();
    const crystalGain = audioContext.createGain();
    crystal.connect(crystalGain);
    crystalGain.connect(audioContext.destination);
    
    crystal.type = 'triangle';
    crystal.frequency.setValueAtTime(2000, now);
    crystal.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    
    crystalGain.gain.setValueAtTime(0.5, now);
    crystalGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    crystal.start(now);
    crystal.stop(now + 0.2);
    
    // Ice crack
    const crack = audioContext.createOscillator();
    const crackGain = audioContext.createGain();
    crack.connect(crackGain);
    crackGain.connect(audioContext.destination);
    
    crack.type = 'square';
    crack.frequency.setValueAtTime(100, now);
    crack.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    
    crackGain.gain.setValueAtTime(0.6, now);
    crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    
    crack.start(now);
    crack.stop(now + 0.35);
    
    // Cold wind
    const wind = audioContext.createOscillator();
    const windGain = audioContext.createGain();
    const windFilter = audioContext.createBiquadFilter();
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioContext.destination);
    
    wind.type = 'sawtooth';
    wind.frequency.setValueAtTime(300, now);
    wind.frequency.linearRampToValueAtTime(150, now + 0.5);
    
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(400, now);
    windFilter.Q.setValueAtTime(2, now);
    
    windGain.gain.setValueAtTime(0.25, now);
    windGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    wind.start(now);
    wind.stop(now + 0.6);
}

function playLightningAttackSound(now) {
    // Electric crackle + thunder
    // Initial crack
    const crack = audioContext.createOscillator();
    const crackGain = audioContext.createGain();
    crack.connect(crackGain);
    crackGain.connect(audioContext.destination);
    
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(3000, now);
    crack.frequency.exponentialRampToValueAtTime(100, now + 0.08);
    
    crackGain.gain.setValueAtTime(0.7, now);
    crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    crack.start(now);
    crack.stop(now + 0.1);
    
    // Thunder rumble
    const thunder = audioContext.createOscillator();
    const thunderGain = audioContext.createGain();
    thunder.connect(thunderGain);
    thunderGain.connect(audioContext.destination);
    
    thunder.type = 'sine';
    thunder.frequency.setValueAtTime(60, now + 0.05);
    thunder.frequency.exponentialRampToValueAtTime(25, now + 0.6);
    
    thunderGain.gain.setValueAtTime(0.01, now);
    thunderGain.gain.linearRampToValueAtTime(0.7, now + 0.08);
    thunderGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    
    thunder.start(now);
    thunder.stop(now + 0.7);
    
    // Electric buzz
    const buzz = audioContext.createOscillator();
    const buzzGain = audioContext.createGain();
    buzz.connect(buzzGain);
    buzzGain.connect(audioContext.destination);
    
    buzz.type = 'square';
    buzz.frequency.setValueAtTime(120, now);
    
    buzzGain.gain.setValueAtTime(0.3, now);
    buzzGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    buzz.start(now);
    buzz.stop(now + 0.4);
}

function playBlackHoleSound(now) {
    // Deep gravitational pull + distortion
    const pull = audioContext.createOscillator();
    const pullGain = audioContext.createGain();
    pull.connect(pullGain);
    pullGain.connect(audioContext.destination);
    
    pull.type = 'sine';
    pull.frequency.setValueAtTime(100, now);
    pull.frequency.exponentialRampToValueAtTime(20, now + 1.0);
    
    pullGain.gain.setValueAtTime(0.6, now);
    pullGain.gain.linearRampToValueAtTime(0.7, now + 0.5);
    pullGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    
    pull.start(now);
    pull.stop(now + 1.2);
    
    // Distortion wobble
    const wobble = audioContext.createOscillator();
    const wobbleGain = audioContext.createGain();
    wobble.connect(wobbleGain);
    wobbleGain.connect(audioContext.destination);
    
    wobble.type = 'triangle';
    wobble.frequency.setValueAtTime(80, now);
    wobble.frequency.linearRampToValueAtTime(40, now + 0.8);
    
    wobbleGain.gain.setValueAtTime(0.4, now);
    wobbleGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    
    wobble.start(now);
    wobble.stop(now + 1.0);
    
    // Space warping
    const warp = audioContext.createOscillator();
    const warpGain = audioContext.createGain();
    const warpFilter = audioContext.createBiquadFilter();
    warp.connect(warpFilter);
    warpFilter.connect(warpGain);
    warpGain.connect(audioContext.destination);
    
    warp.type = 'sawtooth';
    warp.frequency.setValueAtTime(200, now);
    warp.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    
    warpFilter.type = 'lowpass';
    warpFilter.frequency.setValueAtTime(500, now);
    warpFilter.frequency.exponentialRampToValueAtTime(50, now + 0.8);
    
    warpGain.gain.setValueAtTime(0.35, now);
    warpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
    
    warp.start(now);
    warp.stop(now + 0.9);
}

function playLaserBeamSound(now) {
    // Powerful sustained beam
    const beam = audioContext.createOscillator();
    const beamGain = audioContext.createGain();
    beam.connect(beamGain);
    beamGain.connect(audioContext.destination);
    
    beam.type = 'sawtooth';
    beam.frequency.setValueAtTime(150, now);
    beam.frequency.linearRampToValueAtTime(200, now + 0.5);
    beam.frequency.linearRampToValueAtTime(150, now + 1.5);
    
    beamGain.gain.setValueAtTime(0.5, now);
    beamGain.gain.linearRampToValueAtTime(0.6, now + 0.2);
    beamGain.gain.linearRampToValueAtTime(0.5, now + 1.3);
    beamGain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);
    
    beam.start(now);
    beam.stop(now + 1.8);
    
    // High frequency hum
    const hum = audioContext.createOscillator();
    const humGain = audioContext.createGain();
    hum.connect(humGain);
    humGain.connect(audioContext.destination);
    
    hum.type = 'sine';
    hum.frequency.setValueAtTime(800, now);
    hum.frequency.linearRampToValueAtTime(1000, now + 1.5);
    
    humGain.gain.setValueAtTime(0.25, now);
    humGain.gain.exponentialRampToValueAtTime(0.01, now + 1.6);
    
    hum.start(now);
    hum.stop(now + 1.6);
    
    // Power surge
    const surge = audioContext.createOscillator();
    const surgeGain = audioContext.createGain();
    surge.connect(surgeGain);
    surgeGain.connect(audioContext.destination);
    
    surge.type = 'square';
    surge.frequency.setValueAtTime(60, now);
    
    surgeGain.gain.setValueAtTime(0.4, now);
    surgeGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    
    surge.start(now);
    surge.stop(now + 1.5);
}

function playToxicCloudSound(now) {
    // Bubbling poison + gas release
    const bubble = audioContext.createOscillator();
    const bubbleGain = audioContext.createGain();
    bubble.connect(bubbleGain);
    bubbleGain.connect(audioContext.destination);
    
    bubble.type = 'sine';
    bubble.frequency.setValueAtTime(200, now);
    bubble.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    bubble.frequency.exponentialRampToValueAtTime(150, now + 0.35);
    bubble.frequency.exponentialRampToValueAtTime(60, now + 0.5);
    
    bubbleGain.gain.setValueAtTime(0.5, now);
    bubbleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    bubble.start(now);
    bubble.stop(now + 0.6);
    
    // Hiss
    const hiss = audioContext.createOscillator();
    const hissGain = audioContext.createGain();
    const hissFilter = audioContext.createBiquadFilter();
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(audioContext.destination);
    
    hiss.type = 'sawtooth';
    hiss.frequency.setValueAtTime(2000, now);
    hiss.frequency.exponentialRampToValueAtTime(500, now + 0.5);
    
    hissFilter.type = 'highpass';
    hissFilter.frequency.setValueAtTime(1000, now);
    
    hissGain.gain.setValueAtTime(0.3, now);
    hissGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    
    hiss.start(now);
    hiss.stop(now + 0.7);
    
    // Low gurgle
    const gurgle = audioContext.createOscillator();
    const gurgleGain = audioContext.createGain();
    gurgle.connect(gurgleGain);
    gurgleGain.connect(audioContext.destination);
    
    gurgle.type = 'triangle';
    gurgle.frequency.setValueAtTime(80, now);
    gurgle.frequency.linearRampToValueAtTime(50, now + 0.4);
    
    gurgleGain.gain.setValueAtTime(0.4, now);
    gurgleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    gurgle.start(now);
    gurgle.stop(now + 0.5);
}

function playBloodOrbSound(now) {
    // Dark pulsating thump + sinister tone
    const pulse = audioContext.createOscillator();
    const pulseGain = audioContext.createGain();
    pulse.connect(pulseGain);
    pulseGain.connect(audioContext.destination);
    
    pulse.type = 'sine';
    pulse.frequency.setValueAtTime(50, now);
    pulse.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    
    pulseGain.gain.setValueAtTime(0.7, now);
    pulseGain.gain.exponentialRampToValueAtTime(0.3, now + 0.15);
    pulseGain.gain.exponentialRampToValueAtTime(0.6, now + 0.25);
    pulseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    pulse.start(now);
    pulse.stop(now + 0.5);
    
    // Dark chord
    const dark1 = audioContext.createOscillator();
    const dark2 = audioContext.createOscillator();
    const darkGain = audioContext.createGain();
    dark1.connect(darkGain);
    dark2.connect(darkGain);
    darkGain.connect(audioContext.destination);
    
    dark1.type = 'sawtooth';
    dark1.frequency.setValueAtTime(100, now);
    dark2.type = 'sawtooth';
    dark2.frequency.setValueAtTime(75, now); // Minor third below
    
    darkGain.gain.setValueAtTime(0.35, now);
    darkGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    dark1.start(now);
    dark2.start(now);
    dark1.stop(now + 0.6);
    dark2.stop(now + 0.6);
    
    // Wet splatter
    const splat = audioContext.createOscillator();
    const splatGain = audioContext.createGain();
    const splatFilter = audioContext.createBiquadFilter();
    splat.connect(splatFilter);
    splatFilter.connect(splatGain);
    splatGain.connect(audioContext.destination);
    
    splat.type = 'square';
    splat.frequency.setValueAtTime(300, now);
    splat.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    
    splatFilter.type = 'lowpass';
    splatFilter.frequency.setValueAtTime(600, now);
    splatFilter.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    
    splatGain.gain.setValueAtTime(0.4, now);
    splatGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    splat.start(now);
    splat.stop(now + 0.2);
}

function playMultiplierUpSound() {
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    
    // Rising arpeggio sound
    const notes = [400, 500, 600, 800];
    notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        
        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.3, now + i * 0.05 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.15);
        
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.15);
    });
    
    // Final chord
    const chordOsc = audioContext.createOscillator();
    const chordGain = audioContext.createGain();
    chordOsc.connect(chordGain);
    chordGain.connect(audioContext.destination);
    
    chordOsc.type = 'triangle';
    chordOsc.frequency.setValueAtTime(1000, now + 0.2);
    
    chordGain.gain.setValueAtTime(0.4, now + 0.2);
    chordGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    chordOsc.start(now + 0.2);
    chordOsc.stop(now + 0.5);
}

// ============================================
// RETRO CHIPTUNE MUSIC SYSTEM
// ============================================

// Background music using MP3 file
function initBackgroundMusic() {
    if (!backgroundMusic) {
        backgroundMusic = new Audio('spaceship-arcade-shooter-game-background-soundtrack-318508.mp3');
        backgroundMusic.loop = true;
        backgroundMusic.volume = 0.4;
    }
}

function startMusic() {
    try {
        initBackgroundMusic();
        if (backgroundMusic) {
            backgroundMusic.currentTime = 0;
            backgroundMusic.play().catch(e => console.log('Music autoplay blocked:', e));
            musicPlaying = true;
        }
    } catch (e) {
        console.log('Music failed to start:', e);
        musicPlaying = false;
    }
}

function stopMusic() {
    musicPlaying = false;
    if (backgroundMusic) {
        backgroundMusic.pause();
    }
}

function toggleMusic() {
    if (musicPlaying) {
        stopMusic();
    } else {
        startMusic();
    }
}

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Scales following the circle of fifths
const SCALES = [
    { name: 'C Major', key: 'C', sharps: 0, notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
    { name: 'G Major', key: 'G', sharps: 1, notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
    { name: 'D Major', key: 'D', sharps: 2, notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
    { name: 'A Major', key: 'A', sharps: 3, notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
    { name: 'E Major', key: 'E', sharps: 4, notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
    { name: 'B Major', key: 'B', sharps: 5, notes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'] },
    // Flat keys (using enharmonic sharps since our keyboard maps to sharps)
    { name: 'F Major', key: 'F', flats: 1, notes: ['F', 'G', 'A', 'A#', 'C', 'D', 'E'] }, // Bb = A#
    { name: 'Bb Major', key: 'Bb', flats: 2, notes: ['A#', 'C', 'D', 'D#', 'F', 'G', 'A'] }, // Bb=A#, Eb=D#
    { name: 'Eb Major', key: 'Eb', flats: 3, notes: ['D#', 'F', 'G', 'G#', 'A#', 'C', 'D'] }, // Eb=D#, Ab=G#, Bb=A#
    { name: 'Ab Major', key: 'Ab', flats: 4, notes: ['G#', 'A#', 'C', 'C#', 'D#', 'F', 'G'] }, // Ab=G#, Bb=A#, Db=C#, Eb=D#
    { name: 'Db Major', key: 'Db', flats: 5, notes: ['C#', 'D#', 'F', 'F#', 'G#', 'A#', 'C'] }, // Db=C#, Eb=D#, Gb=F#, Ab=G#, Bb=A#
    { name: 'F# Major', key: 'F#', sharps: 6, notes: ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F'] }, // E# = F (enharmonic)
];

// Get the scale for a given level (cycles through all scales)
function getScaleForLevel(level) {
    const scaleIndex = (level - 1) % SCALES.length;
    return SCALES[scaleIndex];
}

// Get a random note from the current level's scale
// If useMidiOctave is true, adds octave number for MIDI matching
function getRandomNoteForLevel(level, useMidiOctave = false) {
    const scale = getScaleForLevel(level);
    const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
    
    // For easy difficulty, only use first 5 notes
    const availableNotes = diffSettings.scaleNotes < scale.notes.length 
        ? scale.notes.slice(0, diffSettings.scaleNotes)
        : scale.notes;
    
    const baseNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];
    
    if (useMidiOctave) {
        // Pick a random octave from the difficulty's allowed range
        const octaveRange = diffSettings.octaveRange;
        const octave = octaveRange[Math.floor(Math.random() * octaveRange.length)];
        return baseNote + octave;
    }
    
    return baseNote;
}

// Generate an ascending or descending scale with proper octaves for MIDI powerups
function generateMidiScale(level) {
    const scale = getScaleForLevel(level);
    const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
    
    // Get available notes based on difficulty
    const availableNotes = diffSettings.scaleNotes < scale.notes.length 
        ? scale.notes.slice(0, diffSettings.scaleNotes)
        : scale.notes;
    
    const scaleNotes = [...availableNotes];
    const result = [];
    const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Determine if scale goes up or down based on difficulty
    let goingUp = true;
    if (diffSettings.scaleDirection === 'both') {
        goingUp = Math.random() > 0.5;
    }
    
    // Pick starting octave from allowed range
    const octaveRange = diffSettings.octaveRange;
    const startingOctave = goingUp 
        ? octaveRange[0]  // Start low if going up
        : octaveRange[octaveRange.length - 1]; // Start high if going down
    
    let currentOctave = startingOctave;
    
    // Get chromatic index of first note to track octave wrapping
    const firstNoteIndex = noteOrder.indexOf(scaleNotes[0]);
    
    // If going down, reverse the scale notes
    const orderedNotes = goingUp ? scaleNotes : [...scaleNotes].reverse();
    
    for (let i = 0; i < orderedNotes.length; i++) {
        const note = orderedNotes[i];
        const noteIndex = noteOrder.indexOf(note);
        
        if (i > 0) {
            const prevNote = orderedNotes[i - 1];
            const prevNoteIndex = noteOrder.indexOf(prevNote);
            
            if (goingUp) {
                // If note is lower in chromatic order than previous, we've wrapped to next octave
                if (noteIndex < prevNoteIndex) {
                    currentOctave++;
                }
            } else {
                // Going down: if note is higher in chromatic order than previous, we've wrapped to lower octave
                if (noteIndex > prevNoteIndex) {
                    currentOctave--;
                }
            }
        }
        
        result.push(note + currentOctave);
    }
    
    // Add the octave note (root note one octave higher/lower than starting)
    const rootNote = scaleNotes[0];
    if (goingUp) {
        result.push(rootNote + (startingOctave + 1));
    } else {
        result.push(rootNote + (startingOctave - 1));
    }
    
    return result;
}

const NOTE_COLORS = {
    'C': '#ff4d6d', 'C#': '#ff6b9d', 'D': '#ffa94d', 'D#': '#ffcf4d',
    'E': '#ffe14d', 'F': '#4dff88', 'F#': '#4dffc3', 'G': '#4dffff',
    'G#': '#4db8ff', 'A': '#9d4dff', 'A#': '#d94dff', 'B': '#ff4da6'
};

// Get color for a note (handles both "C" and "C4" format)
function getNoteColor(note) {
    const baseNote = getBaseNoteName(note);
    return NOTE_COLORS[baseNote] || '#ffffff';
}

// Get enemy type for a note (handles both "C" and "C4" format)
function getEnemyType(note) {
    const baseNote = getBaseNoteName(note);
    return ENEMY_TYPES[baseNote] || 'bat';
}

const ENEMY_TYPES = {
    'C': 'bat', 'C#': 'bat', 'D': 'blob', 'D#': 'blob',
    'E': 'slime', 'F': 'slime', 'F#': 'ghost', 'G': 'ghost',
    'G#': 'skull', 'A': 'skull', 'A#': 'bat', 'B': 'bat'
};

// ============================================
// TYPING MODE - Letters and Words
// ============================================

// Letters for typing mode enemies (home row first, then others)
const TYPING_LETTERS = [
    // Home row (easiest)
    'A', 'S', 'D', 'F', 'J', 'K', 'L',
    // Top row
    'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
    // Bottom row
    'Z', 'X', 'C', 'V', 'B', 'N', 'M'
];

// Letter colors for typing mode (gradient from warm to cool)
const LETTER_COLORS = {
    'A': '#ff4d6d', 'B': '#ff6b4d', 'C': '#ffa94d', 'D': '#ffcf4d',
    'E': '#ffe14d', 'F': '#c3ff4d', 'G': '#4dff88', 'H': '#4dffc3',
    'I': '#4dffff', 'J': '#4db8ff', 'K': '#4d88ff', 'L': '#6b4dff',
    'M': '#9d4dff', 'N': '#d94dff', 'O': '#ff4da6', 'P': '#ff4d6d',
    'Q': '#ff8c4d', 'R': '#ffd94d', 'S': '#8cff4d', 'T': '#4dff4d',
    'U': '#4dffb8', 'V': '#4dd9ff', 'W': '#4d6bff', 'X': '#b84dff',
    'Y': '#ff4dff', 'Z': '#ff4d8c'
};

// Words for typing mode organized by difficulty level (all SFW, 100+ words each)
const TYPING_WORDS = {
    // EASY: 1st grade level - 3 letter max, common words (120 words)
    easy: [
        'CAT', 'DOG', 'SUN', 'RUN', 'FUN', 'RED', 'BIG', 'HAT', 'SAT', 'RAT',
        'BAT', 'MAT', 'PAT', 'CAN', 'MAN', 'FAN', 'PAN', 'RAN', 'TAN', 'VAN',
        'BED', 'PEN', 'TEN', 'HEN', 'MEN', 'NET', 'PET', 'SET', 'WET', 'JET',
        'BIT', 'FIT', 'HIT', 'KIT', 'SIT', 'PIT', 'HOT', 'NOT', 'POT', 'GOT',
        'CUP', 'PUP', 'CUT', 'NUT', 'BUT', 'HUT', 'RUB', 'TUB', 'BUS', 'SUM',
        'TOP', 'HOP', 'MOP', 'POP', 'BOX', 'FOX', 'MIX', 'FIX', 'SIX', 'WAX',
        'YES', 'YET', 'ADD', 'ALL', 'AND', 'ANT', 'APE', 'ARC', 'ARE', 'ARK',
        'ARM', 'ART', 'ATE', 'OAK', 'OAT', 'ODD', 'OFF', 'OLD', 'ONE', 'OUR',
        'BAD', 'BAG', 'COW', 'CRY', 'DAD', 'DAY', 'DIG', 'DIP', 'EAR', 'EAT',
        'EGG', 'END', 'EYE', 'FAR', 'FAT', 'FEW', 'FLY', 'FOR', 'GET', 'GOD',
        'GUM', 'GUN', 'GUY', 'HAD', 'HAS', 'HER', 'HID', 'HIM', 'HIS', 'HOW',
        'HUG', 'ICE', 'ILL', 'INK', 'JAM', 'JAR', 'JAW', 'JOB', 'JOG', 'JOY'
    ],
    // NORMAL: 5th grade level - varied length, common vocabulary (150 words)
    normal: [
        // 3-4 letter words
        'JUMP', 'FIRE', 'WAVE', 'HERO', 'STAR', 'MOON', 'SHIP', 'RING', 'GOLD', 'LAMP',
        'BALL', 'BELL', 'BIRD', 'BOAT', 'BOOK', 'CAKE', 'CITY', 'DARK', 'DOOR', 'FARM',
        'FAST', 'FISH', 'FLAG', 'FOOD', 'GAME', 'GIRL', 'HAND', 'HOME', 'KING', 'LAKE',
        'LIFE', 'LION', 'LOCK', 'LOVE', 'LUCK', 'MAIL', 'MILK', 'NAIL', 'NAME', 'NEWS',
        'NEXT', 'NICE', 'NOSE', 'NOTE', 'OPEN', 'OVER', 'PAGE', 'PAIN', 'PARK', 'PART',
        // 5-6 letter words
        'MAGIC', 'STORM', 'BLAST', 'POWER', 'SUPER', 'LIGHT', 'NIGHT', 'FLAME', 'WATER', 'EARTH',
        'SWORD', 'CROWN', 'TOWER', 'RIVER', 'FIELD', 'STONE', 'STEEL', 'SPARK', 'SPEED', 'SKILL',
        'BRAVE', 'QUICK', 'SHARP', 'SMART', 'NOBLE', 'ROYAL', 'GUARD', 'QUEST', 'REALM', 'GLORY',
        'BATTLE', 'DRAGON', 'KNIGHT', 'WIZARD', 'SHIELD', 'CASTLE', 'FOREST', 'SHADOW', 'SPIRIT', 'LEGEND',
        'ANIMAL', 'BEACH', 'BRAIN', 'BREAD', 'BREAK', 'BRING', 'BUILD', 'CARRY', 'CATCH', 'CHAIR',
        'CHANCE', 'CHANGE', 'CHILD', 'CLEAR', 'CLIMB', 'CLOSE', 'CLOUD', 'COLOR', 'COVER', 'CREAM',
        'DANCE', 'DREAM', 'DRINK', 'DRIVE', 'EARLY', 'EIGHT', 'EMPTY', 'ENTER', 'EVENT', 'EVERY',
        // 7+ letter words
        'WARRIOR', 'VICTORY', 'THUNDER', 'CRYSTAL', 'PHOENIX', 'BLAZING', 'ANCIENT', 'MYSTERY', 'JOURNEY', 'DESTINY',
        'CHAMPION', 'POWERFUL', 'FEARLESS', 'GLORIOUS', 'MAJESTIC', 'STRIKING', 'RADIANCE', 'INFINITE', 'ULTIMATE', 'DEFENDER',
        'AMAZING', 'BALANCE', 'CAPTAIN', 'COMMAND', 'COMPANY', 'CONTAIN', 'CONTROL', 'CORRECT', 'COURAGE', 'CURRENT',
        'DIAMOND', 'ELEMENT', 'EMOTION', 'EMPEROR', 'FOREVER', 'FREEDOM', 'GENERAL', 'GRAVITY', 'HARMONY', 'HORIZON',
        'IMAGINE', 'KINGDOM', 'MACHINE', 'MEASURE', 'MONSTER', 'MORNING', 'NATURAL', 'NOTHING', 'PATTERN', 'PERFECT',
        'PICTURE', 'PRESENT', 'PROBLEM', 'PROGRAM', 'PROJECT', 'PROMISE', 'PROTECT', 'QUALITY', 'RAINBOW', 'REALITY'
    ],
    // HARD: 9th grade level - more complex vocabulary (120 words)
    hard: [
        'CATALYST', 'PARADIGM', 'ELOQUENT', 'SYNTHESIS', 'AMBIGUOUS', 'ELABORATE', 'PROMINENT', 'COMPELLING',
        'FORMIDABLE', 'RESILIENT', 'PROFICIENT', 'ARTICULATE', 'METICULOUS', 'INNOVATIVE', 'EXCEPTIONAL',
        'THRESHOLD', 'PHENOMENON', 'PERPETUAL', 'ILLUMINATE', 'SUBSTANTIAL', 'PERSPECTIVE', 'CONSEQUENCE',
        'ADVERSARY', 'VENGEANCE', 'SOVEREIGN', 'DOMINION', 'HARBINGER', 'FORTITUDE', 'MAGNITUDE', 'DISCIPLINE',
        'VIGILANT', 'STALWART', 'CONQUEST', 'ALLIANCE', 'STRATEGY', 'TRIBUNAL', 'ENDEAVOR', 'PINNACLE',
        'CHRONICLE', 'EXPEDITION', 'REVELATION', 'ASCENDANT', 'TRANSCEND', 'PARAMOUNT', 'EXEMPLARY', 'UNDAUNTED',
        'RESOLUTE', 'DAUNTLESS', 'TENACIOUS', 'RELENTLESS', 'DETERMINED', 'UNWAVERING', 'STEADFAST', 'INDOMITABLE',
        'ABUNDANCE', 'ACCOMPLISH', 'ACCORDING', 'ADVANTAGE', 'ADVENTURE', 'AGREEMENT', 'ALTERNATE', 'AMENDMENT',
        'APPARATUS', 'ARCHITECT', 'AUTHORITY', 'AVAILABLE', 'BEGINNING', 'BENCHMARK', 'BRILLIANT', 'CALCULATE',
        'CANDIDATE', 'CELEBRATE', 'CHALLENGE', 'CHARACTER', 'CIRCULATE', 'CLASSICAL', 'COMMUNITY', 'COMPANION',
        'COMPETENT', 'COMPONENT', 'COMPOSITE', 'CONDITION', 'CONFIDENT', 'CONFUSING', 'CONSCIOUS', 'CONSTRUCT',
        'CONTINUAL', 'COOPERATE', 'CORPORATE', 'CRITERION', 'CURIOSITY', 'DANGEROUS', 'DECLINING', 'DEDICATED',
        'DEFENDANT', 'DEFENSIVE', 'DELICIOUS', 'DEMOCRACY', 'DEPARTURE', 'DEPENDENT', 'DESPERATE', 'DETERMINE',
        'DEVASTATE', 'DIFFERENT', 'DIFFICULT', 'DIMENSION', 'DIPLOMACY', 'DIRECTION', 'DISAPPEAR', 'DISCOVERY',
        'ELABORATE', 'ELIMINATE', 'EMERGENCE', 'EMOTIONAL', 'ENCOUNTER', 'ENCOURAGE', 'ENDURANCE', 'ESTABLISH'
    ],
    // CRAZY: Full dictionary - challenging and rare words (120 words)
    crazy: [
        'FLOCCINAUCINIHILIPILIFICATION', 'ANTIDISESTABLISHMENTARIANISM', 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS',
        'PNEUMONOULTRAMICROSCOPICSILICOVOLCANOCONIOSIS', 'HIPPOPOTOMONSTROSESQUIPPEDALIOPHOBIA',
        'PSEUDOPSEUDOHYPOPARATHYROIDISM', 'SPECTROPHOTOFLUOROMETRICALLY', 'PSYCHOPHYSICOTHERAPEUTICS',
        'OTORHINOLARYNGOLOGICAL', 'IMMUNOELECTROPHORETICALLY', 'COUNTERREVOLUTIONARIES', 'ELECTROENCEPHALOGRAPH',
        'INTERNATIONALIZATION', 'COMPARTMENTALIZATION', 'DISPROPORTIONATENESS', 'CHARACTERISTICALLY',
        'INCOMPREHENSIBILITY', 'UNCONSTITUTIONALITY', 'COUNTERINTELLIGENCE', 'INDISTINGUISHABLENESS',
        'DEINSTITUTIONALIZATION', 'REINSTITUTIONALIZATION', 'OVERINTELLECTUALIZED', 'PSYCHOPHARMACOLOGICAL',
        'HYDROCHLOROFLUOROCARBON', 'MICROELECTROPHORETICALLY', 'DICHLORODIFLUOROMETHANE', 'ELECTROCARDIOGRAPHICALLY',
        'ACCOMPLISHMENT', 'ACKNOWLEDGEMENT', 'ADVERTISEMENTS', 'ALPHABETICALLY', 'ANTHROPOMORPHIC', 'ARCHAEOLOGICAL',
        'AUTOBIOGRAPHY', 'BIOLUMINESCENCE', 'BLOODCURDLING', 'BREATHTAKING', 'CHARACTERISTICS', 'CINEMATOGRAPHY',
        'CIRCUMNAVIGATION', 'CLAUSTROPHOBIA', 'COINCIDENTALLY', 'COMMENSURATELY', 'COMPASSIONATELY', 'COMPREHENSIVELY',
        'CONCEPTUALIZATION', 'CONDESCENDINGLY', 'CONFIDENTIALLY', 'CONFRONTATIONAL', 'CONGRATULATIONS', 'CONSCIENTIOUSLY',
        'CONSEQUENTIALLY', 'CONSERVATIONIST', 'CONSPIRATORIAL', 'CONSTITUTIONALLY', 'CONTEMPORANEOUS', 'CONTRADICTORILY',
        'CONTROVERSIALLY', 'CONVERSATIONALLY', 'CORRESPONDINGLY', 'COUNTERBALANCING', 'COUNTERCLOCKWISE', 'COUNTERPRODUCTIVE',
        'CRYPTOZOOLOGICAL', 'CRYSTALLOGRAPHER', 'DECENTRALIZATION', 'DECONTAMINATION', 'DEFENESTRATION', 'DEMILITARIZATION',
        'DEMOCRATIZATION', 'DENATIONALIZATION', 'DEPARTMENTALIZE', 'DESENSITIZATION', 'DETERMINISTICALLY', 'DEVELOPMENTALLY',
        'DIFFERENTIATING', 'DISACCHARIDASES', 'DISADVANTAGEOUS', 'DISCONSOLATELY', 'DISCOURTEOUSLY', 'DISCRIMINATORILY',
        'DISENCHANTMENT', 'DISENFRANCHISED', 'DISILLUSIONING', 'DISPASSIONATELY', 'DISPROPORTIONAL', 'DISTINGUISHABLE',
        'DIVERSIFICATION', 'DOCUMENTATIONAL', 'DYSFUNCTIONALLY', 'ECCLESIASTICALLY', 'ELECTRIFICATION', 'ELECTROMAGNETIC',
        'EMBARRASSINGLY', 'ENCYCLOPEDICALLY', 'ENTHUSIASTICALLY', 'ENTREPRENEURIAL', 'ENVIRONMENTALLY', 'EPIDEMIOLOGICAL',
        'EPISTEMOLOGICAL', 'ETHEREALIZATION', 'EXCEPTIONALISTIC', 'EXCOMMUNICATION', 'EXEMPLIFICATION', 'EXISTENTIALISM',
        'EXPERIMENTALISM', 'EXPERIMENTALIST', 'EXPERIMENTATION', 'EXTEMPORANEOUSLY', 'EXTRAORDINARILY', 'FAMILIARIZATION',
        'FANTASTICALLY', 'FINGERPRINTING', 'FLABBERGASTING', 'FUNDAMENTALISM', 'GENERALIZATION', 'GEOGRAPHICALLY'
    ]
};

// Get words appropriate for the current difficulty and level
// Words get progressively harder as levels increase
function getWordsForDifficulty(difficulty, level) {
    const allWordLists = {
        easy: TYPING_WORDS.easy,
        normal: TYPING_WORDS.normal,
        hard: TYPING_WORDS.hard,
        crazy: TYPING_WORDS.crazy
    };
    
    // Determine which word lists to pull from based on difficulty and level
    let wordPool = [];
    
    if (difficulty === 'easy') {
        // Easy mode: Always use easy words, but allow slightly longer ones at higher levels
        const easyWords = allWordLists.easy;
        if (level <= 2) {
            // Levels 1-2: Only 3-letter words
            wordPool = easyWords.filter(w => w.length <= 3);
        } else if (level <= 4) {
            // Levels 3-4: All easy words (up to 3 letters)
            wordPool = easyWords;
        } else {
            // Level 5+: Mix in some simple 4-letter words from normal
            const simple4Letter = allWordLists.normal.filter(w => w.length === 4);
            wordPool = [...easyWords, ...simple4Letter.slice(0, 20)];
        }
    } else if (difficulty === 'normal') {
        // Normal mode: Progress from normal → hard words
        const normalWords = allWordLists.normal;
        const hardWords = allWordLists.hard;
        
        if (level <= 2) {
            // Levels 1-2: Short normal words (3-5 letters)
            wordPool = normalWords.filter(w => w.length <= 5);
        } else if (level <= 4) {
            // Levels 3-4: All normal words
            wordPool = normalWords;
        } else if (level <= 6) {
            // Levels 5-6: Normal + some hard words
            wordPool = [...normalWords, ...hardWords.slice(0, 50)];
        } else {
            // Level 7+: Mix of normal and hard, prefer longer words
            const longNormal = normalWords.filter(w => w.length >= 5);
            wordPool = [...longNormal, ...hardWords];
        }
    } else if (difficulty === 'hard') {
        // Hard mode: Progress from hard → crazy words
        const hardWords = allWordLists.hard;
        const crazyWords = allWordLists.crazy;
        
        if (level <= 2) {
            // Levels 1-2: Shorter hard words
            wordPool = hardWords.filter(w => w.length <= 7);
        } else if (level <= 4) {
            // Levels 3-4: All hard words
            wordPool = hardWords;
        } else if (level <= 6) {
            // Levels 5-6: Hard + some crazy words
            wordPool = [...hardWords, ...crazyWords.slice(0, 50)];
        } else {
            // Level 7+: Mix of hard and crazy, prefer longer words
            const longHard = hardWords.filter(w => w.length >= 7);
            wordPool = [...longHard, ...crazyWords];
        }
    } else {
        // Crazy mode: Start with crazy, get progressively longer
        const crazyWords = allWordLists.crazy;
        
        if (level <= 2) {
            // Levels 1-2: Shorter crazy words
            wordPool = crazyWords.filter(w => w.length <= 8);
        } else if (level <= 4) {
            // Levels 3-4: Medium crazy words
            wordPool = crazyWords.filter(w => w.length <= 10);
        } else {
            // Level 5+: All crazy words, prefer longer ones
            const longCrazy = crazyWords.filter(w => w.length >= 8);
            wordPool = longCrazy.length > 20 ? longCrazy : crazyWords;
        }
    }
    
    // Fallback to base word list if filtering resulted in too few words
    if (wordPool.length < 10) {
        const diffSettings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS['normal'];
        wordPool = allWordLists[diffSettings.wordList] || allWordLists.normal;
    }
    
    return wordPool;
}

// Legacy BOSS_WORDS for backward compatibility (uses normal difficulty)
const BOSS_WORDS = [
    TYPING_WORDS.easy,
    TYPING_WORDS.normal.filter(w => w.length <= 5),
    TYPING_WORDS.normal.filter(w => w.length >= 5 && w.length <= 7),
    TYPING_WORDS.normal.filter(w => w.length >= 6),
    TYPING_WORDS.hard.slice(0, 20)
];

// Boss types - each level has a unique boss (speeds 2x + 20% boost for fixed timestep)
const BOSS_TYPES = [
    {
        name: 'SHADOW WRAITH',
        color: '#6a0dad',
        secondaryColor: '#2d0a4e',
        eyeColor: '#ff00ff',
        auraColor: 'rgba(106, 13, 173, 0.3)',
        speed: 3.1,
        projectileColor: '#9932cc',
        pattern: 'wander',
        attackType: 'voidBeam', // Dark energy beam that cuts across screen
        description: 'A ghostly presence from the shadow realm'
    },
    {
        name: 'FIRE DEMON',
        color: '#ff4500',
        secondaryColor: '#8b0000',
        eyeColor: '#ffff00',
        auraColor: 'rgba(255, 69, 0, 0.3)',
        speed: 4.8,
        projectileColor: '#ff6600',
        pattern: 'aggressive',
        attackType: 'meteor', // Giant fireball that explodes
        description: 'Burns with eternal fury'
    },
    {
        name: 'ICE GOLEM',
        color: '#00bfff',
        secondaryColor: '#004466',
        eyeColor: '#ffffff',
        auraColor: 'rgba(0, 191, 255, 0.3)',
        speed: 1.9,
        projectileColor: '#87ceeb',
        pattern: 'slow',
        attackType: 'iceSpike', // Giant ice spike that shatters
        description: 'Ancient frozen guardian'
    },
    {
        name: 'STORM SPECTER',
        color: '#ffd700',
        secondaryColor: '#b8860b',
        eyeColor: '#00ffff',
        auraColor: 'rgba(255, 215, 0, 0.3)',
        speed: 6.0,
        projectileColor: '#ffff00',
        pattern: 'erratic',
        attackType: 'lightning', // Multiple lightning bolts
        description: 'Crackles with electric energy'
    },
    {
        name: 'VOID LORD',
        color: '#6b2d9e',           // Brighter purple
        secondaryColor: '#3d1a5c',   // Deep purple (visible)
        eyeColor: '#ff00ff',         // Bright magenta eyes
        auraColor: 'rgba(150, 50, 200, 0.6)', // Visible purple aura
        speed: 3.6,
        projectileColor: '#9932cc',  // Bright orchid purple
        pattern: 'teleport',
        attackType: 'blackHole', // Dark singularity that pulls
        description: 'Master of the endless void'
    },
    {
        name: 'CRYSTAL DRAGON',
        color: '#e040fb',
        secondaryColor: '#7b1fa2',
        eyeColor: '#00ff00',
        auraColor: 'rgba(224, 64, 251, 0.3)',
        speed: 4.3,
        projectileColor: '#ce93d8',
        pattern: 'circular',
        attackType: 'laserBeam', // Continuous beam
        description: 'Ancient crystalline beast'
    },
    {
        name: 'PLAGUE BEAST',
        color: '#32cd32',
        secondaryColor: '#006400',
        eyeColor: '#ff0000',
        auraColor: 'rgba(50, 205, 50, 0.4)',
        speed: 2.9,
        projectileColor: '#7cfc00',
        pattern: 'wander',
        attackType: 'toxicCloud', // Spreading poison cloud
        description: 'Spreads corruption wherever it goes'
    },
    {
        name: 'BLOOD MOON',
        color: '#dc143c',
        secondaryColor: '#4a0000',
        eyeColor: '#ff6666',
        auraColor: 'rgba(220, 20, 60, 0.4)',
        speed: 3.8,
        projectileColor: '#ff0000',
        pattern: 'aggressive',
        attackType: 'bloodOrb', // Giant blood orb that explodes into smaller orbs
        description: 'Born under a crimson sky'
    }
];

const KEYBOARD_MAP = {
    'KeyA': 'C', 'KeyS': 'D', 'KeyD': 'E', 'KeyF': 'F',
    'KeyG': 'G', 'KeyH': 'A', 'KeyJ': 'B', 'KeyK': 'C', 'KeyL': 'D',
    'KeyW': 'C#', 'KeyE': 'D#', 'KeyT': 'F#',
    'KeyY': 'G#', 'KeyU': 'A#', 'KeyO': 'C#', 'KeyP': 'D#'
};

// ============================================
// DIFFICULTY SETTINGS
// ============================================

const DIFFICULTY_SETTINGS = {
    'easy': {
        name: 'EASY',
        descriptionMusic: 'Slower enemies, simpler scales, longer boss charge time',
        descriptionTyping: 'Slower enemies, 3-letter words, common letters only',
        // Music mode settings
        enemySpeedMultiplier: 0.5,
        scaleNotes: 5,              // Only first 5 notes of scale
        octaveRange: [4],           // Only middle C octave
        bossChargeMultiplier: 2.0,  // Twice as long to charge
        scaleDirection: 'up',       // Scales only go up
        enemyTimer: 0,              // No timer on enemies
        noteChanges: false,         // Notes don't change
        // Typing mode settings
        lettersPerEnemy: 1,         // Single letter per enemy
        wordsPerBoss: 1,            // Single word per boss charge
        wordList: 'easy',           // 1st grade level
        availableLetters: ['A', 'S', 'D', 'F', 'J', 'K', 'L', 'E', 'I', 'O', 'T', 'N', 'R'] // Common early letters
    },
    'normal': {
        name: 'NORMAL',
        descriptionMusic: 'Standard gameplay experience',
        descriptionTyping: 'All letters, 5th grade vocabulary',
        enemySpeedMultiplier: 1.0,
        scaleNotes: 8,              // Full 8-note scale
        octaveRange: [4],           // Middle C octave
        bossChargeMultiplier: 1.0,
        scaleDirection: 'up',
        enemyTimer: 0,
        noteChanges: false,
        lettersPerEnemy: 1,
        wordsPerBoss: 1,
        wordList: 'normal',         // 5th grade level
        availableLetters: null      // All letters
    },
    'hard': {
        name: 'HARD',
        descriptionMusic: 'Bass and treble clef, scales can go up or down',
        descriptionTyping: '2 letters per enemy, 9th grade vocabulary',
        enemySpeedMultiplier: 1.0,
        scaleNotes: 8,
        octaveRange: [3, 4],        // Bass and treble (octaves 3 and 4)
        bossChargeMultiplier: 1.0,
        scaleDirection: 'both',     // Scales can go up or down
        enemyTimer: 0,
        noteChanges: false,
        lettersPerEnemy: 2,         // Two letters per enemy
        wordsPerBoss: 1,            // Single word per boss charge
        wordList: 'hard',           // 9th grade level
        availableLetters: null
    },
    'crazy': {
        name: 'ARE YOU CRAZY?',
        descriptionMusic: 'Multiple octaves, notes change after 5 seconds!',
        descriptionTyping: '2 letters per enemy, letters change after 5 seconds!',
        enemySpeedMultiplier: 1.2,
        scaleNotes: 8,
        octaveRange: [2, 3, 4, 5],
        bossChargeMultiplier: 0.7,
        scaleDirection: 'both',
        enemyTimer: 5000,
        noteChanges: true,          // Notes/letters change after timer!
        lettersPerEnemy: 2,
        wordsPerBoss: 1,            // Single word per boss charge
        wordList: 'crazy',          // Full dictionary
        availableLetters: null
    }
};

let selectedDifficulty = 'normal';

function midiToNoteName(midiNote, includeOctave = true) {
    const noteName = NOTES[midiNote % 12];
    if (includeOctave) {
        const octave = Math.floor(midiNote / 12) - 1; // MIDI octave convention
        return noteName + octave;
    }
    return noteName;
}

// Convert note name with octave back to MIDI number (e.g., "C4" -> 60)
function noteNameToMidi(noteName) {
    // Parse note and octave (e.g., "C#4" -> "C#" and "4")
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) return null;
    const note = match[1];
    const octave = parseInt(match[2]);
    const noteIndex = NOTES.indexOf(note);
    if (noteIndex === -1) return null;
    return (octave + 1) * 12 + noteIndex;
}

// Get just the note name without octave (e.g., "C4" -> "C")
function getBaseNoteName(noteName) {
    return noteName.replace(/\d+$/, '');
}

// Game configuration - speeds tuned for fixed timestep (+20% boost)
const CONFIG = {
    playerSize: 80,
    enemyBaseSpeed: 1.25,      // 2x speed + 20% boost for fixed timestep
    enemySpeedVariance: 0.29,  // variance to match
    enemySpawnRate: 1250, // Doubled enemy rate (was 2500)
    enemySize: 60,
    projectileSpeed: 25,
    projectileSize: 12,
    bossSize: 250,             // Much bigger boss
    bossChargeTime: 4000,      // 4 seconds (1.5x faster than original 6s)
    bossDamageToPlayer: 15,    // Reduced from 25 - similar to enemies
    enemyDamageToPlayer: 10,
    bossHealth: 5,
    bossCircleSpeed: 0.0072,   // 2x speed + 20% boost for fixed timestep
    gridSize: 80
};

// ============================================
// GAME STATE
// ============================================

// Game mode: 'music' or 'typing' - persists between games
let selectedGameMode = 'music';

let gameState = {
    running: false,
    paused: false,
    gameMode: 'music', // 'music' or 'typing'
    difficulty: 'normal', // easy, normal, hard, insane, crazy
    level: 1,
    score: 0,
    health: 100,
    maxHealth: 100,
    enemies: [],
    projectiles: [],
    bossProjectiles: [],
    boss: null,
    bossActive: false,
    enemiesDefeated: 0,
    enemiesToSpawn: 20, // Doubled (was 10)
    lastSpawnTime: 0,
    activeNotes: new Set(),
    midiConnected: false,
    combo: 0,
    maxCombo: 0,
    comboTimer: 0, // For visual effect timing
    multiplierFlash: 0, // Flash effect when multiplier increases (0-1 progress)
    multiplierScale: 1, // Scale effect for multiplier text
    multiplierAnimTimer: 0, // Timer for the animation (in frames)
    multiplierAnimDuration: 180, // Total animation duration (~3 seconds)
    // Combo break effect state
    comboBreakTimer: 0,
    comboBreakDuration: 90, // ~1.5 seconds
    comboBreakValue: 0, // The combo value that was lost
    comboBreakParticles: [], // Particles for power-down effect
    // Camera zoom effect for boss
    cameraZoom: 1.0, // Current zoom level (1.0 = normal, 0.85 = zoomed out)
    targetZoom: 1.0, // Target zoom to interpolate towards
    zoomSpeed: 0.008, // How fast to interpolate
    // Powerup system
    powerup: null, // Current powerup box on screen
    lastPowerupSpawn: 0, // Last time a powerup spawned
    powerupSpawnInterval: 10000, // Initial spawn after 10 seconds, then random 10-20s
    activePowerup: null, // Currently active powerup effect
    powerupShotsRemaining: 0, // Shots remaining for spreadshot/bomb
    // Health restore animation
    healthRestoreActive: false,
    healthRestoreStart: 0, // Starting health value
    healthRestoreTarget: 0, // Target health value
    healthRestoreTimer: 0, // Current timer
    healthRestoreDuration: 180, // 3 seconds at 60fps
    // Ammo system
    maxAmmo: 5,
    currentAmmo: 5,
    ammoRechargeTimer: 0,
    ammoRechargeRate: 120, // Frames to recharge one shot (2 seconds at 60fps)
    ammoFlash: [0, 0, 0, 0, 0] // Flash animation for each ammo slot
};

// ============================================
// PIXEL ART DRAWING HELPERS
// ============================================

function drawPixelRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

function drawSprite(x, y, pattern, scale, baseColor) {
    const rows = pattern.length;
    const cols = pattern[0].length;
    const offsetX = x - (cols * scale) / 2;
    const offsetY = y - (rows * scale) / 2;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const pixel = pattern[row][col];
            if (pixel !== ' ') {
                let color;
                if (pixel === '#') color = baseColor;
                else if (pixel === 'W') color = '#ffffff';
                else if (pixel === 'D') color = shadeColor(baseColor, -30);
                else if (pixel === 'L') color = shadeColor(baseColor, 30);
                else if (pixel === 'B') color = '#000000';
                else if (pixel === 'E') color = '#ff0000'; // Red eyes for boss
                else if (pixel === 'R') color = '#880000'; // Dark red
                else if (pixel === 'P') color = '#440044'; // Dark purple
                else color = baseColor;
                
                drawPixelRect(offsetX + col * scale, offsetY + row * scale, scale, scale, color);
            }
        }
    }
}

function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ============================================
// MUSICAL STAFF NOTATION DRAWING
// ============================================

// Note positions on treble clef staff (0 = middle line B4, negative = lower, positive = higher)
// Each step is a half-line spacing (line or space)
const TREBLE_CLEF_POSITIONS_BASE = {
    'C': -6,   // Middle C - below staff, needs ledger line
    'D': -5,   // Just below bottom line
    'E': -4,   // Bottom line (1st line)
    'F': -3,   // 1st space
    'G': -2,   // 2nd line
    'A': -1,   // 2nd space
    'B': 0,    // 3rd line (middle line)
};

// Bass clef note positions (D3 is the middle line = position 0)
const BASS_CLEF_POSITIONS_BASE = {
    'C': -1,   // 3rd space (just below middle line)
    'D': 0,    // 3rd line (middle line)
    'E': 1,    // Just above middle line
    'F': 2,    // 4th line
    'G': 3,    // 4th space
    'A': 4,    // 5th line (top)
    'B': 5,    // Above staff
};

// Determine if a note should use bass clef (below middle C / C4)
function shouldUseBassClef(note) {
    const match = note.match(/^([A-G]#?)(\d+)?$/);
    if (!match) return false;
    
    const octave = match[2] ? parseInt(match[2]) : 4;
    return octave <= 3; // Use bass clef for octaves 3 and below
}

// Get staff position for treble clef
function getTrebleStaffPosition(note) {
    const match = note.match(/^([A-G]#?)(\d+)?$/);
    if (!match) return 0;
    
    const baseNote = match[1].replace('#', '');
    const octave = match[2] ? parseInt(match[2]) : 4;
    
    const basePos = TREBLE_CLEF_POSITIONS_BASE[baseNote] || 0;
    const octaveOffset = (octave - 4) * 7;
    
    return basePos + octaveOffset;
}

// Get staff position for bass clef
function getBassStaffPosition(note) {
    const match = note.match(/^([A-G]#?)(\d+)?$/);
    if (!match) return 0;
    
    const baseNote = match[1].replace('#', '');
    const octave = match[2] ? parseInt(match[2]) : 3;
    
    const basePos = BASS_CLEF_POSITIONS_BASE[baseNote] || 0;
    const octaveOffset = (octave - 3) * 7; // Reference octave for bass is 3
    
    return basePos + octaveOffset;
}

// Legacy function for backward compatibility
function getStaffPosition(note) {
    return getTrebleStaffPosition(note);
}

// Draw a note on a mini musical staff (treble or bass clef based on note)
function drawStaffNote(centerX, centerY, boxSize, note, color, useGlow = true) {
    const staffHeight = boxSize * 0.6;
    const staffWidth = boxSize * 0.9;
    const lineSpacing = staffHeight / 4;
    const staffTop = centerY - staffHeight / 2 - lineSpacing * 0.5;
    const staffLeft = centerX - staffWidth / 2;
    
    const isSharp = note.includes('#');
    const useBassClef = shouldUseBassClef(note);
    
    // Get note position based on which clef we're using
    let notePos;
    if (useBassClef) {
        notePos = getBassStaffPosition(note);
    } else {
        notePos = getTrebleStaffPosition(note);
    }
    
    // Draw 5 staff lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
        const y = staffTop + i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(staffLeft, y);
        ctx.lineTo(staffLeft + staffWidth, y);
        ctx.stroke();
    }
    
    // Draw clef symbol on left side
    const clefX = staffLeft + 3;
    const clefY = staffTop + lineSpacing * 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    if (useBassClef) {
        // Bass clef (𝄢)
        ctx.font = `${Math.floor(staffHeight * 1.1)}px serif`;
        ctx.fillText('𝄢', clefX, clefY - lineSpacing * 0.2);
    } else {
        // Treble clef (𝄞)
        ctx.font = `${Math.floor(staffHeight * 1.3)}px serif`;
        ctx.fillText('𝄞', clefX, clefY + lineSpacing * 0.3);
    }
    
    // Calculate note Y position
    const middleLineY = staffTop + 2 * lineSpacing;
    const noteY = middleLineY - (notePos * lineSpacing / 2);
    const noteX = centerX + boxSize * 0.15;
    
    // Note head size scales with box
    const noteHeadWidth = lineSpacing * 0.7;
    const noteHeadHeight = lineSpacing * 0.55;
    
    // Draw ledger lines if needed
    const staffBottom = staffTop + 4 * lineSpacing;
    
    // Ledger lines below the staff
    if (noteY > staffBottom + lineSpacing / 2) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        for (let ledgerY = staffBottom + lineSpacing; ledgerY <= noteY + lineSpacing / 2; ledgerY += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(noteX - noteHeadWidth - 4, ledgerY);
            ctx.lineTo(noteX + noteHeadWidth + 4, ledgerY);
            ctx.stroke();
        }
    }
    
    // Ledger lines above the staff
    if (noteY < staffTop - lineSpacing / 2) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        for (let ledgerY = staffTop - lineSpacing; ledgerY >= noteY - lineSpacing / 2; ledgerY -= lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(noteX - noteHeadWidth - 4, ledgerY);
            ctx.lineTo(noteX + noteHeadWidth + 4, ledgerY);
            ctx.stroke();
        }
    }
    
    // Draw the note head (filled oval)
    ctx.fillStyle = color;
    if (useGlow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.save();
    ctx.translate(noteX, noteY);
    ctx.rotate(-0.3);
    ctx.scale(1, noteHeadHeight / noteHeadWidth);
    ctx.arc(0, 0, noteHeadWidth, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
    
    // White outline for visibility
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw note stem
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const stemLength = lineSpacing * 2.5;
    ctx.beginPath();
    if (notePos < 0) {
        // Stem goes up for lower notes
        ctx.moveTo(noteX + noteHeadWidth - 1, noteY);
        ctx.lineTo(noteX + noteHeadWidth - 1, noteY - stemLength);
    } else {
        // Stem goes down for higher notes
        ctx.moveTo(noteX - noteHeadWidth + 1, noteY);
        ctx.lineTo(noteX - noteHeadWidth + 1, noteY + stemLength);
    }
    ctx.stroke();
    
    // Draw sharp symbol if needed
    if (isSharp) {
        ctx.fillStyle = '#ffff00';
        if (useGlow) {
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 5;
        }
        ctx.font = `bold ${Math.floor(lineSpacing * 1.2)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♯', noteX - noteHeadWidth - 8, noteY);
        ctx.shadowBlur = 0;
    }
}

// ============================================
// SPRITE PATTERNS
// ============================================

const SPRITES = {
    castle: [
        '  W W W  ',
        ' W#####W ',
        ' ##B#B## ',
        ' ####### ',
        'W#######W',
        '####B####',
        '####B####',
        '#########',
    ],
    bat: [
        ' #     # ',
        '##     ##',
        '###   ###',
        '#### ####',
        '#########',
        ' ### ### ',
        '  #W W#  ',
        '   ###   ',
    ],
    blob: [
        '   ###   ',
        '  #####  ',
        ' ##W#W## ',
        ' ####### ',
        '######### ',
        '###   ###',
        ' ##   ## ',
        '  #   #  ',
    ],
    slime: [
        '         ',
        '  #####  ',
        ' ####### ',
        '##W###W##',
        '#########',
        '#########',
        ' ####### ',
        '   # #   ',
    ],
    ghost: [
        '  #####  ',
        ' ####### ',
        '##W###W##',
        '#########',
        '#########',
        '#########',
        '## # # ##',
        '#  # #  #',
    ],
    skull: [
        '  #####  ',
        ' ####### ',
        '##B###B##',
        '## ### ##',
        ' ####### ',
        '  #####  ',
        '  #B#B#  ',
        '   ###   ',
    ],
    // Default boss sprite
    boss: [
        '  P     P  ',
        ' P#P   P#P ',
        'P###P P###P',
        ' ######### ',
        '###########',
        '##EE###EE##',
        '###########',
        '##BBBBBBB##',
        '###########',
        ' ######### ',
        '  ## # ##  ',
        '  #  #  #  ',
    ],
    // Shadow Wraith - ghostly, flowing wisps
    shadowWraith: [
        '    ###    ',
        '   #####   ',
        '  ##EEE##  ',
        '  #E###E#  ',
        ' ######### ',
        '  #######  ',
        '   #####   ',
        '  ##   ##  ',
        ' ##     ## ',
        '##       ##',
        '#    #    #',
        '     #     ',
    ],
    // Fire Demon - horned, fiery
    fireDemon: [
        ' P       P ',
        'P#P     P#P',
        '###P   P###',
        ' ######### ',
        '###########',
        '##EE###EE##',
        '###########',
        '##BBBBBBB##',
        '###########',
        ' P#######P ',
        'P## ### ##P',
        '##  ###  ##',
    ],
    // Ice Golem - crystalline, geometric
    iceGolem: [
        '   P###P   ',
        '  P#####P  ',
        ' P#######P ',
        '###########',
        '##EE###EE##',
        '###########',
        '###########',
        '###########',
        ' ######### ',
        '  #######  ',
        '  ### ###  ',
        '  ##   ##  ',
    ],
    // Storm Specter - electric, jagged
    stormSpecter: [
        ' P   #   P ',
        'P#P #P# P#P',
        ' ######### ',
        '###########',
        '##EEE#EEE##',
        '###########',
        'P#########P',
        ' P#######P ',
        '  P#####P  ',
        '   P###P   ',
        '  P# # #P  ',
        ' P   #   P ',
    ],
    // Void Lord - dark tendrils, many eyes
    voidLord: [
        'P         P',
        '#P       P#',
        '##P     P##',
        '###########',
        '##E##E##E##',
        '###########',
        '###########',
        '###########',
        'P#########P',
        '##P     P##',
        '# P     P #',
        'P    P    P',
    ],
    // Crystal Dragon - dragon head shape
    crystalDragon: [
        '      P####',
        '     P#####',
        '    P######',
        '###########',
        '##EE####### ',
        '########## ',
        '###########',
        '###BBBBB###',
        ' ######### ',
        '  #######  ',
        '  ##   ##  ',
        ' P#P   P#P ',
    ],
    // Plague Beast - dripping, diseased
    plagueBeast: [
        '   #####   ',
        '  #######  ',
        ' ######### ',
        '###EE#EE###',
        '###########',
        '###BBBBB###',
        '###########',
        ' #P#####P# ',
        '  P#####P  ',
        '  P## ##P  ',
        ' P #   # P ',
        'P    P    P',
    ],
    // Blood Moon - circular, with tendrils
    bloodMoon: [
        '    ###    ',
        '  #######  ',
        ' ######### ',
        '###EE#EE###',
        '###########',
        '###########',
        '###########',
        ' ######### ',
        '  #######  ',
        'P  #####  P',
        '#P  ###  P#',
        '##P     P##',
    ]
};

// ============================================
// BACKGROUND DRAWING
// ============================================

function drawBackground() {
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.12)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= canvas.width; x += CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y <= canvas.height; y += CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// ============================================
// UI DRAWING
// ============================================

function drawActivePowerupIndicator() {
    const x = canvas.width - 150;
    const y = 150;
    const width = 130;
    const height = 60;
    
    const powerupInfo = gameState.activePowerup === 'SPREADSHOT' 
        ? { color: '#00ffff', name: 'SPREAD' }
        : { color: '#ff6600', name: 'BOMB' };
    
    ctx.save();
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x - width / 2, y - height / 2, width, height);
    
    // Border with glow
    ctx.shadowColor = powerupInfo.color;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = powerupInfo.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);
    ctx.shadowBlur = 0;
    
    // Powerup name
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = powerupInfo.color;
    ctx.fillText(powerupInfo.name, x, y - 10);
    
    // Shots remaining as circles
    ctx.fillStyle = powerupInfo.color;
    const circleSpacing = 20;
    const startX = x - ((gameState.powerupShotsRemaining - 1) * circleSpacing) / 2;
    for (let i = 0; i < gameState.powerupShotsRemaining; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * circleSpacing, y + 12, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawUI() {
    ctx.save();
    
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${gameState.score}`, 30, 50);
    
    // Combo display - always visible
    const multiplier = getComboMultiplier();
    const hasActiveCombo = gameState.combo > 0;
    const comboAlpha = hasActiveCombo ? Math.min(1, 0.5 + gameState.comboTimer / 60) : 0.5;
    const comboScale = hasActiveCombo ? 1 + (gameState.comboTimer / 60) * 0.2 : 1;
    
    ctx.save();
    ctx.translate(30, 90);
    ctx.scale(comboScale, comboScale);
    
    // Combo number with glow - dimmer when at 0
    ctx.shadowColor = gameState.combo >= 25 ? '#ff00ff' : 
                      gameState.combo >= 15 ? '#ff8800' : 
                      gameState.combo >= 10 ? '#ffff00' : 
                      gameState.combo >= 5 ? '#00ffff' : 
                      gameState.combo > 0 ? '#ffffff' : '#666666';
    ctx.shadowBlur = hasActiveCombo ? 15 : 5;
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillStyle = ctx.shadowColor;
    ctx.globalAlpha = comboAlpha;
    ctx.fillText(`${gameState.combo} COMBO`, 0, 0);
    
    ctx.restore();
    
    // Multiplier display with special effects when it increases
    ctx.save();
    const multX = 30;
    const multY = 120;
    
    // Apply scale and position for multiplier
    ctx.translate(multX, multY);
    ctx.scale(gameState.multiplierScale, gameState.multiplierScale);
    
    ctx.restore();
    
    // MASSIVE glow effect when multiplier increases - quarter screen size!
    if (gameState.multiplierFlash > 0) {
        ctx.save();
        
        const flashColor = multiplier >= 4 ? '#ff00ff' : 
                          multiplier >= 3 ? '#ff8800' : 
                          multiplier >= 2 ? '#ffff00' : '#00ffff';
        
        // Calculate bloom size - up to quarter of screen
        const maxBloom = Math.min(canvas.width, canvas.height) / 2;
        const bloomSize = maxBloom * gameState.multiplierFlash;
        
        // Draw from center-ish of screen for dramatic effect
        const centerX = canvas.width / 4;
        const centerY = 150;
        
        // Multiple bloom layers for intensity
        for (let layer = 3; layer >= 0; layer--) {
            const layerSize = bloomSize * (1 + layer * 0.2);
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, layerSize);
            
            if (layer === 0) {
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.1, flashColor);
                gradient.addColorStop(0.4, flashColor + 'aa');
                gradient.addColorStop(0.7, flashColor + '44');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            } else {
                gradient.addColorStop(0, flashColor + Math.floor(80 / layer).toString(16).padStart(2, '0'));
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
            }
            
            ctx.globalAlpha = gameState.multiplierFlash * (layer === 0 ? 0.9 : 0.3);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, layerSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Rays shooting out
        const rayCount = 12;
        for (let i = 0; i < rayCount; i++) {
            const angle = (i / rayCount) * Math.PI * 2 + gameState.multiplierFlash * 2;
            const rayLen = bloomSize * 0.8;
            
            ctx.strokeStyle = flashColor;
            ctx.globalAlpha = gameState.multiplierFlash * 0.6;
            ctx.lineWidth = 4 + gameState.multiplierFlash * 10;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle) * rayLen,
                centerY + Math.sin(angle) * rayLen
            );
            ctx.stroke();
        }
        
        // Big "MULTIPLIER UP!" text in center of effect
        ctx.globalAlpha = gameState.multiplierFlash;
        ctx.font = `bold ${24 + gameState.multiplierFlash * 30}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = flashColor;
        ctx.shadowBlur = 30;
        ctx.fillText(`x${multiplier} MULTIPLIER!`, centerX, centerY + 10);
        
        ctx.restore();
    }
    
    // Multiplier text (always visible in corner)
    ctx.save();
    ctx.translate(multX, multY);
    ctx.scale(Math.min(gameState.multiplierScale, 3), Math.min(gameState.multiplierScale, 3));
    
    ctx.globalAlpha = comboAlpha;
    const multColor = multiplier >= 4 ? '#ff00ff' : 
                     multiplier >= 3 ? '#ff8800' : 
                     multiplier >= 2.5 ? '#ffcc00' :
                     multiplier >= 2 ? '#ffff00' : 
                     multiplier >= 1.5 ? '#00ffff' : 
                     hasActiveCombo ? '#ffffff' : '#666666';
    
    ctx.shadowColor = multColor;
    ctx.shadowBlur = gameState.multiplierFlash > 0 ? 30 + gameState.multiplierFlash * 60 : (hasActiveCombo ? 10 : 3);
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = gameState.multiplierFlash > 0.5 ? '#ffffff' : multColor;
    ctx.textAlign = 'left';
    ctx.fillText(`x${multiplier}`, 0, 0);
    
    ctx.restore();
    
    // Combo break power-down effect - contained erasing effect
    if (gameState.comboBreakTimer > 0) {
        const progress = 1 - (gameState.comboBreakTimer / gameState.comboBreakDuration);
        const intensity = Math.min(gameState.comboBreakValue / 25, 1);
        const comboAreaX = 30;
        const comboAreaY = 75;
        const comboAreaWidth = 180;
        const comboAreaHeight = 50;
        
        // Draw erasing scan lines (horizontal wipes) - optimized
        for (let i = 0, len = gameState.comboBreakParticles.length; i < len; i++) {
            const p = gameState.comboBreakParticles[i];
            if (p.type === 'eraseLine' && p.alpha > 0) {
                ctx.save();
                
                // Each line sweeps from left to right
                const lineProgress = Math.max(0, Math.min(1, p.progress));
                if (lineProgress > 0 && lineProgress < 1) {
                    const sweepX = p.x + lineProgress * p.width;
                    
                    // Main erase line (bright leading edge)
                    ctx.globalAlpha = p.alpha * (1 - lineProgress * 0.7);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(sweepX, p.y - 3);
                    ctx.lineTo(sweepX, p.y + 3);
                    ctx.stroke();
                    
                    // Trailing fade effect (the "erased" area darkens)
                    const trailWidth = lineProgress * p.width;
                    const gradient = ctx.createLinearGradient(p.x, p.y, sweepX, p.y);
                    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                    gradient.addColorStop(0.7, `rgba(20, 20, 30, ${0.3 * p.alpha})`);
                    gradient.addColorStop(1, `rgba(40, 40, 50, ${0.5 * p.alpha})`);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(p.x, p.y - 4, trailWidth, 8);
                }
                
                ctx.restore();
            } else if (p.type === 'glitch' && p.alpha > 0) {
                // Small glitch particles (contained within combo area)
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 4;
                
                // Horizontal glitch line
                ctx.fillRect(p.x, p.y, p.size * 2, 2);
                
                ctx.restore();
            }
        }
        
        // "COMBO BREAK" text - smaller and contained
        if (progress < 0.6) {
            ctx.save();
            const textProgress = progress / 0.6;
            const textAlpha = Math.pow(1 - textProgress, 0.5);
            
            // Position near the combo display
            ctx.translate(comboAreaX + comboAreaWidth / 2, comboAreaY + comboAreaHeight + 20);
            ctx.globalAlpha = textAlpha;
            
            // Subtle glow
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 8;
            
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff6666';
            ctx.fillText('COMBO BREAK', 0, 0);
            
            // Show the lost combo value
            ctx.font = 'bold 14px "Courier New", monospace';
            ctx.fillStyle = '#ff8888';
            ctx.globalAlpha = textAlpha * 0.8;
            ctx.fillText(`-${gameState.comboBreakValue}`, 0, 18);
            
            ctx.restore();
        }
        
        // Static/interference overlay on the combo area
        if (progress < 0.4) {
            ctx.save();
            ctx.globalAlpha = (1 - progress / 0.4) * 0.3;
            
            // Draw static lines within the combo area
            for (let i = 0; i < 5; i++) {
                const y = comboAreaY + Math.random() * comboAreaHeight;
                const lineWidth = 20 + Math.random() * 60;
                const lineX = comboAreaX + Math.random() * (comboAreaWidth - lineWidth);
                
                ctx.fillStyle = `rgba(100, 100, 120, ${0.3 + Math.random() * 0.4})`;
                ctx.fillRect(lineX, y, lineWidth, 1 + Math.random() * 2);
            }
            
            ctx.restore();
        }
    }
    
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px "Courier New", monospace';
    ctx.fillText(`WAVE ${gameState.level}`, canvas.width / 2, 50);
    
    // Display current scale (music mode only)
    if (gameState.gameMode === 'music') {
        const currentScale = getScaleForLevel(gameState.level);
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.fillStyle = '#4dffff';
        ctx.shadowColor = '#4dffff';
        ctx.shadowBlur = 10;
        ctx.fillText(currentScale.name.toUpperCase(), canvas.width / 2, 82);
        ctx.shadowBlur = 0;
        
        // Show scale notes
        ctx.font = '14px "Courier New", monospace';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(currentScale.notes.join('  '), canvas.width / 2, 102);
    }
    
    ctx.textAlign = 'right';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = gameState.midiConnected ? '#4dff88' : '#888888';
    ctx.fillText(gameState.midiConnected ? 'MIDI CONNECTED' : 'AWAITING MIDI', canvas.width - 30, 40);
    
    // Health bar
    const healthBarWidth = 500;
    const healthBarHeight = 35;
    const healthBarX = canvas.width / 2 - healthBarWidth / 2;
    const healthBarY = canvas.height - 80;
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('♥ HEALTH ♥', canvas.width / 2, healthBarY - 15);
    
    // Health restore animation glow effect
    if (gameState.healthRestoreActive) {
        const pulsePhase = gameState.healthRestoreTimer * 0.15;
        const glowIntensity = 0.5 + Math.sin(pulsePhase) * 0.3;
        
        ctx.save();
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 30 + Math.sin(pulsePhase * 2) * 15;
        ctx.strokeStyle = `rgba(0, 255, 0, ${glowIntensity})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(healthBarX - 5, healthBarY - 5, healthBarWidth + 10, healthBarHeight + 10);
        ctx.restore();
    }
    
    ctx.fillStyle = '#333';
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    
    const healthPercent = gameState.health / gameState.maxHealth;
    
    // During health restore, use green color
    if (gameState.healthRestoreActive) {
        // Gradient from current to restored portion
        const gradient = ctx.createLinearGradient(healthBarX, 0, healthBarX + healthBarWidth, 0);
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(healthPercent, '#00ff00');
        gradient.addColorStop(healthPercent + 0.01, '#004400');
        gradient.addColorStop(1, '#004400');
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = '#ff4d6d';
    }
    ctx.fillRect(healthBarX + 3, healthBarY + 3, (healthBarWidth - 6) * healthPercent, healthBarHeight - 6);
    
    ctx.strokeStyle = gameState.healthRestoreActive ? '#00ff00' : '#ff4d6d';
    ctx.lineWidth = 3;
    ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    
    ctx.textAlign = 'left';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('WHITE KEYS: A - K  |  BLACK KEYS: W - U  |  M: MUSIC  |  SPACE: PAUSE', 30, canvas.height - 35);
    
    // Music status
    ctx.textAlign = 'right';
    ctx.fillStyle = musicPlaying ? '#4dff88' : '#666';
    ctx.fillText(musicPlaying ? '♪ MUSIC ON' : '♪ MUSIC OFF', canvas.width - 30, 70);
    
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(gameState.paused ? '▶ PLAY' : '❚❚ PAUSE', canvas.width - 30, canvas.height - 35);
    
    // Draw boss countdown
    if (gameState.boss && gameState.boss.entrancePhase === 'countdown' && gameState.boss.countdownNumber > 0) {
        const boss = gameState.boss;
        const scale = boss.countdownScale;
        
        // Base font size matches player size (80px), scale makes it 3x at start
        const baseFontSize = CONFIG.playerSize; // 80px - same as player
        const fontSize = baseFontSize * scale;
        
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        
        // Glow effect - scales with size
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 20 * scale;
        
        // Draw the number
        ctx.font = `bold ${fontSize}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Outline - scales with size
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * scale;
        ctx.strokeText(boss.countdownNumber.toString(), 0, 0);
        
        // Fill with gradient
        const gradientSize = fontSize / 2;
        const gradient = ctx.createLinearGradient(0, -gradientSize, 0, gradientSize);
        gradient.addColorStop(0, '#ff6666');
        gradient.addColorStop(0.5, '#ff0000');
        gradient.addColorStop(1, '#aa0000');
        ctx.fillStyle = gradient;
        ctx.fillText(boss.countdownNumber.toString(), 0, 0);
        
        ctx.restore();
    }
    
    ctx.restore();
}

// ============================================
// PLAYER CLASS
// ============================================

class Player {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.size = CONFIG.playerSize;
        this.color = '#4dffff';
        this.pulsePhase = 0;
        this.powerupPhase = 0;
        this.spreadBalls = []; // For spreadshot orbiting balls
        this.bombSparks = []; // For bomb sparks
    }

    update() {
        this.powerupPhase += 0.08;
        
        // Update spreadshot orbiting balls
        if (gameState.activePowerup === 'SPREADSHOT') {
            // Ensure we have 3 balls
            while (this.spreadBalls.length < 3) {
                this.spreadBalls.push({
                    angle: (this.spreadBalls.length / 3) * Math.PI * 2,
                    size: 12 + Math.random() * 4
                });
            }
        } else {
            this.spreadBalls = [];
        }
        
        // Update bomb sparks
        if (gameState.activePowerup === 'BOMB') {
            // Spawn new sparks
            if (Math.random() < 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 40 + Math.random() * 30;
                this.bombSparks.push({
                    x: this.x + Math.cos(angle) * dist,
                    y: this.y + Math.sin(angle) * dist,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4 - 2,
                    life: 30 + Math.random() * 20,
                    size: 2 + Math.random() * 3
                });
            }
            // Update existing sparks
            this.bombSparks = this.bombSparks.filter(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.vy += 0.1; // Gravity
                s.life--;
                return s.life > 0;
            });
        } else {
            this.bombSparks = [];
        }
    }

    draw() {
        this.pulsePhase += 0.05;
        
        // HD-2D style warm ambient light (like torch light)
        const pulseAmount = Math.sin(this.pulsePhase) * 0.1;
        const glowSize = 180 + Math.sin(this.pulsePhase * 0.7) * 20;
        
        // Outer warm ambient glow
        const ambientGradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize);
        ambientGradient.addColorStop(0, `rgba(100, 200, 255, ${0.15 + pulseAmount})`);
        ambientGradient.addColorStop(0.4, `rgba(80, 180, 255, ${0.08 + pulseAmount * 0.5})`);
        ambientGradient.addColorStop(0.7, 'rgba(60, 150, 200, 0.03)');
        ambientGradient.addColorStop(1, 'rgba(40, 100, 150, 0)');
        ctx.fillStyle = ambientGradient;
        ctx.fillRect(this.x - glowSize, this.y - glowSize, glowSize * 2, glowSize * 2);
        
        // POWERUP VISUAL EFFECTS
        if (gameState.activePowerup && gameState.powerupShotsRemaining > 0) {
            const powerupColor = gameState.activePowerup === 'SPREADSHOT' ? '#00ffff' : '#ff6600';
            const pulseIntensity = 0.3 + Math.sin(this.powerupPhase * 2) * 0.2;
            
            // Pulsing glow ring around character
            const ringSize = 100 + Math.sin(this.powerupPhase * 1.5) * 15;
            ctx.save();
            ctx.strokeStyle = powerupColor;
            ctx.lineWidth = 4 + Math.sin(this.powerupPhase * 3) * 2;
            ctx.globalAlpha = pulseIntensity;
            ctx.shadowColor = powerupColor;
            ctx.shadowBlur = 30;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringSize, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner pulsing glow
            const innerGlow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, ringSize);
            innerGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
            innerGlow.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
            innerGlow.addColorStop(0.85, powerupColor + '33');
            innerGlow.addColorStop(1, powerupColor + '00');
            ctx.globalAlpha = pulseIntensity * 1.5;
            ctx.fillStyle = innerGlow;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ringSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            
            // SPREADSHOT: 3 orbiting energy balls
            if (gameState.activePowerup === 'SPREADSHOT') {
                for (let i = 0; i < this.spreadBalls.length; i++) {
                    const ball = this.spreadBalls[i];
                    ball.angle += 0.05; // Orbit speed
                    
                    const orbitRadius = 70 + Math.sin(this.powerupPhase + i) * 10;
                    const bx = this.x + Math.cos(ball.angle) * orbitRadius;
                    const by = this.y + Math.sin(ball.angle) * orbitRadius;
                    const ballSize = ball.size + Math.sin(this.powerupPhase * 2 + i) * 3;
                    
                    ctx.save();
                    ctx.shadowColor = '#00ffff';
                    ctx.shadowBlur = 20;
                    
                    // Ball glow
                    const ballGrad = ctx.createRadialGradient(bx, by, 0, bx, by, ballSize * 2);
                    ballGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                    ballGrad.addColorStop(0.3, 'rgba(100, 255, 255, 0.7)');
                    ballGrad.addColorStop(0.7, 'rgba(0, 255, 255, 0.3)');
                    ballGrad.addColorStop(1, 'rgba(0, 200, 255, 0)');
                    ctx.fillStyle = ballGrad;
                    ctx.beginPath();
                    ctx.arc(bx, by, ballSize * 2, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Ball core
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(bx, by, ballSize * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            
            // BOMB: Red/orange sparks flying around
            if (gameState.activePowerup === 'BOMB') {
                for (const spark of this.bombSparks) {
                    const alpha = spark.life / 50;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 10;
                    
                    // Spark gradient
                    const sparkGrad = ctx.createRadialGradient(spark.x, spark.y, 0, spark.x, spark.y, spark.size * 2);
                    sparkGrad.addColorStop(0, '#ffffff');
                    sparkGrad.addColorStop(0.3, '#ffff00');
                    sparkGrad.addColorStop(0.6, '#ff6600');
                    sparkGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                    ctx.fillStyle = sparkGrad;
                    ctx.beginPath();
                    ctx.arc(spark.x, spark.y, spark.size * 2, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.restore();
                }
            }
        }
        
        // Inner bright core glow
        const coreSize = 60 + Math.sin(this.pulsePhase * 1.5) * 8;
        const coreGradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreSize);
        coreGradient.addColorStop(0, 'rgba(200, 255, 255, 0.4)');
        coreGradient.addColorStop(0.5, 'rgba(77, 255, 255, 0.2)');
        coreGradient.addColorStop(1, 'rgba(77, 200, 255, 0)');
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, coreSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Sprite with shadow glow
        ctx.shadowColor = '#4dffff';
        ctx.shadowBlur = 30;
        drawSprite(this.x, this.y, SPRITES.castle, 8, this.color);
        ctx.shadowBlur = 0;
        
        // Draw ammo circles underneath the player
        this.drawAmmo();
    }
    
    drawAmmo() {
        const circleRadius = 7;
        const spacing = 20;
        const startX = this.x - (gameState.maxAmmo - 1) * spacing / 2;
        const y = this.y + 70; // Below the player
        
        for (let i = 0; i < gameState.maxAmmo; i++) {
            const x = startX + i * spacing;
            const hasAmmo = i < gameState.currentAmmo;
            const isRecharging = i === gameState.currentAmmo && gameState.currentAmmo < gameState.maxAmmo;
            const flash = gameState.ammoFlash[i] || 0;
            
            ctx.save();
            
            // Background circle (dark)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x, y, circleRadius + 2, 0, Math.PI * 2);
            ctx.fill();
            
            if (hasAmmo) {
                // Full ammo - bright cyan with glow
                ctx.shadowColor = '#4dffff';
                ctx.shadowBlur = 10 + flash * 20;
                
                // Flash effect when recharged
                if (flash > 0) {
                    const flashSize = circleRadius + flash * 5;
                    ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(x, y, flashSize, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Main circle with gradient
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, circleRadius);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, '#4dffff');
                gradient.addColorStop(1, '#0088aa');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.fill();
                
            } else if (isRecharging) {
                // Recharging - show progress
                const progress = gameState.ammoRechargeTimer / gameState.ammoRechargeRate;
                
                // Grey background
                ctx.fillStyle = '#333333';
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.fill();
                
                // Progress fill (from bottom to top using clip)
                ctx.save();
                ctx.beginPath();
                ctx.rect(x - circleRadius, y + circleRadius - circleRadius * 2 * progress, circleRadius * 2, circleRadius * 2 * progress);
                ctx.clip();
                
                // Charging gradient
                const chargeGradient = ctx.createRadialGradient(x, y, 0, x, y, circleRadius);
                chargeGradient.addColorStop(0, '#88ffff');
                chargeGradient.addColorStop(0.5, '#44aaaa');
                chargeGradient.addColorStop(1, '#226666');
                ctx.fillStyle = chargeGradient;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                
                // Pulsing border to show active recharge
                const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
                ctx.strokeStyle = `rgba(77, 255, 255, ${pulse})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
                
            } else {
                // Empty - greyed out
                ctx.fillStyle = '#333333';
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Border
            ctx.strokeStyle = hasAmmo ? '#4dffff' : '#555555';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
    }
}

// ============================================
// ENEMY CLASS
// ============================================

class Enemy {
    constructor(noteOrLetter, mode = 'music') {
        this.mode = mode;
        
        if (mode === 'typing') {
            // Typing mode: noteOrLetter can be a single letter or multiple letters (e.g., "AB")
            this.letters = noteOrLetter; // Full string of letters to type
            this.letter = noteOrLetter.charAt(0); // Current letter to match (first one)
            this.lettersTyped = 0; // How many letters have been typed
            this.note = null;
            this.color = LETTER_COLORS[this.letter] || '#ffffff';
            // Use consistent enemy type based on first letter
            const typeIndex = this.letter.charCodeAt(0) % 5;
            const types = ['bat', 'blob', 'slime', 'ghost', 'skull'];
            this.type = types[typeIndex];
        } else {
            // Music mode: noteOrLetter is a note
            this.note = noteOrLetter;
            this.letter = null;
            this.color = getNoteColor(noteOrLetter);
            this.type = getEnemyType(noteOrLetter);
        }
        
        this.size = CONFIG.enemySize;
        
        // Apply difficulty speed multiplier
        const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
        const variance = (Math.random() - 0.5) * 2 * CONFIG.enemySpeedVariance;
        this.speed = (CONFIG.enemyBaseSpeed + variance + (gameState.level - 1) * 0.02) * diffSettings.enemySpeedMultiplier;
        
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
            case 0: this.x = Math.random() * canvas.width; this.y = -this.size; break;
            case 1: this.x = canvas.width + this.size; this.y = Math.random() * canvas.height; break;
            case 2: this.x = Math.random() * canvas.width; this.y = canvas.height + this.size; break;
            case 3: this.x = -this.size; this.y = Math.random() * canvas.height; break;
        }
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
        
        this.alive = true;
        this.animPhase = Math.random() * Math.PI * 2;
        
        // Dynamic movement properties - gentle undulation (reduced for readability)
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.02 + Math.random() * 0.01; // Much slower wobble
        this.wobbleAmount = 0.03 + Math.random() * 0.02; // Much less rotation
        this.floatPhase = Math.random() * Math.PI * 2;
        this.floatSpeed = 0.015 + Math.random() * 0.01; // Slower floating
        this.scalePhase = Math.random() * Math.PI * 2;
        this.baseScale = 0.98 + Math.random() * 0.04; // Less scale variation
        
        // Inertia/smoothing
        this.targetVx = this.vx;
        this.targetVy = this.vy;
        this.actualVx = this.vx * 0.3;
        this.actualVy = this.vy * 0.3;
        
        // Slight zigzag movement
        this.zigzagTimer = 0;
        this.zigzagDir = Math.random() > 0.5 ? 1 : -1;
        this.zigzagInterval = 60 + Math.random() * 60;
        
        // Death animation state
        this.dying = false;
        this.deathTimer = 0;
        this.deathDuration = 120; // 2 seconds at 60fps
        this.opacity = 1;
        this.hitGlow = 0; // Glow intensity when hit
        
        // Note popup animation state
        this.notePopup = {
            active: false,
            scale: 0,
            alpha: 0,
            x: 0, // Horizontal offset from box center
            y: 0, // Vertical offset from box center
            phase: 'growing' // 'growing', 'holding', 'fading'
        };
        
        // Timer system for higher difficulties (reuse diffSettings from above)
        const diffSettingsTimer = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
        this.hasTimer = diffSettingsTimer.enemyTimer > 0;
        this.timerDuration = diffSettingsTimer.enemyTimer;
        this.timerRemaining = this.timerDuration;
        this.canChangeNote = diffSettingsTimer.noteChanges;
        this.noteChangeFlash = 0; // Visual effect when note changes
    }
    
    // Called when hit by lightning
    startDying() {
        if (!this.dying) {
            this.dying = true;
            this.hitGlow = 1; // Start with full glow
            this.vx = 0; // Stop moving
            this.vy = 0;
            
            // Trigger note popup animation
            this.notePopup = {
                active: true,
                scale: 0.5,
                alpha: 1,
                x: 0,
                y: 0,
                phase: 'growing'
            };
            
            // Create box fragments for breaking effect (box is below enemy now)
            this.boxFragments = [];
            const boxCenterX = this.x;
            const boxCenterY = this.y + this.size / 2 + 45; // Below the enemy
            
            // Create 8-12 fragments
            const fragCount = 8 + Math.floor(Math.random() * 5);
            for (let i = 0; i < fragCount; i++) {
                const angle = (Math.PI * 2 * i) / fragCount + Math.random() * 0.5;
                const speed = 2 + Math.random() * 3;
                this.boxFragments.push({
                    x: boxCenterX + (Math.random() - 0.5) * 50,
                    y: boxCenterY + (Math.random() - 0.5) * 50,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed + 1, // Slight downward bias now
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.3,
                    size: 6 + Math.random() * 10,
                    opacity: 1,
                    isGlow: Math.random() > 0.6 // Some fragments are glowing
                });
            }
        }
    }
    
    // Change to a different note/letter (for "Are You Crazy?" difficulty)
    changeNote() {
        if (this.mode === 'music') {
            // Get a different note than current
            let newNote;
            let attempts = 0;
            do {
                newNote = getRandomNoteForLevel(gameState.level, gameState.midiConnected);
                attempts++;
            } while (newNote === this.note && attempts < 10);
            
            this.note = newNote;
            this.color = getNoteColor(newNote);
            this.type = getEnemyType(newNote);
        } else {
            // Typing mode: change all remaining letters
            const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
            const letterSource = diffSettings.availableLetters || TYPING_LETTERS;
            const availableLetters = letterSource.slice(0, Math.min(7 + gameState.level * 2, letterSource.length));
            
            // Generate new letters for remaining positions
            let newLetters = this.letters.substring(0, this.lettersTyped); // Keep already typed letters
            for (let i = this.lettersTyped; i < this.letters.length; i++) {
                const newLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
                newLetters += newLetter;
            }
            
            this.letters = newLetters;
            this.letter = this.letters.charAt(this.lettersTyped);
            this.color = LETTER_COLORS[this.letter] || '#ffffff';
        }
    }
    
    // Called when a letter is typed correctly (for multi-letter enemies)
    typeLetter() {
        if (this.mode !== 'typing') return false;
        
        this.lettersTyped++;
        
        if (this.lettersTyped >= this.letters.length) {
            // All letters typed - enemy is defeated
            return true; // Signal to start dying
        }
        
        // Update to next letter
        this.letter = this.letters.charAt(this.lettersTyped);
        this.color = LETTER_COLORS[this.letter] || '#ffffff';
        this.noteChangeFlash = 0.5; // Visual feedback
        
        return false; // Not defeated yet
    }

    update() {
        if (this.dying) {
            // Dying animation - fade out over 2 seconds
            this.deathTimer++;
            this.opacity = 1 - (this.deathTimer / this.deathDuration);
            this.hitGlow = Math.max(0, this.hitGlow - 0.02); // Glow fades faster
            
            // Update note popup animation - floats up and to the side
            if (this.notePopup && this.notePopup.active) {
                if (this.notePopup.phase === 'growing') {
                    this.notePopup.scale += 0.12; // Grow quickly
                    this.notePopup.x += 2; // Move to the right
                    this.notePopup.y -= 2.5; // Move up
                    if (this.notePopup.scale >= 2.0) {
                        this.notePopup.phase = 'holding';
                        this.notePopup.holdTimer = 70; // Hold for ~1.2 seconds
                    }
                } else if (this.notePopup.phase === 'holding') {
                    // Stay visible at full size, drift slowly up and right
                    this.notePopup.holdTimer--;
                    this.notePopup.x += 0.3;
                    this.notePopup.y -= 0.4;
                    if (this.notePopup.holdTimer <= 0) {
                        this.notePopup.phase = 'fading';
                    }
                } else if (this.notePopup.phase === 'fading') {
                    this.notePopup.x += 0.5; // Continue drifting
                    this.notePopup.y -= 0.6;
                    this.notePopup.alpha -= 0.025; // Fade out over ~40 frames
                    if (this.notePopup.alpha <= 0) {
                        this.notePopup.active = false;
                    }
                }
            }
            
            // Update box fragments (optimized)
            if (this.boxFragments) {
                for (let i = 0, len = this.boxFragments.length; i < len; i++) {
                    const frag = this.boxFragments[i];
                    frag.x += frag.vx;
                    frag.y += frag.vy;
                    frag.vy += 0.1; // Gravity
                    frag.rotation += frag.rotationSpeed;
                    frag.opacity = Math.max(0, frag.opacity - 0.015);
                }
            }
            
            if (this.deathTimer >= this.deathDuration) {
                this.alive = false;
            }
            return;
        }
        
        // Update note change flash effect
        if (this.noteChangeFlash > 0) {
            this.noteChangeFlash -= 0.05;
        }
        
        // Timer system for higher difficulties
        if (this.hasTimer && this.timerRemaining > 0) {
            this.timerRemaining -= 16.67; // Roughly one frame at 60fps
            
            if (this.timerRemaining <= 0) {
                if (this.canChangeNote) {
                    // Change to a different note!
                    this.changeNote();
                    this.timerRemaining = this.timerDuration; // Reset timer
                    this.noteChangeFlash = 1; // Visual effect
                }
                // If canChangeNote is false, timer just expires (visual warning only)
            }
        }
        
        // Update animation phases - slow and gentle
        this.animPhase += 0.03;
        this.wobblePhase += this.wobbleSpeed;
        this.floatPhase += this.floatSpeed;
        this.scalePhase += 0.02;
        
        // Recalculate target direction toward player (slight homing)
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Slight zigzag movement
        this.zigzagTimer++;
        if (this.zigzagTimer > this.zigzagInterval) {
            this.zigzagDir *= -1;
            this.zigzagTimer = 0;
            this.zigzagInterval = 60 + Math.random() * 60;
        }
        
        // Calculate target velocity with slight homing and zigzag
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const zigzag = Math.sin(this.zigzagTimer / this.zigzagInterval * Math.PI) * this.zigzagDir * 0.3;
        
        this.targetVx = (dx / dist) * this.speed + perpX * zigzag;
        this.targetVy = (dy / dist) * this.speed + perpY * zigzag;
        
        // Apply inertia - smooth acceleration toward target velocity
        const inertia = 0.03;
        this.actualVx += (this.targetVx - this.actualVx) * inertia;
        this.actualVy += (this.targetVy - this.actualVy) * inertia;
        
        // Move with actual velocity
        this.x += this.actualVx;
        this.y += this.actualVy;
        
        // Store velocity for stretch effect
        this.vx = this.actualVx;
        this.vy = this.actualVy;
        
        if (dist < (this.size + player.size) / 2) {
            this.alive = false;
            damagePlayer(CONFIG.enemyDamageToPlayer);
        }
    }
    
    // Draw a letter in the note box (typing mode)
    drawLetter(centerX, centerY, boxSize, useGlow = true) {
        ctx.save();
        
        // Check if this is a multi-letter enemy
        if (this.letters && this.letters.length > 1) {
            // Multi-letter enemy - draw all letters with progress indication
            const fontSize = Math.floor(boxSize * 0.45);
            ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const letterSpacing = fontSize * 0.7;
            const startX = centerX - ((this.letters.length - 1) * letterSpacing) / 2;
            
            for (let i = 0; i < this.letters.length; i++) {
                const letterX = startX + i * letterSpacing;
                const char = this.letters.charAt(i);
                const isTyped = i < this.lettersTyped;
                const isCurrent = i === this.lettersTyped;
                const letterColor = LETTER_COLORS[char] || '#ffffff';
                
                if (isTyped) {
                    // Already typed - greyed out with strikethrough
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = '#666666';
                    ctx.fillText(char, letterX, centerY);
                    ctx.globalAlpha = 1;
                } else if (isCurrent) {
                    // Current letter - highlighted with glow
                    if (useGlow) {
                        ctx.shadowColor = letterColor;
                        ctx.shadowBlur = 20;
                    }
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeText(char, letterX, centerY);
                    ctx.fillStyle = letterColor;
                    ctx.fillText(char, letterX, centerY);
                    ctx.shadowBlur = 0;
                } else {
                    // Future letter - dimmed
                    ctx.globalAlpha = 0.6;
                    ctx.fillStyle = '#888888';
                    ctx.fillText(char, letterX, centerY);
                    ctx.globalAlpha = 1;
                }
            }
        } else {
            // Single letter enemy - original behavior
            if (useGlow) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 15;
            }
            
            ctx.font = `bold ${boxSize * 0.6}px 'Courier New', monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White outline for visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.strokeText(this.letter, centerX, centerY);
            
            // Colored fill
            ctx.fillStyle = this.color;
            ctx.fillText(this.letter, centerX, centerY);
        }
        
        ctx.restore();
    }

    draw() {
        // Calculate distance to player for LOD (Level of Detail)
        const distToPlayer = Math.sqrt((this.x - player.x) ** 2 + (this.y - player.y) ** 2);
        const isNearby = distToPlayer < 400; // Full effects for nearby enemies
        const isClose = distToPlayer < 250;  // Extra effects for very close enemies
        
        // Dynamic floating/bobbing - gentle undulation for readability
        const floatY = this.dying ? 0 : Math.sin(this.floatPhase) * 2;
        const floatX = this.dying ? 0 : Math.sin(this.floatPhase * 0.8) * 0.5;
        
        // Wobble rotation based on movement
        const wobble = this.dying ? 0 : Math.sin(this.wobblePhase) * this.wobbleAmount;
        
        // Scale pulsing - subtle for readability
        const scalePulse = this.dying ? (1 - this.deathTimer / this.deathDuration * 0.3) : 
                          this.baseScale + Math.sin(this.scalePhase) * 0.02;
        
        // Stretch based on velocity (squash and stretch)
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const stretchAmount = this.dying ? 1 : 1 + speed * 0.1;
        const moveAngle = Math.atan2(this.vy, this.vx);
        
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // HD-2D style bloom/lighting when hit (only for nearby enemies or when hit)
        if (this.hitGlow > 0 && (isNearby || this.hitGlow > 0.5)) {
            const bloomSize = this.size * 2 * this.hitGlow;
            const gradient = ctx.createRadialGradient(
                this.x + floatX, this.y + floatY, 0,
                this.x + floatX, this.y + floatY, bloomSize
            );
            gradient.addColorStop(0, `rgba(255, 255, 220, ${this.hitGlow * 0.6})`);
            gradient.addColorStop(0.3, `rgba(255, 200, 100, ${this.hitGlow * 0.3})`);
            gradient.addColorStop(0.6, `rgba(255, 150, 50, ${this.hitGlow * 0.1})`);
            gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(this.x + floatX - bloomSize, this.y + floatY - bloomSize, bloomSize * 2, bloomSize * 2);
        }
        
        // Base sprite glow - LOD based (expensive shadowBlur only for nearby)
        if (isClose || this.hitGlow > 0) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = this.hitGlow > 0 ? 25 + this.hitGlow * 20 : 15;
        }
        
        const sprite = SPRITES[this.type] || SPRITES.blob;
        
        // Apply transformations for dynamic feel
        ctx.translate(this.x + floatX, this.y + floatY);
        ctx.rotate(wobble);
        if (!this.dying) {
            ctx.rotate(moveAngle);
            ctx.scale(stretchAmount, 1 / Math.sqrt(stretchAmount));
            ctx.rotate(-moveAngle);
        }
        ctx.scale(scalePulse, scalePulse);
        
        // When hit, flash the sprite brighter
        if (this.hitGlow > 0.5) {
            drawSprite(0, 0, sprite, 6, '#ffffff');
        } else {
            drawSprite(0, 0, sprite, 6, this.color);
        }
        
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.shadowBlur = 0;
        
        // Note box - only show if not dying (positioned below enemy)
        if (!this.dying) {
            const boxSize = 70;
            const boxX = this.x - boxSize / 2;
            const boxY = this.y + this.size / 2 + 10 + floatY;
            
            // Box glow - only for nearby enemies
            if (isNearby) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
            }
            
            // Box background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(boxX, boxY, boxSize, boxSize);
            
            // Box border - pixel art style with multiple layers
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.strokeRect(boxX, boxY, boxSize, boxSize);
            
            // Inner highlight
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(boxX + 2, boxY + 2, boxSize - 4, boxSize - 4);
            
            // Draw content based on mode
            ctx.shadowBlur = 0;
            if (this.mode === 'typing') {
                // Typing mode: draw letter
                this.drawLetter(this.x, boxY + boxSize / 2, boxSize, isNearby);
            } else {
                // Music mode: draw staff notation
                drawStaffNote(this.x, boxY + boxSize / 2, boxSize, this.note, this.color, isNearby);
            }
            
            // Note change flash effect (for "Are You Crazy?" difficulty)
            if (this.noteChangeFlash > 0) {
                ctx.save();
                ctx.globalAlpha = this.noteChangeFlash;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(boxX - 5, boxY - 5, boxSize + 10, boxSize + 10);
                ctx.restore();
            }
            
            // Timer bar for timed enemies (Insane and Crazy difficulties)
            if (this.hasTimer && this.timerRemaining > 0) {
                const timerWidth = boxSize;
                const timerHeight = 6;
                const timerX = boxX;
                const timerY = boxY + boxSize + 4;
                const timerPercent = this.timerRemaining / this.timerDuration;
                
                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(timerX, timerY, timerWidth, timerHeight);
                
                // Timer bar - changes color as time runs out
                let timerColor;
                if (timerPercent > 0.5) {
                    timerColor = '#4dff88'; // Green
                } else if (timerPercent > 0.25) {
                    timerColor = '#ffa94d'; // Orange
                } else {
                    timerColor = '#ff4d6d'; // Red - pulsing
                    ctx.globalAlpha = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
                }
                
                ctx.fillStyle = timerColor;
                ctx.fillRect(timerX, timerY, timerWidth * timerPercent, timerHeight);
                
                // Border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(timerX, timerY, timerWidth, timerHeight);
                ctx.globalAlpha = 1;
            }
        }
        
        // Draw box fragments when dying (optimized)
        if (this.dying && this.boxFragments) {
            for (let i = 0, len = this.boxFragments.length; i < len; i++) {
                const frag = this.boxFragments[i];
                ctx.save();
                ctx.globalAlpha = frag.opacity;
                ctx.translate(frag.x, frag.y);
                ctx.rotate(frag.rotation);
                ctx.fillStyle = frag.isGlow ? this.color : 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                if (!frag.isGlow) {
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                }
                ctx.restore();
            }
        }
        
        // Draw note/letter popup animation when dying - floats up and to the side
        if (this.dying && this.notePopup && this.notePopup.active) {
            const boxCenterX = this.x;
            const boxCenterY = this.y + this.size / 2 + 45;
            const popupX = boxCenterX + this.notePopup.x + 40; // Offset to the right of the box
            const popupY = boxCenterY + this.notePopup.y; // Add vertical offset
            
            ctx.save();
            ctx.globalAlpha = this.notePopup.alpha;
            ctx.translate(popupX, popupY);
            ctx.scale(this.notePopup.scale, this.notePopup.scale);
            
            // Dark background for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(-30, -18, 60, 36);
            
            // Glow effect
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            
            // Draw the note or letter
            ctx.font = 'bold 32px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Get display text based on mode (no octave for notes)
            let displayText;
            if (this.mode === 'typing') {
                displayText = this.letter;
            } else {
                // Strip octave number from note name
                displayText = getBaseNoteName(this.note);
                if (displayText && displayText.includes('#')) {
                    displayText = displayText.replace('#', '♯');
                }
            }
            
            // White outline for visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.strokeText(displayText, 0, 0);
            
            // Colored fill
            ctx.fillStyle = this.color;
            ctx.fillText(displayText, 0, 0);
            
            ctx.restore();
        }
        
        ctx.restore();
    }
}

// ============================================
// POWERUP CLASS - Scale Challenge
// ============================================

const POWERUP_TYPES = [
    {
        name: 'SPREADSHOT',
        color: '#00ffff',
        description: 'Hit 3 enemies at once!',
        duration: 5, // 5 shots
        // 3 shots being fired icon
        sprite: [
            '#        #',
            '##      ##',
            ' ##    ## ',
            '  ##  ##  ',
            '   ####   ',
            '    ##    ',
            '   ####   ',
            '  ##  ##  ',
            ' ##    ## ',
            '##      ##',
            '#        #'
        ]
    },
    {
        name: 'BOMB',
        color: '#ff6600',
        description: 'Explosive projectiles!',
        duration: 5, // 5 shots
        // Bomb with fuse icon
        sprite: [
            '      ## ',
            '     #   ',
            '    #    ',
            '  #####  ',
            ' ####### ',
            '#########',
            '#########',
            '#########',
            ' ####### ',
            '  #####  '
        ]
    },
    {
        name: 'HEALTH BOOST',
        color: '#ff0066',
        description: 'Full health restored!',
        duration: 0, // Instant
        // Heart icon
        sprite: [
            ' ##   ## ',
            '#### ####',
            '#########',
            '#########',
            '#########',
            ' ####### ',
            '  #####  ',
            '   ###   ',
            '    #    '
        ]
    }
];

// Words for powerup activation in typing mode (difficulty-specific, 100+ words each)
const POWERUP_WORDS = {
    // EASY: Short 2-3 letter powerup words (100 words)
    easy: [
        'GO', 'UP', 'WIN', 'RUN', 'YAY', 'YES', 'POW', 'ZAP', 'BAM', 'WOW',
        'ACE', 'AIM', 'ALL', 'AMP', 'ARM', 'AXE', 'BAT', 'BIG', 'BOW', 'BOX',
        'BUD', 'CAN', 'CAP', 'CUT', 'DIG', 'END', 'FAN', 'FIN', 'FIT', 'FLY',
        'FOR', 'FUN', 'GET', 'GOT', 'GUN', 'GUT', 'HIT', 'HOT', 'HUB', 'JAB',
        'JAM', 'JET', 'JOB', 'JOY', 'KEY', 'KID', 'KIT', 'LAP', 'LID', 'LIT',
        'LOG', 'LOT', 'MAX', 'MIX', 'MOB', 'NET', 'NEW', 'NIP', 'NIT', 'NOD',
        'NUB', 'OAK', 'ODD', 'OLD', 'ONE', 'OPT', 'ORB', 'OUT', 'OWL', 'OWN',
        'PAD', 'PAL', 'PAN', 'PAT', 'PAW', 'PAY', 'PEP', 'PET', 'PIE', 'PIN',
        'PIT', 'POP', 'POT', 'PRO', 'PUB', 'RAD', 'RAM', 'RAP', 'RAT', 'RAW',
        'RAY', 'RED', 'REP', 'REV', 'RIG', 'RIM', 'RIP', 'ROB', 'ROD', 'ROT'
    ],
    // NORMAL: Medium powerup words (100 words)
    normal: [
        'POWER', 'BOOST', 'SUPER', 'BLAST', 'ENERGY', 'CHARGE', 'MEGA', 'ULTRA',
        'FORCE', 'STORM', 'FLASH', 'SPARK', 'BLAZE', 'SURGE', 'MIGHT', 'SWIFT',
        'BRAVE', 'TURBO', 'RAPID', 'WARP', 'BEAM', 'BOLT', 'FURY', 'RAGE',
        'RUSH', 'ZOOM', 'BURN', 'FIRE', 'GLOW', 'HEAT', 'IRON', 'JADE',
        'JUMP', 'KICK', 'LEAP', 'LIFT', 'LUCK', 'MANA', 'MARK', 'MOVE',
        'NOVA', 'OMNI', 'PACE', 'PEAK', 'PUMP', 'PURE', 'QUAD', 'RAVE',
        'RISE', 'ROCK', 'ROLL', 'RUNE', 'SEAL', 'SHOT', 'SLAM', 'SNAP',
        'SOUL', 'SPIN', 'STAR', 'STEEL', 'STONE', 'SWORD', 'TIGER', 'TITAN',
        'VENOM', 'VIGOR', 'VITAL', 'VOLT', 'WAVE', 'WILD', 'WIND', 'WING',
        'ZERO', 'ZONE', 'ALPHA', 'APEX', 'ARMOR', 'ARROW', 'AURA', 'AZURE',
        'BLADE', 'BRAVE', 'BREAK', 'BURST', 'CHAOS', 'CLASH', 'CRUSH', 'CYBER',
        'DELTA', 'DRAGON', 'EAGLE', 'EARTH', 'ELITE', 'EMBER', 'FALCON', 'FROST',
        'GAMMA', 'GIANT', 'GOLD', 'GRAND'
    ],
    // HARD: Complex powerup words (100 words)
    hard: [
        'ACTIVATE', 'UNLEASH', 'AMPLIFY', 'ENHANCE', 'EMPOWER', 'MAXIMIZE',
        'ACCELERATE', 'ANNIHILATE', 'ASSASSINATE', 'ASSIMILATE', 'ATOMIZE', 'AUTHORIZE',
        'CALIBRATE', 'CAPITALIZE', 'CAPTIVATE', 'CARBONIZE', 'CASCADE', 'CATALYZE',
        'CHAMPION', 'CHANNELIZE', 'CHARGE', 'CHRONOSHIFT', 'CIRCULATE', 'COLLAPSE',
        'COMBUST', 'COMMAND', 'COMPENSATE', 'CONCENTRATE', 'CONFISCATE', 'CONJUGATE',
        'CONQUER', 'CONSECRATE', 'CONSOLIDATE', 'CONTAMINATE', 'CONVERT', 'COOPERATE',
        'COORDINATE', 'CORRUPT', 'COUNTER', 'CULMINATE', 'CULTIVATE', 'CUSTOMIZE',
        'DECIMATE', 'DECONSTRUCT', 'DEDICATE', 'DEFRAGMENT', 'DELEGATE', 'DEMOLISH',
        'DEMONSTRATE', 'DENOMINATE', 'DEPLETE', 'DESIGNATE', 'DESTABILIZE', 'DEVASTATE',
        'DEVOUR', 'DIGITIZE', 'DILAPIDATE', 'DIMINISH', 'DISCHARGE', 'DISINTEGRATE',
        'DISPATCH', 'DISSIPATE', 'DOMINATE', 'DUPLICATE', 'DYNAMIZE', 'ECLIPSE',
        'EDUCATE', 'ELABORATE', 'ELECTRIFY', 'ELEVATE', 'ELIMINATE', 'EMANATE',
        'EMBRACE', 'EMERGE', 'EMPOWER', 'ENCAPSULATE', 'ENERGIZE', 'ENFORCE',
        'ENGINEER', 'ENRAGE', 'ENTANGLE', 'ERADICATE', 'ESCALATE', 'EVAPORATE',
        'EXCAVATE', 'EXCEED', 'EXECUTE', 'EXPAND', 'EXPEDITE', 'EXPLODE',
        'EXPLOIT', 'EXPLORE', 'EXPONENT', 'EXTERMINATE', 'FABRICATE', 'FACILITATE',
        'FINALIZE', 'FIREBLAST', 'FORMULATE', 'FORTIFY'
    ],
    // CRAZY: Extreme powerup words (100 words)
    crazy: [
        'CATASTROPHIC', 'OVERWHELMING', 'UNSTOPPABLE', 'INDESTRUCTIBLE', 'INVINCIBLE', 'APOCALYPTIC',
        'ABSOLUTELYDEVASTATING', 'ACCELERATIONCHAMBER', 'ACCOMPLISHEDASSASSIN', 'ACKNOWLEDGEMENTOFPOWER',
        'AMPLIFICATIONMATRIX', 'ANNIHILATIONPROTOCOL', 'ANTAGONISTICFORCE', 'APOCALYPSEINITIATOR',
        'APPROXIMATELYINFINITE', 'ARMAGEDDONACTIVATOR', 'ASTRONOMICALPOWER', 'AUTHENTICDESTROYER',
        'BATTLEFIELDDOMINATOR', 'BERSERKERACTIVATION', 'BIFURCATIONBLAST', 'BLOODLINEOBLITERATOR',
        'BOMBARDMENTSEQUENCE', 'CATASTROPHICFAILURE', 'CAUSTICEXPLOSION', 'CENTRIFUGALFORCE',
        'CHAOSMANIPULATOR', 'CHRONOSPHERESHATTER', 'CIRCUITOVERLOADER', 'COAGULATIONFIELD',
        'COEFFICIENTBOOSTER', 'COLLATERALDAMAGE', 'COMBUSTIONENGINE', 'COMMANDEEREDPOWER',
        'COMMEMORATIVEBLAST', 'COMMUNICATIONSJAMMER', 'COMPENSATIONMATRIX', 'CONCENTRATIONBEAM',
        'CONFISCATORACTIVE', 'CONFLAGRATIONSTORM', 'CONGREGATIONALPOWER', 'CONSTELLATIONARRAY',
        'CONTAMINATIONSPREAD', 'CONVERGENCECANNON', 'COORDINATEDSTRIKE', 'CORROBORATIVEFORCE',
        'COUNTERACTIVEBEAM', 'CRYSTALLINEFORMATION', 'CULMINATIONOFPOWER', 'CYBERNETICOVERLOAD',
        'DEACTIVATIONSEQUENCE', 'DECAPITATIONSTRIKE', 'DECELERATIONFIELD', 'DECOMPOSITIONBEAM',
        'DECONSTRUCTIONWAVE', 'DEFIBRILLATORSHOCK', 'DEGENERATIONAURA', 'DEHYDRATINGBLAST',
        'DELINEATIONPROTOCOL', 'DEMONSLAYERACTIVATED', 'DENOMINATOROFZERO', 'DEPOPULATIONEVENT',
        'DEPRECIATIONFIELD', 'DESECRATIONRITUALS', 'DESICCATIONEFFECT', 'DESTINATIONDESTROYER',
        'DESTABILIZATIONWAVE', 'DETOXIFICATIONPULSE', 'DEVASTATORUNLEASHED', 'DIFFERENTIATIONBLAST',
        'DIMENSIONALCOLLAPSE', 'DISASSEMBLYPROTOCOL', 'DISINTEGRATIONBEAM', 'DISSEMINATIONSPREAD',
        'DISSOCIATIONEFFECT', 'DOMESTICATIONFIELD', 'DRAGONFIREUNLEASHED', 'DYNAMOMETEROVERLOAD',
        'EARTHQUAKEGENERATOR', 'ELECTRICUTIONFIELD', 'ELECTROCUTIONMATRIX', 'ELECTROSHOCKTHERAPY',
        'EMANCIPATIONPROTOCOL', 'ENCAPSULATIONSPHERE', 'EQUILIBRIUMBREAKER', 'ETHEREALIZATIONWAVE',
        'EVISCERATIONSTRIKE', 'EXACERBATIONCASCADE', 'EXAGGERATEDPOWER', 'EXASPERATIONBLAST',
        'EXCOMMUNICATIONWAVE', 'EXHILARATIONOVERLOAD', 'EXONERATIONPROTOCOL', 'EXPATRIATIONEVENT',
        'EXTERMINATORACTIVATED', 'EXTRAPOLATIONMATRIX', 'FIREBREATHERUNLEASHED', 'FLASHFREEZEACTIVATED',
        'GRAVITYBOMBDETONATED', 'HYPERNOVAEXPLOSION', 'INFINITEPOWERMATRIX', 'SUPERMASSIVEOBLITERATION'
    ]
};

// Get powerup word for current difficulty
function getPowerupWord() {
    const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
    const wordList = POWERUP_WORDS[diffSettings.wordList] || POWERUP_WORDS['normal'];
    return wordList[Math.floor(Math.random() * wordList.length)];
}

class Powerup {
    constructor() {
        // Store the game mode and whether MIDI is connected
        this.mode = gameState.gameMode;
        this.useMidiOctave = gameState.midiConnected && this.mode === 'music';
        
        if (this.mode === 'typing') {
            // Typing mode: use words based on difficulty
            this.word = getPowerupWord();
            this.lettersHit = []; // Letters hit in order
            this.letterFlash = {};
            for (let i = 0; i < this.word.length; i++) {
                this.letterFlash[i] = 0;
            }
            this.notes = null;
            this.scaleName = this.word;
        } else {
            // Music mode: use scales
            const scale = getScaleForLevel(gameState.level);
            
            // Always use simple note names (no octaves) for display and matching
            // This allows the scale to be played in any octave
            this.notes = [...scale.notes, scale.notes[0]]; // 7 notes + octave = 8 notes
            
            this.notesHit = []; // Notes hit in order
            this.scaleName = scale.name;
            this.word = null;
        }
        
        // Random powerup type
        this.type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        
        // Visual properties - dynamically size based on content
        if (this.mode === 'typing' && this.word) {
            // Calculate width needed for word
            const letterSize = 30;
            const letterSpacing = letterSize + 8;
            const wordWidth = this.word.length * letterSpacing + 40; // 40px padding
            this.boxWidth = Math.max(300, Math.min(wordWidth, canvas.width - 100));
        } else {
            // Music mode: 8 notes
            this.boxWidth = 400;
        }
        this.boxHeight = 120;
        
        // Start offscreen and float in
        const side = Math.floor(Math.random() * 4);
        const margin = 150;
        
        if (side === 0) { // Top
            this.x = margin + Math.random() * (canvas.width - margin * 2);
            this.y = -this.boxHeight;
            this.targetX = this.x;
            this.targetY = margin + 100;
        } else if (side === 1) { // Right
            this.x = canvas.width + this.boxWidth;
            this.y = margin + Math.random() * (canvas.height - margin * 2 - 200);
            this.targetX = canvas.width - margin - this.boxWidth / 2;
            this.targetY = this.y;
        } else if (side === 2) { // Bottom
            this.x = margin + Math.random() * (canvas.width - margin * 2);
            this.y = canvas.height + this.boxHeight;
            this.targetX = this.x;
            this.targetY = canvas.height - margin - 150;
        } else { // Left
            this.x = -this.boxWidth;
            this.y = margin + Math.random() * (canvas.height - margin * 2 - 200);
            this.targetX = margin + this.boxWidth / 2;
            this.targetY = this.y;
        }
        
        this.speed = 4.8; // 2x + 20% boost
        this.arrived = false;
        
        // Timer (20 seconds = 1200 frames at 60fps)
        this.timeLimit = 1200;
        this.timer = 0;
        this.timerStarted = false;
        
        this.alive = true;
        this.activated = false;
        this.activationFlash = 0;
        this.failFlash = 0;
        
        // Float animation
        this.floatPhase = Math.random() * Math.PI * 2;
        this.pulsePhase = 0;
        
        // Note flash effects (music mode only)
        if (this.mode !== 'typing') {
            this.noteFlash = {};
            for (const note of this.notes) {
                this.noteFlash[note] = 0;
            }
        }
    }
    
    update() {
        // Float animation
        this.floatPhase += 0.03;
        this.pulsePhase += 0.05;
        
        // Move toward target
        if (!this.arrived) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            } else {
                this.arrived = true;
                this.timerStarted = true;
            }
        } else {
            // Apply floating motion
            this.y += Math.sin(this.floatPhase) * 0.3;
        }
        
        // Update timer
        if (this.timerStarted && !this.activated) {
            this.timer++;
            if (this.timer >= this.timeLimit) {
                // Time's up - powerup failed
                this.failFlash = 1;
                this.alive = false;
                playPowerupFailSound();
            }
        }
        
        // Update flashes based on mode
        if (this.mode === 'typing') {
            // Update letter flashes
            for (const idx in this.letterFlash) {
                if (this.letterFlash[idx] > 0) {
                    this.letterFlash[idx] -= 0.05;
                }
            }
        } else {
            // Update note flashes
            for (const note of this.notes) {
                if (this.noteFlash[note] > 0) {
                    this.noteFlash[note] -= 0.05;
                }
            }
        }
        
        // Update activation flash
        if (this.activationFlash > 0) {
            this.activationFlash -= 0.02;
            if (this.activationFlash <= 0) {
                this.alive = false;
            }
        }
        
        // Update fail flash
        if (this.failFlash > 0) {
            this.failFlash -= 0.03;
        }
    }
    
    tryNote(noteOrLetter) {
        if (!this.arrived || this.activated || !this.alive) return false;
        
        if (this.mode === 'typing') {
            // Typing mode: expect letters
            const expectedLetter = this.word[this.lettersHit.length];
            
            if (noteOrLetter === expectedLetter) {
                this.lettersHit.push(noteOrLetter);
                this.letterFlash[this.lettersHit.length - 1] = 1;
                playPowerupNoteSound('C'); // Use a default sound
                
                // Check if word is complete
                if (this.lettersHit.length === this.word.length) {
                    this.activate();
                }
                return true;
            } else {
                // Wrong letter - reset progress
                this.lettersHit = [];
                this.failFlash = 0.5;
                return false;
            }
        } else {
            // Music mode: expect notes (compare base note names, ignore octave)
            const expectedNote = this.notes[this.notesHit.length];
            const playedBaseNote = getBaseNoteName(noteOrLetter);
            const expectedBaseNote = getBaseNoteName(expectedNote);
            
            if (playedBaseNote === expectedBaseNote) {
                this.notesHit.push(expectedNote); // Store the expected note for display
                this.noteFlash[expectedNote] = 1;
                playPowerupNoteSound(noteOrLetter); // Play at the octave the player actually played
                
                // Check if scale is complete
                if (this.notesHit.length === this.notes.length) {
                    this.activate();
                }
                return true;
            } else {
                // Wrong note - reset progress
                this.notesHit = [];
                this.failFlash = 0.5;
                return false;
            }
        }
    }
    
    activate() {
        this.activated = true;
        this.activationFlash = 1;
        playPowerupActivateSound(this.type.name);
        
        // Apply powerup effect
        if (this.type.name === 'HEALTH BOOST') {
            // Start health restore animation (3 seconds)
            gameState.healthRestoreActive = true;
            gameState.healthRestoreStart = gameState.health;
            gameState.healthRestoreTarget = gameState.maxHealth;
            gameState.healthRestoreTimer = 0;
            createHealthRestoreEffect();
        } else {
            // Spreadshot or Bomb - set active powerup
            gameState.activePowerup = this.type.name;
            gameState.powerupShotsRemaining = this.type.duration;
        }
    }
    
    draw() {
        const floatY = Math.sin(this.floatPhase) * 5;
        const drawX = this.x;
        const drawY = this.y + floatY;
        
        ctx.save();
        
        // Activation flash
        if (this.activationFlash > 0) {
            const flashSize = this.boxWidth * (1 + this.activationFlash);
            const gradient = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, flashSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.activationFlash})`);
            gradient.addColorStop(0.3, this.type.color + Math.floor(this.activationFlash * 200).toString(16).padStart(2, '0'));
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(drawX, drawY, flashSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Fail flash (red tint)
        if (this.failFlash > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${this.failFlash * 0.3})`;
            ctx.fillRect(drawX - this.boxWidth / 2 - 10, drawY - this.boxHeight / 2 - 30, 
                        this.boxWidth + 20, this.boxHeight + 60);
        }
        
        // Draw powerup icon ABOVE the box (like enemies)
        const iconY = drawY - this.boxHeight / 2 - 50;
        const pulse = Math.sin(this.pulsePhase) * 3;
        
        // Icon glow
        ctx.shadowColor = this.type.color;
        ctx.shadowBlur = 25 + Math.sin(this.pulsePhase * 2) * 10;
        
        // Draw the sprite icon
        if (this.type.sprite) {
            const scale = 6 + pulse / 3;
            drawSprite(drawX, iconY, this.type.sprite, scale, this.type.color);
        }
        ctx.shadowBlur = 0;
        
        // Main box background
        const boxX = drawX - this.boxWidth / 2;
        const boxY = drawY - this.boxHeight / 2 + 15; // Shifted down slightly
        
        ctx.shadowColor = this.type.color;
        ctx.shadowBlur = 20 + Math.sin(this.pulsePhase) * 10;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(boxX, boxY, this.boxWidth, this.boxHeight - 15);
        
        // Border
        ctx.strokeStyle = this.type.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(boxX, boxY, this.boxWidth, this.boxHeight - 15);
        
        // Inner glow border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 3, boxY + 3, this.boxWidth - 6, this.boxHeight - 21);
        
        ctx.shadowBlur = 0;
        
        // Timer bar (only when timer started)
        if (this.timerStarted && !this.activated) {
            const timerWidth = this.boxWidth - 20;
            const timerHeight = 6;
            const timerX = boxX + 10;
            const timerY = boxY + 8;
            const progress = 1 - (this.timer / this.timeLimit);
            
            ctx.fillStyle = '#333';
            ctx.fillRect(timerX, timerY, timerWidth, timerHeight);
            
            // Color changes as time runs out
            const timerColor = progress > 0.5 ? '#00ff00' : progress > 0.25 ? '#ffff00' : '#ff0000';
            ctx.fillStyle = timerColor;
            ctx.fillRect(timerX, timerY, timerWidth * progress, timerHeight);
        }
        
        // Draw content based on mode
        if (this.mode === 'typing') {
            // TYPING MODE: Draw word with letter boxes
            const letterY = boxY + 55;
            const letterSize = 30;
            const letterSpacing = letterSize + 8;
            const totalWidth = this.word.length * letterSpacing - 8;
            const startX = drawX - totalWidth / 2 + letterSize / 2;
            
            for (let i = 0; i < this.word.length; i++) {
                const letter = this.word[i];
                const letterX = startX + i * letterSpacing;
                const isHit = i < this.lettersHit.length;
                const isNext = this.lettersHit.length === i;
                const flash = this.letterFlash[i] || 0;
                const letterColor = LETTER_COLORS[letter] || '#ffffff';
                
                // Glow for hit letters or flash
                if (isHit || flash > 0) {
                    ctx.shadowColor = letterColor;
                    ctx.shadowBlur = 15 + flash * 20;
                }
                
                // Letter box background
                const boxLeft = letterX - letterSize / 2;
                const boxTop = letterY - letterSize / 2;
                
                if (isHit) {
                    ctx.fillStyle = letterColor;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(boxLeft, boxTop, letterSize, letterSize);
                    ctx.globalAlpha = 1;
                } else if (isNext) {
                    const pulse = Math.sin(this.pulsePhase * 2) * 0.3 + 0.7;
                    ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.2})`;
                    ctx.fillRect(boxLeft, boxTop, letterSize, letterSize);
                    ctx.strokeStyle = letterColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(boxLeft, boxTop, letterSize, letterSize);
                } else {
                    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
                    ctx.fillRect(boxLeft, boxTop, letterSize, letterSize);
                    ctx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(boxLeft, boxTop, letterSize, letterSize);
                }
                
                // Draw the letter
                ctx.font = `bold ${letterSize * 0.7}px 'Courier New', monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isHit ? letterColor : (isNext ? '#ffffff' : '#666666');
                ctx.fillText(letter, letterX, letterY);
                
                ctx.shadowBlur = 0;
            }
        } else {
            // MUSIC MODE: Draw scale notes as a music staff
            const staffY = boxY + 55;
            const noteSpacing = (this.boxWidth - 60) / (this.notes.length - 1);
            const startX = boxX + 30;
            
            // Staff lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.moveTo(boxX + 10, staffY - 16 + i * 8);
                ctx.lineTo(boxX + this.boxWidth - 10, staffY - 16 + i * 8);
                ctx.stroke();
            }
            
            // Draw each note
            this.notes.forEach((note, i) => {
                const noteX = startX + i * noteSpacing;
                // Position-based hit check (not note-name based) to handle duplicate notes like C at start/end
                const isHit = i < this.notesHit.length;
                const isNext = this.notesHit.length === i;
                const flash = this.noteFlash[note] || 0;
                const noteColor = getNoteColor(note);
                
                // Note head
                const noteSize = 12;
                
                // Glow for hit notes or flash
                if (isHit || flash > 0) {
                    ctx.shadowColor = noteColor;
                    ctx.shadowBlur = 15 + flash * 20;
                }
                
                // Note circle
                ctx.beginPath();
                ctx.arc(noteX, staffY, noteSize, 0, Math.PI * 2);
                
                if (isHit) {
                    ctx.fillStyle = noteColor;
                    ctx.fill();
                } else if (isNext) {
                    // Pulse effect for next note
                    const pulse = Math.sin(this.pulsePhase * 2) * 0.3 + 0.7;
                    ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.5})`;
                    ctx.fill();
                    ctx.strokeStyle = noteColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
                
                ctx.shadowBlur = 0;
                
                // Note name below
                ctx.font = '10px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = isHit ? noteColor : (isNext ? '#ffffff' : '#666666');
                ctx.fillText(note, noteX, staffY + 28);
            });
        }
        
        // Instruction text
        if (!this.timerStarted) {
            ctx.font = '12px "Courier New", monospace';
            ctx.fillStyle = '#aaaaaa';
            ctx.textAlign = 'center';
            const instructionText = this.mode === 'typing' ? 'Type the word to activate!' : 'Play the scale to activate!';
            ctx.fillText(instructionText, drawX, boxY + this.boxHeight - 8);
        }
        
        ctx.restore();
    }
}

// Powerup sound effects
function playPowerupNoteSound(note) {
    if (!audioContext) return;
    try {
        // Handle notes with octave (e.g., "C4")
        const baseNoteName = getBaseNoteName(note);
        
        // Extract octave from note string (default to 4 if not specified)
        const octaveMatch = note.match(/(\d)$/);
        const octave = octaveMatch ? parseInt(octaveMatch[1]) : 4;
        
        // Get base frequency and adjust for octave (4 is reference octave)
        let freq = NOTE_FREQUENCIES[baseNoteName] || 440;
        freq = freq * Math.pow(2, octave - 4);
        
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.1);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start();
        osc.stop(audioContext.currentTime + 0.15);
    } catch (e) {}
}

function playPowerupActivateSound(type) {
    if (!audioContext) return;
    try {
        if (type === 'SPREADSHOT') {
            // Electric charging/spreading sound
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400 + i * 200, audioContext.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(800 + i * 300, audioContext.currentTime + 0.1);
                    
                    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                    gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.15);
                    
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    
                    osc.start();
                    osc.stop(audioContext.currentTime + 0.2);
                }, i * 60);
            }
            // Add a shimmer effect
            const noise = audioContext.createOscillator();
            const noiseGain = audioContext.createGain();
            noise.type = 'triangle';
            noise.frequency.value = 2000;
            noiseGain.gain.setValueAtTime(0.1, audioContext.currentTime);
            noiseGain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.3);
            noise.connect(noiseGain);
            noiseGain.connect(audioContext.destination);
            noise.start();
            noise.stop(audioContext.currentTime + 0.4);
            
        } else if (type === 'BOMB') {
            // Deep explosive charging sound
            const bass = audioContext.createOscillator();
            const bassGain = audioContext.createGain();
            bass.type = 'sawtooth';
            bass.frequency.setValueAtTime(80, audioContext.currentTime);
            bass.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.2);
            bassGain.gain.setValueAtTime(0.4, audioContext.currentTime);
            bassGain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.25);
            bass.connect(bassGain);
            bassGain.connect(audioContext.destination);
            bass.start();
            bass.stop(audioContext.currentTime + 0.4);
            
            // Crackling overlay
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const crackle = audioContext.createOscillator();
                    const crackleGain = audioContext.createGain();
                    crackle.type = 'square';
                    crackle.frequency.value = 100 + Math.random() * 200;
                    crackleGain.gain.setValueAtTime(0.15, audioContext.currentTime);
                    crackleGain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.05);
                    crackle.connect(crackleGain);
                    crackleGain.connect(audioContext.destination);
                    crackle.start();
                    crackle.stop(audioContext.currentTime + 0.08);
                }, i * 50 + Math.random() * 30);
            }
            
        } else if (type === 'HEALTH BOOST') {
            // Magical healing chime sound - ascending notes
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, i) => {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    
                    gain.gain.setValueAtTime(0.25, audioContext.currentTime);
                    gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.4);
                    
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    
                    osc.start();
                    osc.stop(audioContext.currentTime + 0.5);
                }, i * 120);
            });
            
            // Add sparkle overlay
            for (let i = 0; i < 6; i++) {
                setTimeout(() => {
                    const sparkle = audioContext.createOscillator();
                    const sparkleGain = audioContext.createGain();
                    sparkle.type = 'sine';
                    sparkle.frequency.value = 2000 + Math.random() * 2000;
                    sparkleGain.gain.setValueAtTime(0.08, audioContext.currentTime);
                    sparkleGain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.1);
                    sparkle.connect(sparkleGain);
                    sparkleGain.connect(audioContext.destination);
                    sparkle.start();
                    sparkle.stop(audioContext.currentTime + 0.15);
                }, i * 100 + Math.random() * 50);
            }
        } else {
            // Default triumphant rising sound
            for (let i = 0; i < 4; i++) {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    
                    osc.type = 'square';
                    osc.frequency.value = 300 + i * 150;
                    
                    gain.gain.setValueAtTime(0.15, audioContext.currentTime);
                    gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.1);
                    
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    
                    osc.start();
                    osc.stop(audioContext.currentTime + 0.15);
                }, i * 80);
            }
        }
    } catch (e) {}
}

function playPowerupFailSound() {
    if (!audioContext) return;
    try {
        // Descending failure sound
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.2);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start();
        osc.stop(audioContext.currentTime + 0.4);
    } catch (e) {}
}

function playAmmoRechargeSound() {
    if (!audioContext) return;
    try {
        // Quick bright "ping" sound for ammo recharge
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.15, audioContext.currentTime);
        gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.1);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start();
        osc.stop(audioContext.currentTime + 0.15);
    } catch (e) {}
}

function playOutOfAmmoSound() {
    if (!audioContext) return;
    try {
        // Dull "click" sound when out of ammo
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.setTargetAtTime(0.01, audioContext.currentTime, 0.03);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start();
        osc.stop(audioContext.currentTime + 0.08);
    } catch (e) {}
}

function playMissSound() {
    if (!audioContext) return;
    try {
        const now = audioContext.currentTime;
        
        // Main buzz tone - medium low frequency
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'triangle'; // Softer than square
        osc1.frequency.setValueAtTime(130, now);
        osc1.frequency.exponentialRampToValueAtTime(70, now + 0.18);
        gain1.gain.setValueAtTime(0.22, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(now);
        osc1.stop(now + 0.18);
        
        // Mid tone - softer sawtooth
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(200, now);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gain2.gain.setValueAtTime(0.12, now);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.start(now);
        osc2.stop(now + 0.15);
        
        // Soft noise for texture
        const noise = audioContext.createOscillator();
        const noiseGain = audioContext.createGain();
        const noiseFilter = audioContext.createBiquadFilter();
        noise.type = 'sawtooth';
        noise.frequency.setValueAtTime(90, now);
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(500, now);
        noiseGain.gain.setValueAtTime(0.12, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        noise.start(now);
        noise.stop(now + 0.12);
    } catch (e) {}
}

function createHealthRestoreEffect() {
    // Create healing particles around player
    for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const dist = 50 + Math.random() * 100;
        const particle = new Particle(
            player.x + Math.cos(angle) * dist,
            player.y + Math.sin(angle) * dist,
            '#00ff00'
        );
        particle.vx = -Math.cos(angle) * 3;
        particle.vy = -Math.sin(angle) * 3;
        particle.life = 1;
        particles.push(particle);
    }
}

function spawnPowerup() {
    if (!gameState.powerup && !gameState.bossActive) {
        gameState.powerup = new Powerup();
    }
}

// ============================================
// BOSS CLASS - Ominous and Imposing
// ============================================

class Boss {
    constructor(level) {
        this.level = level;
        
        // Get boss type based on level (cycles through types)
        const typeIndex = (level - 1) % BOSS_TYPES.length;
        this.bossType = BOSS_TYPES[typeIndex];
        
        this.name = this.bossType.name;
        this.size = CONFIG.bossSize + level * 15;
        this.health = CONFIG.bossHealth + Math.floor(level / 2);
        this.maxHealth = this.health;
        
        // Select unique sprite based on boss name
        this.sprite = this.getBossSprite();
        
        // Ice Golem gets extra health
        if (this.bossType.pattern === 'slow') {
            this.health += 2;
            this.maxHealth = this.health;
        }
        
        // Start OFFSCREEN and move in
        const margin = this.size + 50;
        const side = Math.floor(Math.random() * 4);
        
        // Spawn position (offscreen)
        if (side === 0) { // Top
            this.x = margin + Math.random() * (canvas.width - margin * 2);
            this.y = -this.size; // Above screen
            this.entranceTargetX = this.x;
            this.entranceTargetY = margin;
        } else if (side === 1) { // Right
            this.x = canvas.width + this.size; // Right of screen
            this.y = margin + Math.random() * (canvas.height - margin * 2);
            this.entranceTargetX = canvas.width - margin;
            this.entranceTargetY = this.y;
        } else if (side === 2) { // Bottom
            this.x = margin + Math.random() * (canvas.width - margin * 2);
            this.y = canvas.height + this.size; // Below screen
            this.entranceTargetX = this.x;
            this.entranceTargetY = canvas.height - margin;
        } else { // Left
            this.x = -this.size; // Left of screen
            this.y = margin + Math.random() * (canvas.height - margin * 2);
            this.entranceTargetX = margin;
            this.entranceTargetY = this.y;
        }
        
        // Boss entrance state - phases: 'entering', 'countdown', 'revealing', 'active'
        this.entrancePhase = 'entering';
        this.entering = true;
        this.entranceSpeed = 2.9; // Entrance speed (2x + 20% boost)
        this.countdownNumber = 3; // 3, 2, 1 countdown
        this.countdownTimer = 0;
        this.countdownDuration = 120; // Each number lasts exactly 2 seconds (120 frames at 60fps)
        this.countdownScale = 5.0; // Start at 5x player size, shrink to small
        this.revealTimer = 0;
        this.revealDuration = 90; // ~1.5 seconds for reveal animation
        this.revealFlash = 0;
        this.notesRevealed = false;
        
        // Play entrance sound
        playBossEntranceSound();
        
        // Movement parameters based on boss type
        this.targetX = this.x;
        this.targetY = this.y;
        this.pickNewTarget();
        this.baseSpeed = this.bossType.speed;
        this.wanderTimer = 0;
        this.wanderInterval = this.bossType.pattern === 'erratic' ? 800 : 2000 + Math.random() * 2000;
        
        // Teleport pattern variables
        this.teleportTimer = 0;
        this.teleportInterval = 4000 + Math.random() * 2000;
        this.teleportFlash = 0;
        
        // Circular pattern variables
        this.circleAngle = Math.random() * Math.PI * 2;
        this.circleRadius = 150 + Math.random() * 100;
        this.circleCenter = { x: canvas.width / 2, y: canvas.height / 2 };
        
        // Store the game mode for this boss
        this.mode = gameState.gameMode;
        
        if (this.mode === 'typing') {
            // Typing mode: use words instead of notes
            this.generateNewWord();
        } else {
            // Music mode: use notes
            this.noteCount = Math.min(2 + Math.floor(level / 2), 5);
            this.generateNewNotes();
        }
        
        // Apply difficulty multiplier to boss charge time
        const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
        this.chargeTime = (CONFIG.bossChargeTime - level * 200) * diffSettings.bossChargeMultiplier;
        this.currentCharge = 0;
        this.charging = false; // Don't start charging until entrance is complete
        
        this.alive = true;
        this.color = this.bossType.color;
        this.secondaryColor = this.bossType.secondaryColor;
        this.eyeColor = this.bossType.eyeColor;
        this.auraColor = this.bossType.auraColor;
        this.pulsePhase = 0;
        this.eyeGlow = 0;
        
        // Hit effect state
        this.hitGlow = 0;
        this.speedMultiplier = 1;
        
        // Box breaking fragments
        this.boxFragments = [];
        
        // Charge interrupt effect
        this.interruptFlash = 0;
        this.interruptParticles = [];
        this.shockwaveRadius = 0;
        this.shockwaveActive = false;
        this.interruptFreezeTimer = 0; // 1 second freeze after interrupt
        
        // Death animation state
        this.dying = false;
        this.deathTimer = 0;
        this.deathDuration = 300; // 5 seconds at 60fps
        this.deathPixels = []; // Dissolving pixels
    }
    
    initDeathPixels() {
        // Store original position for shake effect
        this.deathOriginalX = this.x;
        this.deathOriginalY = this.y;
        this.shakeIntensity = 8;
        
        // Create a grid of pixels that will dissolve
        const pixelSize = 8;
        const gridSize = Math.ceil(this.size / pixelSize);
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const px = this.x - this.size / 2 + gx * pixelSize + pixelSize / 2;
                const py = this.y - this.size / 2 + gy * pixelSize + pixelSize / 2;
                
                // Check if pixel is within the circular boss shape
                const dx = px - this.x;
                const dy = py - this.y;
                if (Math.sqrt(dx * dx + dy * dy) < this.size / 2) {
                    // Stagger delays across the full 5 seconds (0-250 frames)
                    // Pixels at edges start dissolving first, center last
                    const distFromCenter = Math.sqrt(dx * dx + dy * dy) / (this.size / 2);
                    const randomDelay = Math.random() * 180 + (1 - distFromCenter) * 70;
                    
                    this.deathPixels.push({
                        x: px,
                        y: py,
                        originalX: px,
                        originalY: py,
                        size: pixelSize,
                        color: Math.random() > 0.5 ? this.color : this.secondaryColor,
                        delay: randomDelay,
                        opacity: 1,
                        vx: (Math.random() - 0.5) * 0.8, // Slower horizontal drift
                        vy: -Math.random() * 1.5 - 0.5, // Slower upward float
                        active: false,
                        dissolved: false
                    });
                }
            }
        }
    }
    
    getBossSprite() {
        // Return the appropriate sprite based on boss name
        switch (this.name) {
            case 'SHADOW WRAITH':
                return SPRITES.shadowWraith;
            case 'FIRE DEMON':
                return SPRITES.fireDemon;
            case 'ICE GOLEM':
                return SPRITES.iceGolem;
            case 'STORM SPECTER':
                return SPRITES.stormSpecter;
            case 'VOID LORD':
                return SPRITES.voidLord;
            case 'CRYSTAL DRAGON':
                return SPRITES.crystalDragon;
            case 'PLAGUE BEAST':
                return SPRITES.plagueBeast;
            case 'BLOOD MOON':
                return SPRITES.bloodMoon;
            default:
                return SPRITES.boss;
        }
    }
    
    pickNewTarget() {
        // Pick a random point along the EDGES of the arena (not the center)
        const margin = this.size / 2 + 30;
        const edgeDepth = 80; // How far from the edge the boss can go
        // Bottom margin needs extra space for note boxes (boss size/2 + 60 gap + 65 box + some padding)
        const bottomMargin = this.size / 2 + 60 + 65 + 40; // ~290px from bottom
        
        // Calculate word width to keep letters on screen (typing mode)
        let wordHalfWidth = margin;
        if (this.mode === 'typing' && this.word) {
            const maxTotalWidth = canvas.width - 100;
            const idealBoxSize = 50;
            const idealSpacing = idealBoxSize + 5;
            const idealTotalWidth = this.word.length * idealSpacing - 5;
            const scaleFactor = idealTotalWidth > maxTotalWidth ? maxTotalWidth / idealTotalWidth : 1;
            const boxSize = Math.max(25, idealBoxSize * scaleFactor);
            const letterSpacing = boxSize + (5 * scaleFactor);
            wordHalfWidth = Math.max(margin, (this.word.length * letterSpacing) / 2 + 30);
        }
        
        // Pick a random edge (0=top, 1=right, 2=bottom, 3=left)
        // Reduce chance of bottom edge since there's less room there
        const edgeWeights = [1, 1, 0.3, 1]; // Less likely to pick bottom
        const totalWeight = edgeWeights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalWeight;
        let edge = 0;
        for (let i = 0; i < edgeWeights.length; i++) {
            rand -= edgeWeights[i];
            if (rand <= 0) {
                edge = i;
                break;
            }
        }
        
        switch (edge) {
            case 0: // Top edge
                this.targetX = wordHalfWidth + Math.random() * (canvas.width - wordHalfWidth * 2);
                this.targetY = margin + Math.random() * edgeDepth;
                break;
            case 1: // Right edge
                this.targetX = canvas.width - wordHalfWidth - Math.random() * edgeDepth;
                this.targetY = margin + Math.random() * (canvas.height - margin - bottomMargin);
                break;
            case 2: // Bottom edge - stay higher up to leave room for notes
                this.targetX = wordHalfWidth + Math.random() * (canvas.width - wordHalfWidth * 2);
                this.targetY = canvas.height - bottomMargin - Math.random() * edgeDepth;
                break;
            case 3: // Left edge
                this.targetX = wordHalfWidth + Math.random() * edgeDepth;
                this.targetY = margin + Math.random() * (canvas.height - margin - bottomMargin);
                break;
        }
    }
    
    pickEdgeTeleportTarget() {
        // For teleport - pick a random edge position
        const margin = this.size / 2 + 30;
        const edge = Math.floor(Math.random() * 4);
        
        switch (edge) {
            case 0: // Top
                this.x = margin + Math.random() * (canvas.width - margin * 2);
                this.y = margin + 50;
                break;
            case 1: // Right
                this.x = canvas.width - margin - 50;
                this.y = margin + Math.random() * (canvas.height - margin * 2);
                break;
            case 2: // Bottom
                this.x = margin + Math.random() * (canvas.width - margin * 2);
                this.y = canvas.height - margin - 50;
                break;
            case 3: // Left
                this.x = margin + 50;
                this.y = margin + Math.random() * (canvas.height - margin * 2);
                break;
        }
    }

    generateNewNotes() {
        this.notes = [];
        this.notesHit = new Set();
        this.noteHitFlash = {}; // Track hit flash timer for each note
        this.notePopups = {}; // Track popup animations for each note
        // Use notes from the current level's scale
        const scale = getScaleForLevel(gameState.level);
        const availableNotes = [...scale.notes];
        
        // Check if using MIDI octaves
        this.useMidiOctave = gameState.midiConnected && this.mode === 'music';
        
        // Get difficulty settings for octave range
        const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
        const octaveRange = diffSettings.octaveRange;
        
        for (let i = 0; i < this.noteCount; i++) {
            const index = Math.floor(Math.random() * availableNotes.length);
            let note = availableNotes[index];
            
            // Add octave for MIDI mode - use random octave from difficulty's range
            if (this.useMidiOctave) {
                const octave = octaveRange[Math.floor(Math.random() * octaveRange.length)];
                note = note + octave;
            }
            
            this.notes.push(note);
            availableNotes.splice(index, 1);
        }
    }
    
    generateNewWord() {
        const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
        const wordsPerBoss = diffSettings.wordsPerBoss || 1;
        
        // Get word pool based on difficulty
        const wordPool = getWordsForDifficulty(gameState.difficulty, this.level);
        
        // Generate the required number of words
        this.words = [];
        for (let w = 0; w < wordsPerBoss; w++) {
            const word = wordPool[Math.floor(Math.random() * wordPool.length)];
            this.words.push(word);
        }
        
        // Combined word for display and tracking (separated by space)
        this.word = this.words.join(' ');
        this.lettersHit = []; // Letters hit in order (for typing words)
        this.letterHitFlash = {}; // Track hit flash timer for each letter position
        this.letterPopups = {}; // Track popup animations for each letter
        
        // Timer for word changing (crazy difficulty)
        this.hasWordTimer = diffSettings.noteChanges;
        this.wordTimerDuration = diffSettings.enemyTimer || 0;
        this.wordTimerRemaining = this.wordTimerDuration;
        
        // Initialize flash timers for each letter position
        for (let i = 0; i < this.word.length; i++) {
            this.letterHitFlash[i] = 0;
        }
    }
    
    // Regenerate content based on mode
    regenerateContent() {
        if (this.mode === 'typing') {
            this.generateNewWord();
        } else {
            this.generateNewNotes();
        }
    }
    
    // Reset to a completely new word when timer runs out (for crazy difficulty)
    changeRemainingWord() {
        if (this.mode !== 'typing' || !this.word) return;
        
        // If word is already complete, nothing to change
        if (this.lettersHit.length >= this.word.length) return;
        
        // Generate a completely new word and reset progress
        this.generateNewWord();
        
        // Reinitialize flash timers for all letters (generateNewWord already does this, but ensure clean state)
        for (let i = 0; i < this.word.length; i++) {
            this.letterHitFlash[i] = 0;
        }
    }

    hitNote(note) {
        if (this.notes.includes(note) && !this.notesHit.has(note)) {
            // Find the note's position to spawn fragments (match larger box size)
            const boxSize = 65;
            const noteSpacing = boxSize + 8;
            const startX = this.x - ((this.notes.length - 1) * noteSpacing) / 2;
            const noteIndex = this.notes.indexOf(note);
            const noteX = startX + noteIndex * noteSpacing;
            const noteY = this.y + this.size / 2 + 60;
            
            // Create box fragments
            const fragCount = 8 + Math.floor(Math.random() * 4);
            for (let i = 0; i < fragCount; i++) {
                const angle = (Math.PI * 2 * i) / fragCount + Math.random() * 0.5;
                const speed = 3 + Math.random() * 4;
                this.boxFragments.push({
                    x: noteX + (Math.random() - 0.5) * boxSize,
                    y: noteY + (Math.random() - 0.5) * boxSize,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed + 1,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.4,
                    size: 6 + Math.random() * 10,
                    opacity: 1,
                    color: getNoteColor(note),
                    isGlow: Math.random() > 0.5
                });
            }
            
            this.notesHit.add(note);
            this.noteHitFlash[note] = 1.0; // Start flash effect for this note
            
            // Start note popup animation
            this.notePopups[note] = {
                active: true,
                scale: 0.5,
                alpha: 1,
                x: 0,
                y: 0,
                phase: 'growing'
            };
            
            // Trigger hit effect - glow and slowdown
            this.hitGlow = 1;
            this.speedMultiplier = 0.2; // Slow down to 20% speed
            incrementCombo(); // Each boss note hit increases combo
            
            if (this.notesHit.size === this.notes.length) {
                this.health--;
                this.currentCharge = 0;
                stopBossChargingSound(); // Stop the charging sound
                addScoreWithCombo(500); // Charge interrupt bonus
                
                // *** CHARGE INTERRUPT - BIG VISUAL EFFECT ***
                this.hitGlow = 2.0;
                this.speedMultiplier = 0.05;
                this.interruptFlash = 1.0;
                this.shockwaveRadius = 0;
                this.shockwaveActive = true;
                this.interruptFreezeTimer = 60; // 1 second freeze at 60fps
                
                // Create dissolving fragments for ALL note boxes
                const boxSize = 65;
                const noteSpacing = boxSize + 8;
                const startX = this.x - ((this.notes.length - 1) * noteSpacing) / 2;
                this.notes.forEach((n, i) => {
                    const noteX = startX + i * noteSpacing;
                    const noteY = this.y + this.size / 2 + 60;
                    const noteColor = getNoteColor(n);
                    
                    // Create many fragments per box for dissolve effect
                    for (let j = 0; j < 15; j++) {
                        const angle = (Math.PI * 2 * j) / 15 + Math.random() * 0.5;
                        const speed = 4 + Math.random() * 6;
                        this.boxFragments.push({
                            x: noteX + (Math.random() - 0.5) * boxSize,
                            y: noteY + (Math.random() - 0.5) * boxSize,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed - 2,
                            rotation: Math.random() * Math.PI * 2,
                            rotationSpeed: (Math.random() - 0.5) * 0.5,
                            size: 4 + Math.random() * 12,
                            opacity: 1,
                            color: noteColor,
                            isGlow: Math.random() > 0.3
                        });
                    }
                });
                
                // Create explosion particles around the boss
                for (let i = 0; i < 40; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 3 + Math.random() * 8;
                    const dist = Math.random() * this.size * 0.8;
                    this.interruptParticles.push({
                        x: this.x + Math.cos(angle) * dist,
                        y: this.y + Math.sin(angle) * dist,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        size: 5 + Math.random() * 15,
                        opacity: 1,
                        color: this.bossType.projectileColor,
                        type: Math.random() > 0.5 ? 'spark' : 'mote'
                    });
                }
                
                // Create light rays
                for (let i = 0; i < 12; i++) {
                    const angle = (Math.PI * 2 * i) / 12;
                    this.interruptParticles.push({
                        x: this.x,
                        y: this.y,
                        angle: angle,
                        length: 50 + Math.random() * 100,
                        maxLength: 50 + Math.random() * 100,
                        speed: 15 + Math.random() * 10,
                        opacity: 1,
                        color: '#ffffff',
                        type: 'ray'
                    });
                }
                
                if (this.health <= 0) {
                    // Start death animation instead of immediate death
                    this.dying = true;
                    this.deathTimer = 0;
                    this.charging = false;
                    stopBossChargingSound();
                    this.initDeathPixels();
                    playBossDeathSound();
                    addScoreWithCombo(2000); // Boss kill bonus
                } else {
                    this.regenerateContent();
                }
                return true;
            }
        }
        return false;
    }
    
    // Hit a letter (typing mode) - must be in sequence
    hitLetter(letter) {
        if (this.mode !== 'typing' || !this.word) return false;
        
        const nextIndex = this.lettersHit.length;
        if (nextIndex >= this.word.length) return false;
        
        const expectedLetter = this.word[nextIndex];
        if (letter !== expectedLetter) return false;
        
        // Correct letter hit!
        // Use same dynamic sizing as draw method
        const maxTotalWidth = canvas.width - 100;
        const idealBoxSize = 50;
        const idealSpacing = idealBoxSize + 5;
        const idealTotalWidth = this.word.length * idealSpacing - 5;
        const scaleFactor = idealTotalWidth > maxTotalWidth ? maxTotalWidth / idealTotalWidth : 1;
        const boxSize = Math.max(25, idealBoxSize * scaleFactor);
        const letterSpacing = boxSize + (5 * scaleFactor);
        const totalWidth = this.word.length * letterSpacing - (5 * scaleFactor);
        const startX = this.x - totalWidth / 2 + boxSize / 2;
        const letterX = startX + nextIndex * letterSpacing;
        const letterY = this.y + this.size / 2 + 60;
        
        // Create box fragments for visual effect
        const fragCount = 6 + Math.floor(Math.random() * 4);
        const letterColor = LETTER_COLORS[letter] || '#ffffff';
        for (let i = 0; i < fragCount; i++) {
            const angle = (Math.PI * 2 * i) / fragCount + Math.random() * 0.5;
            const speed = 3 + Math.random() * 4;
            this.boxFragments.push({
                x: letterX + (Math.random() - 0.5) * boxSize,
                y: letterY + (Math.random() - 0.5) * boxSize,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed + 1,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.4,
                size: 5 + Math.random() * 8,
                opacity: 1,
                color: letterColor,
                isGlow: Math.random() > 0.5
            });
        }
        
        this.lettersHit.push(letter);
        this.letterHitFlash[nextIndex] = 1.0;
        
        // Start letter popup animation
        this.letterPopups[nextIndex] = {
            active: true,
            scale: 0.5,
            alpha: 1,
            x: 0,
            y: 0,
            phase: 'growing',
            letter: letter
        };
        
        // Trigger hit effect
        this.hitGlow = 1;
        this.speedMultiplier = 0.2;
        incrementCombo();
        
        // Check if word is complete
        if (this.lettersHit.length === this.word.length) {
            this.health--;
            this.currentCharge = 0;
            stopBossChargingSound();
            addScoreWithCombo(500);
            
            // Big visual effect
            this.hitGlow = 2.0;
            this.speedMultiplier = 0.05;
            this.interruptFlash = 1.0;
            this.shockwaveRadius = 0;
            this.shockwaveActive = true;
            this.interruptFreezeTimer = 60;
            
            // Create fragments for all letter boxes
            for (let i = 0; i < this.word.length; i++) {
                const lX = startX + i * letterSpacing;
                const lY = letterY;
                const lColor = LETTER_COLORS[this.word[i]] || '#ffffff';
                
                for (let j = 0; j < 12; j++) {
                    const angle = (Math.PI * 2 * j) / 12 + Math.random() * 0.5;
                    const speed = 4 + Math.random() * 6;
                    this.boxFragments.push({
                        x: lX + (Math.random() - 0.5) * boxSize,
                        y: lY + (Math.random() - 0.5) * boxSize,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed - 2,
                        rotation: Math.random() * Math.PI * 2,
                        rotationSpeed: (Math.random() - 0.5) * 0.5,
                        size: 4 + Math.random() * 10,
                        opacity: 1,
                        color: lColor,
                        isGlow: Math.random() > 0.3
                    });
                }
            }
            
            // Explosion particles
            for (let i = 0; i < 40; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 8;
                const dist = Math.random() * this.size * 0.8;
                this.interruptParticles.push({
                    x: this.x + Math.cos(angle) * dist,
                    y: this.y + Math.sin(angle) * dist,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 5 + Math.random() * 15,
                    opacity: 1,
                    color: this.bossType.projectileColor,
                    type: Math.random() > 0.5 ? 'spark' : 'mote'
                });
            }
            
            // Light rays
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12;
                this.interruptParticles.push({
                    x: this.x,
                    y: this.y,
                    angle: angle,
                    length: 50 + Math.random() * 100,
                    maxLength: 50 + Math.random() * 100,
                    speed: 15 + Math.random() * 10,
                    opacity: 1,
                    color: '#ffffff',
                    type: 'ray'
                });
            }
            
            if (this.health <= 0) {
                this.dying = true;
                this.deathTimer = 0;
                this.charging = false;
                stopBossChargingSound();
                this.initDeathPixels();
                playBossDeathSound();
                addScoreWithCombo(2000);
            } else {
                this.regenerateContent();
            }
            return true;
        }
        
        return true;
    }

    update(deltaTime) {
        // Handle death animation
        if (this.dying) {
            this.deathTimer++;
            
            // Shake effect - decreases over time
            const shakeProgress = this.deathTimer / this.deathDuration;
            this.shakeIntensity = 8 * (1 - shakeProgress * 0.7); // Shake decreases but doesn't fully stop
            const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
            
            // Update death pixels
            for (const pixel of this.deathPixels) {
                if (this.deathTimer > pixel.delay && !pixel.active) {
                    pixel.active = true;
                }
                
                if (pixel.active && !pixel.dissolved) {
                    // Move the pixel
                    pixel.x += pixel.vx;
                    pixel.y += pixel.vy;
                    pixel.vy += 0.005; // Very slight gravity
                    
                    // Very slow fade - should last most of the 5 seconds
                    pixel.opacity -= 0.003;
                    
                    if (pixel.opacity <= 0) {
                        pixel.dissolved = true;
                    }
                } else if (!pixel.active) {
                    // Pixels that haven't started dissolving yet follow the shake
                    pixel.x = pixel.originalX + shakeX;
                    pixel.y = pixel.originalY + shakeY;
                }
            }
            
            // Check if all pixels have dissolved
            if (this.deathTimer >= this.deathDuration) {
                this.alive = false;
            }
            return;
        }
        
        // Handle entrance animation phases
        if (this.entrancePhase === 'entering') {
            // Slow, imposing movement onto screen
            const dx = this.entranceTargetX - this.x;
            const dy = this.entranceTargetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                this.x += (dx / dist) * this.entranceSpeed;
                this.y += (dy / dist) * this.entranceSpeed;
            } else {
                this.x = this.entranceTargetX;
                this.y = this.entranceTargetY;
                this.entrancePhase = 'countdown';
                this.countdownNumber = 3;
                this.countdownTimer = 0;
                this.countdownScale = 5.0; // Start at 5x player size
            }
            
            // Ominous pulsing while entering
            this.pulsePhase += 0.06;
            this.eyeGlow = (Math.sin(this.pulsePhase * 2) + 1) / 2;
            return;
        }
        
        if (this.entrancePhase === 'countdown') {
            // 3, 2, 1 countdown
            this.countdownTimer++;
            
            // Shrink the number over time (from 5.0 to 0.3)
            const progress = this.countdownTimer / this.countdownDuration;
            this.countdownScale = 5.0 - progress * 4.7;
            
            this.pulsePhase += 0.1;
            this.eyeGlow = (Math.sin(this.pulsePhase * 3) + 1) / 2;
            
            if (this.countdownTimer >= this.countdownDuration) {
                this.countdownNumber--;
                this.countdownTimer = 0;
                this.countdownScale = 5.0; // Reset scale for next number
                
                if (this.countdownNumber <= 0) {
                    this.entrancePhase = 'revealing';
                    this.revealTimer = 0;
                    this.revealFlash = 1.0;
                    playBossRevealSound();
                }
            }
            return;
        }
        
        if (this.entrancePhase === 'revealing') {
            // Flash and reveal animation
            this.revealTimer++;
            
            // Flash fades out then notes appear
            if (this.revealTimer < 30) {
                this.revealFlash = 1.0 - (this.revealTimer / 30) * 0.7;
            } else {
                this.revealFlash = 0.3 * (1 - (this.revealTimer - 30) / 60);
                if (!this.notesRevealed && this.revealTimer >= 40) {
                    this.notesRevealed = true;
                }
            }
            
            // Dramatic eye glow during reveal
            this.eyeGlow = 0.5 + Math.sin(this.revealTimer * 0.3) * 0.5;
            this.pulsePhase += 0.15;
            
            if (this.revealTimer >= this.revealDuration) {
                this.entrancePhase = 'active';
                this.entering = false;
                this.revealFlash = 0;
                this.charging = true; // Now start charging
                this.pickNewTarget();
            }
            return;
        }
        
        // Recover from hit slowdown
        if (this.speedMultiplier < 1) {
            this.speedMultiplier = Math.min(1, this.speedMultiplier + 0.02); // 2x for fixed timestep
        }
        
        // Fade hit glow
        if (this.hitGlow > 0) {
            this.hitGlow = Math.max(0, this.hitGlow - 0.03); // 2x for fixed timestep
        }
        
        // Word timer for crazy difficulty (typing mode only)
        if (this.mode === 'typing' && this.hasWordTimer && this.wordTimerRemaining > 0) {
            this.wordTimerRemaining -= deltaTime;
            
            if (this.wordTimerRemaining <= 0) {
                // Change remaining letters in the word(s)!
                this.changeRemainingWord();
                this.wordTimerRemaining = this.wordTimerDuration;
                this.wordChangeFlash = 1.0;
            }
        }
        
        // Update word change flash
        if (this.wordChangeFlash > 0) {
            this.wordChangeFlash -= 0.03;
        }
        
        // Movement based on boss pattern - all patterns stay near edges
        const pattern = this.bossType.pattern;
        const margin = this.size / 2 + 30;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const minDistFromCenter = 380; // Stay far away from the player in the center (was 250)
        
        if (pattern === 'teleport') {
            // Void Lord - teleports to random edge positions
            this.teleportTimer += deltaTime;
            this.teleportFlash = Math.max(0, this.teleportFlash - 0.10); // 2x for fixed timestep
            
            if (this.teleportTimer >= this.teleportInterval) {
                this.pickEdgeTeleportTarget();
                this.teleportFlash = 1;
                this.teleportTimer = 0;
                this.teleportInterval = 4000 + Math.random() * 2000;
                this.pickNewTarget();
            }
            
            // Move along edges between teleports
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const speed = this.baseSpeed * this.speedMultiplier * 0.5;
                this.x += (dx / dist) * speed;
                this.y += (dy / dist) * speed;
            }
            
        } else if (pattern === 'circular') {
            // Crystal Dragon - circles around the EDGE of the arena
            this.circleAngle += 0.0144 * this.speedMultiplier; // 2x + 20% boost
            
            // Calculate position on an ellipse that follows the arena edges
            // Use asymmetric ellipse - smaller on bottom to leave room for note boxes
            const radiusX = canvas.width / 2 - margin - 50;
            const bottomMarginCircle = this.size / 2 + 60 + 65 + 40;
            const radiusYTop = canvas.height / 2 - margin - 50;
            const radiusYBottom = canvas.height / 2 - bottomMarginCircle - 50;
            // Use different radius for top vs bottom half
            const radiusY = Math.sin(this.circleAngle) > 0 ? radiusYBottom : radiusYTop;
            const targetX = centerX + Math.cos(this.circleAngle) * radiusX;
            const targetY = centerY + Math.sin(this.circleAngle) * radiusY;
            
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                this.x += (dx / dist) * this.baseSpeed * this.speedMultiplier;
                this.y += (dy / dist) * this.baseSpeed * this.speedMultiplier;
            }
            
        } else if (pattern === 'aggressive') {
            // Fire Demon / Blood Moon - moves faster along edges, occasionally darts closer
            this.wanderTimer += deltaTime;
            if (this.wanderTimer >= this.wanderInterval) {
                this.pickNewTarget();
                this.wanderTimer = 0;
                this.wanderInterval = 1200 + Math.random() * 1000;
            }
            
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const speed = this.baseSpeed * this.speedMultiplier * 1.2;
                this.x += (dx / dist) * speed;
                this.y += (dy / dist) * speed;
            } else {
                this.pickNewTarget();
            }
            
        } else if (pattern === 'erratic') {
            // Storm Specter - fast, unpredictable along edges
            this.wanderTimer += deltaTime;
            if (this.wanderTimer >= this.wanderInterval) {
                this.pickNewTarget();
                this.wanderTimer = 0;
                this.wanderInterval = 400 + Math.random() * 600;
            }
            
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const speed = this.baseSpeed * this.speedMultiplier;
                const jitterX = (Math.random() - 0.5) * 0.3;
                const jitterY = (Math.random() - 0.5) * 0.3;
                this.x += (dx / dist + jitterX) * speed;
                this.y += (dy / dist + jitterY) * speed;
            } else {
                this.pickNewTarget();
            }
            
        } else {
            // Default wander / slow patterns - move along edges
            this.wanderTimer += deltaTime;
            if (this.wanderTimer >= this.wanderInterval) {
                this.pickNewTarget();
                this.wanderTimer = 0;
                this.wanderInterval = pattern === 'slow' ? 3000 + Math.random() * 2000 : 2000 + Math.random() * 2000;
            }
            
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                const speed = this.baseSpeed * this.speedMultiplier;
                this.x += (dx / dist) * speed;
                this.y += (dy / dist) * speed;
            } else {
                this.pickNewTarget();
            }
        }
        
        // Keep boss in bounds and away from center
        // Bottom needs extra margin for note boxes
        const bottomMargin = this.size / 2 + 60 + 65 + 40; // ~290px from bottom
        
        // Calculate word width to keep letters on screen (typing mode)
        let wordHalfWidth = 0;
        if (this.mode === 'typing' && this.word) {
            const maxTotalWidth = canvas.width - 100;
            const idealBoxSize = 50;
            const idealSpacing = idealBoxSize + 5;
            const idealTotalWidth = this.word.length * idealSpacing - 5;
            const scaleFactor = idealTotalWidth > maxTotalWidth ? maxTotalWidth / idealTotalWidth : 1;
            const boxSize = Math.max(25, idealBoxSize * scaleFactor);
            const letterSpacing = boxSize + (5 * scaleFactor);
            wordHalfWidth = (this.word.length * letterSpacing) / 2 + 20; // Extra padding
        }
        
        // Use larger of boss size margin or word half-width for horizontal constraint
        const horizontalMargin = Math.max(margin, wordHalfWidth);
        this.x = Math.max(horizontalMargin, Math.min(canvas.width - horizontalMargin, this.x));
        this.y = Math.max(margin, Math.min(canvas.height - bottomMargin, this.y));
        
        // Push boss away from center if it gets too close
        const distFromCenter = Math.sqrt((this.x - centerX) ** 2 + (this.y - centerY) ** 2);
        if (distFromCenter < minDistFromCenter) {
            const pushAngle = Math.atan2(this.y - centerY, this.x - centerX);
            this.x = centerX + Math.cos(pushAngle) * minDistFromCenter;
            this.y = centerY + Math.sin(pushAngle) * minDistFromCenter;
        }
        
        // Update interrupt freeze timer
        if (this.interruptFreezeTimer > 0) {
            this.interruptFreezeTimer--;
        }
        
        if (this.charging && this.interruptFreezeTimer <= 0) {
            // Start charging sound if not already playing
            if (this.currentCharge === 0) {
                startBossChargingSound();
            }
            
            this.currentCharge += deltaTime;
            
            // Update charging sound intensity
            const chargePercent = this.currentCharge / this.chargeTime;
            updateBossChargingSound(chargePercent);
            
            if (this.currentCharge >= this.chargeTime) {
                // Stop charging sound and fire!
                stopBossChargingSound();
                this.fireProjectile();
                this.currentCharge = 0;
                this.notesHit.clear();
            }
        }
        
        // Update box fragments
        this.boxFragments = this.boxFragments.filter(frag => {
            frag.x += frag.vx;
            frag.y += frag.vy;
            frag.vy += 0.15; // Gravity
            frag.rotation += frag.rotationSpeed;
            frag.opacity -= 0.02;
            return frag.opacity > 0;
        });
        
        // Update note/letter hit flash effects based on mode
        if (this.mode === 'typing') {
            // Typing mode: update letter flashes
            if (this.letterHitFlash) {
                for (const idx in this.letterHitFlash) {
                    if (this.letterHitFlash[idx] > 0) {
                        this.letterHitFlash[idx] -= 0.04;
                    }
                }
            }
            
            // Update letter popup animations
            if (this.letterPopups) {
                for (const idx in this.letterPopups) {
                    const popup = this.letterPopups[idx];
                    if (popup && popup.active) {
                        if (popup.phase === 'growing') {
                            popup.scale += 0.1;
                            popup.x += 1.5;
                            popup.y -= 1.8;
                            if (popup.scale >= 1.6) {
                                popup.phase = 'holding';
                                popup.holdTimer = 60;
                            }
                        } else if (popup.phase === 'holding') {
                            popup.holdTimer--;
                            popup.x += 0.2;
                            popup.y -= 0.3;
                            if (popup.holdTimer <= 0) {
                                popup.phase = 'fading';
                            }
                        } else if (popup.phase === 'fading') {
                            popup.x += 0.3;
                            popup.y -= 0.4;
                            popup.alpha -= 0.03;
                            if (popup.alpha <= 0) {
                                popup.active = false;
                            }
                        }
                    }
                }
            }
        } else {
            // Music mode: update note flashes
            if (this.noteHitFlash) {
                for (const note in this.noteHitFlash) {
                    if (this.noteHitFlash[note] > 0) {
                        this.noteHitFlash[note] -= 0.04;
                    }
                }
            }
            
            // Update note popup animations - floats up and to the side
            if (this.notePopups) {
                for (const note in this.notePopups) {
                    const popup = this.notePopups[note];
                    if (popup && popup.active) {
                        if (popup.phase === 'growing') {
                            popup.scale += 0.1;
                            popup.x += 1.8; // Move to the right
                            popup.y -= 2; // Move up
                            if (popup.scale >= 1.8) {
                                popup.phase = 'holding';
                                popup.holdTimer = 70; // Hold for ~1.2 seconds
                            }
                        } else if (popup.phase === 'holding') {
                            // Stay visible at full size, drift slowly up and right
                            popup.holdTimer--;
                            popup.x += 0.25;
                            popup.y -= 0.35;
                            if (popup.holdTimer <= 0) {
                                popup.phase = 'fading';
                            }
                        } else if (popup.phase === 'fading') {
                            popup.x += 0.4; // Continue drifting
                            popup.y -= 0.5;
                            popup.alpha -= 0.025; // Fade out over ~40 frames
                            if (popup.alpha <= 0) {
                                popup.active = false;
                            }
                        }
                    }
                }
            }
        }
        
        // Update charge interrupt effects
        if (this.interruptFlash > 0) {
            this.interruptFlash -= 0.03;
        }
        
        if (this.shockwaveActive) {
            this.shockwaveRadius += 15;
            if (this.shockwaveRadius > 400) {
                this.shockwaveActive = false;
            }
        }
        
        // Update interrupt particles
        this.interruptParticles = this.interruptParticles.filter(p => {
            if (p.type === 'ray') {
                p.x += Math.cos(p.angle) * p.speed;
                p.y += Math.sin(p.angle) * p.speed;
                p.opacity -= 0.04;
                p.length = p.maxLength * p.opacity;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.95;
                p.vy *= 0.95;
                p.opacity -= 0.025;
                p.size *= 0.97;
            }
            return p.opacity > 0;
        });
        
        this.pulsePhase += 0.08;
        this.eyeGlow = (Math.sin(this.pulsePhase * 2) + 1) / 2;
    }
    
    fireProjectile() {
        const attackType = this.bossType.attackType || 'meteor';
        
        // Play attack sound effect
        playBossAttackSound(attackType);
        
        // Create a boss projectile that shoots at the player
        gameState.bossProjectiles.push(new BossProjectile(
            this.x, 
            this.y - this.size/2 - 60, // Start from charging position
            player.x, 
            player.y, 
            this.bossType.projectileColor,
            attackType
        ));
    }

    draw() {
        // Ensure clean canvas state at start of boss draw
        ctx.save();
        
        try {
        // Draw death animation
        if (this.dying) {
            // Draw all pixels (both active dissolving and inactive still-in-place)
            for (const pixel of this.deathPixels) {
                if (!pixel.dissolved) {
                    ctx.save();
                    ctx.globalAlpha = pixel.opacity;
                    ctx.fillStyle = pixel.color;
                    ctx.shadowColor = pixel.color;
                    ctx.shadowBlur = pixel.active ? 8 : 4;
                    ctx.fillRect(pixel.x - pixel.size / 2, pixel.y - pixel.size / 2, pixel.size, pixel.size);
                    ctx.restore();
                }
            }
            
            return; // Don't draw normal boss
        }
        
        const pulse = Math.sin(this.pulsePhase) * 8;
        const chargePercent = this.currentCharge / this.chargeTime;
        
        // Teleport flash effect (for Void Lord)
        if (this.teleportFlash > 0) {
            const flashSize = this.size * 2;
            ctx.fillStyle = `rgba(100, 0, 150, ${this.teleportFlash * 0.5})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, flashSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // *** CHARGE INTERRUPT EFFECTS ***
        // Shockwave ring
        if (this.shockwaveActive && this.shockwaveRadius > 0) {
            const alpha = Math.max(0, 1 - this.shockwaveRadius / 400);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.lineWidth = 8 - (this.shockwaveRadius / 60);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.shockwaveRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner colored ring
            ctx.strokeStyle = this.bossType.projectileColor + Math.floor(alpha * 200).toString(16).padStart(2, '0');
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.shockwaveRadius * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Big flash when charge is interrupted
        if (this.interruptFlash > 0) {
            // Screen-wide flash tint
            ctx.fillStyle = `rgba(255, 255, 255, ${this.interruptFlash * 0.3})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Massive bloom around boss
            const bloomSize = this.size * 3 * this.interruptFlash;
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, bloomSize
            );
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.interruptFlash * 0.9})`);
            gradient.addColorStop(0.2, `rgba(255, 255, 200, ${this.interruptFlash * 0.6})`);
            gradient.addColorStop(0.5, `rgba(255, 200, 100, ${this.interruptFlash * 0.3})`);
            gradient.addColorStop(1, 'rgba(255, 150, 50, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, bloomSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw interrupt particles (rays and sparks)
        this.interruptParticles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.opacity;
            
            if (p.type === 'ray') {
                // Light rays shooting outward
                const endX = p.x + Math.cos(p.angle) * p.length;
                const endY = p.y + Math.sin(p.angle) * p.length;
                
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (p.type === 'spark') {
                // Glowing sparks
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Light motes
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.4, p.color);
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        });
        
        // HD-2D style bloom lighting when hit
        if (this.hitGlow > 0) {
            const bloomSize = this.size * 1.5 * this.hitGlow;
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, bloomSize
            );
            gradient.addColorStop(0, `rgba(255, 255, 220, ${this.hitGlow * 0.5})`);
            gradient.addColorStop(0.2, `rgba(255, 200, 150, ${this.hitGlow * 0.3})`);
            gradient.addColorStop(0.5, `rgba(255, 100, 50, ${this.hitGlow * 0.15})`);
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(this.x - bloomSize, this.y - bloomSize, bloomSize * 2, bloomSize * 2);
        }
        
        // Boss-specific aura using boss type colors
        for (let i = 3; i >= 0; i--) {
            const auraSize = this.size + 60 + i * 30 + pulse;
            const alpha = 0.1 + chargePercent * 0.15 - i * 0.02;
            ctx.beginPath();
            ctx.arc(this.x, this.y, auraSize, 0, Math.PI * 2);
            ctx.fillStyle = this.auraColor.replace(/[\d.]+\)$/, `${alpha})`);
            ctx.fill();
        }
        
        // Charge ring using boss color
        if (chargePercent > 0.3) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 40, 0, Math.PI * 2 * chargePercent);
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = chargePercent;
            ctx.lineWidth = 8;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        
        // *** MASSIVE CHARGING ATTACK VISUALS ***
        if (chargePercent > 0.1) {
            const attackType = this.bossType.attackType || 'meteor';
            const chargeSize = 40 + chargePercent * 150; // Grows with charge
            const time = this.pulsePhase;
            
            ctx.save();
            
            if (attackType === 'meteor') {
                // FIRE DEMON - Giant fireball growing above boss
                const fireY = this.y - this.size/2 - 60 - chargePercent * 40;
                
                // Multiple flame layers
                for (let layer = 3; layer >= 0; layer--) {
                    const layerSize = chargeSize * (1 + layer * 0.3);
                    const gradient = ctx.createRadialGradient(this.x, fireY, 0, this.x, fireY, layerSize);
                    const flicker = Math.sin(time * 8 + layer) * 0.2 + 0.8;
                    
                    if (layer === 0) {
                        gradient.addColorStop(0, '#ffffff');
                        gradient.addColorStop(0.2, '#ffff00');
                        gradient.addColorStop(0.5, '#ff6600');
                        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                    } else {
                        gradient.addColorStop(0, `rgba(255, ${150 - layer * 30}, 0, ${flicker * 0.6})`);
                        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                    }
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(this.x, fireY, layerSize, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Rising fire particles
                for (let i = 0; i < 8; i++) {
                    const angle = (time * 2 + i * Math.PI / 4) % (Math.PI * 2);
                    const dist = chargeSize * 0.6 + Math.sin(time * 3 + i) * 20;
                    const px = this.x + Math.cos(angle) * dist;
                    const py = fireY + Math.sin(angle) * dist * 0.5 - Math.sin(time * 5 + i) * 30;
                    
                    ctx.fillStyle = `rgba(255, ${100 + Math.random() * 100}, 0, ${chargePercent * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 5 + Math.random() * 10, 0, Math.PI * 2);
                    ctx.fill();
                }
                
            } else if (attackType === 'voidBeam') {
                // SHADOW WRAITH - Dark energy swirling around, beam forming
                const beamY = this.y - this.size/2 - 50;
                
                // Dark vortex
                for (let ring = 0; ring < 5; ring++) {
                    const ringSize = chargeSize * (0.5 + ring * 0.2);
                    const rotation = time * (2 - ring * 0.3);
                    
                    ctx.strokeStyle = `rgba(106, 13, 173, ${(1 - ring * 0.15) * chargePercent})`;
                    ctx.lineWidth = 4 - ring * 0.5;
                    ctx.beginPath();
                    ctx.arc(this.x, beamY, ringSize, rotation, rotation + Math.PI * 1.5);
                    ctx.stroke();
                }
                
                // Central dark core
                const coreGrad = ctx.createRadialGradient(this.x, beamY, 0, this.x, beamY, chargeSize * 0.5);
                coreGrad.addColorStop(0, `rgba(0, 0, 0, ${chargePercent})`);
                coreGrad.addColorStop(0.5, `rgba(75, 0, 130, ${chargePercent * 0.8})`);
                coreGrad.addColorStop(1, 'rgba(106, 13, 173, 0)');
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(this.x, beamY, chargeSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
                
                // Dark energy tendrils pointing toward player
                if (chargePercent > 0.5) {
                    const dx = player.x - this.x;
                    const dy = player.y - beamY;
                    const angle = Math.atan2(dy, dx);
                    const tendrilLen = chargePercent * 200;
                    
                    ctx.strokeStyle = `rgba(150, 50, 200, ${chargePercent * 0.6})`;
                    ctx.lineWidth = 3 + chargePercent * 5;
                    ctx.beginPath();
                    ctx.moveTo(this.x, beamY);
                    ctx.lineTo(this.x + Math.cos(angle) * tendrilLen, beamY + Math.sin(angle) * tendrilLen);
                    ctx.stroke();
                }
                
            } else if (attackType === 'iceSpike') {
                // ICE GOLEM - Giant ice crystal forming
                const iceY = this.y - this.size/2 - 80;
                const spikeHeight = chargeSize * 1.5;
                
                // Crystal glow
                const iceGrad = ctx.createRadialGradient(this.x, iceY, 0, this.x, iceY, chargeSize);
                iceGrad.addColorStop(0, `rgba(200, 255, 255, ${chargePercent * 0.9})`);
                iceGrad.addColorStop(0.5, `rgba(135, 206, 235, ${chargePercent * 0.5})`);
                iceGrad.addColorStop(1, 'rgba(0, 191, 255, 0)');
                ctx.fillStyle = iceGrad;
                ctx.beginPath();
                ctx.arc(this.x, iceY, chargeSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Main ice crystal
                ctx.fillStyle = `rgba(200, 255, 255, ${chargePercent * 0.8})`;
                ctx.beginPath();
                ctx.moveTo(this.x, iceY - spikeHeight/2);
                ctx.lineTo(this.x - chargeSize * 0.4, iceY);
                ctx.lineTo(this.x, iceY + spikeHeight/3);
                ctx.lineTo(this.x + chargeSize * 0.4, iceY);
                ctx.closePath();
                ctx.fill();
                
                // Crystal facets
                ctx.strokeStyle = `rgba(255, 255, 255, ${chargePercent})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Frost particles
                for (let i = 0; i < 12; i++) {
                    const angle = time + i * Math.PI / 6;
                    const dist = chargeSize * 0.8 + Math.sin(time * 2 + i) * 15;
                    const fx = this.x + Math.cos(angle) * dist;
                    const fy = iceY + Math.sin(angle) * dist * 0.6;
                    
                    ctx.fillStyle = `rgba(200, 255, 255, ${chargePercent * 0.7})`;
                    ctx.fillRect(fx - 3, fy - 3, 6, 6);
                }
                
            } else if (attackType === 'lightning') {
                // STORM SPECTER - Electric storm building
                const stormY = this.y - this.size/2 - 60;
                
                // Electric field
                const elecGrad = ctx.createRadialGradient(this.x, stormY, 0, this.x, stormY, chargeSize * 1.2);
                elecGrad.addColorStop(0, `rgba(255, 255, 200, ${chargePercent * 0.6})`);
                elecGrad.addColorStop(0.5, `rgba(255, 215, 0, ${chargePercent * 0.3})`);
                elecGrad.addColorStop(1, 'rgba(255, 255, 0, 0)');
                ctx.fillStyle = elecGrad;
                ctx.beginPath();
                ctx.arc(this.x, stormY, chargeSize * 1.2, 0, Math.PI * 2);
                ctx.fill();
                
                // Lightning bolts
                for (let bolt = 0; bolt < 6; bolt++) {
                    if (Math.random() < chargePercent * 0.5) {
                        const startAngle = Math.random() * Math.PI * 2;
                        const boltLen = 30 + Math.random() * chargeSize;
                        let bx = this.x + Math.cos(startAngle) * 10;
                        let by = stormY + Math.sin(startAngle) * 10;
                        
                        ctx.strokeStyle = `rgba(255, 255, ${150 + Math.random() * 100}, ${0.5 + chargePercent * 0.5})`;
                        ctx.lineWidth = 2 + Math.random() * 3;
                        ctx.beginPath();
                        ctx.moveTo(bx, by);
                        
                        for (let seg = 0; seg < 5; seg++) {
                            bx += (Math.random() - 0.5) * 40;
                            by += boltLen / 5;
                            ctx.lineTo(bx, by);
                        }
                        ctx.stroke();
                    }
                }
                
            } else if (attackType === 'blackHole') {
                // VOID LORD - Singularity forming
                const voidY = this.y - this.size/2 - 70;
                
                // Warping space effect - concentric rings (brighter purple/magenta)
                for (let ring = 5; ring >= 0; ring--) {
                    const ringSize = chargeSize * (0.3 + ring * 0.15);
                    const warp = Math.sin(time * 3 - ring * 0.5) * 5;
                    
                    // Brighter purple/magenta rings
                    ctx.strokeStyle = `rgba(${100 + ring * 25}, ${20 + ring * 10}, ${150 + ring * 20}, ${(1 - ring * 0.1) * chargePercent})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    // Use scale instead of ellipse to avoid canvas glitches
                    ctx.save();
                    ctx.translate(this.x, voidY);
                    ctx.scale(1, 0.8);
                    ctx.arc(0, 0, ringSize + warp, 0, Math.PI * 2);
                    ctx.restore();
                    ctx.stroke();
                }
                
                // Central void with visible purple core
                const voidGrad = ctx.createRadialGradient(this.x, voidY, 0, this.x, voidY, chargeSize * 0.4);
                voidGrad.addColorStop(0, `rgba(50, 0, 80, ${chargePercent})`);
                voidGrad.addColorStop(0.5, `rgba(100, 30, 150, ${chargePercent * 0.9})`);
                voidGrad.addColorStop(0.8, `rgba(150, 50, 200, ${chargePercent * 0.6})`);
                voidGrad.addColorStop(1, 'rgba(180, 80, 220, 0)');
                ctx.fillStyle = voidGrad;
                ctx.beginPath();
                ctx.arc(this.x, voidY, chargeSize * 0.4, 0, Math.PI * 2);
                ctx.fill();
                
                // Matter being pulled in
                for (let p = 0; p < 8; p++) {
                    const pullAngle = time * 2 + p * Math.PI / 4;
                    const pullDist = chargeSize * (1.3 - chargePercent * 0.4) + Math.sin(time * 3 + p) * 15;
                    const px = this.x + Math.cos(pullAngle) * pullDist;
                    const py = voidY + Math.sin(pullAngle) * pullDist * 0.7;
                    
                    ctx.fillStyle = `rgba(120, 50, 180, ${chargePercent * 0.7})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 4 + (1 - chargePercent) * 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                
            } else if (attackType === 'laserBeam') {
                // CRYSTAL DRAGON - Charging crystal beam
                const crystalY = this.y - this.size/2 - 60;
                
                // Crystal energy buildup
                const beamGrad = ctx.createRadialGradient(this.x, crystalY, 0, this.x, crystalY, chargeSize);
                beamGrad.addColorStop(0, `rgba(255, 255, 255, ${chargePercent})`);
                beamGrad.addColorStop(0.3, `rgba(224, 64, 251, ${chargePercent * 0.8})`);
                beamGrad.addColorStop(1, 'rgba(206, 147, 216, 0)');
                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.arc(this.x, crystalY, chargeSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Rotating crystal shards
                for (let shard = 0; shard < 8; shard++) {
                    const shardAngle = time * 1.5 + shard * Math.PI / 4;
                    const shardDist = chargeSize * 0.7;
                    const sx = this.x + Math.cos(shardAngle) * shardDist;
                    const sy = crystalY + Math.sin(shardAngle) * shardDist;
                    
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(shardAngle + Math.PI / 4);
                    ctx.fillStyle = `rgba(255, 200, 255, ${chargePercent * 0.8})`;
                    ctx.fillRect(-8, -4, 16, 8);
                    ctx.restore();
                }
                
                // Beam preview line toward player
                if (chargePercent > 0.6) {
                    const previewLen = (chargePercent - 0.6) * 2.5 * 300;
                    const angle = Math.atan2(player.y - crystalY, player.x - this.x);
                    
                    ctx.strokeStyle = `rgba(224, 64, 251, ${(chargePercent - 0.6) * 2})`;
                    ctx.lineWidth = 2 + chargePercent * 8;
                    ctx.setLineDash([10, 10]);
                    ctx.beginPath();
                    ctx.moveTo(this.x, crystalY);
                    ctx.lineTo(this.x + Math.cos(angle) * previewLen, crystalY + Math.sin(angle) * previewLen);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                
            } else if (attackType === 'toxicCloud') {
                // PLAGUE BEAST - Toxic cloud expanding
                const cloudY = this.y - this.size/2 - 50;
                
                // Multiple toxic bubbles
                for (let bubble = 0; bubble < 6; bubble++) {
                    const bubbleAngle = time * 0.5 + bubble * Math.PI / 3;
                    const bubbleDist = chargeSize * 0.5 * Math.sin(time + bubble);
                    const bx = this.x + Math.cos(bubbleAngle) * bubbleDist;
                    const by = cloudY + Math.sin(bubbleAngle) * bubbleDist * 0.5;
                    const bubbleSize = chargeSize * (0.3 + 0.1 * Math.sin(time * 2 + bubble));
                    
                    const toxGrad = ctx.createRadialGradient(bx, by, 0, bx, by, bubbleSize);
                    toxGrad.addColorStop(0, `rgba(124, 252, 0, ${chargePercent * 0.6})`);
                    toxGrad.addColorStop(0.7, `rgba(50, 205, 50, ${chargePercent * 0.3})`);
                    toxGrad.addColorStop(1, 'rgba(0, 100, 0, 0)');
                    ctx.fillStyle = toxGrad;
                    ctx.beginPath();
                    ctx.arc(bx, by, bubbleSize, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Dripping toxic drops
                for (let drop = 0; drop < 5; drop++) {
                    const dropX = this.x + (Math.sin(time * 2 + drop * 1.3) * chargeSize * 0.4);
                    const dropY = cloudY + (time * 30 + drop * 20) % (chargeSize * 0.8);
                    
                    ctx.fillStyle = `rgba(124, 252, 0, ${chargePercent * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(dropX, dropY, 4 + Math.random() * 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                
            } else if (attackType === 'bloodOrb') {
                // BLOOD MOON - Massive blood orb pulsating
                const orbY = this.y - this.size/2 - 70;
                const pulsate = 1 + Math.sin(time * 4) * 0.15;
                
                // Blood aura
                const bloodGrad = ctx.createRadialGradient(this.x, orbY, 0, this.x, orbY, chargeSize * 1.3 * pulsate);
                bloodGrad.addColorStop(0, `rgba(220, 20, 60, ${chargePercent * 0.9})`);
                bloodGrad.addColorStop(0.5, `rgba(139, 0, 0, ${chargePercent * 0.5})`);
                bloodGrad.addColorStop(1, 'rgba(74, 0, 0, 0)');
                ctx.fillStyle = bloodGrad;
                ctx.beginPath();
                ctx.arc(this.x, orbY, chargeSize * 1.3 * pulsate, 0, Math.PI * 2);
                ctx.fill();
                
                // Core orb
                ctx.fillStyle = `rgba(255, 50, 50, ${chargePercent})`;
                ctx.beginPath();
                ctx.arc(this.x, orbY, chargeSize * 0.5 * pulsate, 0, Math.PI * 2);
                ctx.fill();
                
                // Blood tendrils
                for (let t = 0; t < 8; t++) {
                    const tendrilAngle = time * 1.5 + t * Math.PI / 4;
                    const tendrilLen = chargeSize * 0.8 + Math.sin(time * 3 + t) * 20;
                    
                    ctx.strokeStyle = `rgba(139, 0, 0, ${chargePercent * 0.7})`;
                    ctx.lineWidth = 3 + Math.sin(time * 4 + t) * 2;
                    ctx.beginPath();
                    ctx.moveTo(this.x, orbY);
                    
                    const endX = this.x + Math.cos(tendrilAngle) * tendrilLen;
                    const endY = orbY + Math.sin(tendrilAngle) * tendrilLen * 0.7;
                    const ctrlX = this.x + Math.cos(tendrilAngle) * tendrilLen * 0.5 + Math.sin(time * 2 + t) * 20;
                    const ctrlY = orbY + Math.sin(tendrilAngle) * tendrilLen * 0.35;
                    
                    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
                    ctx.stroke();
                }
            }
            
            ctx.restore();
        }
        
        // Draw boss sprite with boss-specific glow
        ctx.shadowColor = this.hitGlow > 0 ? '#ffffff' : this.color;
        ctx.shadowBlur = 40 + chargePercent * 40 + this.hitGlow * 60;
        
        if (this.hitGlow > 0.5) {
            drawSprite(this.x, this.y, this.sprite, 16 + pulse / 4, '#ffffff');
        } else {
            drawSprite(this.x, this.y, this.sprite, 16 + pulse / 4, this.color);
        }
        ctx.shadowBlur = 0;
        
        // Glowing eyes with boss-specific color and configuration
        const eyeIntensity = 0.5 + this.eyeGlow * 0.5 + chargePercent * 0.5;
        ctx.fillStyle = this.eyeColor;
        ctx.globalAlpha = eyeIntensity;
        ctx.shadowColor = this.eyeColor;
        ctx.shadowBlur = 30;
        
        // Draw eyes based on boss type
        const eyeSize = 12 + pulse / 3;
        if (this.name === 'VOID LORD') {
            // Three eyes for Void Lord
            ctx.beginPath();
            ctx.arc(this.x - 50, this.y - 15, eyeSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x, this.y - 25, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 50, this.y - 15, eyeSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.name === 'BLOOD MOON') {
            // Multiple small eyes in a circle for Blood Moon
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + this.pulsePhase * 0.5;
                const ex = this.x + Math.cos(angle) * 40;
                const ey = this.y - 10 + Math.sin(angle) * 25;
                ctx.beginPath();
                ctx.arc(ex, ey, eyeSize * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.name === 'SHADOW WRAITH') {
            // Ghostly elongated eyes
            ctx.save();
            ctx.translate(this.x - 35, this.y - 20);
            ctx.scale(1, 0.5);
            ctx.beginPath();
            ctx.arc(0, 0, eyeSize * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.translate(this.x + 35, this.y - 20);
            ctx.scale(1, 0.5);
            ctx.beginPath();
            ctx.arc(0, 0, eyeSize * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (this.name === 'STORM SPECTER') {
            // Electric crackling eyes
            ctx.beginPath();
            ctx.arc(this.x - 40, this.y - 15, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 40, this.y - 15, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            // Electric arcs from eyes
            ctx.strokeStyle = this.eyeColor;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const angle = Math.random() * Math.PI - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(this.x - 40, this.y - 15);
                ctx.lineTo(this.x - 40 + Math.cos(angle) * 25, this.y - 15 + Math.sin(angle) * 25);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(this.x + 40, this.y - 15);
                ctx.lineTo(this.x + 40 + Math.cos(angle) * 25, this.y - 15 + Math.sin(angle) * 25);
                ctx.stroke();
            }
        } else {
            // Default two eyes
            ctx.beginPath();
            ctx.arc(this.x - 45, this.y - 20, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 45, this.y - 20, eyeSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        // Health bar
        const barWidth = this.size * 1.5;
        const barHeight = 14;
        const barY = this.y - this.size / 2 - 80;
        
        ctx.fillStyle = '#222';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        // Health bar color matches boss
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * (this.health / this.maxHealth), barHeight);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        
        // Boss name label - use aura color for dark bosses so name is visible
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.textAlign = 'center';
        // Check if the boss color is too dark (Void Lord is #1a1a2e)
        const nameColor = this.bossType.pattern === 'teleport' ? '#9966ff' : this.color;
        ctx.fillStyle = nameColor;
        ctx.shadowColor = nameColor;
        ctx.shadowBlur = 15;
        ctx.fillText(this.name, this.x, barY - 12);
        ctx.shadowBlur = 0;
        
        // Draw reveal flash effect during reveal phase
        if (this.revealFlash > 0) {
            ctx.save();
            
            // Large bloom around the boss
            const bloomSize = this.size * (1.5 + this.revealFlash * 1.5);
            const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, bloomSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${this.revealFlash * 0.9})`);
            gradient.addColorStop(0.2, `${this.color}${Math.floor(this.revealFlash * 200).toString(16).padStart(2, '0')}`);
            gradient.addColorStop(0.5, `${this.auraColor}${Math.floor(this.revealFlash * 100).toString(16).padStart(2, '0')}`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, bloomSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Light rays during reveal
            if (this.revealFlash > 0.3) {
                const rayCount = 8;
                for (let i = 0; i < rayCount; i++) {
                    const angle = (i / rayCount) * Math.PI * 2 + this.pulsePhase;
                    const rayLength = bloomSize * 1.2;
                    
                    ctx.strokeStyle = this.color;
                    ctx.globalAlpha = this.revealFlash * 0.7;
                    ctx.lineWidth = 8 + this.revealFlash * 15;
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(
                        this.x + Math.cos(angle) * rayLength,
                        this.y + Math.sin(angle) * rayLength
                    );
                    ctx.stroke();
                }
            }
            
            ctx.restore();
        }
        
        // Note boxes with staff notation (only show after reveal)
        if (!this.notesRevealed) {
            // Don't draw note boxes during entrance
            ctx.textBaseline = 'alphabetic';
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            
            // Still draw box fragments if any (optimized)
            if (this.boxFragments && this.boxFragments.length > 0) {
                for (let i = 0, len = this.boxFragments.length; i < len; i++) {
                    const frag = this.boxFragments[i];
                    ctx.save();
                    ctx.globalAlpha = frag.opacity;
                    ctx.translate(frag.x, frag.y);
                    ctx.rotate(frag.rotation);
                    ctx.fillStyle = frag.isGlow ? frag.color : 'rgba(0, 0, 0, 0.8)';
                    ctx.fillRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                    if (!frag.isGlow) {
                        ctx.strokeStyle = frag.color;
                        ctx.lineWidth = 2;
                        ctx.strokeRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                    }
                    ctx.restore();
                }
            }
            
            return;
        }
        
        // Draw based on mode: notes (music) or word (typing)
        if (this.mode === 'typing' && this.word) {
            // TYPING MODE: Draw word with individual letter boxes
            // Scale box size based on word length to fit on screen
            const maxTotalWidth = canvas.width - 100; // Leave 50px margin on each side
            const idealBoxSize = 50;
            const idealSpacing = idealBoxSize + 5;
            const idealTotalWidth = this.word.length * idealSpacing - 5;
            
            // If word is too long, scale down
            const scaleFactor = idealTotalWidth > maxTotalWidth ? maxTotalWidth / idealTotalWidth : 1;
            const boxSize = Math.max(25, idealBoxSize * scaleFactor); // Minimum 25px box size
            const letterSpacing = boxSize + (5 * scaleFactor);
            const totalWidth = this.word.length * letterSpacing - (5 * scaleFactor);
            const startX = this.x - totalWidth / 2 + boxSize / 2;
            
            for (let i = 0; i < this.word.length; i++) {
                const letter = this.word[i];
                const letterX = startX + i * letterSpacing;
                const letterY = this.y + this.size / 2 + 60;
                const isHit = i < this.lettersHit.length;
                const boxX = letterX - boxSize / 2;
                const boxY = letterY - boxSize / 2;
                const letterColor = LETTER_COLORS[letter] || '#ffffff';
                
                if (!isHit) {
                    // Box glow (subtle)
                    ctx.shadowColor = letterColor;
                    ctx.shadowBlur = 8;
                    
                    // Box background (more opaque for better contrast)
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
                    ctx.fillRect(boxX, boxY, boxSize, boxSize);
                    
                    // Box border
                    ctx.strokeStyle = letterColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(boxX, boxY, boxSize, boxSize);
                    
                    // Inner highlight
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(boxX + 2, boxY + 2, boxSize - 4, boxSize - 4);
                    
                    // Draw the letter (clearer, less bloom)
                    ctx.shadowBlur = 0;
                    ctx.font = `bold ${boxSize * 0.65}px 'Courier New', monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // White outline for better readability
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 4;
                    ctx.strokeText(letter, letterX, letterY);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeText(letter, letterX, letterY);
                    ctx.fillStyle = letterColor;
                    ctx.fillText(letter, letterX, letterY);
                    ctx.shadowBlur = 0;
                } else {
                    // Hit letter - show flash effect
                    const flashAmount = this.letterHitFlash && this.letterHitFlash[i] ? this.letterHitFlash[i] : 0;
                    
                    if (flashAmount > 0.5) {
                        const bloomSize = boxSize * (1 + flashAmount * 0.8);
                        const gradient = ctx.createRadialGradient(letterX, letterY, 0, letterX, letterY, bloomSize);
                        gradient.addColorStop(0, `rgba(255, 255, 255, ${flashAmount * 0.9})`);
                        gradient.addColorStop(0.5, `${letterColor}${Math.floor(flashAmount * 128).toString(16).padStart(2, '0')}`);
                        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(letterX, letterY, bloomSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    // Draw letter popup animation
                    const popup = this.letterPopups && this.letterPopups[i];
                    if (popup && popup.active) {
                        const popupX = letterX + popup.x + 30;
                        const popupY = letterY + popup.y;
                        
                        ctx.save();
                        ctx.globalAlpha = popup.alpha;
                        ctx.translate(popupX, popupY);
                        ctx.scale(popup.scale, popup.scale);
                        
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.fillRect(-20, -14, 40, 28);
                        
                        ctx.shadowColor = letterColor;
                        ctx.shadowBlur = 15;
                        ctx.font = 'bold 24px "Courier New", monospace';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2;
                        ctx.strokeText(letter, 0, 0);
                        ctx.fillStyle = letterColor;
                        ctx.fillText(letter, 0, 0);
                        
                        ctx.restore();
                    }
                }
            }
        } else {
            // MUSIC MODE: Draw notes with staff notation
            const boxSize = 65;
            const noteSpacing = boxSize + 8;
            const startX = this.x - ((this.notes.length - 1) * noteSpacing) / 2;
            
            this.notes.forEach((note, i) => {
                const noteX = startX + i * noteSpacing;
                const noteY = this.y + this.size / 2 + 60;
                const isHit = this.notesHit.has(note);
                const boxX = noteX - boxSize / 2;
                const boxY = noteY - boxSize / 2;
                const noteColor = getNoteColor(note);
                
                if (!isHit) {
                    // Box glow
                    ctx.shadowColor = noteColor;
                    ctx.shadowBlur = 15;
                    
                    // Box background
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillRect(boxX, boxY, boxSize, boxSize);
                    
                    // Box border
                    ctx.strokeStyle = noteColor;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(boxX, boxY, boxSize, boxSize);
                    
                    // Inner highlight
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(boxX + 2, boxY + 2, boxSize - 4, boxSize - 4);
                    
                    // Draw musical staff notation
                    ctx.shadowBlur = 0;
                    drawStaffNote(noteX, boxY + boxSize / 2, boxSize, note, noteColor);
                } else {
                    // Hit note - show flash effect only, no greyed out box
                    const flashAmount = this.noteHitFlash && this.noteHitFlash[note] ? this.noteHitFlash[note] : 0;
                    
                    // Hit flash bloom effect (brief flash then nothing)
                    if (flashAmount > 0.5) {
                        const bloomSize = boxSize * (1 + flashAmount * 0.8);
                        const gradient = ctx.createRadialGradient(noteX, boxY + boxSize/2, 0, noteX, boxY + boxSize/2, bloomSize);
                        gradient.addColorStop(0, `rgba(255, 255, 255, ${flashAmount * 0.9})`);
                        gradient.addColorStop(0.3, `${noteColor}${Math.floor(flashAmount * 200).toString(16).padStart(2, '0')}`);
                        gradient.addColorStop(0.7, `${noteColor}${Math.floor(flashAmount * 80).toString(16).padStart(2, '0')}`);
                        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(noteX, boxY + boxSize/2, bloomSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    // Draw note popup animation for this hit note - floats up and to the side
                    const popup = this.notePopups && this.notePopups[note];
                    if (popup && popup.active) {
                        const popupX = noteX + popup.x + 35; // Offset to the right
                        const popupY = boxY + boxSize/2 + popup.y; // Add vertical offset
                        
                        ctx.save();
                        ctx.globalAlpha = popup.alpha;
                        ctx.translate(popupX, popupY);
                        ctx.scale(popup.scale, popup.scale);
                        
                        // Dark background for readability
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.fillRect(-28, -16, 56, 32);
                        
                        // Glow effect
                        ctx.shadowColor = noteColor;
                        ctx.shadowBlur = 15;
                        
                        // Draw the note name with sharps/flats
                        ctx.font = 'bold 28px "Courier New", monospace';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        // Format the note name (strip octave, C# becomes C♯)
                        let displayNote = getBaseNoteName(note);
                        if (displayNote && displayNote.includes('#')) {
                            displayNote = displayNote.replace('#', '♯');
                        }
                        
                        // White outline for visibility
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2;
                        ctx.strokeText(displayNote, 0, 0);
                        
                        // Colored fill
                        ctx.fillStyle = noteColor;
                        ctx.fillText(displayNote, 0, 0);
                        
                        ctx.restore();
                    }
                }
            });
        }
        
        ctx.textBaseline = 'alphabetic';
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        
        // Draw box fragments (optimized)
        if (this.boxFragments && this.boxFragments.length > 0) {
            for (let i = 0, len = this.boxFragments.length; i < len; i++) {
                const frag = this.boxFragments[i];
                ctx.save();
                ctx.globalAlpha = frag.opacity;
                ctx.translate(frag.x, frag.y);
                ctx.rotate(frag.rotation);
                ctx.fillStyle = frag.isGlow ? frag.color : 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                if (!frag.isGlow) {
                    ctx.strokeStyle = frag.color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-frag.size / 2, -frag.size / 2, frag.size, frag.size);
                }
                ctx.restore();
            }
        }
        
        } finally {
            // Always restore canvas state at end of boss draw
            ctx.restore();
        }
    }
}

// ============================================
// BOSS PROJECTILE CLASS
// ============================================

class BossProjectile {
    constructor(startX, startY, targetX, targetY, color = '#ff4400', attackType = 'meteor') {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.attackType = attackType;
        
        const dx = targetX - startX;
        const dy = targetY - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.beamLength = dist;
        this.angle = Math.atan2(dy, dx);
        
        this.alive = true;
        this.phase = 0;
        this.lifetime = 0;
        this.particles = [];
        this.hasHitPlayer = false;
        
        // ALL attacks are now beam-based for maximum impact
        this.beamWidth = 0;
        this.beamPhase = 'expanding'; // expanding, holding, fading
        this.beamTimer = 0;
        this.beamHoldDuration = 120; // Hold for 2 seconds
        
        // Attack-specific beam widths and effects
        if (attackType === 'iceSpike') {
            this.maxBeamWidth = 80;
            this.snowflakes = [];
            this.initSnowflakes();
        } else if (attackType === 'lightning') {
            this.maxBeamWidth = 100;
            this.lightningBolts = [];
            this.sparks = [];
            this.initLightningBolts();
        } else if (attackType === 'meteor') {
            this.maxBeamWidth = 90;
            this.fireParticles = [];
        } else if (attackType === 'voidBeam') {
            this.maxBeamWidth = 70;
            this.voidParticles = [];
        } else if (attackType === 'blackHole') {
            this.maxBeamWidth = 85;
            this.distortionRings = [];
        } else if (attackType === 'laserBeam') {
            this.maxBeamWidth = 75;
            this.crystalShards = [];
        } else if (attackType === 'toxicCloud') {
            this.maxBeamWidth = 95;
            this.toxicBubbles = [];
        } else if (attackType === 'bloodOrb') {
            this.maxBeamWidth = 80;
            this.bloodDrops = [];
        } else {
            this.maxBeamWidth = 60;
        }
    }
    
    initSnowflakes() {
        // Create snowflakes along the beam path
        for (let i = 0; i < 50; i++) {
            const t = Math.random();
            const px = this.x + Math.cos(this.angle) * this.beamLength * t;
            const py = this.y + Math.sin(this.angle) * this.beamLength * t;
            this.snowflakes.push({
                x: px + (Math.random() - 0.5) * 100,
                y: py + (Math.random() - 0.5) * 100,
                size: 3 + Math.random() * 8,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                opacity: 0.7 + Math.random() * 0.3,
                vx: (Math.random() - 0.5) * 2,
                vy: Math.random() * 2
            });
        }
    }
    
    initLightningBolts() {
        // Create just 3 lightning bolts (reduced from 5 for performance)
        this.lightningBolts = [];
        for (let bolt = 0; bolt < 3; bolt++) {
            const points = [];
            const segments = 8; // Reduced segments for performance
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const baseX = this.x + Math.cos(this.angle) * this.beamLength * t;
                const baseY = this.y + Math.sin(this.angle) * this.beamLength * t;
                
                // Add random zigzag offset perpendicular to beam
                const perpAngle = this.angle + Math.PI / 2;
                const offset = (Math.random() - 0.5) * 60 * (bolt === 0 ? 0.3 : 1);
                const px = baseX + Math.cos(perpAngle) * offset;
                const py = baseY + Math.sin(perpAngle) * offset;
                
                points.push({ x: px, y: py, baseX: baseX, baseY: baseY });
            }
            
            this.lightningBolts.push({
                points: points,
                width: bolt === 0 ? 10 : 3 + Math.random() * 4,
                opacity: bolt === 0 ? 1 : 0.5 + Math.random() * 0.3,
                color: bolt === 0 ? '#ffffff' : '#ffff00'
            });
        }
    }
    
    // Lightweight update for lightning flicker effect
    updateLightningFlicker() {
        if (!this.lightningBolts) return;
        
        for (const bolt of this.lightningBolts) {
            for (let i = 1; i < bolt.points.length - 1; i++) { // Don't move endpoints
                const p = bolt.points[i];
                const perpAngle = this.angle + Math.PI / 2;
                const offset = (Math.random() - 0.5) * 40;
                p.x = p.baseX + Math.cos(perpAngle) * offset;
                p.y = p.baseY + Math.sin(perpAngle) * offset;
            }
        }
    }

    update() {
        this.phase += 0.2;
        this.lifetime++;
        
        // ALL attacks are now beam-based
        if (this.beamPhase === 'expanding') {
            this.beamWidth = Math.min(this.beamWidth + 8, this.maxBeamWidth);
            if (this.beamWidth >= this.maxBeamWidth) {
                this.beamPhase = 'holding';
                this.checkBeamCollision();
                this.createImpactEffects();
            }
        } else if (this.beamPhase === 'holding') {
            this.beamTimer++;
            
            // Spawn continuous particles during hold
            this.spawnBeamParticles();
            
            // Lightweight lightning flicker (just move points, don't recreate)
            if (this.attackType === 'lightning' && this.beamTimer % 4 === 0) {
                this.updateLightningFlicker();
                // Add sparks less frequently
                if (this.beamTimer % 12 === 0) {
                    this.addImpactSparks();
                }
            }
            
            if (this.beamTimer > this.beamHoldDuration) {
                this.beamPhase = 'fading';
            }
        } else if (this.beamPhase === 'fading') {
            this.beamWidth -= 2;
            if (this.beamWidth <= 0) {
                this.alive = false;
            }
        }
        
        // Update all particle arrays
        this.updateParticles();
    }
    
    spawnBeamParticles() {
        const impactX = this.targetX;
        const impactY = this.targetY;
        
        if (this.attackType === 'iceSpike') {
            // Spawn snowflakes along beam
            if (this.beamTimer % 3 === 0) {
                const t = Math.random();
                const px = this.x + Math.cos(this.angle) * this.beamLength * t;
                const py = this.y + Math.sin(this.angle) * this.beamLength * t;
                this.snowflakes.push({
                    x: px + (Math.random() - 0.5) * this.beamWidth,
                    y: py + (Math.random() - 0.5) * this.beamWidth,
                    size: 4 + Math.random() * 10,
                    rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.3,
                    opacity: 1,
                    vx: (Math.random() - 0.5) * 4,
                    vy: Math.random() * 3 + 1
                });
            }
        } else if (this.attackType === 'meteor') {
            // Spawn fire particles
            if (this.beamTimer % 2 === 0) {
                for (let i = 0; i < 3; i++) {
                    const t = Math.random();
                    const px = this.x + Math.cos(this.angle) * this.beamLength * t;
                    const py = this.y + Math.sin(this.angle) * this.beamLength * t;
                    this.fireParticles.push({
                        x: px + (Math.random() - 0.5) * this.beamWidth,
                        y: py + (Math.random() - 0.5) * this.beamWidth,
                        size: 8 + Math.random() * 15,
                        opacity: 1,
                        vx: (Math.random() - 0.5) * 5,
                        vy: -Math.random() * 5 - 2
                    });
                }
            }
        } else if (this.attackType === 'toxicCloud') {
            if (this.beamTimer % 4 === 0) {
                const t = Math.random();
                const px = this.x + Math.cos(this.angle) * this.beamLength * t;
                const py = this.y + Math.sin(this.angle) * this.beamLength * t;
                this.toxicBubbles.push({
                    x: px,
                    y: py,
                    size: 10 + Math.random() * 25,
                    opacity: 0.8,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -Math.random() * 2
                });
            }
        } else if (this.attackType === 'bloodOrb') {
            if (this.beamTimer % 3 === 0) {
                const t = Math.random();
                const px = this.x + Math.cos(this.angle) * this.beamLength * t;
                const py = this.y + Math.sin(this.angle) * this.beamLength * t;
                this.bloodDrops.push({
                    x: px + (Math.random() - 0.5) * this.beamWidth,
                    y: py + (Math.random() - 0.5) * this.beamWidth,
                    size: 5 + Math.random() * 10,
                    opacity: 1,
                    vx: (Math.random() - 0.5) * 2,
                    vy: Math.random() * 4 + 2
                });
            }
        }
    }
    
    addImpactSparks() {
        // Add sparks at the impact point for lightning (limit total sparks)
        if (this.sparks.length > 30) return; // Prevent too many sparks
        
        for (let i = 0; i < 3; i++) {
            this.sparks.push({
                x: this.targetX + (Math.random() - 0.5) * 40,
                y: this.targetY + (Math.random() - 0.5) * 40,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                size: 2 + Math.random() * 4,
                life: 15 + Math.random() * 15
            });
        }
    }
    
    createImpactEffects() {
        // Create big impact effects at player location when beam connects
        const impactX = this.targetX;
        const impactY = this.targetY;
        
        if (this.attackType === 'iceSpike') {
            // Ice shatter effect
            for (let i = 0; i < 30; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 5 + Math.random() * 10;
                this.particles.push({
                    x: impactX,
                    y: impactY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 5 + Math.random() * 15,
                    life: 60 + Math.random() * 40,
                    color: Math.random() > 0.5 ? '#87ceeb' : '#ffffff',
                    type: 'ice'
                });
            }
        } else if (this.attackType === 'lightning') {
            // Electric explosion (reduced count for performance)
            for (let i = 0; i < 15; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 6 + Math.random() * 10;
                this.sparks.push({
                    x: impactX,
                    y: impactY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 4,
                    life: 20 + Math.random() * 20
                });
            }
        }
    }
    
    updateParticles() {
        // Update snowflakes
        if (this.snowflakes) {
            this.snowflakes = this.snowflakes.filter(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.rotation += s.rotSpeed;
                s.opacity -= 0.01;
                return s.opacity > 0;
            });
        }
        
        // Update sparks
        if (this.sparks) {
            this.sparks = this.sparks.filter(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.vx *= 0.95;
                s.vy *= 0.95;
                s.life--;
                return s.life > 0;
            });
        }
        
        // Update fire particles
        if (this.fireParticles) {
            this.fireParticles = this.fireParticles.filter(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.size *= 0.96;
                p.opacity -= 0.02;
                return p.opacity > 0 && p.size > 1;
            });
        }
        
        // Update toxic bubbles
        if (this.toxicBubbles) {
            this.toxicBubbles = this.toxicBubbles.filter(b => {
                b.x += b.vx;
                b.y += b.vy;
                b.size += 0.5;
                b.opacity -= 0.015;
                return b.opacity > 0;
            });
        }
        
        // Update blood drops
        if (this.bloodDrops) {
            this.bloodDrops = this.bloodDrops.filter(d => {
                d.x += d.vx;
                d.y += d.vy;
                d.vy += 0.2; // gravity
                d.opacity -= 0.02;
                return d.opacity > 0;
            });
        }
        
        // Update impact particles
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.type === 'ice') {
                p.vy += 0.1; // slight gravity
            }
            p.life--;
            p.size *= 0.98;
            return p.life > 0 && p.size > 0.5;
        });
    }
    
    checkBeamCollision() {
        // Only hit player once per beam attack
        if (this.hasHitPlayer) return;
        
        // Check if player is in the beam path using proper line-to-point distance
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const beamLenSq = dx * dx + dy * dy;
        const beamLen = Math.sqrt(beamLenSq);
        
        // The beam extends 1.5x past the target
        const extendedLen = beamLen * 1.5;
        
        // Vector from beam start to player
        const px = player.x - this.x;
        const py = player.y - this.y;
        
        // Project player position onto beam line
        const dot = (px * dx + py * dy) / beamLenSq;
        
        // Clamp to beam length (0 to 1.5x original length)
        const t = Math.max(0, Math.min(1.5, dot));
        
        // Find closest point on beam to player
        const closestX = this.x + t * dx;
        const closestY = this.y + t * dy;
        
        // Distance from player to closest point on beam
        const distToPlayer = Math.sqrt((player.x - closestX) ** 2 + (player.y - closestY) ** 2);
        
        // Check collision with generous hit detection
        const hitRadius = this.beamWidth * 0.8 + player.size * 0.4;
        
        if (distToPlayer < hitRadius) {
            this.hasHitPlayer = true; // Mark as hit so we don't hit again
            try {
                damagePlayer(CONFIG.bossDamageToPlayer);
                this.createImpactExplosion();
            } catch (e) {
                console.error('Error in beam collision:', e);
            }
        }
    }
    
    createImpactExplosion() {
        // Simple explosion - reduced particle count to prevent issues
        const color = this.color || '#ff0000';
        
        // Basic particles
        for (let i = 0; i < 20; i++) {
            const p = new Particle(player.x, player.y, color);
            p.vx = (Math.random() - 0.5) * 15;
            p.vy = (Math.random() - 0.5) * 15;
            particles.push(p);
        }
        
        // A few light motes
        for (let i = 0; i < 8; i++) {
            particles.push(new LightMote(player.x, player.y, color));
        }
        
        // Light rays with proper parameters
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            particles.push(new LightRay(player.x, player.y, angle, color));
        }
    }

    draw() {
        ctx.save();
        
        // Draw all particle effects first
        this.drawParticleEffects();
        
        // Draw the main beam attack
        if (this.attackType === 'iceSpike') {
            this.drawIceBeam();
        } else if (this.attackType === 'lightning') {
            this.drawLightningBeam();
        } else if (this.attackType === 'meteor') {
            this.drawFireBeam();
        } else if (this.attackType === 'voidBeam') {
            this.drawVoidBeam();
        } else if (this.attackType === 'blackHole') {
            this.drawDarkBeam();
        } else if (this.attackType === 'laserBeam') {
            this.drawCrystalBeam();
        } else if (this.attackType === 'toxicCloud') {
            this.drawToxicBeam();
        } else if (this.attackType === 'bloodOrb') {
            this.drawBloodBeam();
        } else {
            this.drawDefaultBeam();
        }
        
        // Draw impact effects at player location
        this.drawImpactEffects();
        
        ctx.restore();
    }
    
    drawParticleEffects() {
        // Draw snowflakes
        if (this.snowflakes) {
            this.snowflakes.forEach(s => {
                ctx.save();
                ctx.globalAlpha = s.opacity;
                ctx.translate(s.x, s.y);
                ctx.rotate(s.rotation);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#87ceeb';
                ctx.shadowBlur = 10;
                // Draw snowflake shape
                for (let i = 0; i < 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(s.size, 0);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#ffffff';
                    ctx.stroke();
                    ctx.rotate(Math.PI / 3);
                }
                ctx.restore();
            });
        }
        
        // Draw sparks
        if (this.sparks) {
            this.sparks.forEach(s => {
                ctx.save();
                ctx.globalAlpha = s.life / 30;
                ctx.fillStyle = '#ffff00';
                ctx.shadowColor = '#ffff00';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }
        
        // Draw fire particles
        if (this.fireParticles) {
            this.fireParticles.forEach(p => {
                ctx.save();
                ctx.globalAlpha = p.opacity;
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, '#ffff00');
                gradient.addColorStop(0.6, '#ff6600');
                gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }
        
        // Draw toxic bubbles
        if (this.toxicBubbles) {
            this.toxicBubbles.forEach(b => {
                ctx.save();
                ctx.globalAlpha = b.opacity;
                const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
                gradient.addColorStop(0, 'rgba(150, 255, 150, 0.8)');
                gradient.addColorStop(0.5, 'rgba(50, 200, 50, 0.5)');
                gradient.addColorStop(1, 'rgba(0, 100, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }
        
        // Draw blood drops (optimized)
        if (this.bloodDrops) {
            for (let i = 0, len = this.bloodDrops.length; i < len; i++) {
                const d = this.bloodDrops[i];
                ctx.save();
                ctx.globalAlpha = d.opacity;
                ctx.fillStyle = '#8b0000';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        
        // Draw impact particles (optimized)
        for (let i = 0, len = this.particles.length; i < len; i++) {
            const p = this.particles[i];
            ctx.save();
            ctx.globalAlpha = p.life / 60;
            ctx.fillStyle = p.color || this.color;
            ctx.shadowColor = p.color || this.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    drawIceBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Multiple icy layers
        const layers = [
            { width: this.beamWidth * 2, color: 'rgba(135, 206, 235, 0.2)' },
            { width: this.beamWidth * 1.5, color: 'rgba(173, 216, 230, 0.4)' },
            { width: this.beamWidth, color: 'rgba(200, 240, 255, 0.6)' },
            { width: this.beamWidth * 0.5, color: 'rgba(255, 255, 255, 0.9)' }
        ];
        
        ctx.shadowColor = '#00bfff';
        ctx.shadowBlur = 40;
        
        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, -layer.width / 2);
            ctx.lineTo(beamLen, -layer.width / 2);
            ctx.lineTo(beamLen, layer.width / 2);
            ctx.lineTo(0, layer.width / 2);
            ctx.closePath();
            ctx.fill();
        });
        
        // Ice crystal spikes along beam edges
        if (this.beamPhase === 'holding') {
            ctx.fillStyle = 'rgba(200, 255, 255, 0.8)';
            for (let i = 0; i < 15; i++) {
                const bx = (i / 15) * beamLen;
                const spikeSize = 15 + Math.sin(this.phase + i) * 8;
                // Top spikes
                ctx.beginPath();
                ctx.moveTo(bx - 5, -this.beamWidth / 2);
                ctx.lineTo(bx, -this.beamWidth / 2 - spikeSize);
                ctx.lineTo(bx + 5, -this.beamWidth / 2);
                ctx.fill();
                // Bottom spikes
                ctx.beginPath();
                ctx.moveTo(bx - 5, this.beamWidth / 2);
                ctx.lineTo(bx, this.beamWidth / 2 + spikeSize);
                ctx.lineTo(bx + 5, this.beamWidth / 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
        
        // Origin frost burst
        const frostGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 2.5);
        frostGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        frostGrad.addColorStop(0.3, 'rgba(135, 206, 235, 0.6)');
        frostGrad.addColorStop(1, 'rgba(0, 191, 255, 0)');
        ctx.fillStyle = frostGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawLightningBeam() {
        // Draw all lightning bolts
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 30;
        
        this.lightningBolts.forEach(bolt => {
            ctx.save();
            ctx.globalAlpha = bolt.opacity;
            ctx.strokeStyle = bolt.color;
            ctx.lineWidth = bolt.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Main bolt path
            ctx.beginPath();
            ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
            for (let i = 1; i < bolt.points.length; i++) {
                ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
            }
            ctx.stroke();
            
            // Glow layer
            ctx.strokeStyle = 'rgba(255, 255, 200, 0.5)';
            ctx.lineWidth = bolt.width * 2;
            ctx.beginPath();
            ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
            for (let i = 1; i < bolt.points.length; i++) {
                ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
            }
            ctx.stroke();
            
            ctx.restore();
        });
        
        // Electric field at origin
        const elecGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 2);
        elecGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        elecGrad.addColorStop(0.3, 'rgba(255, 255, 0, 0.6)');
        elecGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = elecGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawFireBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Fiery beam layers
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 50;
        
        const layers = [
            { width: this.beamWidth * 2.5, color: 'rgba(255, 100, 0, 0.15)' },
            { width: this.beamWidth * 1.8, color: 'rgba(255, 150, 0, 0.3)' },
            { width: this.beamWidth * 1.2, color: 'rgba(255, 200, 0, 0.5)' },
            { width: this.beamWidth * 0.6, color: 'rgba(255, 255, 200, 0.8)' }
        ];
        
        layers.forEach(layer => {
            // Wavy fire edges
            ctx.beginPath();
            ctx.moveTo(0, -layer.width / 2);
            for (let i = 0; i <= beamLen; i += 20) {
                const wave = Math.sin(this.phase * 2 + i * 0.1) * 10;
                ctx.lineTo(i, -layer.width / 2 + wave);
            }
            ctx.lineTo(beamLen, layer.width / 2);
            for (let i = beamLen; i >= 0; i -= 20) {
                const wave = Math.sin(this.phase * 2 + i * 0.1) * 10;
                ctx.lineTo(i, layer.width / 2 + wave);
            }
            ctx.closePath();
            ctx.fillStyle = layer.color;
            ctx.fill();
        });
        
        ctx.restore();
        
        // Fireball at origin
        const fireGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 3);
        fireGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        fireGrad.addColorStop(0.2, 'rgba(255, 255, 0, 0.8)');
        fireGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.5)');
        fireGrad.addColorStop(1, 'rgba(100, 0, 0, 0)');
        ctx.fillStyle = fireGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawVoidBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Dark energy layers
        ctx.shadowColor = '#4b0082';
        ctx.shadowBlur = 40;
        
        const layers = [
            { width: this.beamWidth * 2, color: 'rgba(75, 0, 130, 0.2)' },
            { width: this.beamWidth * 1.5, color: 'rgba(50, 0, 80, 0.4)' },
            { width: this.beamWidth, color: 'rgba(25, 0, 40, 0.7)' },
            { width: this.beamWidth * 0.3, color: 'rgba(0, 0, 0, 0.9)' }
        ];
        
        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, -layer.width / 2);
            ctx.lineTo(beamLen, -layer.width / 2);
            ctx.lineTo(beamLen, layer.width / 2);
            ctx.lineTo(0, layer.width / 2);
            ctx.closePath();
            ctx.fill();
        });
        
        // Dark energy wisps
        if (this.beamPhase === 'holding') {
            ctx.strokeStyle = 'rgba(150, 0, 200, 0.6)';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                let bx = Math.random() * beamLen;
                let by = (Math.random() - 0.5) * this.beamWidth;
                ctx.moveTo(bx, by);
                for (let j = 0; j < 5; j++) {
                    bx += 15 + Math.random() * 25;
                    by = (Math.random() - 0.5) * this.beamWidth;
                    ctx.lineTo(bx, by);
                }
                ctx.stroke();
            }
        }
        
        ctx.restore();
        
        // Void sphere at origin
        const voidGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 2.5);
        voidGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        voidGrad.addColorStop(0.4, 'rgba(50, 0, 80, 0.8)');
        voidGrad.addColorStop(1, 'rgba(75, 0, 130, 0)');
        ctx.fillStyle = voidGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawDarkBeam() {
        const beamLen = this.beamLength;
        
        // Draw the beam with proper transform isolation
        ctx.save();
        
        try {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            
            // Gravitational distortion beam
            ctx.shadowColor = '#330066';
            ctx.shadowBlur = 50;
            
            // Draw distortion rings along beam (using arcs instead of ellipse for compatibility)
            for (let i = 0; i < 8; i++) {
                const t = i / 8;
                const rx = beamLen * t;
                const ringSize = this.beamWidth * (0.5 + Math.sin(this.phase + i) * 0.2);
                
                ctx.strokeStyle = `rgba(100, 0, 150, ${0.6 - t * 0.4})`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                // Draw oval using scale instead of ellipse
                ctx.save();
                ctx.translate(rx, 0);
                ctx.scale(1, 0.4);
                ctx.arc(0, 0, ringSize, 0, Math.PI * 2);
                ctx.restore();
                ctx.stroke();
            }
            
            // Core beam - dark energy
            const layers = [
                { width: this.beamWidth * 1.5, color: 'rgba(80, 0, 130, 0.3)' },
                { width: this.beamWidth, color: 'rgba(50, 0, 80, 0.5)' },
                { width: this.beamWidth * 0.5, color: 'rgba(20, 0, 40, 0.8)' }
            ];
            
            layers.forEach(layer => {
                ctx.fillStyle = layer.color;
                ctx.fillRect(0, -layer.width / 2, beamLen, layer.width);
            });
            
        } finally {
            ctx.restore();
        }
        
        // Singularity at origin (outside transform)
        ctx.save();
        ctx.shadowColor = '#6600aa';
        ctx.shadowBlur = 40;
        
        const singuGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 3);
        singuGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        singuGrad.addColorStop(0.3, 'rgba(50, 0, 80, 0.9)');
        singuGrad.addColorStop(0.6, 'rgba(100, 0, 160, 0.5)');
        singuGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = singuGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawCrystalBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Crystal beam layers
        ctx.shadowColor = '#e040fb';
        ctx.shadowBlur = 40;
        
        const layers = [
            { width: this.beamWidth * 2, color: 'rgba(224, 64, 251, 0.2)' },
            { width: this.beamWidth * 1.4, color: 'rgba(200, 100, 255, 0.4)' },
            { width: this.beamWidth * 0.8, color: 'rgba(230, 150, 255, 0.7)' },
            { width: this.beamWidth * 0.3, color: 'rgba(255, 255, 255, 0.95)' }
        ];
        
        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, -layer.width / 2);
            ctx.lineTo(beamLen, -layer.width / 2);
            ctx.lineTo(beamLen, layer.width / 2);
            ctx.lineTo(0, layer.width / 2);
            ctx.closePath();
            ctx.fill();
        });
        
        // Crystal fragments along beam
        if (this.beamPhase === 'holding') {
            ctx.fillStyle = 'rgba(255, 200, 255, 0.7)';
            for (let i = 0; i < 12; i++) {
                const fx = (i / 12) * beamLen;
                const fsize = 8 + Math.sin(this.phase + i * 0.5) * 4;
                ctx.save();
                ctx.translate(fx, (Math.sin(this.phase + i) * this.beamWidth * 0.3));
                ctx.rotate(this.phase + i);
                ctx.fillRect(-fsize / 2, -fsize / 2, fsize, fsize);
                ctx.restore();
            }
        }
        
        ctx.restore();
        
        // Crystal core at origin
        const crystalGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 2.5);
        crystalGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        crystalGrad.addColorStop(0.3, 'rgba(224, 64, 251, 0.8)');
        crystalGrad.addColorStop(1, 'rgba(150, 0, 200, 0)');
        ctx.fillStyle = crystalGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawToxicBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Toxic gas layers
        ctx.shadowColor = '#32cd32';
        ctx.shadowBlur = 40;
        
        // Draw bubbly/cloudy beam
        const layers = [
            { width: this.beamWidth * 2.5, color: 'rgba(50, 205, 50, 0.15)' },
            { width: this.beamWidth * 1.8, color: 'rgba(100, 255, 100, 0.25)' },
            { width: this.beamWidth * 1.2, color: 'rgba(150, 255, 150, 0.4)' },
            { width: this.beamWidth * 0.5, color: 'rgba(200, 255, 200, 0.6)' }
        ];
        
        layers.forEach(layer => {
            ctx.beginPath();
            // Bubbly edges
            ctx.moveTo(0, -layer.width / 2);
            for (let i = 0; i <= beamLen; i += 30) {
                const bubble = Math.sin(this.phase + i * 0.08) * 15;
                ctx.lineTo(i, -layer.width / 2 + bubble);
            }
            ctx.lineTo(beamLen, layer.width / 2);
            for (let i = beamLen; i >= 0; i -= 30) {
                const bubble = Math.sin(this.phase + i * 0.08) * 15;
                ctx.lineTo(i, layer.width / 2 + bubble);
            }
            ctx.closePath();
            ctx.fillStyle = layer.color;
            ctx.fill();
        });
        
        ctx.restore();
        
        // Toxic cloud at origin
        const toxicGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 3);
        toxicGrad.addColorStop(0, 'rgba(200, 255, 200, 0.9)');
        toxicGrad.addColorStop(0.4, 'rgba(50, 205, 50, 0.6)');
        toxicGrad.addColorStop(1, 'rgba(0, 100, 0, 0)');
        ctx.fillStyle = toxicGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawBloodBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Blood beam layers
        ctx.shadowColor = '#8b0000';
        ctx.shadowBlur = 40;
        
        const layers = [
            { width: this.beamWidth * 2, color: 'rgba(139, 0, 0, 0.2)' },
            { width: this.beamWidth * 1.5, color: 'rgba(180, 0, 0, 0.4)' },
            { width: this.beamWidth, color: 'rgba(220, 20, 60, 0.6)' },
            { width: this.beamWidth * 0.4, color: 'rgba(255, 50, 50, 0.8)' }
        ];
        
        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, -layer.width / 2);
            ctx.lineTo(beamLen, -layer.width / 2);
            ctx.lineTo(beamLen, layer.width / 2);
            ctx.lineTo(0, layer.width / 2);
            ctx.closePath();
            ctx.fill();
        });
        
        // Dripping effect along bottom
        if (this.beamPhase === 'holding') {
            ctx.fillStyle = 'rgba(139, 0, 0, 0.7)';
            for (let i = 0; i < 10; i++) {
                const dx = (i / 10) * beamLen;
                const dripLen = 10 + Math.sin(this.phase + i) * 15 + Math.random() * 10;
                ctx.beginPath();
                ctx.moveTo(dx - 3, this.beamWidth / 2);
                ctx.lineTo(dx, this.beamWidth / 2 + dripLen);
                ctx.lineTo(dx + 3, this.beamWidth / 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
        
        // Blood orb at origin
        const bloodGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.beamWidth * 2.5);
        bloodGrad.addColorStop(0, 'rgba(255, 100, 100, 0.9)');
        bloodGrad.addColorStop(0.4, 'rgba(220, 20, 60, 0.7)');
        bloodGrad.addColorStop(1, 'rgba(139, 0, 0, 0)');
        ctx.fillStyle = bloodGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.beamWidth * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawDefaultBeam() {
        const beamLen = this.beamLength;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 30;
        
        ctx.fillStyle = this.color + '66';
        ctx.fillRect(0, -this.beamWidth / 2, beamLen, this.beamWidth);
        
        ctx.fillStyle = this.color + 'cc';
        ctx.fillRect(0, -this.beamWidth * 0.3, beamLen, this.beamWidth * 0.6);
        
        ctx.restore();
    }
    
    drawImpactEffects() {
        // Draw a big impact explosion at the target
        if (this.beamPhase === 'holding' || this.beamPhase === 'expanding') {
            const pulse = Math.sin(this.phase * 4) * 0.3 + 1;
            const impactSize = this.beamWidth * 2.5 * pulse;
            
            let colors;
            switch (this.attackType) {
                case 'iceSpike':
                    colors = {
                        core: 'rgba(255, 255, 255, 0.95)',
                        mid: 'rgba(200, 255, 255, 0.7)',
                        outer: 'rgba(135, 206, 235, 0.4)',
                        glow: '#00bfff'
                    };
                    break;
                case 'lightning':
                    colors = {
                        core: 'rgba(255, 255, 255, 1)',
                        mid: 'rgba(255, 255, 150, 0.8)',
                        outer: 'rgba(255, 215, 0, 0.5)',
                        glow: '#ffff00'
                    };
                    break;
                case 'meteor':
                    colors = {
                        core: 'rgba(255, 255, 200, 0.95)',
                        mid: 'rgba(255, 200, 100, 0.7)',
                        outer: 'rgba(255, 100, 0, 0.4)',
                        glow: '#ff6600'
                    };
                    break;
                case 'voidBeam':
                    colors = {
                        core: 'rgba(100, 0, 150, 0.9)',
                        mid: 'rgba(75, 0, 130, 0.6)',
                        outer: 'rgba(50, 0, 80, 0.3)',
                        glow: '#4b0082'
                    };
                    break;
                case 'blackHole':
                    colors = {
                        core: 'rgba(0, 0, 0, 0.95)',
                        mid: 'rgba(50, 0, 80, 0.7)',
                        outer: 'rgba(80, 0, 130, 0.4)',
                        glow: '#330066'
                    };
                    break;
                case 'laserBeam':
                    colors = {
                        core: 'rgba(255, 255, 255, 0.95)',
                        mid: 'rgba(224, 100, 251, 0.7)',
                        outer: 'rgba(200, 50, 255, 0.4)',
                        glow: '#e040fb'
                    };
                    break;
                case 'toxicCloud':
                    colors = {
                        core: 'rgba(200, 255, 200, 0.9)',
                        mid: 'rgba(100, 255, 100, 0.6)',
                        outer: 'rgba(50, 200, 50, 0.3)',
                        glow: '#32cd32'
                    };
                    break;
                case 'bloodOrb':
                    colors = {
                        core: 'rgba(255, 100, 100, 0.95)',
                        mid: 'rgba(220, 20, 60, 0.7)',
                        outer: 'rgba(139, 0, 0, 0.4)',
                        glow: '#dc143c'
                    };
                    break;
                default:
                    colors = {
                        core: 'rgba(255, 255, 255, 0.9)',
                        mid: this.color + 'aa',
                        outer: this.color + '44',
                        glow: this.color
                    };
            }
            
            ctx.save();
            
            // Outer glow
            ctx.shadowColor = colors.glow;
            ctx.shadowBlur = 60;
            
            // Draw multiple impact layers for a big explosion effect
            const impactGrad = ctx.createRadialGradient(
                this.targetX, this.targetY, 0,
                this.targetX, this.targetY, impactSize
            );
            impactGrad.addColorStop(0, colors.core);
            impactGrad.addColorStop(0.3, colors.mid);
            impactGrad.addColorStop(0.7, colors.outer);
            impactGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            // Outer explosive ring
            const ringSize = impactSize * 1.5;
            ctx.strokeStyle = colors.glow;
            ctx.lineWidth = 8 + Math.sin(this.phase * 6) * 4;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, ringSize, 0, Math.PI * 2);
            ctx.stroke();
            
            // Main impact gradient
            ctx.fillStyle = impactGrad;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, impactSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Secondary pulsing ring
            const ring2Size = impactSize * (1.2 + Math.sin(this.phase * 8) * 0.2);
            ctx.strokeStyle = colors.mid;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, ring2Size, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner bright core - larger and brighter
            const coreSize = this.beamWidth * 1.2 * pulse;
            ctx.shadowBlur = 80;
            ctx.fillStyle = colors.core;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, coreSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Very bright center flash
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, coreSize * 0.4, 0, Math.PI * 2);
            ctx.fill();
            
            // Radiating lines/spikes from impact point - more dramatic
            ctx.strokeStyle = colors.core;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 30;
            const spikeCount = 16;
            for (let i = 0; i < spikeCount; i++) {
                const spikeAngle = (i / spikeCount) * Math.PI * 2 + this.phase;
                const spikeLen = impactSize * (1.0 + Math.sin(this.phase * 3 + i * 2) * 0.4);
                ctx.beginPath();
                ctx.moveTo(
                    this.targetX + Math.cos(spikeAngle) * coreSize * 0.5,
                    this.targetY + Math.sin(spikeAngle) * coreSize * 0.5
                );
                ctx.lineTo(
                    this.targetX + Math.cos(spikeAngle) * spikeLen,
                    this.targetY + Math.sin(spikeAngle) * spikeLen
                );
                ctx.stroke();
            }
            
            // Energy particles swirling at impact
            ctx.fillStyle = colors.glow;
            for (let i = 0; i < 8; i++) {
                const particleAngle = (i / 8) * Math.PI * 2 + this.phase * 2;
                const particleDist = impactSize * 0.7;
                const px = this.targetX + Math.cos(particleAngle) * particleDist;
                const py = this.targetY + Math.sin(particleAngle) * particleDist;
                ctx.beginPath();
                ctx.arc(px, py, 6 + Math.sin(this.phase * 4 + i) * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        }
    }
}

// ============================================
// LIGHTNING PROJECTILE CLASS - Harry Potter style
// ============================================

class LightningProjectile {
    constructor(targetEnemy, noteOrLetter, powerupType = null) {
        this.startX = player.x;
        this.startY = player.y;
        this.targetEnemy = targetEnemy;
        this.note = noteOrLetter; // Can be a note (music mode) or letter (typing mode)
        
        // Get color based on game mode
        if (gameState.gameMode === 'typing') {
            this.color = LETTER_COLORS[noteOrLetter] || '#ffffff';
        } else {
            this.color = getNoteColor(noteOrLetter);
        }
        
        this.alive = true;
        this.powerupType = powerupType; // 'spreadshot', 'bomb', or null
        
        // Phases: 'strike' (instant), 'flash' (hold), 'fading'
        this.phase = 'strike';
        this.flashDuration = 50;  // ~0.8 seconds hold - longer bright flash
        this.flashTimer = 0;
        this.fadeDuration = 120;  // 2 seconds fade - slow lingering fade
        this.fadeTimer = 0;
        this.opacity = 1;
        
        // Store target position
        this.finalX = targetEnemy.x;
        this.finalY = targetEnemy.y;
        
        // Powerup visual modifications
        if (powerupType === 'spreadshot') {
            this.color = '#00ffff'; // Cyan for spreadshot
        } else if (powerupType === 'bomb') {
            this.color = '#ff6600'; // Orange for bomb
        }
        
        // Generate ONE static lightning bolt
        this.generateLightning();
    }

    generateLightning() {
        this.segments = [];
        const steps = 8;  // Fewer segments = less jagged
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let x = this.startX + (this.finalX - this.startX) * t;
            let y = this.startY + (this.finalY - this.startY) * t;
            
            // Subtle offset - only in the middle, very mild
            if (i > 0 && i < steps) {
                const perpX = -(this.finalY - this.startY);
                const perpY = this.finalX - this.startX;
                const len = Math.sqrt(perpX * perpX + perpY * perpY);
                // Small offset, more in middle, less at ends
                const midFactor = 1 - Math.abs(t - 0.5) * 2;
                const offset = (Math.random() - 0.5) * 35 * midFactor;
                x += (perpX / len) * offset;
                y += (perpY / len) * offset;
            }
            
            this.segments.push({ x, y });
        }
    }

    update() {
        if (this.phase === 'strike') {
            // Instant strike - immediately hit and transition to flash
            this.phase = 'flash';
            
            // Deal damage on hit
            if (this.targetEnemy instanceof Boss) {
                // Call appropriate hit method based on mode
                if (this.targetEnemy.mode === 'typing') {
                    this.targetEnemy.hitLetter(this.note); // note is actually a letter in typing mode
                } else {
                    this.targetEnemy.hitNote(this.note);
                }
                playBossHitSound();
            } else {
                // For regular enemies, handle multi-letter typing
                if (this.targetEnemy.mode === 'typing' && this.targetEnemy.letters && this.targetEnemy.letters.length > 1) {
                    // Multi-letter enemy - call typeLetter to progress
                    const defeated = this.targetEnemy.typeLetter();
                    if (defeated) {
                        this.targetEnemy.startDying();
                        gameState.enemiesDefeated++;
                        incrementCombo();
                        addScoreWithCombo(100 * this.targetEnemy.letters.length); // Bonus for multi-letter
                        playImpactSound();
                    } else {
                        // Not all letters typed yet - just play feedback
                        playImpactSound();
                        incrementCombo();
                        addScoreWithCombo(25); // Small score for partial progress
                    }
                } else {
                    // Single letter/note enemy - immediate defeat
                    this.targetEnemy.startDying();
                    gameState.enemiesDefeated++;
                    incrementCombo();
                    addScoreWithCombo(100);
                    playImpactSound();
                }
            }
            
            // Handle bomb explosion - damage nearby enemies
            if (this.powerupType === 'bomb') {
                this.triggerBombExplosion();
            } else {
                createExplosion(this.finalX, this.finalY, this.color);
            }
        } 
        else if (this.phase === 'flash') {
            // Hold the bright flash - NO regeneration, static bolt
            this.flashTimer++;
            
            if (this.flashTimer >= this.flashDuration) {
                this.phase = 'fading';
            }
        }
        else if (this.phase === 'fading') {
            // Fade out gradually - still static, just fading
            this.fadeTimer++;
            this.opacity = 1 - (this.fadeTimer / this.fadeDuration);
            
            if (this.fadeTimer >= this.fadeDuration) {
                this.alive = false;
            }
        }
    }
    
    triggerBombExplosion() {
        // Create massive explosion visual
        createBombExplosion(this.finalX, this.finalY);
        playBombSound();
        
        // Find and damage all nearby enemies within blast radius (3x bigger)
        const blastRadius = 600;
        for (const enemy of gameState.enemies) {
            if (enemy === this.targetEnemy) continue; // Already hit
            if (!enemy.alive || enemy.dying) continue;
            
            const dist = Math.sqrt(
                (enemy.x - this.finalX) ** 2 + 
                (enemy.y - this.finalY) ** 2
            );
            
            if (dist <= blastRadius) {
                enemy.startDying();
                gameState.enemiesDefeated++;
                incrementCombo();
                addScoreWithCombo(100);
                
                // Create small explosion at each hit enemy
                createExplosion(enemy.x, enemy.y, enemy.color);
            }
        }
    }

    draw() {
        if (this.segments.length < 2) return;
        
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
        // Brighter during flash phase
        const intensity = this.phase === 'flash' ? 1.3 : 1;
        
        // Draw glow layers (outer to inner) - 1/3 thinner
        const layers = [
            { color: this.color + '22', width: 33 },
            { color: this.color + '44', width: 23 },
            { color: this.color + '88', width: 15 },
            { color: this.color, width: 8 },
            { color: '#ffffff', width: 3 }
        ];
        
        for (const layer of layers) {
            ctx.beginPath();
            ctx.moveTo(this.segments[0].x, this.segments[0].y);
            
            for (let i = 1; i < this.segments.length; i++) {
                ctx.lineTo(this.segments[i].x, this.segments[i].y);
            }
            
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = layer.width * intensity;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        
        // HD-2D style impact bloom at target
        const impactSize = this.phase === 'flash' ? 80 : 50;
        const bloomGradient = ctx.createRadialGradient(
            this.finalX, this.finalY, 0,
            this.finalX, this.finalY, impactSize * intensity
        );
        bloomGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        bloomGradient.addColorStop(0.2, `rgba(255, 255, 220, 0.6)`);
        bloomGradient.addColorStop(0.5, this.color + '44');
        bloomGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = bloomGradient;
        ctx.beginPath();
        ctx.arc(this.finalX, this.finalY, impactSize * intensity, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.finalX, this.finalY, 15 * intensity, 0, Math.PI * 2);
        ctx.fill();
        
        // HD-2D source bloom at player
        const sourceSize = 60 * intensity;
        const sourceGradient = ctx.createRadialGradient(
            this.startX, this.startY, 0,
            this.startX, this.startY, sourceSize
        );
        sourceGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        sourceGradient.addColorStop(0.3, this.color + '66');
        sourceGradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = sourceGradient;
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, sourceSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.restore();
    }
}

// ============================================
// PARTICLE EFFECTS - HD-2D Octopath Style
// ============================================

let particles = [];
let bombExplosions = []; // Persistent bomb explosion effects

// Lasting bomb explosion visual effect
class BombExplosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 600; // Match blast radius
        this.maxLife = 180; // 3 seconds at 60fps
        this.life = this.maxLife;
        this.rings = [];
        this.phase = 0;
        
        // Create expanding rings
        for (let i = 0; i < 5; i++) {
            this.rings.push({
                radius: 0,
                maxRadius: this.radius * (0.4 + i * 0.15),
                speed: 15 + i * 3,
                opacity: 1,
                color: i < 2 ? '#ffffff' : (i < 4 ? '#ffaa00' : '#ff6600')
            });
        }
        
        // Fire particles that linger
        this.fireParticles = [];
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * this.radius * 0.8;
            this.fireParticles.push({
                x: this.x + Math.cos(angle) * dist,
                y: this.y + Math.sin(angle) * dist,
                size: 8 + Math.random() * 15,
                flickerPhase: Math.random() * Math.PI * 2,
                color: Math.random() > 0.3 ? '#ff6600' : '#ffaa00'
            });
        }
    }
    
    update() {
        this.life--;
        this.phase += 0.1;
        
        // Update rings
        for (const ring of this.rings) {
            if (ring.radius < ring.maxRadius) {
                ring.radius += ring.speed;
                if (ring.radius > ring.maxRadius) ring.radius = ring.maxRadius;
            }
            // Fade based on life remaining
            ring.opacity = Math.min(1, this.life / 60);
        }
        
        // Update fire particles
        for (const p of this.fireParticles) {
            p.flickerPhase += 0.2;
            p.size *= 0.995; // Slowly shrink
        }
        
        return this.life > 0;
    }
    
    draw() {
        const progress = 1 - (this.life / this.maxLife);
        const fadeOut = this.life < 60 ? this.life / 60 : 1;
        
        ctx.save();
        
        // Draw expanding rings
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            if (ring.radius > 0) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, ring.radius, 0, Math.PI * 2);
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = 8 - i * 1.5;
                ctx.globalAlpha = ring.opacity * fadeOut * (0.3 + (1 - ring.radius / ring.maxRadius) * 0.7);
                ctx.shadowColor = ring.color;
                ctx.shadowBlur = 20;
                ctx.stroke();
            }
        }
        
        // Draw central glow (fades over time)
        const glowSize = this.radius * 0.5 * (1 - progress * 0.5);
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowSize);
        gradient.addColorStop(0, `rgba(255, 255, 200, ${0.4 * fadeOut})`);
        gradient.addColorStop(0.3, `rgba(255, 150, 50, ${0.3 * fadeOut})`);
        gradient.addColorStop(0.6, `rgba(255, 100, 0, ${0.15 * fadeOut})`);
        gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw lingering fire particles
        for (const p of this.fireParticles) {
            if (p.size > 1) {
                const flicker = 0.5 + Math.sin(p.flickerPhase) * 0.5;
                ctx.globalAlpha = flicker * fadeOut * 0.7;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Draw scorched ground effect (dark circle that fades)
        ctx.globalAlpha = fadeOut * 0.3;
        ctx.fillStyle = 'rgba(30, 20, 10, 0.5)';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// Standard pixel particle
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12;
        this.life = 1;
        this.decay = 0.025 + Math.random() * 0.02;
        this.size = 5 + Math.random() * 6;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.vx *= 0.96;
        this.vy *= 0.96;
    }

    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// HD-2D Light mote - glowing sparkle particle
class LightMote {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.baseColor = color;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6 - 2; // Drift upward
        this.life = 1;
        this.decay = 0.008 + Math.random() * 0.008; // Slower decay
        this.size = 3 + Math.random() * 4;
        this.flickerPhase = Math.random() * Math.PI * 2;
        this.flickerSpeed = 0.2 + Math.random() * 0.2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy -= 0.02; // Float upward
        this.life -= this.decay;
        this.vx *= 0.98;
        this.vy *= 0.99;
        this.flickerPhase += this.flickerSpeed;
    }

    draw() {
        const flicker = 0.5 + Math.sin(this.flickerPhase) * 0.5;
        const alpha = this.life * flicker;
        
        // Simplified drawing - no gradient for performance
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = this.baseColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright pixel core
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        
        ctx.globalAlpha = 1;
    }
}

// Light ray particle - streaks outward
class LightRay {
    constructor(x, y, angle, color) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.color = color;
        this.length = 20 + Math.random() * 40;
        this.maxLength = this.length;
        this.speed = 16 + Math.random() * 16; // 2x for fixed timestep
        this.life = 1;
        this.decay = 0.06 + Math.random() * 0.04; // 2x for fixed timestep
        this.width = 2 + Math.random() * 3;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life -= this.decay;
        this.speed *= 0.95;
        this.length = this.maxLength * this.life;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        
        const endX = this.x - Math.cos(this.angle) * this.length;
        const endY = this.y - Math.sin(this.angle) * this.length;
        
        // Glow
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        
        // Ray line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = this.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Colored overlay
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * 0.6;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        ctx.restore();
    }
}

function createExplosion(x, y, color) {
    // Reduced particle counts for performance
    // Standard pixel particles
    for (let i = 0; i < 8; i++) {
        particles.push(new Particle(x, y, color));
    }
    
    // White core particles
    for (let i = 0; i < 3; i++) {
        particles.push(new Particle(x, y, '#ffffff'));
    }
    
    // HD-2D light motes (reduced)
    for (let i = 0; i < 5; i++) {
        particles.push(new LightMote(x, y, color));
    }
    
    // Light rays shooting outward (reduced)
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.3;
        particles.push(new LightRay(x, y, angle, color));
    }
}

// Create just light motes (for ambient effects)
function createLightBurst(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        particles.push(new LightMote(x, y, color));
    }
}

// Massive bomb explosion effect
function createBombExplosion(x, y) {
    const color = '#ff6600';
    
    // Create the lasting explosion effect (3 seconds)
    bombExplosions.push(new BombExplosion(x, y));
    
    // Large ring of particles (bigger spread for 3x radius)
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const speed = 12 + Math.random() * 12;
        const particle = new Particle(x, y, color);
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.size = 5 + Math.random() * 6;
        particles.push(particle);
    }
    
    // Inner white/yellow burst
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 8 + Math.random() * 15;
        const particle = new Particle(x, y, '#ffff00');
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particles.push(particle);
    }
    
    // White core
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, '#ffffff'));
    }
    
    // Lots of light motes (more for bigger explosion)
    for (let i = 0; i < 40; i++) {
        particles.push(new LightMote(x, y, color));
    }
    
    // Light rays in all directions (more rays)
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        particles.push(new LightRay(x, y, angle, color));
    }
}

function playBombSound() {
    if (!audioContext) return;
    try {
        // Deep explosion
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.5, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.5);
        
        // Noise burst
        const bufferSize = audioContext.sampleRate * 0.3;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        
        const noiseGain = audioContext.createGain();
        noiseGain.gain.setValueAtTime(0.4, audioContext.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        noise.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
        noise.start();
    } catch (e) {}
}

// ============================================
// INPUT HANDLING
// ============================================

let midiAccess = null;

document.addEventListener('keydown', (e) => {
    // Initialize audio on first interaction
    initAudio();
    
    // Press Enter or Space to proceed on level complete screen (check first!)
    if (e.code === 'Enter' || e.code === 'Space') {
        const levelCompleteScreen = document.getElementById('level-complete-screen');
        if (levelCompleteScreen && !levelCompleteScreen.classList.contains('hidden')) {
            nextLevel();
            return;
        }
    }
    
    // Space toggles pause during gameplay
    if (e.code === 'Space') {
        gameState.paused = !gameState.paused;
        return;
    }
    
    // Toggle music with M key (only when not in typing mode gameplay)
    if (e.code === 'KeyM' && gameState.gameMode !== 'typing') {
        toggleMusic();
        return;
    }
    
    if (!gameState.running || gameState.paused) return;
    
    // Handle input based on game mode
    if (gameState.gameMode === 'typing') {
        // Typing mode: handle letter keys A-Z
        const keyCode = e.code;
        if (keyCode.startsWith('Key')) {
            const letter = keyCode.charAt(3).toUpperCase(); // Extract letter from 'KeyA' -> 'A'
            if (!gameState.activeNotes.has(letter)) {
                gameState.activeNotes.add(letter);
                playLetter(letter);
            }
        }
    } else {
        // Music mode: handle musical keys
        const note = KEYBOARD_MAP[e.code];
        if (note && !gameState.activeNotes.has(note)) {
            gameState.activeNotes.add(note);
            playNote(note);
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (gameState.gameMode === 'typing') {
        // Typing mode: handle letter keys
        const keyCode = e.code;
        if (keyCode.startsWith('Key')) {
            const letter = keyCode.charAt(3).toUpperCase();
            gameState.activeNotes.delete(letter);
        }
    } else {
        // Music mode: handle musical keys
        const note = KEYBOARD_MAP[e.code];
        if (note) {
            gameState.activeNotes.delete(note);
        }
    }
});

async function initMIDI() {
    try {
        midiAccess = await navigator.requestMIDIAccess();
        
        midiAccess.inputs.forEach((input) => {
            input.onmidimessage = handleMIDIMessage;
            gameState.midiConnected = true;
        });
        
        midiAccess.onstatechange = (e) => {
            if (e.port.type === 'input') {
                if (e.port.state === 'connected') {
                    e.port.onmidimessage = handleMIDIMessage;
                    gameState.midiConnected = true;
                } else {
                    gameState.midiConnected = false;
                }
            }
        };
    } catch (err) {
        console.log('MIDI not available:', err);
    }
}

function handleMIDIMessage(message) {
    initAudio();
    const [status, note, velocity] = message.data;
    const command = status >> 4;
    
    if (command === 9 && velocity > 0) {
        // Check if middle C (MIDI note 60) is pressed on level complete screen
        if (note === 60) {
            const levelCompleteScreen = document.getElementById('level-complete-screen');
            if (levelCompleteScreen && !levelCompleteScreen.classList.contains('hidden')) {
                nextLevel();
                return;
            }
        }
        
        const noteName = midiToNoteName(note);
        if (!gameState.activeNotes.has(noteName)) {
            gameState.activeNotes.add(noteName);
            playNote(noteName);
        }
    } else if (command === 8 || (command === 9 && velocity === 0)) {
        const noteName = midiToNoteName(note);
        gameState.activeNotes.delete(noteName);
    }
}

// ============================================
// GAME LOGIC
// ============================================

let player;

function playNote(note) {
    if (!gameState.running || gameState.paused) return;
    
    // Check if there's an active powerup to try (also shoots enemies with same note)
    if (gameState.powerup && gameState.powerup.alive && gameState.powerup.arrived) {
        gameState.powerup.tryNote(note);
        // Continue to also shoot enemies with this note
    }
    
    // Check if we have ammo to shoot
    if (gameState.currentAmmo <= 0) {
        // Out of ammo - play click sound and don't shoot
        playOutOfAmmoSound();
        return;
    }
    
    let target = null;
    
    // Check if note matches any enemy or boss
    // For boss, only target if the note hasn't been cleared yet
    if (gameState.boss && gameState.boss.alive && 
        gameState.boss.notes.includes(note) && 
        !gameState.boss.notesHit.has(note)) {
        target = gameState.boss;
    }
    
    if (!target) {
        for (const enemy of gameState.enemies) {
            if (enemy.alive && !enemy.dying && enemy.note === note) {
                target = enemy;
                break;
            }
        }
    }
    
    if (target) {
        // Hit! No ammo consumed for successful hits
        // Play the audio note and laser sound (tuned to the note)
        playAudioNote(note, 0.4);
        playLaserSound(note);
        
        // Check for active powerup effects
        if (gameState.activePowerup === 'SPREADSHOT' && gameState.powerupShotsRemaining > 0) {
            // Spreadshot - hit target plus 2 nearby enemies
            gameState.projectiles.push(new LightningProjectile(target, note, 'spreadshot'));
            gameState.powerupShotsRemaining--;
            
            // Find 2 nearby enemies to also hit
            const nearbyEnemies = findNearbyEnemies(target, 2);
            for (const nearby of nearbyEnemies) {
                gameState.projectiles.push(new LightningProjectile(nearby, note, 'spreadshot'));
            }
            
            if (gameState.powerupShotsRemaining <= 0) {
                gameState.activePowerup = null;
            }
        } else if (gameState.activePowerup === 'BOMB' && gameState.powerupShotsRemaining > 0) {
            // Bomb - projectile explodes on hit
            gameState.projectiles.push(new LightningProjectile(target, note, 'bomb'));
            gameState.powerupShotsRemaining--;
            
            if (gameState.powerupShotsRemaining <= 0) {
                gameState.activePowerup = null;
            }
        } else {
            // Normal shot
            gameState.projectiles.push(new LightningProjectile(target, note));
        }
        
        createNoteVisual(note);
    } else {
        // Missed! No valid target for this note - consume ammo and reset combo
        gameState.currentAmmo--;
        gameState.ammoRechargeTimer = 0; // Reset recharge timer on miss
        
        playMissSound();
        if (gameState.combo > 0) {
            triggerComboBreak(gameState.combo);
            gameState.combo = 0;
            gameState.comboTimer = 0;
        }
    }
}

// Play a letter (typing mode)
function playLetter(letter) {
    if (!gameState.running || gameState.paused) return;
    
    // Check if there's an active powerup to try (doesn't use ammo, doesn't shoot enemies)
    if (gameState.powerup && gameState.powerup.alive && gameState.powerup.arrived) {
        const powerupHandled = gameState.powerup.tryNote(letter);
        if (powerupHandled) {
            return;
        }
    }
    
    // Check if we have ammo to shoot
    if (gameState.currentAmmo <= 0) {
        playOutOfAmmoSound();
        return;
    }
    
    let target = null;
    
    // Check if letter matches boss (for typing mode, boss has a word)
    if (gameState.boss && gameState.boss.alive && gameState.boss.mode === 'typing') {
        const nextLetter = gameState.boss.word[gameState.boss.lettersHit.length];
        if (letter === nextLetter) {
            target = gameState.boss;
        }
    }
    
    // If not targeting boss, find enemy with this letter
    if (!target) {
        for (const enemy of gameState.enemies) {
            if (enemy.alive && !enemy.dying && enemy.letter === letter) {
                target = enemy;
                break;
            }
        }
    }
    
    if (target) {
        // Hit! No ammo consumed for successful hits
        playTypingHitSound(letter);
        playLaserSound('C'); // Use default laser sound
        
        // Check for active powerup effects
        if (gameState.activePowerup === 'SPREADSHOT' && gameState.powerupShotsRemaining > 0) {
            gameState.projectiles.push(new LightningProjectile(target, letter, 'spreadshot'));
            gameState.powerupShotsRemaining--;
            
            const nearbyEnemies = findNearbyEnemies(target, 2);
            for (const nearby of nearbyEnemies) {
                gameState.projectiles.push(new LightningProjectile(nearby, letter, 'spreadshot'));
            }
            
            if (gameState.powerupShotsRemaining <= 0) {
                gameState.activePowerup = null;
            }
        } else if (gameState.activePowerup === 'BOMB' && gameState.powerupShotsRemaining > 0) {
            gameState.projectiles.push(new LightningProjectile(target, letter, 'bomb'));
            gameState.powerupShotsRemaining--;
            
            if (gameState.powerupShotsRemaining <= 0) {
                gameState.activePowerup = null;
            }
        } else {
            gameState.projectiles.push(new LightningProjectile(target, letter));
        }

        createLetterVisual(letter);
    } else {
        // Missed! Consume ammo and reset combo
        gameState.currentAmmo--;
        gameState.ammoRechargeTimer = 0;
        
        playMissSound();
        if (gameState.combo > 0) {
            triggerComboBreak(gameState.combo);
            gameState.combo = 0;
            gameState.comboTimer = 0;
        }
    }
}

// Play typing hit sound
function playTypingHitSound(letter) {
    if (!audioContext) return;
    
    // Create a satisfying "click-clack" typewriter sound
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    // Different pitch based on letter position in alphabet
    const letterIndex = letter.charCodeAt(0) - 65;
    const baseFreq = 800 + letterIndex * 30;
    
    const now = audioContext.currentTime;
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.05);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start();
    osc.stop(now + 0.1);
}

// Create visual effect for letter hit
function createLetterVisual(letter) {
    const color = LETTER_COLORS[letter] || '#ffffff';
    
    // Pixel particles
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 5;
        const particle = new Particle(player.x, player.y, color);
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particles.push(particle);
    }
    
    // HD-2D light motes
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 30;
        particles.push(new LightMote(
            player.x + Math.cos(angle) * dist,
            player.y + Math.sin(angle) * dist,
            color
        ));
    }
}

// Find nearby enemies for spreadshot
function findNearbyEnemies(target, count) {
    const nearby = [];
    const candidates = gameState.enemies.filter(e => 
        e.alive && !e.dying && e !== target
    );
    
    // Sort by distance to target
    candidates.sort((a, b) => {
        const distA = Math.sqrt((a.x - target.x) ** 2 + (a.y - target.y) ** 2);
        const distB = Math.sqrt((b.x - target.x) ** 2 + (b.y - target.y) ** 2);
        return distA - distB;
    });
    
    // Return closest ones
    return candidates.slice(0, count);
}

function createNoteVisual(note) {
    const color = getNoteColor(note);
    
    // Pixel particles
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 5;
        const particle = new Particle(player.x, player.y, color);
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particles.push(particle);
    }
    
    // HD-2D light motes
    for (let i = 0; i < 5; i++) {
        particles.push(new LightMote(player.x, player.y, color));
    }
    
    // A few light rays
    for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push(new LightRay(player.x, player.y, angle, color));
    }
}

function damagePlayer(amount) {
    try {
        gameState.health -= amount;
        playHitSound();
        
        // Reset combo when taking damage
        if (gameState.combo > 0) {
            triggerComboBreak(gameState.combo);
            gameState.combo = 0;
            gameState.comboTimer = 0;
        }
        
        if (gameState.health <= 0) {
            gameState.health = 0;
            gameOver();
        }
        
        canvas.style.transform = 'translateX(8px)';
        setTimeout(() => canvas.style.transform = 'translateX(-8px)', 50);
        setTimeout(() => canvas.style.transform = 'translateX(0)', 100);
    } catch (e) {
        console.error('Error in damagePlayer:', e);
    }
}

// Combo system helpers
function getComboMultiplier() {
    // Multiplier increases every 5 combo
    // 0-4: 1x, 5-9: 1.5x, 10-14: 2x, 15-19: 2.5x, 20-24: 3x, 25+: 4x
    if (gameState.combo >= 25) return 4;
    if (gameState.combo >= 20) return 3;
    if (gameState.combo >= 15) return 2.5;
    if (gameState.combo >= 10) return 2;
    if (gameState.combo >= 5) return 1.5;
    return 1;
}

function incrementCombo() {
    const oldMultiplier = getComboMultiplier();
    gameState.combo++;
    gameState.comboTimer = 60; // Reset visual timer
    
    const newMultiplier = getComboMultiplier();
    
    // Check if multiplier increased - trigger MASSIVE visual effect and sound
    if (newMultiplier > oldMultiplier) {
        gameState.multiplierAnimTimer = gameState.multiplierAnimDuration; // Start animation timer
        playMultiplierUpSound();
    }
    
    if (gameState.combo > gameState.maxCombo) {
        gameState.maxCombo = gameState.combo;
    }
}

function triggerComboBreak(lostCombo) {
    gameState.comboBreakTimer = gameState.comboBreakDuration;
    gameState.comboBreakValue = lostCombo;
    
    // Create contained "erasing" effect - horizontal scan lines
    gameState.comboBreakParticles = [];
    const startX = 30;
    const startY = 75;
    const width = 180;
    const height = 50;
    
    // Create horizontal erase lines that sweep down
    const lineCount = 6 + Math.min(lostCombo, 10);
    for (let i = 0; i < lineCount; i++) {
        gameState.comboBreakParticles.push({
            type: 'eraseLine',
            x: startX,
            y: startY + (i / lineCount) * height,
            width: width,
            progress: -i * 0.08, // Stagger the start
            alpha: 1,
            color: lostCombo >= 25 ? '#ff00ff' : 
                   lostCombo >= 15 ? '#ff8800' : 
                   lostCombo >= 10 ? '#ffff00' : 
                   lostCombo >= 5 ? '#00ffff' : '#888888'
        });
    }
    
    // Add small static/glitch particles within the combo area (contained)
    const particleCount = 8 + Math.min(lostCombo, 15);
    for (let i = 0; i < particleCount; i++) {
        gameState.comboBreakParticles.push({
            type: 'glitch',
            x: startX + Math.random() * width,
            y: startY + Math.random() * height,
            vx: (Math.random() - 0.5) * 1.5, // Very slow horizontal drift
            vy: 0.3 + Math.random() * 0.5, // Slight downward
            size: 2 + Math.random() * 4,
            alpha: 0.8,
            life: 40 + Math.random() * 30,
            color: lostCombo >= 25 ? '#ff00ff' : 
                   lostCombo >= 15 ? '#ff8800' : 
                   lostCombo >= 10 ? '#ffff00' : 
                   lostCombo >= 5 ? '#00ffff' : '#666666'
        });
    }
    
    // Play power-down sound
    playComboBreakSound(lostCombo);
}

function playComboBreakSound(combo) {
    if (!audioContext) return;
    
    try {
        // Descending tone - scales with combo (quieter for small combos)
        const intensity = Math.min(combo / 25, 1);
        const baseVolume = 0.1 + intensity * 0.2; // Softer base for small combos
        const duration = 0.2 + intensity * 0.3; // Shorter for small combos
        
        // Main descending tone
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300 + intensity * 200, audioContext.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + duration);
        gain1.gain.setValueAtTime(baseVolume, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start();
        osc1.stop(audioContext.currentTime + duration);
        
        // Sub bass thump (only for combos >= 3)
        if (combo >= 3) {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(100, audioContext.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.3);
            gain2.gain.setValueAtTime(0.2 + intensity * 0.3, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.start();
            osc2.stop(audioContext.currentTime + 0.3);
        }
        
        // Crackle/static noise (only for combos >= 5)
        if (combo >= 5) {
            const bufferSize = audioContext.sampleRate * 0.2;
            const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }
            const noise = audioContext.createBufferSource();
            noise.buffer = noiseBuffer;
            const noiseGain = audioContext.createGain();
            noiseGain.gain.setValueAtTime(0.1 + intensity * 0.1, audioContext.currentTime);
            const noiseFilter = audioContext.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(1500, audioContext.currentTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.2);
        noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(audioContext.destination);
            noise.start();
        }
    } catch (e) {
        console.error('Error playing combo break sound:', e);
    }
}

function addScoreWithCombo(baseScore) {
    const multiplier = getComboMultiplier();
    const finalScore = Math.floor(baseScore * multiplier);
    gameState.score += finalScore;
    return finalScore;
}

function spawnEnemy() {
    if (gameState.bossActive) return;
    
    const diffSettings = DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS['normal'];
    
    if (gameState.gameMode === 'typing') {
        // Typing mode: use letters based on difficulty
        const letterSource = diffSettings.availableLetters || TYPING_LETTERS;
        const availableLetters = letterSource.slice(0, Math.min(7 + gameState.level * 2, letterSource.length));
        
        // Generate letters based on difficulty (1 or 2 letters)
        let letters = '';
        const letterCount = diffSettings.lettersPerEnemy || 1;
        for (let i = 0; i < letterCount; i++) {
            letters += availableLetters[Math.floor(Math.random() * availableLetters.length)];
        }
        
        gameState.enemies.push(new Enemy(letters, 'typing'));
    } else {
        // Music mode: use notes from the current level's scale
        // If MIDI is connected, use octave-specific notes
        const note = getRandomNoteForLevel(gameState.level, gameState.midiConnected);
        gameState.enemies.push(new Enemy(note, 'music'));
    }
}

function startBossFight() {
    gameState.bossActive = true;
    gameState.boss = new Boss(gameState.level);
}

function levelComplete() {
    gameState.running = false;
    document.getElementById('next-level').textContent = gameState.level + 1;
    document.getElementById('level-complete-screen').classList.remove('hidden');
}

function nextLevel() {
    gameState.level++;
    // Health is NOT refilled between levels - must earn health powerups
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.bossProjectiles = [];
    gameState.boss = null;
    gameState.bossActive = false;
    gameState.enemiesDefeated = 0;
    gameState.enemiesToSpawn = 20 + gameState.level * 4; // Doubled (was 10 + level * 2)
    gameState.lastSpawnTime = 0;
    gameState.cameraZoom = 1.0; // Reset zoom
    gameState.targetZoom = 1.0;
    
    document.getElementById('level-complete-screen').classList.add('hidden');
    gameState.running = true;
}

function gameOver() {
    try {
        gameState.running = false;
        stopMusic();
        stopBossChargingSound();
        
        document.getElementById('final-level').textContent = gameState.level;
        document.getElementById('final-score').textContent = gameState.score.toLocaleString();
        document.getElementById('max-combo').textContent = gameState.maxCombo;
        
        // Check if player made the leaderboard for current mode
        const currentMode = gameState.gameMode || 'music';
        const position = getLeaderboardPosition(gameState.score, currentMode);
        const nameEntry = document.getElementById('name-entry');
        const playerNameInput = document.getElementById('player-name');
        
        if (position > 0) {
            // Player made the leaderboard!
            pendingScore = {
                score: gameState.score,
                wave: gameState.level,
                maxCombo: gameState.maxCombo,
                mode: currentMode,
                difficulty: gameState.difficulty || 'normal'
            };
            nameEntry.classList.remove('hidden');
            playerNameInput.value = '';
            playerNameInput.focus();
        } else {
            nameEntry.classList.add('hidden');
            pendingScore = null;
        }
        
        // Display both leaderboards
        displayLeaderboards();
        
        document.getElementById('game-over-screen').classList.remove('hidden');
    } catch (e) {
        console.error('Error in gameOver:', e);
        // Ensure game stops even if there's an error
        gameState.running = false;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

function resetGame() {
    initAudio();
    stopBossChargingSound(); // Stop any charging sound
    startMusic(); // Start the retro music!
    
    gameState = {
        running: true,
        paused: false,
        gameMode: selectedGameMode, // 'music' or 'typing'
        difficulty: selectedDifficulty, // easy, normal, hard, insane, crazy
        level: 1,
        score: 0,
        health: 100,
        maxHealth: 100,
        enemies: [],
        projectiles: [],
        bossProjectiles: [],
        boss: null,
        bossActive: false,
        enemiesDefeated: 0,
        enemiesToSpawn: 20, // Doubled (was 10)
        lastSpawnTime: 0,
        activeNotes: new Set(),
        midiConnected: gameState.midiConnected,
        combo: 0,
        maxCombo: 0,
        comboTimer: 0,
        multiplierFlash: 0,
        multiplierScale: 1,
        multiplierAnimTimer: 0,
        multiplierAnimDuration: 180,
        comboBreakTimer: 0,
        comboBreakDuration: 90,
        comboBreakValue: 0,
        comboBreakParticles: [],
        cameraZoom: 1.0,
        targetZoom: 1.0,
        zoomSpeed: 0.008,
        powerup: null,
        lastPowerupSpawn: 0,
        powerupSpawnInterval: 10000, // Initial spawn after 10s
        activePowerup: null,
        powerupShotsRemaining: 0,
        healthRestoreActive: false,
        healthRestoreStart: 0,
        healthRestoreTarget: 0,
        healthRestoreTimer: 0,
        healthRestoreDuration: 180,
        maxAmmo: 5,
        currentAmmo: 5,
        ammoRechargeTimer: 0,
        ammoRechargeRate: 120,
        ammoFlash: [0, 0, 0, 0, 0]
    };
    
    particles = [];
    bombExplosions = [];
    player = new Player();
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('level-complete-screen').classList.add('hidden');
}

// ============================================
// GAME LOOP - Fixed Timestep for Consistent Speed
// ============================================

// Fixed timestep ensures game runs at same speed regardless of framerate
// On slow computers (30fps), runs 2 updates per frame to keep up
// On fast computers (120fps), skips updates to maintain consistent speed
const FIXED_TIMESTEP = 1000 / 60; // ~16.67ms - target 60 logic updates per second
const MAX_FRAME_TIME = 250; // Cap to prevent spiral of death when tab inactive
let lastTime = 0;
let accumulator = 0;
let gameTimestamp = 0; // Virtual timestamp for game logic (increments by FIXED_TIMESTEP)

// Separate update function for fixed timestep
function updateGame() {
    // Spawn enemies
    if (!gameState.bossActive && gameState.enemiesDefeated < gameState.enemiesToSpawn) {
        if (gameTimestamp - gameState.lastSpawnTime > CONFIG.enemySpawnRate - gameState.level * 50) {
            spawnEnemy();
            gameState.lastSpawnTime = gameTimestamp;
        }
    }
    
    // Check if boss should appear
    if (!gameState.bossActive && gameState.enemiesDefeated >= gameState.enemiesToSpawn && gameState.enemies.length === 0) {
        startBossFight();
    }
    
    // Check if level complete
    if (gameState.bossActive && gameState.boss && !gameState.boss.alive) {
        levelComplete();
    }
    
    // Update health restore animation
    if (gameState.healthRestoreActive) {
        gameState.healthRestoreTimer++;
        const progress = Math.min(1, gameState.healthRestoreTimer / gameState.healthRestoreDuration);
        // Ease-out animation for smooth fill
        const eased = 1 - Math.pow(1 - progress, 3);
        gameState.health = gameState.healthRestoreStart + 
            (gameState.healthRestoreTarget - gameState.healthRestoreStart) * eased;
        
        // Spawn healing particles during animation
        if (Math.random() < 0.3) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 60;
            const particle = new Particle(
                player.x + Math.cos(angle) * dist,
                player.y + Math.sin(angle) * dist,
                '#00ff00'
            );
            particle.vx = -Math.cos(angle) * 2;
            particle.vy = -Math.sin(angle) * 2;
            particles.push(particle);
        }
        
        if (progress >= 1) {
            gameState.healthRestoreActive = false;
            gameState.health = gameState.healthRestoreTarget;
        }
    }
    
    // Update ammo recharge
    if (gameState.currentAmmo < gameState.maxAmmo) {
        gameState.ammoRechargeTimer++;
        if (gameState.ammoRechargeTimer >= gameState.ammoRechargeRate) {
            // Recharge one shot
            gameState.ammoFlash[gameState.currentAmmo] = 1; // Flash the newly recharged ammo
            gameState.currentAmmo++;
            gameState.ammoRechargeTimer = 0;
        }
    }
    
    // Update ammo flash animations
    for (let i = 0; i < gameState.ammoFlash.length; i++) {
        if (gameState.ammoFlash[i] > 0) {
            gameState.ammoFlash[i] -= 0.05;
            if (gameState.ammoFlash[i] < 0) gameState.ammoFlash[i] = 0;
        }
    }
    
    // Update player (for powerup visuals)
    player.update();
    
    // Update enemies (optimized with for loop and in-place filtering)
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        if (!gameState.enemies[i].alive) {
            gameState.enemies.splice(i, 1);
        }
    }
    for (let i = 0, len = gameState.enemies.length; i < len; i++) {
        gameState.enemies[i].update();
    }
    
    // Update boss
    if (gameState.boss && gameState.boss.alive) {
        gameState.boss.update(FIXED_TIMESTEP);
    }
    
    // Update projectiles (optimized)
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        if (!gameState.projectiles[i].alive) {
            gameState.projectiles.splice(i, 1);
        }
    }
    for (let i = 0, len = gameState.projectiles.length; i < len; i++) {
        gameState.projectiles[i].update();
    }
    
    // Update boss projectiles (optimized)
    for (let i = gameState.bossProjectiles.length - 1; i >= 0; i--) {
        if (!gameState.bossProjectiles[i].alive) {
            gameState.bossProjectiles.splice(i, 1);
        }
    }
    for (let i = 0, len = gameState.bossProjectiles.length; i < len; i++) {
        gameState.bossProjectiles[i].update();
    }
    
    // Update combo timer for visual effects
    if (gameState.comboTimer > 0) {
        gameState.comboTimer--;
    }
    
    // Update multiplier flash/scale animation with easing
    if (gameState.multiplierAnimTimer > 0) {
        gameState.multiplierAnimTimer--;
        
        // Calculate progress (0 = start, 1 = end)
        const progress = 1 - (gameState.multiplierAnimTimer / gameState.multiplierAnimDuration);
        
        // Easing function: fast start (ease-out) for expansion, then slow down at peak, then shrink
        // First 40% of time: expand (ease-out - starts fast, slows at peak)
        // Last 60% of time: shrink (ease-in - starts slow, speeds up)
        const expandPhase = 0.4;
        
        if (progress < expandPhase) {
            // Expanding phase - ease-out (starts fast, slows down at peak)
            const expandProgress = progress / expandPhase;
            // Ease-out cubic: 1 - (1-t)^3
            const eased = 1 - Math.pow(1 - expandProgress, 3);
            gameState.multiplierFlash = eased;
            gameState.multiplierScale = 1 + eased * 7; // Up to 8x
        } else {
            // Shrinking phase - ease-in (starts slow, speeds up)
            const shrinkProgress = (progress - expandPhase) / (1 - expandPhase);
            // Ease-in cubic: t^3
            const eased = Math.pow(shrinkProgress, 2);
            gameState.multiplierFlash = 1 - eased;
            gameState.multiplierScale = 1 + (1 - eased) * 7;
        }
    } else {
        gameState.multiplierFlash = 0;
        gameState.multiplierScale = 1;
    }
    
    // Update combo break effect
    if (gameState.comboBreakTimer > 0) {
        gameState.comboBreakTimer--;
        
        // Update combo break particles based on type (optimized)
        for (let i = 0, len = gameState.comboBreakParticles.length; i < len; i++) {
            const p = gameState.comboBreakParticles[i];
            if (p.type === 'eraseLine') {
                // Erase lines sweep across
                p.progress += 0.04;
                if (p.progress > 1.2) {
                    p.alpha = 0; // Mark for removal
                } else if (p.progress > 0.8) {
                    p.alpha -= 0.05; // Fade out at end
                }
            } else if (p.type === 'glitch') {
                // Glitch particles drift slowly and fade
                p.x += p.vx;
                p.y += p.vy;
                p.life--;
                p.alpha = Math.max(0, p.life / 50);
            }
        }
        
        // Remove dead particles
        gameState.comboBreakParticles = gameState.comboBreakParticles.filter(p => p.alpha > 0 && (p.life === undefined || p.life > 0));
    }
    
    // Powerup spawning and update
    if (!gameState.bossActive) {
        // Check if should spawn powerup (random 10-20 second interval)
        if (!gameState.powerup && gameTimestamp - gameState.lastPowerupSpawn > gameState.powerupSpawnInterval) {
            spawnPowerup();
            gameState.lastPowerupSpawn = gameTimestamp;
            // Set next spawn interval randomly between 10-20 seconds
            gameState.powerupSpawnInterval = 10000 + Math.random() * 10000;
        }
        
        // Update powerup
        if (gameState.powerup) {
            gameState.powerup.update();
            if (!gameState.powerup.alive) {
                gameState.powerup = null;
            }
        }
    } else {
        // Remove powerup during boss fight
        gameState.powerup = null;
    }
    
    // Update particles (optimized with cap)
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
    // Cap particles to prevent performance issues (keeps newest particles)
    const MAX_PARTICLES = 150;
    if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
    }
    for (let i = 0, len = particles.length; i < len; i++) {
        particles[i].update();
    }
    
    // Update bomb explosions
    for (let i = bombExplosions.length - 1; i >= 0; i--) {
        if (!bombExplosions[i].update()) {
            bombExplosions.splice(i, 1);
        }
    }
}

function gameLoop(timestamp) {
    try {
        // Calculate real time elapsed since last frame
        const frameTime = Math.min(timestamp - lastTime, MAX_FRAME_TIME);
        lastTime = timestamp;
        
        // CRITICAL: Reset canvas transform to identity at start of each frame
        // This prevents accumulated transform corruption from causing screen glitches
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        
        // Clear the entire canvas first (before any transforms)
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (gameState.running && !gameState.paused) {
            // Accumulate real time and run fixed timestep updates
            accumulator += frameTime;
            
            // Run game logic in fixed timesteps to maintain consistent speed
            // On slow computers: runs multiple updates per frame to catch up
            // On fast computers: may skip frames to maintain consistent speed
            while (accumulator >= FIXED_TIMESTEP) {
                updateGame();
                gameTimestamp += FIXED_TIMESTEP;
                accumulator -= FIXED_TIMESTEP;
            }
        }
    
    // Draw background
    drawBackground();
    
    // Draw everything (optimized with for loops)
    player.draw();
    for (let i = 0, len = gameState.enemies.length; i < len; i++) {
        gameState.enemies[i].draw();
    }
    if (gameState.boss && gameState.boss.alive) {
        gameState.boss.draw();
    }
    
    // Draw powerup box
    if (gameState.powerup && gameState.powerup.alive) {
        gameState.powerup.draw();
    }
    
    for (let i = 0, len = gameState.projectiles.length; i < len; i++) {
        gameState.projectiles[i].draw();
    }
    for (let i = 0, len = gameState.bossProjectiles.length; i < len; i++) {
        gameState.bossProjectiles[i].draw();
    }
    
    // Draw bomb explosions (behind particles)
    for (let i = 0, len = bombExplosions.length; i < len; i++) {
        bombExplosions[i].draw();
    }
    
    for (let i = 0, len = particles.length; i < len; i++) {
        particles[i].draw();
    }
    
    drawUI();
    
    // Draw active powerup indicator
    if (gameState.activePowerup && gameState.powerupShotsRemaining > 0) {
        drawActivePowerupIndicator();
    }
    
    if (gameState.paused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 72px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        ctx.font = '28px "Courier New", monospace';
        ctx.fillText('Press SPACE to continue', canvas.width / 2, canvas.height / 2 + 60);
    }
    } catch (e) {
        console.error('Error in game loop:', e);
        // Reset canvas state on error to prevent persistent corruption
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
    }
    
    // Final cleanup - ensure transform is reset before next frame
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    
    requestAnimationFrame(gameLoop);
}

// ============================================
// INITIALIZATION
// ============================================

function submitHighScore() {
    if (!pendingScore) return;
    
    const playerNameInput = document.getElementById('player-name');
    const name = playerNameInput.value.trim() || 'ANONYMOUS';
    
    // Add to leaderboard for the mode that was played
    const mode = pendingScore.mode || 'music';
    const difficulty = pendingScore.difficulty || 'normal';
    addToLeaderboard(name, pendingScore.score, pendingScore.wave, pendingScore.maxCombo, mode, difficulty);
    
    // Hide name entry
    document.getElementById('name-entry').classList.add('hidden');
    
    // Update display with highlight
    displayLeaderboards(pendingScore.score);
    
    pendingScore = null;
}

// Mode selection UI update
function updateModeSelection(mode) {
    selectedGameMode = mode;
    
    const musicBtn = document.getElementById('mode-music');
    const typingBtn = document.getElementById('mode-typing');
    const musicControls = document.getElementById('controls-info-music');
    const typingControls = document.getElementById('controls-info-typing');
    const title = document.getElementById('game-title');
    const subtitle = document.getElementById('game-subtitle');
    
    if (mode === 'music') {
        musicBtn.classList.add('selected');
        typingBtn.classList.remove('selected');
        musicControls.classList.remove('hidden');
        typingControls.classList.add('hidden');
        title.textContent = 'KEYMAGEDDON';
        subtitle.textContent = 'Defeat enemies by playing their keys!';
    } else {
        musicBtn.classList.remove('selected');
        typingBtn.classList.add('selected');
        musicControls.classList.add('hidden');
        typingControls.classList.remove('hidden');
        title.textContent = 'KEYMAGEDDON';
        subtitle.textContent = 'Defeat enemies by typing their keys!';
    }
    
    // Update difficulty description for the new mode
    updateDifficultySelection(selectedDifficulty);
}

// Difficulty selection UI update
function updateDifficultySelection(difficulty) {
    selectedDifficulty = difficulty;
    
    const buttons = ['easy', 'normal', 'hard', 'crazy'];
    buttons.forEach(diff => {
        const btn = document.getElementById('diff-' + diff);
        if (btn) {
            btn.classList.toggle('selected', diff === difficulty);
        }
    });
}

function init() {
    player = new Player();
    initMIDI();
    
    document.getElementById('start-btn').addEventListener('click', resetGame);
    document.getElementById('restart-btn').addEventListener('click', resetGame);
    document.getElementById('continue-btn').addEventListener('click', nextLevel);
    
    // Mode selection buttons
    document.getElementById('mode-music').addEventListener('click', () => updateModeSelection('music'));
    document.getElementById('mode-typing').addEventListener('click', () => updateModeSelection('typing'));
    
    // Difficulty selection buttons
    document.getElementById('diff-easy').addEventListener('click', () => updateDifficultySelection('easy'));
    document.getElementById('diff-normal').addEventListener('click', () => updateDifficultySelection('normal'));
    document.getElementById('diff-hard').addEventListener('click', () => updateDifficultySelection('hard'));
    document.getElementById('diff-crazy').addEventListener('click', () => updateDifficultySelection('crazy'));
    
    // Leaderboard submit button
    document.getElementById('submit-score-btn').addEventListener('click', submitHighScore);
    
    // Allow Enter key to submit score
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitHighScore();
        }
    });
    
    requestAnimationFrame(gameLoop);
}

window.addEventListener('load', init);
