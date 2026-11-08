// Guntrad the Pit Boss's one-liners (client/src/lines/guntrad-lines.json). Picker logic lives in guntrad-core.js.
// In the anime theme (3 tables in the multi-table view) he speaks only Japanese: guntrad-lines-ja.json has the
// same sets, line for line, so the factoid of the day is the same fact in either language.
import BANK from './lines/guntrad-lines.json';
import BANK_JA from './lines/guntrad-lines-ja.json';
import { makeSayer } from './guntrad-core.js';
import { activeTheme } from './themes/store.js';

export const LINES = BANK;
export const LINES_JA = BANK_JA;
export const bankFor = (theme = activeTheme()) => (theme === 'anime' ? BANK_JA : BANK);
const en = makeSayer(BANK), ja = makeSayer(BANK_JA);
/** Next line from a set ('lines', 'fightIntro', 'fightHit', 'fightBreak', 'fightWin', 'fightLose', 'bust', 'offer'). */
export const guntradSays = (set, opts) => (activeTheme() === 'anime' ? ja : en)(set, opts);
