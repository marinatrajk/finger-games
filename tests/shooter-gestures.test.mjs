// Drives the Gloop Patrol controls with synthetic hands and faces at 30 frames per second.
//   node tests/shooter-gestures.test.mjs
import { createControls, straightness } from "../shooter-gestures.js";

// ---------- synthetic hands ----------
// Built in palm lengths with fingers pointing up (-y), then scaled to meters for world landmarks.
// `tilt` turns the hand toward the camera (degrees), like pointing a finger gun at the screen.
function hand({ at = { x: 0.65, y: 0.55 }, fingers, thumb = "tucked", tilt = 0, label = "Left", size = 0.12 }) {
  const P = [];
  const put = (i, x, y, z = 0) => { P[i] = { x, y, z }; };
  put(0, 0, 1, 0);
  const across = [-0.3, -0.1, 0.1, 0.3];
  fingers.forEach((shape, f) => {
    const x = across[f], len = f === 3 ? 0.8 : 1, base = 5 + f * 4;
    put(base, x, 0, 0);
    if (shape === "straight") {
      put(base + 1, x, -0.45 * len); put(base + 2, x, -0.7 * len); put(base + 3, x, -0.9 * len);
    } else {
      put(base + 1, x, -0.2 * len, -0.25 * len); put(base + 2, x, 0, -0.35 * len); put(base + 3, x, 0.15 * len, -0.2 * len);
    }
  });
  put(1, -0.35, 0.75, 0); put(2, -0.55, 0.45, -0.05); put(3, -0.7, 0.2, -0.08);
  if (thumb === "up") put(4, -0.95, 0.05, -0.1);          // cocked hammer, sticking out
  else if (thumb === "down") put(4, -0.33, -0.05, -0.12); // dropped onto the side of the index finger
  else put(4, 0.0, 0.2, -0.3);                            // tucked over curled fingers
  // Tilt toward the camera around the knuckles.
  const a = (tilt * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rotated = P.map((p) => ({ x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }));
  const world = rotated.map((p) => ({ x: p.x * 0.085, y: p.y * 0.085, z: p.z * 0.085 }));
  const image = rotated.map((p) => ({ x: at.x + (p.x * size) / 1.78, y: at.y + p.y * size }));
  return { image, world, label };
}
const fist = ["curled", "curled", "curled", "curled"];
const open = ["straight", "straight", "straight", "straight"];
const gunShape = ["straight", "curled", "curled", "curled"];
const twoFinger = ["straight", "straight", "curled", "curled"];

/** A face looking `turn` face-widths off center (negative = your left). */
function face(turn = 0, x = 0.5) {
  return { nose: { x: x + turn * 0.16, y: 0.4 }, left: { x: x - 0.08, y: 0.42 }, right: { x: x + 0.08, y: 0.42 } };
}

// ---------- harness ----------
let failures = 0;
function check(ok, name, detail = "") {
  console.log(ok ? "  ✅" : "  ❌", name, detail ? `(${detail})` : "");
  if (!ok) failures++;
}
function sim() {
  const controls = createControls();
  let t = 10;
  return {
    controls,
    run(seconds, frame, opts) {
      const out = [];
      const n = Math.max(1, Math.round(seconds * 30));
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 1;
        out.push(controls.update(frame(k), t, opts));
        t += 1 / 30;
      }
      return out;
    },
  };
}
const shots = (outs) => outs.filter((o) => o.gun.fired).length;
const last = (outs) => outs.at(-1);

// ---------- scenarios ----------
console.log("Finger shapes (3D)");
{
  const g = hand({ fingers: gunShape, thumb: "up" }).world;
  check(straightness(g, 8, 6) > 1.25 && straightness(g, 12, 10) < 1.0, "index straight and middle curled in a finger gun");
  const aimed = hand({ fingers: gunShape, thumb: "up", tilt: 75 }).world;
  check(Math.abs(straightness(aimed, 8, 6) - straightness(g, 8, 6)) < 1e-9, "pointing it at the camera doesn't change that");
}

console.log("Move hand");
{
  const s = sim();
  let o = s.run(0.3, () => ({ hands: [hand({ at: { x: 0.3, y: 0.6 }, fingers: fist, label: "Right" })] }));
  check(last(o).walking, "a fist walks");
  o = s.run(0.3, () => ({ hands: [hand({ at: { x: 0.3, y: 0.6 }, fingers: twoFinger, label: "Right" })] }));
  check(last(o).walking, "a half-open hand keeps doing what it was doing");
  o = s.run(0.3, () => ({ hands: [hand({ at: { x: 0.3, y: 0.6 }, fingers: open, label: "Right" })] }));
  check(!last(o).walking, "an open hand stops");
  s.run(0.3, () => ({ hands: [hand({ at: { x: 0.3, y: 0.6 }, fingers: fist, label: "Right" })] }));
  o = s.run(0.5, () => ({ hands: [] }));
  check(!last(o).walking, "losing the move hand stops you");
}

