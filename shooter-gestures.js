// Gloop Patrol controls: turns face and hand landmarks into steering, walking and shooting.
// Pure logic with no browser APIs, so it can be tested with Node (see tests/shooter-gestures.test.mjs).
//
// - Head: turn it left or right to turn. Calibrates to how you sit while a menu is showing.
// - Move hand (left by default): a fist walks forward, an open hand stops.
// - Gun hand (right by default): a finger gun. Move it to aim; drop your thumb like a hammer to fire.
//   (Gloop Patrol only uses the left-right part of the aim; the gun stays level.)
//
// Input, per camera frame (picture coordinates are mirrored: x 0 = left of the screen):
//   face:  { nose, left, right } points {x, y}, or null
//   hands: [{ image: 21 points {x, y}, world: 21 points {x, y, z} in meters, label: "Left" | "Right" }]

export const SETTINGS = {
  // Head turn, measured as how far the nose sits off the middle of the face, in face widths.
  steerDeadZone: 0.035,
  steerFull: 0.18,
  steerSmoothing: 0.35,
  // Finger straightness in 3D (tip-to-wrist over middle-joint-to-wrist), so it works whichever way
  // the hand points, including straight at the camera.
  straightOn: 1.15,
  straightOff: 1.03,
  fistMax: 1.05,
  // Thumb hammer: distance from the thumb tip to the base of the index and middle fingers, in palm lengths.
  thumbCocked: 0.55,
  thumbFired: 0.38,
  shotCooldown: 0.15,
  // Aim: how far the gun hand moves (fraction of the picture) to go from the middle of the screen to its edge.
  aimHalfWidth: 0.2,
  aimHalfHeight: 0.17,
  // Fire where you were aiming just before the thumb dropped, before it jolted the hand.
  aimLookback: 0.07,
  lostAfter: 0.3,
  // How quickly the head and aim centers settle while calibrating, in seconds.
  calibrateTime: 0.8,
};

const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];   // [tip, middle joint] for index, middle, ring, little

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export function straightness(world, tip, pip) {
  return d3(world[0], world[tip]) / Math.max(d3(world[0], world[pip]), 1e-6);
}

