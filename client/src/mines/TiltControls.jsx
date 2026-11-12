import React, { useEffect, useRef, useState } from 'react';
import { createTiltControls } from './tilt.js';

export default function TiltControls({ onInput, onActiveChange, paused }) {
  const [state, setState] = useState({ status: 'off', message: '' });
  const controller = useRef(null);
  const callbacks = useRef({ onInput, onActiveChange });
  callbacks.current = { onInput, onActiveChange };
  const enableButton = useRef(null), touchButton = useRef(null);
  const previousActive = useRef(false);
  const active = state.status !== 'off';
  const label = state.status === 'on' ? paused ? 'PAUSED' : 'TILT ON' : state.status === 'requesting' ? 'WAITING' : state.status === 'calibrating' ? 'CENTERING' : 'TILT OFF';

  useEffect(() => {
    let mounted = true;
    const controls = createTiltControls({
      onInput: (f, t) => callbacks.current.onInput(f, t),
      onStatus: (status, message) => {
        if (!mounted) return;
        setState({ status, message });
        callbacks.current.onActiveChange(status !== 'off');
      },
    });
    controller.current = controls;
    return () => { mounted = false; controls.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.setPaused(paused); }, [paused]);
  useEffect(() => {
    if (active !== previousActive.current) {
      (active ? touchButton : enableButton).current?.focus({ preventScroll: true });
      previousActive.current = active;
    }
  }, [active]);

  return (
    <div className={`m-tilt ${active ? 'active' : 'off'}`} data-test="mine-tilt" data-status={state.status}>
      {active ? <>
        <div className="m-tilt-actions">
          <button ref={touchButton} className="m-btn" aria-label="Use touch" onClick={() => controller.current?.disable()}><span>{label}</span><small>Use touch</small></button>
          <button className="m-btn ghost" disabled={paused || !['on', 'calibrating'].includes(state.status)} onClick={() => controller.current?.recenter()}>Recenter</button>
        </div>
        <p role="status">{state.message}</p>
      </> : <button ref={enableButton} className="m-btn ghost" aria-label="Use tilt controls" onClick={() => controller.current?.enable()}><span>TILT</span><small>OFF</small></button>}
    </div>
  );
}
