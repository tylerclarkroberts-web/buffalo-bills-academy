import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getModes, loadModes, setFamily as setFamilyStore, setWork as setWorkStore, subscribeModes } from './store.js';
import { displayTableName, familyHandle, familyMask } from './family.js';
import './modes.css';

const ModesCtx = createContext({
  family: false,
  work: false,
  setFamily: () => {},
  setWork: () => {},
});

export function ModesProvider({ children }) {
  const [modes, setModes] = useState(() => loadModes());
  useEffect(() => subscribeModes((s) => setModes(s)), []);
  const value = useMemo(() => ({
    family: !!modes.family,
    work: !!modes.work,
    setFamily: setFamilyStore,
    setWork: setWorkStore,
  }), [modes.family, modes.work]);
  return <ModesCtx.Provider value={value}>{children}</ModesCtx.Provider>;
}

export function useModes() {
  return useContext(ModesCtx);
}

export function useTableLabel(code, rawName) {
  const { family } = useModes();
  return displayTableName(code, rawName, family);
}

export function useSafeText(text) {
  const { family } = useModes();
  return family ? familyMask(text) : text;
}

export function useSafeHandle(name, fallback = 'Player') {
  const { family } = useModes();
  return family ? familyHandle(name, { fallback }) : name;
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
 * (Work Mode, Mines, El Halo, Foff, admin). Hidden when both are off and the
 * header toggles are already visible.
 */
export function ModeRail({ always = false } = {}) {
  const { family, work, setFamily, setWork } = useModes();
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
