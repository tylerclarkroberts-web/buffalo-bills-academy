// Setup helpers for the SCUM create page and lobby Deal button. Kept here so tests can import them without the React page.
/** Host + 2 bots fills a 3-player table, so Open & deal can fire immediately. Fewer bots: open a lobby and invite friends. */
export const canDealNow = (bots) => Number(bots) >= 2;
/** Humans already seated plus bots reserved for the deal. Scum needs 3. */
export const canStartDeal = (seated, bots = 0) => Number(seated) + Number(bots || 0) >= 3;

/** Seat on the felt, in percent. You are k=0 at the bottom. The ring stays under the
 *  status line and above the pile; the north turn chip is anchored to the avatar, not the fan. */
export function seatXY(k, n, tall) {
  const ang = ((90 + (360 * k) / n) * Math.PI) / 180;
  const rx = tall ? 40 : 43, ry = tall ? 32 : 33;
  return { x: 50 + rx * Math.cos(ang), y: (tall ? 51 : 53) + ry * Math.sin(ang) };
}
