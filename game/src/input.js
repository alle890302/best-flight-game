// TRADEWIND RUN — keyboard and mouse input.
// One job: read the player's hands and hand the game a clean control frame.

// A control frame: pitch/roll in [-1, 1], throttle in [-1, 1] (rate), rudder in [-1, 1],
// plus edge-triggered actions (flaps, pause, retry, view, mute, confirm).
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    frame: { pitch: 0, roll: 0, throttle: 0, rudder: 0 },
    flaps: false,
    pause: false,
    retry: false,
    view: false,
    mute: false,
    confirm: false,
    anyKey: false,
    mouse: { x: 0, y: 0, dragging: false, down: false },
  };

  const KEYMAP = {
    ArrowUp: 'pitchUp', KeyW: 'throttleUp',
    ArrowDown: 'pitchDown', KeyS: 'throttleDown',
    ArrowLeft: 'rollLeft', KeyA: 'rollLeft',
    ArrowRight: 'rollRight', KeyD: 'rollRight',
    KeyQ: 'rudderLeft', KeyE: 'rudderRight',
  };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    state.anyKey = true;
    if (e.code === 'KeyF') state.flaps = true;
    if (e.code === 'KeyP' || e.code === 'Escape') state.pause = true;
    if (e.code === 'KeyR') state.retry = true;
    if (e.code === 'KeyV') state.view = true;
    if (e.code === 'KeyM') state.mute = true;
    if (e.code === 'Enter' || e.code === 'Space') state.confirm = true;
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseDown(e) {
    state.mouse.down = true;
    state.mouse.dragging = true;
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
  }
  function onMouseMove(e) {
    if (!state.mouse.dragging) return;
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
  }
  function onMouseUp() {
    state.mouse.dragging = false;
    state.mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Read the current control frame. Mouse drag acts as a stick: horizontal = roll,
  // vertical = pitch, measured from the point where the drag started.
  function readFrame() {
    const f = state.frame;
    f.pitch = 0; f.roll = 0; f.throttle = 0; f.rudder = 0;
    if (keys.has('ArrowUp')) f.pitch += 1;
    if (keys.has('ArrowDown')) f.pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) f.roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) f.roll += 1;
    if (keys.has('KeyW')) f.throttle += 1;
    if (keys.has('KeyS')) f.throttle -= 1;
    if (keys.has('KeyQ')) f.rudder -= 1;
    if (keys.has('KeyE')) f.rudder += 1;
    if (state.mouse.dragging) {
      const rect = canvas.getBoundingClientRect();
      const dx = (state.mouse.x - rect.left - rect.width / 2) / (rect.width / 2);
      const dy = (state.mouse.y - rect.top - rect.height / 2) / (rect.height / 2);
      f.roll += clamp(dx * 1.4, -1, 1);
      f.pitch -= clamp(dy * 1.4, -1, 1);
    }
    f.pitch = clamp(f.pitch, -1, 1);
    f.roll = clamp(f.roll, -1, 1);
    f.rudder = clamp(f.rudder, -1, 1);
    return f;
  }

  // Edge-triggered actions: read once per frame, then clear.
  function takeActions() {
    const a = {
      flaps: state.flaps, pause: state.pause, retry: state.retry,
      view: state.view, mute: state.mute, confirm: state.confirm, anyKey: state.anyKey,
    };
    state.flaps = state.pause = state.retry = state.view = state.mute = state.confirm = state.anyKey = false;
    return a;
  }

  function mousePos() {
    const rect = canvas.getBoundingClientRect();
    return { x: state.mouse.x - rect.left, y: state.mouse.y - rect.top, down: state.mouse.down };
  }

  return { readFrame, takeActions, mousePos, keys };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
