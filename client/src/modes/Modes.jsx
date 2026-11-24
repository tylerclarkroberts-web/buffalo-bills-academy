import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getModes, loadModes, setFamily as setFamilyStore, setWork as setWorkStore, subscribeModes, subscribeElHaloActive, handleWorkHotkey, isElHaloImmersive } from './store.js';
import { displayTableName, familyHandle, familyMask } from './family.js';
import './modes.css';

const ModesCtx = createContext({
  family: false,
  work: false,
  safe: false,
  setFamily: () => {},
  setWork: () => {},
});

export function ModesProvider({ children }) {
  const [modes, setModes] = useState(() => loadModes());
  useEffect(() => subscribeModes((s) => setModes(s)), []);
  useEffect(() => {
    const onKey = (e) => handleWorkHotkey(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const value = useMemo(() => ({
    family: !!modes.family,
    work: !!modes.work,
    safe: !!(modes.family || modes.work),
    setFamily: setFamilyStore,
    setWork: setWorkStore,
  }), [modes.family, modes.work]);
  return <ModesCtx.Provider value={value}>{children}</ModesCtx.Provider>;
}

export function useModes() {
  return useContext(ModesCtx);
}

/** True on /elhalo or when the El Halo room is mounted (including the Hall of Doors). */
export function useElHaloImmersive() {
  const [on, setOn] = useState(() => isElHaloImmersive());
  useEffect(() => {
    const sync = () => setOn(isElHaloImmersive());
    const unsub = subscribeElHaloActive(sync);
    window.addEventListener('popstate', sync);
    window.addEventListener('bba:navigate', sync);
    sync();
    return () => {
      unsub();
      window.removeEventListener('popstate', sync);
      window.removeEventListener('bba:navigate', sync);
    };
  }, []);
  return on;
}

export function useTableLabel(code, rawName) {
  const { safe } = useModes();
  return displayTableName(code, rawName, safe);
}

export function useSafeText(text) {
  const { safe } = useModes();
  return safe ? familyMask(text) : text;
}

export function useSafeHandle(name, fallback = 'Player') {
  const { safe } = useModes();
  return safe ? familyHandle(name, { fallback }) : name;
}

/** Compact Family / Work toggles for the main-page header (and the work masthead). */
export function ModeToggles({ compact = false, className = '' }) {
  const { family, work, setFamily, setWork } = useModes();
  return (
    <div className={`mode-toggles ${compact ? 'compact' : ''} ${className}`.trim()} data-test="mode-toggles" role="group" aria-label="View modes">
      <button
        type="button"
        className="mode-tog"
        data-test="mode-family"
        aria-pressed={family}
        aria-label={family ? 'Turn Family Mode off' : 'Turn Family Mode on'}
        title="Family Mode hides crude table names and language on this device only"
        onClick={() => setFamily(!family)}
      >
        <span className="mode-full">Family</span>
        <span className="mode-short">Fam</span>
      </button>
      <button
        type="button"
        className="mode-tog"
        data-test="mode-work"
        aria-pressed={work}
        aria-label={work ? 'Turn Work Mode off' : 'Turn Work Mode on'}
        title="Work Mode dresses the site as a shareholder memo, on this device only"
        onClick={() => setWork(!work)}
      >
        Work
      </button>
    </div>
  );
}

/**
 * A small on-page way to turn modes off when the main header is hidden
 * (Work Mode, Mines, Foff, admin). Hidden when both are off, when the
 * header toggles are already visible, and on El Halo (it covers the controls).
 */
export function ModeRail({ always = false } = {}) {
  const { family, work, setFamily, setWork } = useModes();
  const elhalo = useElHaloImmersive();
  if (elhalo) return null;
  if (!always && !family && !work) return null;
  return (
    <div className="mode-rail" data-test="mode-rail" role="status">
      {family && <button type="button" className="mode-rail-chip" data-test="mode-rail-family" onClick={() => setFamily(false)} aria-label="Turn Family Mode off">Family on <span aria-hidden="true">×</span></button>}
      {work && <button type="button" className="mode-rail-chip work" data-test="mode-rail-work" onClick={() => setWork(false)} aria-label="Turn Work Mode off">Work on <span aria-hidden="true">×</span></button>}
      {always && !family && !work && <ModeToggles compact />}
    </div>
  );
}

// Re-export helpers so call sites can import from one module when they already have the flag.
export { displayTableName, familyHandle, familyMask, getModes };
