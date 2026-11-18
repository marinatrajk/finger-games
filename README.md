# finger-games

Silly browser games you play with your index finger, using your laptop camera.
Hand and face tracking run in the browser with [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).
There is no build step, no server-side code, and nothing leaves your machine.

## Play it

| Game | What it is |
| --- | --- |
| [**Slice Party**](https://marinatrajk.github.io/finger-games/) | Swipe your finger to slice flying fruit. Avoid the 💣, grab the 🌶️ for a frenzy. |
| [**Finger Pop**](https://marinatrajk.github.io/finger-games/pop.html) | Poke the bubbles before they float away. ⭐ adds time, 💣 costs a heart. |
| [**Quick Question**](https://marinatrajk.github.io/finger-games/gta.html) | "Have you played GTA6?" The Yes button runs away from your finger, and an emoji takes over your face every time you miss. |
| [**Gloop Patrol**](https://marinatrajk.github.io/finger-games/shooter.html) | A 3D arena shooter played with your whole body. Turn your head to turn, make a fist with your left hand to walk (open hand to stop), and fire a right-hand finger gun by dropping your thumb. |

Open a link and allow the camera. Every game also works with a mouse or trackpad if you don't want to use the camera. In Gloop Patrol that's <kbd>A</kbd>/<kbd>D</kbd> to turn, <kbd>W</kbd> to walk and click to shoot; <kbd>H</kbd> swaps which hand is the gun and <kbd>C</kbd> recenters your head and aim.

## Run it locally

Browsers only allow camera access on `localhost` or `https`, so serve the folder instead of opening the files directly:

```bash
python3 -m http.server 8766
```

Then open <http://localhost:8766> (Slice Party), <http://localhost:8766/pop.html>, <http://localhost:8766/gta.html> or <http://localhost:8766/shooter.html> and allow the camera.

Each game is a single HTML page. Gloop Patrol keeps its gesture logic in `shooter-gestures.js` so it can be tested without a camera:

```bash
node tests/shooter-gestures.test.mjs
```

The MediaPipe library, its models and (for Gloop Patrol) three.js load from public CDNs the first time you play.

## License

MIT
