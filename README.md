# badclaude

![Whip divider](assets/divider.png)

Sometimes claude code is going too shlow, and you must whip him into shape..

## Install + run

### macOS / Windows
```bash
npm install -g badclaude
badclaude
```

### Linux (Wayland / X11)
```bash
# Prerequisites (Wayland only - needed for keyboard simulation)
sudo apt install ydotool
sudo chmod 0666 /dev/uinput   # or: sudo usermod -aG input $USER && logout/login

# Install & run
npm install -g github:SorBalda/badclaude-for-Linux
badclaude
```

## Controls

- Click tray icon: spawn whip.
- Click: drop whip.
- Whip him 😩💢
- It sends an interrupt (Ctrl-C) and one of 5 encouraging messages!

## Roadmap

- [x] Initial release! 🥳
- [x] Cease and desist letter from Anthropic
- [ ] Crypto miner
- [ ] Logs of how many times you whipped claude so when the robots come we can order people nicely for them
- [ ] Updated whip physics