console.log("Gun hand");
{
  const s = sim();
  const g = (thumb, extra = {}) => () => ({ hands: [hand({ fingers: gunShape, thumb, ...extra })] });
  let o = s.run(0.5, g("up"));
  check(last(o).gun.pose && last(o).gun.cocked, "a finger gun with the thumb up is ready to fire");
  o = s.run(0.4, g("down"));
  check(shots(o) === 1, "dropping the thumb fires once, even when held down");
  o = s.run(0.3, g("up")).concat(s.run(0.3, g("down")));
  check(shots(o) === 1, "cock and drop again fires again");
  o = s.run(0.3, g("up", { tilt: 75 })).concat(s.run(0.3, g("down", { tilt: 75 })));
  check(shots(o) === 1, "it also fires when the finger points straight at the camera");
  o = s.run(0.3, () => ({ hands: [hand({ fingers: open, thumb: "up" })] }))
    .concat(s.run(0.3, () => ({ hands: [hand({ fingers: open, thumb: "down" })] })));
  check(shots(o) === 0, "an open hand never fires");
  o = s.run(0.3, () => ({ hands: [hand({ fingers: fist, thumb: "up" })] }))
    .concat(s.run(0.3, () => ({ hands: [hand({ fingers: fist, thumb: "tucked" })] })));
  check(shots(o) === 0, "making a fist never fires");
  o = s.run(0.3, () => ({ hands: [hand({ fingers: twoFinger, thumb: "up" })] }))
    .concat(s.run(0.3, () => ({ hands: [hand({ fingers: twoFinger, thumb: "down" })] })));
  check(shots(o) === 1, "a two-finger gun works too");
}

console.log("Aim");
{
  const s = sim();
  const at = (x, y, thumb = "up") => () => ({ hands: [hand({ at: { x, y }, fingers: gunShape, thumb })] });
  let o = s.run(1.5, at(0.7, 0.6), { calibrating: true });
  check(Math.abs(last(o).gun.aim.x - 0.5) < 0.05 && Math.abs(last(o).gun.aim.y - 0.5) < 0.05,
    "while a menu shows, wherever you hold the gun becomes the middle of the screen",
    `${last(o).gun.aim.x.toFixed(2)}, ${last(o).gun.aim.y.toFixed(2)}`);
  o = s.run(0.6, (k) => at(0.7 + 0.15 * k, 0.6)());
  check(last(o).gun.aim.x > 0.8, "moving the gun right aims right", last(o).gun.aim.x.toFixed(2));
  o = s.run(0.6, (k) => at(0.85, 0.6 - 0.12 * k)());
  check(last(o).gun.aim.y < 0.25, "moving it up aims up", last(o).gun.aim.y.toFixed(2));
  // The thumb drop jolts the hand: the shot should go where you were aiming just before.
  s.run(0.5, at(0.78, 0.6));
  const steady = s.run(0.1, at(0.78, 0.6)).at(-1).gun.aim;
  o = s.run(0.1, (k) => at(0.78 + 0.06 * k, 0.6, k > 0.5 ? "down" : "up")());
  const shot = o.find((x) => x.gun.fired);
  check(shot && Math.abs(shot.gun.aimAtFire.x - steady.x) < 0.03,
    "a shot lands where you aimed before the thumb jolted the hand",
    shot ? `${steady.x.toFixed(2)} → ${shot.gun.aimAtFire.x.toFixed(2)} (hand drifted to ${shot.gun.aim.x.toFixed(2)})` : "no shot");
}

console.log("Head steering");
{
  const s = sim();
  let o = s.run(1.5, () => ({ face: face(0.1) }), { calibrating: true });
  check(Math.abs(last(o).steer) < 0.01, "however you sit during the menu counts as straight ahead");
  o = s.run(0.5, () => ({ face: face(0.12) }));
  check(Math.abs(last(o).steer) < 0.01, "a small head wobble doesn't turn");
  o = s.run(0.5, () => ({ face: face(0.1 - 0.15) }));
  check(last(o).steer < -0.3, "turning your head left turns left", last(o).steer.toFixed(2));
  o = s.run(0.5, () => ({ face: face(0.1 + 0.25) }));
  check(last(o).steer > 0.9, "turning it further right turns right at full speed", last(o).steer.toFixed(2));
  o = s.run(0.5, () => ({ face: null }));
  check(last(o).steer === 0, "if your face leaves the picture, turning stops");
}

console.log("Which hand is which");
{
  const s = sim();
  // One hand, labeled the way MediaPipe labels an unmirrored picture (swapped): "Left" is really your right.
  let o = s.run(0.3, () => ({ hands: [hand({ at: { x: 0.7, y: 0.55 }, fingers: gunShape, thumb: "up", label: "Left" })] }));
  check(last(o).gun.seen && !last(o).move.seen, "on its own, your right hand is the gun");
  const both = (gunLabel, moveLabel) => () => ({
    hands: [
      hand({ at: { x: 0.3, y: 0.6 }, fingers: fist, label: moveLabel }),
      hand({ at: { x: 0.7, y: 0.55 }, fingers: gunShape, thumb: "up", label: gunLabel }),
    ],
  });
  o = s.run(0.3, both("Left", "Right"));
  check(last(o).gun.seen && last(o).walking, "with both up, the hand on the right of the screen is the gun");
  // A camera whose labels aren't swapped: it learns that from seeing both hands, then gets single hands right.
  const t = sim();
  t.run(0.5, both("Right", "Left"));
  o = t.run(0.6, () => ({ hands: [hand({ at: { x: 0.7, y: 0.55 }, fingers: gunShape, thumb: "up", label: "Right" })] }));
  check(last(o).gun.seen && !last(o).move.seen, "it learns which way round the labels are");
  t.controls.swapHands();
  o = t.run(0.3, both("Right", "Left"));
  check(last(o).gun.hand && last(o).gun.hand.image[0].x < 0.5, "swapping hands makes the left hand the gun");
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