/** Middle of the palm in the picture: wrist plus the four knuckles. The thumb doesn't move it. */
export function palmCenter(image) {
  const ids = [0, 5, 9, 13, 17];
  return {
    x: ids.reduce((s, i) => s + image[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + image[i].y, 0) / ids.length,
  };
}

/** Smooths heavily when still and barely at all when moving fast. */
class OneEuro {
  constructor(minCutoff, beta) { this.minCutoff = minCutoff; this.beta = beta; this.value = null; }
  reset() { this.value = null; }
  filter(x, t) {
    if (this.value == null) { this.value = x; this.slope = 0; this.t = t; return x; }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    const alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
    this.slope += alpha(1) * ((x - this.value) / dt - this.slope);
    this.value += alpha(this.minCutoff + this.beta * Math.abs(this.slope)) * (x - this.value);
    return this.value;
  }
}

export function createControls(overrides = {}) {
  const s = { ...SETTINGS, ...overrides };
  const st = {
    lastT: null,
    // head
    yaw: null, neutral: null, steer: 0, faceSeenAt: -Infinity,
    // move hand
    walking: false, moveShape: "none", moveSeenAt: -Infinity,
    // gun hand
    gunSeenAt: -Infinity, indexUp: false, gunPose: false, cocked: false, thumbGap: null, lastShot: -Infinity,
    aimCenter: { x: 0.65, y: 0.55 }, aim: { x: 0.5, y: 0.5 }, lastPalm: null, trail: [],
    fx: new OneEuro(0.8, 3), fy: new OneEuro(0.8, 3),
    // MediaPipe labels hands as if the picture were mirrored, and we hand it the unmirrored camera
    // picture, so its labels start out assumed swapped. Whenever both hands are visible we check
    // that against where they are, and learn which way round this camera is.
    flipVotes: 1,
    gunHand: "Right",
  };

  function trueSide(hand) {
    if (hand.label !== "Left" && hand.label !== "Right") return palmCenter(hand.image).x > 0.5 ? "Right" : "Left";
    if (st.flipVotes < 0) return hand.label;
    return hand.label === "Left" ? "Right" : "Left";
  }

  function assign(hands) {
    if (hands.length >= 2) {
      const [a, b] = hands;
      // In the mirror view your right hand is on the right.
      const right = palmCenter(a.image).x > palmCenter(b.image).x ? a : b;
      const left = right === a ? b : a;
      if (a.label !== b.label) st.flipVotes = clamp(st.flipVotes + (right.label === "Right" ? -1 : 1), -20, 20);
      return st.gunHand === "Right" ? { gun: right, move: left } : { gun: left, move: right };
    }
    if (hands.length === 1) {
      return trueSide(hands[0]) === st.gunHand ? { gun: hands[0] } : { move: hands[0] };
    }
    return {};
  }

  function update(frame, t, { calibrating = false } = {}) {
    const dt = st.lastT == null ? 0 : clamp(t - st.lastT, 0, 0.2);
    st.lastT = t;
    const settle = 1 - Math.exp(-dt / s.calibrateTime);
    const { gun, move } = assign(frame.hands ?? []);

    // Head turn.
    if (frame.face) {
      const { nose, left, right } = frame.face;
      const width = Math.abs(right.x - left.x);
      if (width > 0.02) {
        st.faceSeenAt = t;
        const raw = (nose.x - (left.x + right.x) / 2) / width;
        st.yaw = st.yaw == null ? raw : st.yaw + (raw - st.yaw) * s.steerSmoothing;
        if (st.neutral == null) st.neutral = st.yaw;
        if (calibrating) st.neutral += (st.yaw - st.neutral) * settle;
        const off = st.yaw - st.neutral;
        const amount = clamp((Math.abs(off) - s.steerDeadZone) / (s.steerFull - s.steerDeadZone), 0, 1);
        st.steer = Math.sign(off) * amount ** 1.5;
      }
    }
    if (t - st.faceSeenAt > s.lostAfter) st.steer = 0;

    // Move hand: fist walks, open hand stops, anything in between keeps doing what it was doing.
    if (move) {
      st.moveSeenAt = t;
      const fingers = FINGERS.map(([tip, pip]) => straightness(move.world, tip, pip));
      if (fingers.every((v) => v < s.fistMax)) { st.walking = true; st.moveShape = "fist"; }
      else if (fingers.filter((v) => v > s.straightOn).length >= 3) { st.walking = false; st.moveShape = "open"; }
      else st.moveShape = "between";
    } else if (t - st.moveSeenAt > s.lostAfter) {
      st.walking = false;
      st.moveShape = "none";
    }

    // Gun hand.
    let fired = false, aimAtFire = null;
    if (gun) {
      st.gunSeenAt = t;
      const w = gun.world;
      const index = straightness(w, 8, 6), ring = straightness(w, 16, 14), little = straightness(w, 20, 18);
      st.indexUp = st.indexUp ? index > s.straightOff : index > s.straightOn;
      // Index out, ring and little folded: a finger gun, not an open hand.
      st.gunPose = st.indexUp && ring < s.straightOn && little < s.straightOn;
      const palm = Math.max(d3(w[0], w[9]), 1e-6);
      st.thumbGap = Math.min(d3(w[4], w[5]), d3(w[4], w[6]), d3(w[4], w[9]), d3(w[4], w[10])) / palm;

      const p = palmCenter(gun.image);
      st.lastPalm = p;
      if (calibrating) {
        st.aimCenter.x += (p.x - st.aimCenter.x) * settle;
        st.aimCenter.y += (p.y - st.aimCenter.y) * settle;
      }
      const ax = clamp(0.5 + (p.x - st.aimCenter.x) / (2 * s.aimHalfWidth), 0, 1);
      const ay = clamp(0.5 + (p.y - st.aimCenter.y) / (2 * s.aimHalfHeight), 0, 1);
      st.aim = { x: st.fx.filter(ax, t), y: st.fy.filter(ay, t) };

      if (st.thumbGap > s.thumbCocked) {
        st.cocked = true;
      } else if (st.cocked && st.thumbGap < s.thumbFired && st.gunPose && t - st.lastShot > s.shotCooldown) {
        st.cocked = false;
        st.lastShot = t;
        fired = true;
        const before = st.trail.filter((e) => e.t <= t - s.aimLookback);
        aimAtFire = before.length ? { x: before.at(-1).x, y: before.at(-1).y } : { ...st.aim };
      }
      st.trail.push({ t, x: st.aim.x, y: st.aim.y });
      st.trail = st.trail.filter((e) => t - e.t < 0.4);
    } else if (t - st.gunSeenAt > s.lostAfter) {
      st.gunPose = false;
      st.fx.reset(); st.fy.reset();
      st.trail = [];
    }

    return {
      steer: st.steer,
      walking: st.walking,
      face: { seen: t - st.faceSeenAt <= s.lostAfter, yaw: st.yaw, neutral: st.neutral },
      move: { seen: t - st.moveSeenAt <= s.lostAfter, shape: st.moveShape, hand: move ?? null },
      gun: {
        seen: t - st.gunSeenAt <= s.lostAfter,
        pose: st.gunPose,
        cocked: st.cocked,
        thumbGap: st.thumbGap,
        aim: { ...st.aim },
        fired,
        aimAtFire,
        hand: gun ?? null,
      },
    };
  }

  return {
    update,
    settings: s,
    /** Treat the current head position and gun hand position as straight ahead. */
    recenter() {
      if (st.yaw != null) st.neutral = st.yaw;
      if (st.lastPalm) st.aimCenter = { ...st.lastPalm };
    },
    /** Switch which hand is the gun. Returns the new gun hand ("Left" or "Right"). */
    swapHands() {
      st.gunHand = st.gunHand === "Right" ? "Left" : "Right";
      return st.gunHand;
    },
    get gunHand() { return st.gunHand; },
  };
}
