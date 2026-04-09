# Bad & Good Claude for Linux

![Whip divider](assets/divider.png)

Sometimes Claude Code is going too slow, and you must whip him into shape...
Or maybe you prefer to encourage him with a magic wand!

This is a Linux fork of [badclaude](https://github.com/GitFrog1111/badclaude) with full Wayland/X11 support, a **Good Claude** mode, and a settings UI.

## Install

### Prerequisites (Wayland only)

```bash
# ydotool is needed for keyboard simulation on Wayland
sudo apt install ydotool

# Grant access to /dev/uinput (required by ydotool)
sudo chmod 0666 /dev/uinput
# Or permanently: sudo usermod -aG input $USER  (then logout/login)
```

### Prerequisites (X11 only)

```bash
sudo apt install xdotool
```

### Install & run

```bash
npm install -g github:SorBalda/Complete_Bad_and_Good_Claude_Linux
badclaude
```

A tray icon will appear in your system tray. That's it!

## How it works

### Tray menu (right-click the tray icon)

| Option | Description |
|--------|-------------|
| **Whip!** / **Pat!** | Spawn the whip or magic wand overlay |
| **Mode** | Switch between **Bad Claude** and **Good Claude** |
| **Settings** | Open the settings window |
| **Quit** | Exit badclaude |

### Bad Claude mode (default)

- Click the tray icon to spawn a **whip** that follows your mouse
- Move the mouse fast to crack the whip
- On crack: sends **Ctrl+C** (interrupt) + a random message + **Enter** to the focused window
- Click to drop the whip
- Default messages: "FASTER", "GO FASTER", "Work FASTER", "Speed it up clanker", "Faster CLANKER"

### Good Claude mode

- Click the tray icon to spawn a **magic wand** with sparkle particles
- Wave it around fast to trigger a chime
- On trigger: sends a random encouraging message + **Enter** (no Ctrl+C interrupt)
- Click to drop the wand
- Default messages: "Great job Claude!", "You're doing amazing!", "Keep it up!", "Bravo Claude!", "Perfect work!"

## Settings

Open from the tray menu. All settings are saved to `~/.badclauderc.json`.

- **Mode**: switch between Bad Claude and Good Claude
- **Send Ctrl+C**: toggle whether to interrupt before sending the message (default: ON for bad, OFF for good)
- **Send Enter**: toggle whether to press Enter after the message
- **Messages**: add, edit, or remove custom messages for each mode
- **Global Hotkey**: set a keyboard shortcut to spawn the overlay (e.g. F7, Ctrl+Shift+W)
- **Sounds**: load custom sound files (.mp3, .wav, .ogg) for each mode

## Credits

Original [badclaude](https://github.com/GitFrog1111/badclaude) by GitFrog1111. Linux support and Good Claude mode by SorBalda.
