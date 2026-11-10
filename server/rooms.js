import { GameError } from './engine/game.js';
import { ROOM_ANCHORS, ROOM_THEMES, ROOM_ITEMS, ROOM_ITEM, ROOM_SHELF_IDS, ROOM_SHELF_SPOTS, ROOM_SHELF_SIZES, ROOM_FINISHES,
  ROOM_FURNITURE, ROOM_WALL_SPOTS, defaultWallDisplays, roomWallDisplays, wallMountsFit,
  defaultShelves, roomShelves, roomFinishes, roomAnchors, roomItemFits, wealthStage, defaultFurniture, furnitureValid, roomFurniture, upgradeFurniture, ROOM_PLAN } from './catalog/room.js';

const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const signedIn = player => !!(player?.google || player?.login);
const knownTheme = id => ROOM_THEMES.some(theme => theme.id === id);
const allowedBody = (body, fields) => record(body) && Object.keys(body).every(key => fields.includes(key));
const defaults = () => ({ layoutRevision: 0, themeId: ROOM_THEMES[0].id, placements: [], shelves: defaultShelves(), wallDisplays: defaultWallDisplays(), finishes: roomFinishes(), furniture: defaultFurniture() });
const validFinish = (kind, value) => allowedBody(value, ['typeId', 'colorId'])
  && ROOM_FINISHES[kind].types.some(type => type.id === value.typeId)
  && ROOM_FINISHES[kind].colors.some(color => color.id === value.colorId);
const validShelves = value => Array.isArray(value) && value.length <= ROOM_SHELF_IDS.length
  && new Set(value.map(shelf => shelf?.id)).size === value.length
  && new Set(value.map(shelf => shelf?.spotId)).size === value.length
  && value.every(shelf => allowedBody(shelf, ['id', 'spotId', 'typeId', 'colorId', 'sizeId'])
    && ROOM_SHELF_IDS.includes(shelf.id) && ROOM_SHELF_SPOTS.some(spot => spot.id === shelf.spotId)
    && (!Object.hasOwn(shelf, 'sizeId') || typeof shelf.sizeId === 'string' && Object.hasOwn(ROOM_SHELF_SIZES, shelf.sizeId))
    && validFinish('shelf', { typeId: shelf.typeId, colorId: shelf.colorId }));
const validFinishes = value => allowedBody(value, ['floor', 'rug', 'wardrobe', 'couch'])
  && ['floor', 'rug', 'wardrobe'].every(kind => validFinish(kind, value[kind])) && (!('couch' in value) || validFinish('couch', value.couch));
const validFurniture = value => allowedBody(value, Object.keys(ROOM_FURNITURE))
  && Object.values(value).every(place => allowedBody(place, ['x', 'z', 'r', 'off'])) && !!furnitureValid(value);
const validWallDisplays = value => allowedBody(value, Object.keys(defaultWallDisplays()))
  && Object.keys(defaultWallDisplays()).every(id => ROOM_WALL_SPOTS.some(spot => spot.id === value[id]))
  && new Set(Object.values(value)).size === 2;
const maxPlacements = ROOM_ANCHORS.filter(anchor => anchor.type !== 'shelf').length
  + ROOM_SHELF_IDS.length * Math.max(...Object.values(ROOM_SHELF_SIZES).map(size => size.capacity));

