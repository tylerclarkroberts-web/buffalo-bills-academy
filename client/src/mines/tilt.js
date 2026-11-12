import { Euler, Quaternion, Vector3 } from 'three';

const RAD = Math.PI / 180;
const SCREEN_AXIS = new Vector3(0, 0, 1);
const strength = angle => Math.abs(angle) <= 4 * RAD ? 0 : Math.sign(angle) * Math.min(1, (Math.abs(angle) / RAD - 4) / 18);

export function createTiltControls({ target = window, onInput, onStatus }) {
  let active = false, paused = false, disposed = false, hasReading = false, generation = 0, timer, frame;
  let neutral = null, lastAt = 0, lastAngle = 0, forward = 0, turn = 0, wantedForward = 0, wantedTurn = 0;
  let status = 'off', message = '';
  const orientation = target.screen?.orientation;
  const current = new Quaternion(), relative = new Quaternion(), screen = new Quaternion();
  const euler = new Euler(0, 0, 0, 'ZXY');
  const report = (next, text) => {
    if (status === next && message === text) return;
    status = next; message = text; onStatus(next, text);
  };
  const zero = () => {
    target.cancelAnimationFrame(frame); frame = undefined;
    forward = turn = wantedForward = wantedTurn = 0; onInput(0, 0);
  };
  const angle = () => {
    const value = orientation?.angle ?? target.orientation ?? 0;
    return Number.isFinite(value) ? value : 0;
  };
  const clearTimer = () => { target.clearTimeout(timer); timer = undefined; };
  function stop() {
    generation++; active = false; hasReading = false; neutral = null; clearTimer(); zero();
    target.removeEventListener('deviceorientation', receive);
    target.removeEventListener('blur', disable);
    target.document?.removeEventListener('visibilitychange', visibility);
    orientation?.removeEventListener?.('change', rotated);
    target.removeEventListener('orientationchange', rotated);
  }
  function fail(text) { stop(); report('error', text); }
  function waitForReading() {
    if (timer === undefined) timer = target.setTimeout(() => fail('No valid motion reading arrived. Choose Use touch to continue.'), 3000);
  }
  function disable() { stop(); report('off', 'Touch controls are on.'); }
  function visibility() { if (target.document.hidden) disable(); }
  function rotated() { if (angle() !== lastAngle) { hasReading = false; recenter(); } }
  function recenter() {
    if (!active) return;
    neutral = null; lastAt = 0; zero(); clearTimer();
    if (paused) { report('on', 'Tilt is paused. Release the controls to recenter.'); return; }
    if (hasReading) {
      neutral = current.clone().invert();
      report('on', 'Tilt gently to walk and steer. Recenter if your grip changes.');
      return;
    }
    report('calibrating', 'Hold your phone comfortably. This position becomes your center.');
    waitForReading();
  }
  function smooth(now) {
    frame = undefined;
    const blend = 1 - Math.exp(-Math.max(0, Math.min(100, now - lastAt)) / 120);
    lastAt = now;
    forward = wantedForward === 0 ? 0 : forward + (wantedForward - forward) * blend;
    turn = wantedTurn === 0 ? 0 : turn + (wantedTurn - turn) * blend;
    if (Math.abs(forward - wantedForward) < 0.001) forward = wantedForward;
    if (Math.abs(turn - wantedTurn) < 0.001) turn = wantedTurn;
    onInput(forward, turn);
    if (forward !== wantedForward || turn !== wantedTurn) frame = target.requestAnimationFrame(smooth);
  }
  function receive(event) {
    if (!active) return;
    if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) {
      hasReading = false; neutral = null;
      if (paused) return;
      zero();
      report('calibrating', 'Waiting for a valid motion reading.');
      waitForReading();
      return;
    }
    const screenAngle = angle();
    if (screenAngle !== lastAngle) neutral = null;
    lastAngle = screenAngle;
    // Device rotations are Z-X-Y; screen rotation makes the same gestures work in landscape.
    current.setFromEuler(euler.set(event.beta * RAD, event.gamma * RAD, event.alpha * RAD, 'ZXY'));
    current.multiply(screen.setFromAxisAngle(SCREEN_AXIS, -screenAngle * RAD));
    hasReading = true;
    if (paused) return;
    clearTimer();
    if (!neutral) {
      recenter();
      return;
    }
    relative.multiplyQuaternions(neutral, current);
    const length = Math.hypot(relative.x, relative.y, relative.z);
    const scale = length ? (relative.w < 0 ? -1 : 1) * 2 * Math.atan2(length, Math.abs(relative.w)) / length : 0;
    wantedForward = strength(-relative.x * scale); wantedTurn = strength(relative.y * scale) * 0.9;
    // Orientation events need only fire on changes; finish smoothing even when the phone is held steady.
    if (frame === undefined && (forward !== wantedForward || turn !== wantedTurn)) {
      lastAt = target.performance.now(); frame = target.requestAnimationFrame(smooth);
    }
  }
  async function enable() {
    if (disposed) return;
    stop();
    if (!target.isSecureContext) return fail('Tilt needs HTTPS. Choose Use touch to continue.');
    if (!target.DeviceOrientationEvent) return fail('This browser does not support tilt. Choose Use touch to continue.');
    if (target.document?.hidden) return fail('Keep the mine open while enabling tilt controls.');
    const request = generation;
    report('requesting', 'Allow motion access to use tilt controls.');
    target.document?.addEventListener('visibilitychange', visibility);
    try {
      const permission = target.DeviceOrientationEvent.requestPermission;
      // This call must happen before awaiting anything, while the enabling tap is still active.
      const granted = typeof permission === 'function' ? await permission.call(target.DeviceOrientationEvent) : 'granted';
      if (disposed || request !== generation) return;
      if (granted !== 'granted') return fail('Motion permission was not granted. Choose Use touch to continue.');
      active = true;
      target.addEventListener('deviceorientation', receive);
      target.addEventListener('blur', disable);
      orientation?.addEventListener?.('change', rotated);
      target.addEventListener('orientationchange', rotated);
      recenter();
    } catch {
      if (!disposed && request === generation) fail('Motion access failed. Choose Use touch to continue.');
    }
  }
  function setPaused(value) {
    if (paused === value) return;
    paused = value;
    if (active) recenter();
  }
  function dispose() { if (!disposed) { stop(); disposed = true; } }
  return { enable, disable, recenter, setPaused, dispose };
}
