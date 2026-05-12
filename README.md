<div align="center">

```
█▀█ █▀█ █▀█ ▀█▀   █ █ ▄▀▄ █▀█ █▀▄ █▀█ █ █ █▀█
█▀▀ █▄█ █▀▄  █    █▀█ █▀█ █▀▄ █▄█ █▄█ █▄█ █▀▄
```

**Computer *ports* on a pixel-art *harbour*. Pun + pleonasm (*port* = *harbour*). Both intended. 🚢**

⭐ Heading to the VS Code Marketplace soon. Star the repo to follow along.

</div>

Your listening sockets are fishing boats moored at the seawall. Your Docker containers light up windows in the red palazzo on the right. The cathedral keeps real time. The lighthouse rotates. The sun rises and sets with your system clock.

<div align="center">

![Sidebar: every port lined up next to its boat](docs/screenshots/sidebar-sockets.png)

<sub><i>Each LISTEN row is a boat at the seawall. Click one to inspect.</i></sub>

</div>

## Run it

1. Open this folder in VS Code.
2. Press <kbd>F5</kbd>.
3. In the new window: <kbd>⌘⇧P</kbd> → **Port Harbour: Open**.

Click any audio toggle to wake up the sea, bells, and retro music (browsers gate Web Audio).

## Things to look for

- 🌅 Day/night cycle (golden hour is the prettiest)
- ⛪ A princess named Mikaela waving from the cathedral window
- 🐱 Two cats. One has spots.
- 🐋 A whale. Dolphins. A sea serpent. Glowing jellyfish at night.
- 🛸 UFOs at 3 AM (rare)
- 🍾 A bottle drifting past with a love note
- 🌈 Konami code → CRT mode

## No VS Code? There's a TUI

```sh
cd rust && cargo build --release
./target/release/portharbour
```

<kbd>q</kbd> quit · <kbd>/</kbd> filter · <kbd>s</kbd> sort · <kbd>k</kbd> kill PID · <kbd>?</kbd> help.

## Build

Needs Node 20+ and Rust.

```sh
cd rust && cargo build --release && cd ..
npm install && (cd webview-ui && npm install) && npm run build
```

## Credits

Art inspired by [Igor Grincu](https://www.artstation.com/grigoreen) ([LinkedIn](https://www.linkedin.com/in/igor-g-3a152966/)). His harbours are hand-painted. Mine are drawn by code in a `<canvas>` at 30 FPS.

## License

MIT.