export class Rooms {
  constructor({ store, shop, barn, avatars, netWorth }) {
    this.store = store; this.shop = shop; this.barn = barn; this.avatars = avatars; this.netWorth = netWorth;
    this.doc = store.loadDoc('rooms', { schemaVersion: 1, rooms: {} });
    if (this.doc?.schemaVersion !== 1 || !record(this.doc.rooms)) throw new Error('Unsupported rooms document');
  }
  requirePlayer(player) {
    if (!player || !Object.hasOwn(this.store.players, player.id)) throw new GameError('Please sign in first', 401);
  }
  owned(pid) {
    const own = this.shop.doc.inv[pid]?.own;
    return ROOM_ITEMS.filter(item => own?.[item.id] > 0).map(item => item.id);
  }
  saved(pid) {
    const value = Object.hasOwn(this.doc.rooms, pid) ? this.doc.rooms[pid] : null;
    if (!record(value)) return defaults();
    const shelves = roomShelves(value.shelves), wallDisplays = roomWallDisplays(value.wallDisplays, shelves);
    const furniture = value.plan === ROOM_PLAN ? roomFurniture(value.furniture) : upgradeFurniture(value.furniture, shelves, wallDisplays), availableAnchors = roomAnchors(shelves, furniture);
    const owned = new Set(this.owned(pid)), anchors = new Set(), items = new Set();
    const placements = [];
    for (const place of Array.isArray(value.placements) ? value.placements : []) {
      if (!record(place) || anchors.has(place.anchorId) || items.has(place.itemId)
        || !owned.has(place.itemId) || !roomItemFits(ROOM_ITEM[place.itemId], availableAnchors.find(anchor => anchor.id === place.anchorId))) continue;
      placements.push({ anchorId: place.anchorId, itemId: place.itemId });
      anchors.add(place.anchorId); items.add(place.itemId);
      if (placements.length === availableAnchors.length) break;
    }
    return {
      layoutRevision: Number.isSafeInteger(value.layoutRevision) && value.layoutRevision >= 0 ? value.layoutRevision : 0,
      themeId: knownTheme(value.themeId) ? value.themeId : ROOM_THEMES[0].id,
      placements, shelves, wallDisplays, finishes: roomFinishes(value.finishes), furniture,
    };
  }
  isOpen(pid) {
    const player = this.store.players[pid];
    return !!player && !player.hidden && signedIn(player);
  }
  pet(pid) {
    const pen = this.barn.view(pid).pen;
    if (!pen) return null;
    if (pen.stage === 'egg') return { stage: 'egg' };
    if (!['creature', 'dead'].includes(pen.stage)) return null;
    const out = { stage: pen.stage, species: pen.species, speciesName: pen.speciesName, name: pen.name, level: pen.level };
    if (pen.stage === 'creature' && pen.style) {
      const style = {};
      for (const slot of ['bugskin', 'bughat', 'bugacc']) {
        const look = pen.style[slot]; if (!record(look)) continue;
        style[slot] = { id: look.id, ...(look.shape ? { shape: look.shape } : {}), ...(Array.isArray(look.pal) ? { pal: [...look.pal] } : {}) };
      }
      if (Object.keys(style).length) out.style = style;
    }
    if (pen.stage === 'creature') {
      // The terrarium shows the toy and battle gear in use, a running feeder and a one-word temper; never care timing.
      const kit = this.shop.bugStyle?.(pid) || {};
      for (const slot of ['toy', 'gear']) if (typeof kit[slot] === 'string') out[slot] = kit[slot];
      if (pen.feederUntil > this.barn.view(pid).serverNow) out.feeder = true;
      if (typeof pen.mood === 'string') out.mood = pen.mood;
    }
    return out;
  }
  view(player, own) {
    const saved = this.saved(player.id);
    const currentWorth = this.netWorth(player);
    const worth = Object.fromEntries(['bankroll', 'chips', 'holdings', 'riskEscrow', 'total']
      .filter(key => Number.isFinite(currentWorth[key])).map(key => [key, currentWorth[key]]));
    const out = {
      owner: { id: player.id, name: player.name, avatar: this.avatars.info(player) },
      layoutRevision: saved.layoutRevision, themeId: saved.themeId,
      placements: saved.placements, shelves: saved.shelves, wallDisplays: saved.wallDisplays, finishes: saved.finishes, furniture: saved.furniture, pet: this.pet(player.id), worth,
    };
    const stage = wealthStage(worth.total);
    if (stage !== null) out.wealthStage = stage;
    if (own) out.owned = this.owned(player.id);
    return out;
  }
  owner(player) { this.requirePlayer(player); return this.view(player, true); }
  visit(viewer, player) {
    this.requirePlayer(viewer);
    if (!signedIn(viewer)) throw new GameError('Sign in to an account to visit rooms.', 403);
    if (!player || !this.isOpen(player.id)) throw new GameError('This room is unavailable.', 404);
    return this.view(player, false);
  }
  commit(pid, room) {
    const next = { schemaVersion: 1, rooms: { ...this.doc.rooms, [pid]: room } };
    this.store.saveDoc('rooms', next);
    this.doc = next;
  }
  saveLayout(player, body) {
    this.requirePlayer(player);
    if (!allowedBody(body, ['expectedRevision', 'themeId', 'placements', 'shelves', 'wallDisplays', 'finishes', 'furniture'])
      || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER
      || !knownTheme(body.themeId) || !Array.isArray(body.placements) || body.placements.length > maxPlacements
      || ('shelves' in body && !validShelves(body.shelves)) || ('finishes' in body && !validFinishes(body.finishes))
      || ('furniture' in body && !validFurniture(body.furniture)) || ('wallDisplays' in body && !validWallDisplays(body.wallDisplays))) {
      throw new GameError('Choose a valid room theme and arrangement.', 400);
    }
    const current = this.saved(player.id);
    if (body.expectedRevision !== current.layoutRevision) throw new GameError('Your room changed in another tab. Reload before saving.', 409);
    const shelves = 'shelves' in body ? roomShelves(body.shelves.map(shelf => {
      const previous = current.shelves.find(value => value.id === shelf.id);
      return !Object.hasOwn(shelf, 'sizeId') && previous?.sizeId ? { ...shelf, sizeId: previous.sizeId } : shelf;
    })) : current.shelves;
    const wallDisplays = 'wallDisplays' in body ? { ...body.wallDisplays } : current.wallDisplays;
    const finishes = 'finishes' in body ? roomFinishes(body.finishes) : current.finishes;
    const furniture = 'furniture' in body ? furnitureValid(body.furniture) : current.furniture;
    if (!wallMountsFit(shelves, wallDisplays, furniture)) throw new GameError('Keep shelves and wall displays clear of each other, furniture and the resident.', 400);
    const availableAnchors = roomAnchors(shelves, furniture);
    const owned = new Set(this.owned(player.id)), anchors = new Set(), items = new Set();
    for (const place of body.placements) {
      if (!allowedBody(place, ['anchorId', 'itemId']) || !owned.has(place.itemId)
        || !roomItemFits(ROOM_ITEM[place.itemId], availableAnchors.find(anchor => anchor.id === place.anchorId)) || anchors.has(place.anchorId) || items.has(place.itemId)) {
        throw new GameError('Display each owned oddity once, in a compatible spot.', 400);
      }
      anchors.add(place.anchorId); items.add(place.itemId);
    }
    this.commit(player.id, { ...current, plan: ROOM_PLAN, layoutRevision: current.layoutRevision + 1, themeId: body.themeId,
      placements: body.placements.map(place => ({ anchorId: place.anchorId, itemId: place.itemId })), shelves, wallDisplays, finishes, furniture });
    return this.owner(player);
  }
  forget(pid) {
    if (!Object.hasOwn(this.doc.rooms, pid)) return;
    const rooms = { ...this.doc.rooms }; delete rooms[pid];
    const next = { schemaVersion: 1, rooms };
    this.store.saveDoc('rooms', next);
    this.doc = next;
  }
}
