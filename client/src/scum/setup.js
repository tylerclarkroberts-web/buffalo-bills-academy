// Setup helpers for the SCUM create page and lobby Deal button. Kept here so tests can import them without the React page.
/** Host + 2 bots fills a 3-player table, so Open & deal can fire immediately. Fewer bots: open a lobby and invite friends. */
export const canDealNow = (bots) => Number(bots) >= 2;
/** Humans already seated plus bots reserved for the deal. Scum needs 3. */
export const canStartDeal = (seated, bots = 0) => Number(seated) + Number(bots || 0) >= 3;
