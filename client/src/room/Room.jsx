import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { Link } from '../Shell.jsx';
import { Bust } from '../avatar/Bust.jsx';
import { FitDialog } from '../avatar/FitEditor.jsx';
import { PixIcon } from '../store/PixIcon.jsx';
import { money } from '../util.js';
import { ROOM_THEMES, ROOM_ITEMS, ROOM_ITEM, ROOM_ANCHORS, ROOM_FINISHES, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_WALL_SPOTS, ROOM_FURNITURE, roomAnchors, roomItemFits, shelfSlots, shelfForAnchor } from '../../../server/catalog/room.js';
import { RoomScene } from './scene.js';
import { roomView, nudgeAxes, ROOM_VIEW_LIMITS } from './scene-model.js';
import { layoutOf, layoutKey, addShelf, resizeShelf, moveShelf, moveWallDisplay, removeShelf, changeStyle, furnitureOf, placeFurniture } from './layout.js';
import './room.css';

const WEALTH = ['An empty tray', 'Loose chips and notes', 'Neat chip stacks', 'Stacks and cash bundles', 'A crowded cash tray', 'A full strongbox'];
const left = (ms) => ms > 0 ? `${Math.max(1, Math.ceil(ms / 60000))} min` : 'Ready';
const SHELF_SIZES = [{ id: 'standard', label: 'Small shelf', detail: '1 item' }, { id: 'wide', label: 'Large shelf', detail: '3 items' }];

function ShelfSizes({ value, disabled, onChange }) {
  return <div className="room-choices room-shelf-sizes" role="group" aria-label="Shelf size">{SHELF_SIZES.map(size => <button key={size.id} className="btn room-choice room-shelf-size" aria-pressed={value ? value === size.id : undefined} disabled={disabled} onClick={() => onChange(size.id)}><span>{size.label}</span><small className="muted">{size.detail}</small></button>)}</div>;
}

function StyleChoices({ kind, label, value, onChange, disabled }) {
  const options = ROOM_FINISHES[kind], selected = value || options.default;
  return <div className="room-style-choices">
    <h3>{label} style</h3><div className="room-choices" role="group" aria-label={`${label} style`}>{options.types.map(option => <button key={option.id} className="btn room-choice" aria-label={`${label} style ${option.name}`} aria-pressed={selected.typeId === option.id} disabled={disabled} onClick={() => onChange('typeId', option.id)}>{option.name}</button>)}</div>
    {selected.typeId !== 'none' && <><h3>{label} color</h3><div className="room-colors" role="group" aria-label={`${label} color`}>{options.colors.map(option => <button key={option.id} className="btn ghost room-color" aria-label={`${label} color ${option.name}`} aria-pressed={selected.colorId === option.id} disabled={disabled} onClick={() => onChange('colorId', option.id)}><span aria-hidden="true" style={{ backgroundColor: option.color }} />{option.name}</button>)}</div></>}
  </div>;
}

