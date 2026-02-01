# Keymageddon

A 2D top-down arcade survival game where you defeat enemies by playing musical notes or typing letters!

## Game Modes

### Music Mode 🎹
- Enemies display musical notes
- Play the matching note on your keyboard or MIDI piano to shoot and destroy them
- Bosses require playing multiple notes before their attack charges

### Typing Mode ⌨️
- Enemies display letters
- Type the matching letter to destroy them
- Bosses display words you must type to interrupt their attacks

## How to Play

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge recommended)
2. Select your game mode (Music or Typing)
3. Select your difficulty level
4. Click "Start Game" to begin
5. Enemies will spawn from the edges and move toward you
6. Match the note/letter displayed to shoot and destroy enemies!

## Difficulty Levels

- **Easy** - Slower enemies, simpler content, longer boss charge time
- **Normal** - Standard gameplay experience
- **Hard** - More complex content, multiple letters/notes per enemy
- **Are You Crazy?** - Content changes after 5 seconds!

## Controls

### Music Mode - Computer Keyboard
- **White Keys:** A S D F G H J K L (maps to C D E F G A B C D)
- **Black Keys:** W E T Y U O P (maps to C# D# F# G# A# C# D#)

### Music Mode - MIDI Keyboard
- Connect any MIDI keyboard before starting the game
- The game will automatically detect and use your MIDI input
- Notes must match the exact octave shown on the staff

### Typing Mode
- Simply type the letters shown on enemies
- Type words to interrupt boss attacks

## Features

- 8 unique bosses with different attack patterns
- Powerup system (Spreadshot, Bomb, Health Boost)
- Combo multiplier system
- Dual leaderboards for each mode
- Progressive difficulty scaling
- Retro pixel-art style with HD-2D lighting effects

## Technical Requirements

- Modern web browser with HTML5 Canvas support
- JavaScript enabled
- For MIDI support: Browser with Web MIDI API support (Chrome recommended)

## Files

- `index.html` - Main HTML structure
- `styles.css` - Game styling and UI
- `game.js` - Complete game logic

## Running the Game

Simply open `index.html` in your browser. No server or build process required!

For MIDI keyboard support, you may need to run from a local server due to browser security policies:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve
```

Then navigate to `http://localhost:8000`
