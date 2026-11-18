# finger-games

Silly browser games you play with your index finger, using your laptop camera.
Hand and face tracking run in the browser with [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).
There is no build step, no server-side code, and nothing leaves your machine.

| Page | What it is |
| --- | --- |
| `index.html` | **Slice Party**: swipe your finger to slice flying fruit. Avoid the 💣, grab the 🌶️ for a frenzy. |
| `pop.html` | **Finger Pop**: poke the bubbles before they float away. ⭐ adds time, 💣 costs a heart. |
| `gta.html` | **Quick Question**: "Have you played GTA6?" The Yes button runs away from your finger, and an emoji takes over your face every time you miss. |

Every game also works with a mouse or trackpad if you don't want to use the camera.

## Run it

Browsers only allow camera access on `localhost` or `https`, so serve the folder instead of opening the files directly:

```bash
python3 -m http.server 8766
```

Then open <http://localhost:8766> (Slice Party), <http://localhost:8766/pop.html> or <http://localhost:8766/gta.html> and allow the camera.

Each page is a single self-contained HTML file. The MediaPipe library and models load from public CDNs the first time you play.

## License

MIT