export default function Room({ id }) {
  const { me, loading } = useSession();
  const owner = !id || id === me?.id;
  const allowed = !!me && (owner || me.signedIn);
  const endpoint = owner ? '/room' : `/players/${encodeURIComponent(id)}/room`;
  const [room, setRoom] = useState(null);
  const [draft, setDraft] = useState(null);
  const base = useRef('');
  const [preview, setPreview] = useState(false);
  const [selection, setSelection] = useState({ kind: 'pet' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sequence = useRef(0);
  const panelSequence = useRef(0), panelRef = useRef(null);
  const epoch = useRef(0);
  const [conflict, setConflict] = useState(false);
  const [barn, setBarn] = useState(null);
  const [shop, setShop] = useState(null);
  const [fitOpen, setFitOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [moneyHovered, setMoneyHovered] = useState(false);
  const [cameraView, setCameraView] = useState(roomView);
  const [activityPaused, setActivityPaused] = useState(false);
  const [speech, setSpeech] = useState(null);
  const speechRef = useRef(null);
  const [clock, setClock] = useState(Date.now());
  const canvas = useRef(null);
  const scene = useRef(null);
  const fitBox = useRef(null);
  const fitButton = useRef(null);
  const hoverTimer = useRef(null);
  const dirty = !!draft && layoutKey(draft) !== base.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const editing = owner && !preview;
  panelRef.current = editing && room ? selection.kind : null;
  const draftRef = useRef(draft), canMoveShelf = useRef(false);
  draftRef.current = draft; canMoveShelf.current = editing && !!draft && !busy && !fitOpen;
  const shiftShelf = useCallback((id, spotId) => {
    if (!canMoveShelf.current) return;
    const current = draftRef.current, next = moveShelf(current, id, spotId);
    if (next === current) return;
    setDraft(next); setSelection({ kind: 'anchor', anchorId: id }); setMsg('Shelf moved with its display. Save room to keep it.');
  }, []);
  const shiftWall = useCallback((id, spotId) => {
    if (!canMoveShelf.current) return;
    const current = draftRef.current, next = moveWallDisplay(current, id, spotId);
    if (next === current) return;
    setDraft(next); setSelection({ kind: 'anchor', anchorId: id }); setMsg('Wall display moved. Save room to keep it.');
  }, []);
  const positionSpeech = useCallback((x, y) => {
    if (!speechRef.current) return;
    speechRef.current.style.left = `${x}px`; speechRef.current.style.top = `${y}px`;
  }, []);
  // Move, turn, store or restore one piece in the draft. Shared by scene dragging and the panel buttons.
  const arrangeFurniture = useCallback((id, change, done) => {
    if (!canMoveShelf.current) return;
    const current = draftRef.current, next = placeFurniture(current, id, change);
    if (next === current) { setMsg(`${ROOM_FURNITURE[id].label} does not fit there. Keep it on clear floor, away from other furniture, shelves, wall displays, the doorway and where you stand on the rug.`); return; }
    setDraft(next); setMsg(done || `${ROOM_FURNITURE[id].label} moved. Save room to keep it.`);
    if (change.off) setSelection({ kind: 'edit' });
  }, []);
  const hoverMoney = useCallback((show) => {
    clearTimeout(hoverTimer.current);
    if (show) setMoneyHovered(true);
    else hoverTimer.current = setTimeout(() => setMoneyHovered(false), 180);
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const loadPanel = useCallback(async () => {
    const kind = panelRef.current;
    if (busyRef.current || !['pet', 'wardrobe'].includes(kind)) return;
    const request = ++panelSequence.current, current = epoch.current;
    const active = () => current === epoch.current && request === panelSequence.current && kind === panelRef.current;
    try {
      const value = await api('GET', kind === 'pet' ? '/barn' : '/shop');
      if (!active()) return;
      if (kind === 'pet') setBarn({ ...value, receivedAt: Date.now() }); else setShop(value);
    } catch (e) { if (active()) setErr(e.message); }
  }, []);

  const load = useCallback(async () => {
    if (!allowed || busyRef.current) return;
    const request = ++sequence.current;
    try {
      const next = await api('GET', endpoint);
      if (request !== sequence.current) return;
      setRoom(next); setErr('');
      if (owner) { refreshSession(); loadPanel(); }
    } catch (e) {
      if (request !== sequence.current) return;
      if ([401, 403, 404].includes(e.status)) setRoom(null);
      if ([401, 403].includes(e.status)) refreshSession();
      setErr(e.message);
    }
  }, [allowed, endpoint, owner, loadPanel]);

  useEffect(() => {
    epoch.current += 1; sequence.current += 1;
    setRoom(null); setDraft(null); setPreview(false); setBarn(null); setShop(null); setFitOpen(false);
    setErr(''); setMsg(''); setConflict(false); setPendingPath(null); setSceneFailed(false); setMoneyHovered(false); setCameraView(roomView());
    busyRef.current = false; setBusy(false);
    if (allowed) load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      epoch.current += 1; sequence.current += 1;
      clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  useEffect(() => { document.title = `${room?.owner.name ? room.owner.name + "'s room" : 'My Room'} · Buffalo Bill's Academy`; }, [room?.owner.name]);

  useEffect(() => {
    if (!dirty) return undefined;
    const path = window.location.pathname + window.location.search;
    const ask = (e) => { if (dirtyRef.current) { e.preventDefault(); setPendingPath(e.detail.path); } };
    const unload = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const back = (e) => {
      if (!dirtyRef.current) return;
      const destination = window.location.pathname + window.location.search;
      if (destination === path) return;
      e.stopImmediatePropagation();
      // shortcut: preserve a room draft by restoring its history entry; replace with router blocking if routing grows.
      window.history.pushState({}, '', path);
      setPendingPath(destination);
    };
    window.addEventListener('bba:navigate', ask);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('popstate', back, true);
    return () => { window.removeEventListener('bba:navigate', ask); window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', back, true); };
  }, [dirty]);

  const sceneView = useMemo(() => room && (!preview && draft ? { ...room, ...draft } : room), [room, preview, draft]);
  useEffect(() => {
    if (!room || !canvas.current) return undefined;
    let renderer;
    try {
      renderer = new RoomScene(canvas.current, { onSelect: setSelection, onMoveShelf: shiftShelf, onMoveWall: shiftWall, onMoveFurniture: arrangeFurniture, onWealthHover: hoverMoney, onSpeech: setSpeech, onSpeechPosition: positionSpeech, onError: () => { setSceneFailed(true); setMoneyHovered(false); setSpeech(null); } });
      scene.current = renderer; setSceneFailed(false);
    } catch { setSceneFailed(true); }
    return () => { renderer?.dispose(); scene.current = null; };
  }, [room?.owner.id, hoverMoney, shiftShelf, shiftWall, arrangeFurniture, positionSpeech]);
  useEffect(() => { if (sceneView) { try { scene.current?.update(sceneView); } catch { setSceneFailed(true); } } }, [sceneView]);
  useEffect(() => { scene.current?.setEditing(editing && !!draft && !busy && !fitOpen, selection); }, [editing, !!draft, busy, fitOpen, selection, room?.owner.id]);
  useEffect(() => { scene.current?.setView(cameraView); }, [cameraView, room?.owner.id]);
  useEffect(() => { scene.current?.setActivityPaused(activityPaused || !!draft || fitOpen); }, [activityPaused, !!draft, fitOpen, room?.owner.id]);

  useEffect(() => {
    if (!moneyHovered) return undefined;
    const dismiss = (e) => { if (e.key === 'Escape') setMoneyHovered(false); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [moneyHovered]);

  useEffect(() => {
    loadPanel();
    return () => { panelSequence.current += 1; };
  }, [editing, !!draft, !!room, room?.pet?.stage, selection.kind, me?.id, loadPanel]);

  useEffect(() => {
    if (!editing || selection.kind !== 'pet') return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [editing, !!draft, selection.kind]);

  useEffect(() => {
    if (!fitOpen) return undefined;
    const previous = document.activeElement;
    const buttons = () => [...(fitBox.current?.querySelectorAll('button:not(:disabled), input, select, a[href]') || [])];
    buttons()[0]?.focus();
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setFitOpen(false); }
      if (e.key !== 'Tab') return;
      const all = buttons(); const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); if (previous?.isConnected) previous.focus(); };
  }, [fitOpen]);

  async function run(action, onSuccess, message) {
    if (busyRef.current) return;
    const current = epoch.current;
    busyRef.current = true; sequence.current += 1; panelSequence.current += 1; setBusy(true); setErr(''); setMsg('');
    try {
      const result = await action();
      if (current !== epoch.current) return;
      onSuccess?.(result); setMsg(message || 'Saved.');
    } catch (e) {
      if (current !== epoch.current) return;
      setErr(e.message); if (e.status === 409 && draft) setConflict(true);
      if (!owner && [401, 403, 404].includes(e.status)) setRoom(null);
    } finally { if (current === epoch.current) { busyRef.current = false; setBusy(false); } }
  }

  function arrange() {
    if (!room || preview || busy) return;
    const next = layoutOf(room); base.current = layoutKey(next); setDraft(next); setConflict(false); setMsg(''); setErr('');
    if (!['anchor', 'wardrobe', 'finish', 'surface'].includes(selection.kind)) setSelection({ kind: 'edit' });
  }
  function place(anchorId, itemId) {
    setDraft((current) => ({ ...current, placements: [...current.placements.filter((p) => p.anchorId !== anchorId && (!itemId || p.itemId !== itemId)), ...(itemId ? [{ anchorId, itemId }] : [])] }));
    setMsg(itemId ? 'Arrangement changed. Save when it feels right.' : 'Returned to storage. You still own it.');
  }
  function discard() { dirtyRef.current = false; setDraft(null); setConflict(false); setErr(''); setMsg('Room layout changes canceled.'); setSelection({ kind: 'pet' }); }
  function save() {
    run(() => api('PATCH', '/room/layout', { expectedRevision: draft.layoutRevision, themeId: draft.themeId, placements: draft.placements, shelves: draft.shelves, wallDisplays: draft.wallDisplays, finishes: draft.finishes, furniture: draft.furniture }), (next) => {
      dirtyRef.current = false; setRoom(next); setDraft(null); setConflict(false); setSelection({ kind: 'pet' });
    }, 'Room saved. Visitors see this arrangement.');
  }
  function care(action) {
    run(async () => {
      const nextBarn = await api('POST', '/barn/care', { action });
      return { barn: nextBarn, room: await api('GET', '/room').catch(() => null) };
    }, (next) => { setBarn({ ...next.barn, receivedAt: Date.now() }); if (next.room) setRoom(next.room); }, 'Your bug appreciates that.');
  }
  function equip(item, wearing) {
    run(async () => {
      const nextShop = await api('POST', '/shop/equip', wearing ? { id: null, slot: item.slot } : { id: item.id });
      const nextRoom = await api('GET', '/room').catch(() => null);
      await refreshSession();
      return { shop: nextShop, room: nextRoom };
    }, (next) => { setShop(next.shop); if (next.room) setRoom(next.room); }, wearing ? 'Taken off. Your outfit changes throughout the Academy.' : 'Wearing it throughout the Academy.');
  }
  function moveView(zoom = 0, rotation = 0) {
    setCameraView((current) => roomView({ zoom: current.zoom + zoom, rotation: current.rotation + rotation }));
  }
  function putShelf(sizeId) {
    if (!draft || busy) return;
    const next = addShelf(draft, undefined, sizeId), added = next.shelves.find(shelf => !draft.shelves.some(current => current.id === shelf.id));
    if (!added) { setMsg('No clear space for that shelf. Move another shelf or furnishing first.'); return; }
    setDraft(next); setSelection({ kind: 'anchor', anchorId: added.id }); setMsg('Shelf added. Drag to move it, or choose something to display.');
  }
  function changeShelfSize(id, sizeId) {
    if (!draft || busy) return;
    const shelf = draft.shelves.find(current => current.id === id);
    if (!shelf || (shelf.sizeId || 'standard') === sizeId) return;
    const next = resizeShelf(draft, id, sizeId);
    if (next === draft) { setMsg('That size needs more room. Drag the shelf to a clear space first.'); return; }
    const resized = next.shelves.find(current => current.id === id);
    setDraft(next);
    if (!shelfSlots(resized).some(slot => slot.id === selection.anchorId)) setSelection({ kind: 'anchor', anchorId: id });
    setMsg(sizeId === 'standard' ? 'Shelf made smaller. Items from the extra slots are back in storage.' : 'Shelf made larger. There is room for three items.');
  }
  function takeShelfOut(id) {
    setDraft(current => current ? removeShelf(current, id) : current);
    setSelection({ kind: 'edit' }); setMsg('Shelf removed. Its items are back in storage. Save room to keep this change.');
  }
  function style(kind, field, value, shelfId) { setDraft(current => current ? changeStyle(current, kind, field, value, shelfId) : current); }
  function cycleMount(direction) {
    if (!draft || busy) return;
    const shelf = shelfForAnchor(draft.shelves, selection.anchorId), id = shelf?.id || selection.anchorId;
    const spots = shelf ? ROOM_SHELF_SPOTS : ROOM_WALL_SPOTS;
    const current = spots.findIndex(spot => spot.id === (shelf?.spotId || draft.wallDisplays[id]));
    for (let step = 1; step < spots.length; step++) {
      const spot = spots[(current + direction * step + spots.length) % spots.length];
      const next = shelf ? moveShelf(draft, id, spot.id) : moveWallDisplay(draft, id, spot.id);
      if (next === draft) continue;
      setDraft(next); setMsg('Moved to the next clear spot. Save room to keep it.'); return;
    }
    setMsg('No other clear spot. Move another furnishing first.');
  }

  if (loading) return <div className="screen center-screen muted">Opening the room…</div>;
  if (!allowed) return <div className="screen center-screen room-auth"><h1 className="western">{owner ? 'My Room' : 'Visit a room'}</h1><p>Sign in {owner ? 'to make yourself at home.' : 'with an account to visit another player’s room.'}</p><SignIn next={owner ? '/room' : `/rooms/${id}`} /></div>;
  if (!room) return <div className="screen center-screen"><h1 className="western">{owner ? 'My Room' : 'Room unavailable'}</h1><p className={err ? 'error' : 'muted'} role={err ? 'alert' : undefined}>{err || 'Opening the front door…'}</p>{err && <button className="btn" onClick={load}>Try again</button>}</div>;

  const display = sceneView;
  const anchors = roomAnchors(display.shelves, display.furniture);
  const pet = display.pet;
  const selectedAnchor = anchors.find((a) => a.id === selection.anchorId);
  const selectedShelf = shelfForAnchor(display.shelves, selection.anchorId);
  const selectedShelfLabel = selectedShelf && ROOM_ANCHORS.find(anchor => anchor.id === selectedShelf.id)?.label;
  const displayedItem = ROOM_ITEM[display.placements.find((p) => p.anchorId === selection.anchorId)?.itemId];
  const owned = ROOM_ITEMS.filter((item) => room.owned?.includes(item.id));
  const selectedItem = draft?.placements.find((p) => p.anchorId === selection.anchorId)?.itemId || '';
  const privatePet = editing ? barn?.pen : null;
  const elapsed = barn ? Math.max(0, clock - barn.receivedAt) : 0;
  const surfaceLabel = selection.surface === 'floor' ? 'Floor' : 'Rug';
  const pieceId = editing && draft ? furnitureOf(selection) : null, piece = ROOM_FURNITURE[pieceId], piecePlace = draft?.furniture[pieceId];
  const stored = editing && draft ? Object.keys(ROOM_FURNITURE).filter(id => draft.furniture[id].off) : [];
  const steps = nudgeAxes(cameraView.rotation);
  const nudge = ([x, z], sign) => arrangeFurniture(pieceId, { x: piecePlace.x + x * sign * 0.25, z: piecePlace.z + z * sign * 0.25 });
  const panelTitle = selection.kind === 'add-shelf' ? 'Add a shelf' : selection.kind === 'surface' ? surfaceLabel : selection.kind === 'edit' ? 'Edit room' : selection.kind === 'finish' ? 'Wall finish' : selection.kind === 'pet' ? 'The terrarium' : selection.kind === 'wardrobe' ? 'Wardrobe & mirror' : selection.kind === 'wealth' ? 'Chips & cash' : selection.kind === 'anchor' ? selectedShelfLabel || selectedAnchor?.label || 'Display spot' : editing ? 'Your collection' : 'On display';
  const editTargets = [{ label: 'Walls', target: { kind: 'finish' } }, { label: 'Floor finish', target: { kind: 'surface', surface: 'floor' } }, { label: 'Rug', target: { kind: 'surface', surface: 'rug' } }, ...anchors.filter(anchor => !anchor.shelfId || anchor.id === anchor.shelfId).map(anchor => ({ label: ROOM_ANCHORS.find(base => base.id === anchor.id)?.label || anchor.label, target: { kind: 'anchor', anchorId: anchor.id } })), { label: 'Wardrobe', target: { kind: 'wardrobe' } }, { label: 'Pet', target: { kind: 'pet' } }, { label: 'Cash table', target: { kind: 'wealth' } }];

  return <div className="screen room-page" data-test="personal-room">
    <header className="room-heading">
      <div><p className="kicker">A little place in the Academy</p><h1 className="western">{owner ? 'My Room' : `${room.owner.name}’s room`}</h1></div>
      {owner && <div className="room-heading-actions">
        <button className="btn ghost" onClick={() => { setPreview(!preview); setSelection({ kind: 'pet' }); setFitOpen(false); }} aria-pressed={preview} disabled={busy}>{preview ? 'Back to my room' : 'Preview as visitor'}</button>
        {!preview && !draft && <button className="btn" onClick={arrange} disabled={busy}>Edit room</button>}
      </div>}
    </header>
    {preview && <p className="room-note" role="status">Visitor preview · your saved arrangement, outfit, pet, displays and wealth.</p>}
    {!owner && <p className="room-note">Make yourself at home. You can look around; only {room.owner.name} can change this room.</p>}
    {pendingPath && <div className="room-leave" role="alert"><p>You have an unsaved arrangement. Keep decorating or discard it before leaving?</p><div className="room-actions"><button className="btn" onClick={() => setPendingPath(null)}>Keep editing</button><button className="btn ghost" onClick={() => { const destination = pendingPath; dirtyRef.current = false; setDraft(null); setPendingPath(null); navigate(destination); }}>Discard and leave</button></div></div>}
    {editing && draft && <div className="room-arrange">
      <p className="small">Drag furniture, shelves or wall displays to move them. Click something glowing to change it. Save when the room feels right.</p>
      <div className="room-actions"><button className="btn ghost" onClick={() => setSelection({ kind: 'add-shelf' })} disabled={busy || draft.shelves.length >= ROOM_SHELF_IDS.length}>Add shelf · {draft.shelves.length}/{ROOM_SHELF_IDS.length}</button><button className="btn" onClick={dirty ? save : () => { setDraft(null); setSelection({ kind: 'pet' }); }} disabled={busy}>{dirty ? 'Save room' : 'Done editing'}</button><button className="btn ghost" onClick={discard} disabled={busy}>Cancel edits</button></div>
    </div>}
    <div className="room-body">
      <section className="room-view" aria-label="Your room scene">
        <div className="room-camera" role="group" aria-label="Room view" data-test="room-view-controls">
          <button className="btn ghost" aria-label="Rotate left" title="Rotate left" disabled={sceneFailed} onClick={() => moveView(0, -15)}>↶</button>
          <button className="btn ghost" aria-label="Rotate right" title="Rotate right" disabled={sceneFailed} onClick={() => moveView(0, 15)}>↷</button>
          <button className="btn ghost" aria-label="Zoom out" title="Zoom out" disabled={sceneFailed || cameraView.zoom <= ROOM_VIEW_LIMITS.minZoom} onClick={() => moveView(-0.25)}>−</button>
          <output aria-label="Room zoom" aria-live="polite" data-test="room-zoom">{Math.round(cameraView.zoom * 100)}%</output>
          <button className="btn ghost" aria-label="Zoom in" title="Zoom in" disabled={sceneFailed || cameraView.zoom >= ROOM_VIEW_LIMITS.maxZoom} onClick={() => moveView(0.25)}>+</button>
          <button className="btn ghost" aria-label="Reset view" title="Reset view" disabled={sceneFailed} onClick={() => setCameraView(roomView())}>⌂</button>
          <button className="btn ghost room-activity-toggle" aria-pressed={activityPaused} disabled={sceneFailed} onClick={() => setActivityPaused(value => !value)}>{activityPaused ? 'Resume activity' : 'Pause activity'}</button>
        </div>
        <div className={`room-canvas-wrap ${sceneFailed ? 'room-scene-unavailable' : ''}`}><canvas ref={canvas} className="room-canvas" role="img" tabIndex={editing && draft ? 0 : undefined} aria-keyshortcuts={editing && draft ? 'ArrowUp ArrowDown ArrowLeft ArrowRight' : undefined} aria-label="A western cutaway room. Use the view controls to zoom and turn, or the named room controls to inspect objects. In edit mode, select an object, focus the room and use arrow keys to move." title={editing && draft ? 'Select an object, then focus the room and use arrow keys to move.' : undefined} data-test="room-canvas" />{speech && !sceneFailed && <div ref={speechRef} className="room-speech" role="status" aria-label={speech.speaker === 'faun' ? 'A shy faun says' : `${room.owner.name} says`} style={{ left: speech.x, top: speech.y }}>{speech.text}</div>}{sceneFailed && <p className="room-fallback">The 3D view is unavailable here. Your room and all its controls are still available below.</p>}{moneyHovered && <div className="room-money-tooltip" role="tooltip" id="room-money-tooltip" onPointerEnter={() => hoverMoney(true)} onPointerLeave={() => hoverMoney(false)}><strong>Cash: {money(display.worth?.bankroll)}</strong><span>Chips at tables: {money(display.worth?.chips)}</span></div>}</div>
        {editing && draft ? <nav className="room-edit-targets" aria-label="Editable room objects">
          {editTargets.map(({ label, target }) => <button key={label} className="btn ghost small" aria-pressed={selection.kind === target.kind && (selection.anchorId === target.anchorId || selectedShelf?.id === target.anchorId) && selection.surface === target.surface} disabled={busy} onClick={() => setSelection(target)}>{label}</button>)}
        </nav> : <nav className="room-destinations" aria-label="Room objects">{[['pet', 'Pet'], ['wardrobe', 'Wardrobe'], ['collection', editing ? 'Collection' : 'Displays'], ['wealth', 'Chips & cash']].map(([kind, title]) => <button key={kind} className={`btn ${selection.kind === kind ? '' : 'ghost'}`} aria-pressed={selection.kind === kind} aria-describedby={kind === 'wealth' && moneyHovered ? 'room-money-tooltip' : undefined} onPointerEnter={kind === 'wealth' ? () => hoverMoney(true) : undefined} onPointerLeave={kind === 'wealth' ? () => hoverMoney(false) : undefined} onFocus={kind === 'wealth' ? () => hoverMoney(true) : undefined} onBlur={kind === 'wealth' ? () => hoverMoney(false) : undefined} onClick={() => setSelection({ kind })}>{title}</button>)}</nav>}
        <p className="small muted room-caption">{editing && draft ? 'Drag to move. Click to change styles, colors and displays. Save room to keep your arrangement.' : 'Your resident is just enjoying the room. Select a furnishing to take a closer look.'}</p>
      </section>
      <section className="room-detail panel" aria-label={panelTitle} data-test="room-detail">
        <h2 className="western">{panelTitle}</h2>
        {piece && (piecePlace.off ? <button className="btn" disabled={busy} onClick={() => arrangeFurniture(pieceId, { off: false }, `${piece.label} is back in the room. Save room to keep it.`)}>Put the {piece.label.toLowerCase()} back</button> : <div className="room-style-choices" data-test="room-furniture-controls">
          <h3>Move the {piece.label.toLowerCase()}</h3>
          <div className="room-actions" role="group" aria-label={`Move the ${piece.label.toLowerCase()}`}>
            {[['←', 'left', steps.right, -1], ['↑', 'back', steps.away, 1], ['↓', 'forward', steps.away, -1], ['→', 'right', steps.right, 1]].map(([arrow, name, step, sign]) => <button key={name} className="btn ghost" aria-label={`Move ${name}`} title={`Move ${name}`} disabled={busy} onClick={() => nudge(step, sign)}>{arrow}</button>)}
            <button className="btn ghost" disabled={busy} onClick={() => arrangeFurniture(pieceId, { r: (piecePlace.r + 1) % 4 }, `${piece.label} turned. Save room to keep it.`)}>Turn</button>
            {piece.removable && <button className="btn ghost" disabled={busy} onClick={() => arrangeFurniture(pieceId, { off: true }, `${piece.label} put away${pieceId === 'desk' ? ', with anything displayed on it back in storage' : ''}. Save room to keep this change.`)}>Put away</button>}
          </div>
          <p className="small muted">Arrows follow the current view. You can also drag the {piece.label.toLowerCase()} directly in the scene.{piece.removable ? ' Put it away to clear the floor; Edit room offers it back.' : ''}</p>
        </div>)}
        {selection.kind === 'edit' && <><p>Drag to move. Click a glowing object to make it yours.</p><p className="small muted">Use Add shelf for a small or large shelf. Furniture, styles, paint and displays save together; pet care and clothing changes save immediately.</p>{stored.map(id => <button key={id} className="btn ghost" disabled={busy} onClick={() => arrangeFurniture(id, { off: false }, `${ROOM_FURNITURE[id].label} is back in the room. Save room to keep it.`)}>Put the {ROOM_FURNITURE[id].label.toLowerCase()} back</button>)}</>}
        {selection.kind === 'add-shelf' && editing && draft && <><p className="small muted">Choose a size. We’ll find a clear spot, then you can drag it where you like.</p><ShelfSizes disabled={busy || draft.shelves.length >= ROOM_SHELF_IDS.length} onChange={putShelf} /><p className="small muted">Free · {draft.shelves.length} of {ROOM_SHELF_IDS.length} shelves in use.</p></>}
        {selection.kind === 'surface' && editing && draft && <StyleChoices kind={selection.surface} label={surfaceLabel} value={draft.finishes[selection.surface]} disabled={busy} onChange={(field, value) => style(selection.surface, field, value)} />}
        {selection.kind === 'finish' && editing && draft && <><p className="small muted">Choose a free wall finish.</p><div className="room-choices">{ROOM_THEMES.map((theme) => <button key={theme.id} className="btn room-choice" aria-pressed={draft.themeId === theme.id} disabled={busy} onClick={() => setDraft({ ...draft, themeId: theme.id })}>{theme.name}</button>)}</div></>}
        {selection.kind === 'pet' && <>
          {!pet ? <><p>The terrarium is waiting for a resident.</p>{editing && <Link to="/barn" className="btn ghost">Visit the Barn</Link>}</> : pet.stage === 'egg' ? <><p>A speckled egg from the mines. Its resident is still a surprise.</p>{editing && privatePet?.stage === 'egg' && <><p className="small muted">Keeping it warm is a kind gesture; it does not speed up hatching.</p><button className="btn" disabled={busy || privatePet.warmCoolMs > elapsed} onClick={() => care('play')}>Keep it warm {privatePet.warmCoolMs > elapsed ? `· ${left(privatePet.warmCoolMs - elapsed)}` : ''}</button></>}</> : <><h3>{pet.name}</h3><p className="small muted">{pet.speciesName} · Level {pet.level}</p>{pet.stage === 'dead' ? <><p>A small memorial to your resident.</p>{editing && <Link to="/barn" className="btn ghost">Visit the memorial in the Barn</Link>}</> : editing && privatePet?.stage === 'creature' ? <>
            <dl className="room-needs">{[['hunger', 'Fed'], ['mood', 'Mood'], ['clean', 'Clean']].map(([key, name]) => <div key={key}><dt>{name}</dt><dd><meter min="0" max="100" value={privatePet.needs[key]} aria-label={name} /><span className="num">{privatePet.needs[key]}%</span></dd></div>)}</dl>
            {privatePet.starving > 0 && <p className="room-warning">Your bug needs food. Visit the Barn for its care details.</p>}
            <div className="room-actions">{[['feed', 'Feed'], ['play', 'Play'], ['clean', 'Mist']].map(([action, name]) => <button key={action} className="btn" onClick={() => care(action)} disabled={busy || privatePet.cool[action] > elapsed}>{name}{privatePet.cool[action] > elapsed ? ` · ${left(privatePet.cool[action] - elapsed)}` : ''}</button>)}</div>
            <p className="small muted">Free care, with the same cooldowns and XP rules as the Barn. These actions apply immediately.</p><Link to="/barn" className="btn ghost">More pet details</Link>
          </> : <p className="small muted">{editing ? 'Opening the terrarium…' : 'The owner takes care of this resident.'}</p>}</>}
          {editing && <Link to="/store" className="small">Bug food, toys, style and care supplies →</Link>}
        </>}
        {selection.kind === 'wardrobe' && <>
          {editing && draft && <><StyleChoices kind="wardrobe" label="Wardrobe" value={draft.finishes.wardrobe} disabled={busy} onChange={(field, value) => style('wardrobe', field, value)} /><p className="small muted">Furniture changes save with the room. Clothing changes below save immediately.</p></>}
          <div className="room-outfit"><Bust id={room.owner.id} avatar={room.owner.avatar} size={110} still title={`${room.owner.name}'s current outfit`} /><p className="small muted">{editing ? 'Your worn outfit appears throughout the Academy. Wearing and fitting save immediately.' : 'The current outfit. The rest of the wardrobe stays private.'}</p></div>
          {editing && (!shop ? <p className="muted small">Opening the wardrobe…</p> : <>
            <div className="room-clothes">{shop.items.filter((item) => item.kind === 'avatar' && shop.own[item.id]).map((item) => { const worn = shop.eq[item.slot] === item.id; return <div className="room-clothing" key={item.id}><span>{item.name}<small className="muted">{worn ? 'Wearing' : 'Owned'}</small></span><button className="btn ghost small" disabled={busy} onClick={() => equip(item, worn)} aria-label={`${worn ? 'Take off' : 'Wear'} ${item.name}`}>{worn ? 'Take off' : 'Wear'}</button></div>; })}{!shop.items.some((item) => item.kind === 'avatar' && shop.own[item.id]) && <p className="muted small">Your wardrobe is ready for its first purchase.</p>}</div>
            {shop.items.some((item) => item.kind === 'avatar' && item.slot !== 'skin' && shop.eq[item.slot] === item.id) && <button className="btn ghost" ref={fitButton} onClick={() => setFitOpen(true)} disabled={busy}>Fit accessories</button>}
            <Link to="/store" className="btn ghost">Browse the General Store</Link>
          </>)}
        </>}
        {selection.kind === 'wealth' && <>
          <h3>{Number.isInteger(display.wealthStage) ? WEALTH[display.wealthStage] : 'A decorative tray'}</h3>
          <p className="room-worth num">{money(display.worth?.total)}</p><p className="small muted">In-game wealth · play money only</p><dl className="room-money">{[['bankroll', 'Cash'], ['chips', 'Chips at tables'], ['holdings', 'Investments'], ['riskEscrow', 'Risk stakes']].map(([key, name]) => <div key={key}><dt>{name}</dt><dd className="num">{money(display.worth?.[key])}</dd></div>)}</dl><p className="small muted">Moving cash onto a table keeps it in the total. Hover over the pile for cash and chips, or select it for this breakdown.</p>
        </>}
        {selection.kind === 'collection' && <>
          <p className="small muted">{editing && draft ? 'Choose a spot, then choose an owned oddity. Removing it from display keeps it in storage.' : 'Select a display to inspect it.'}</p>
          <div className="room-spots">{anchors.map((anchor) => { const item = ROOM_ITEM[display.placements.find((p) => p.anchorId === anchor.id)?.itemId]; return <button className="room-spot" key={anchor.id} onClick={() => setSelection({ kind: 'anchor', anchorId: anchor.id })}>{item && <PixIcon pix={item.pix} size={32} />}<span>{anchor.label}<small>{item?.name || 'Empty spot'}</small></span></button>; })}</div>
          {editing && <><h3>In your collection</h3>{owned.length ? <ul className="room-storage">{owned.map((item) => <li key={item.id}>{item.name}<span className="small muted">{display.placements.some((p) => p.itemId === item.id) ? 'On display' : 'In storage'}</span></li>)}</ul> : <p className="small muted">No oddities yet. Your furnished room is yours all the same.</p>}<Link to="/store" className="small">Find an oddity at the General Store →</Link></>}
        </>}
        {selection.kind === 'anchor' && <>
          {editing && draft && selectedShelf && <>
            <p className="small muted room-drag-hint"><strong>Drag to move.</strong> Everything on the shelf moves with it.</p>
            <ShelfSizes value={selectedShelf.sizeId || 'standard'} disabled={busy} onChange={sizeId => changeShelfSize(selectedShelf.id, sizeId)} />
            <StyleChoices kind="shelf" label={selectedShelfLabel} value={selectedShelf} disabled={busy} onChange={(field, value) => style('shelf', field, value, selectedShelf.id)} />
            {shelfSlots(selectedShelf).length > 1 && <div className="room-choices room-shelf-slots" role="group" aria-label={`${selectedShelfLabel} item slots`}>{shelfSlots(selectedShelf).map((slot, index) => { const item = ROOM_ITEM[display.placements.find(place => place.anchorId === slot.id)?.itemId]; return <button key={slot.id} className="btn room-choice room-shelf-slot" aria-label={`${slot.label}: ${item?.name || 'Empty slot'}`} aria-pressed={selection.anchorId === slot.id} disabled={busy} onClick={() => setSelection({ kind: 'anchor', anchorId: slot.id })}><span className="room-slot-label">Slot {index + 1}</span>{item && <PixIcon pix={item.pix} size={24} />}<span className="room-slot-item">{item?.name || 'Empty slot'}</span></button>; })}</div>}
            <button className="btn ghost small" disabled={busy} onClick={() => takeShelfOut(selectedShelf.id)}>Remove shelf</button>
          </>}
          {editing && draft && selectedAnchor?.type === 'wall' && <>
            <p className="small muted room-drag-hint"><strong>Drag to move.</strong> Choose what to hang here below.</p>
          </>}
          {editing && draft && sceneFailed && (selectedShelf || selectedAnchor?.type === 'wall') && <div className="room-actions" role="group" aria-label="Move to a clear wall spot"><button className="btn ghost small" disabled={busy} onClick={() => cycleMount(-1)}>Previous clear spot</button><button className="btn ghost small" disabled={busy} onClick={() => cycleMount(1)}>Next clear spot</button></div>}
          {editing && draft ? <p className="small muted">Choose what to display here. Everything below fits this spot.</p> : displayedItem ? <><div className="room-oddity"><PixIcon pix={displayedItem.pix} size={64} /><h3>{displayedItem.name}</h3></div><p>{displayedItem.desc}</p><p className="small muted">Room decoration · no gameplay bonus.</p></> : <p className="muted">Nothing on display here yet.</p>}
          {editing && draft && selectedAnchor && <div className="room-choices" role="group" aria-label={`Choose a display for ${selectedAnchor.label}`}><button className="btn room-choice" aria-pressed={!selectedItem} disabled={busy} onClick={() => place(selectedAnchor.id, '')}>Leave empty</button>{owned.filter((item) => roomItemFits(item, selectedAnchor)).map((item) => { const currentSpot = display.placements.find((p) => p.itemId === item.id)?.anchorId; return <button key={item.id} className="btn room-choice" aria-pressed={selectedItem === item.id} disabled={busy} onClick={() => place(selectedAnchor.id, item.id)}><PixIcon pix={item.pix} size={36} /><span>{item.name}{currentSpot && currentSpot !== selectedAnchor.id && <small className="muted">Move from {anchors.find((a) => a.id === currentSpot)?.label}</small>}</span></button>; })}</div>}
          {editing && !draft && <button className="btn" disabled={busy} onClick={arrange}>Edit room</button>}
          {(!editing || !draft) && <button className="btn ghost" onClick={() => setSelection({ kind: 'collection' })}>All displays</button>}
        </>}
      </section>
    </div>
    {!preview && <div className="room-feedback" aria-live="polite">{err && <p className="error" role="alert">{err}</p>}{msg && <p role="status">{msg}</p>}{conflict && draft && <button className="btn ghost" disabled={busy} onClick={() => { discard(); load(); }}>Load saved room and discard my arrangement</button>}</div>}
    {editing && <section className="room-sharing panel" aria-label="Room link">
      <div><h2 className="western">The front door</h2><p className="small muted">Any signed-in player can visit your room and see your cash and chips. Only you can change things.</p></div>
      {!me.signedIn ? <div className="room-account-signin"><p className="small muted">Sign in with an account so friends can visit.</p><SignIn compact next="/room" /></div> : <div className="room-link"><label>Room link<input readOnly value={`${window.location.origin}/rooms/${room.owner.id}`} onFocus={(e) => e.target.select()} /></label><button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.owner.id}`); setMsg('Room link copied. Visitors must sign in.'); } catch { setMsg('Select the room link to copy it.'); } }}>Copy link</button></div>}
    </section>}
    {editing && fitOpen && shop && <div ref={fitBox}><FitDialog me={me} shop={shop} onClose={() => setFitOpen(false)} onSaved={(next) => { panelSequence.current += 1; setShop(next); load(); }} /></div>}
  </div>;
}
