# ConquestK links and Risk bets

The **Risk bets** navigation opens `/conquest`, with a link to play ConquestK, account linking, upcoming match odds, and your private bet history. The two sites keep their accounts, games, databases, and deployments separate. This integration does not turn Academy play money into ConquestK rating points or real money.

## Player flow

Sign in to an Academy account and choose **Link ConquestK account**. Sign in to ConquestK and approve the link there. The callback confirms that you still control the original Academy session. Existing names, passwords, avatars, bankrolls, and game histories are retained. Guest browser-token accounts must sign in to a registered account before linking or wagering.

Eligible public Classic free-for-all matches open a visible two-minute betting window when the human roster fills. ConquestK owns that window, game-start rules, and the roster snapshot. Participants can only back themselves; spectators can back any quoted player. Place one bet per market generation, with no top-ups, changes, or user cancellation. A voided generation must refund before another active wager on the same match can be placed.

Choose a player and a stake, then **Review bet**. The confirmation shows the stake, decimal multiplier, total return including the original stake, and net profit. Quotes expire after at most 60 seconds, and always by the market cutoff. A quote does not reserve house capacity. An expired quote, unavailable capacity, or insufficient balance never silently changes the accepted price or stake.

While acceptance is being confirmed, the stake is held and the bet says **Confirming — stake held**. A connection timeout is not a rejected bet. Keep the existing bet and let it recover; no second wager is needed. The history updates after ConquestK provides its durable decision and result.

## Pricing and limits

Pricing model `cr-strength-v1` freezes the roster and current Conquest Rankings when the market opens:

```text
strength(player) = 10 ^ ((rating(player) - highest_rating) / 400)
estimated_probability(player) = strength(player) / sum(all strengths)
odds_hundredths = floor(min(20, 0.95 / estimated_probability) * 100)
gross_return_cents = floor(stake_cents * odds_hundredths / 100)
```

These are rating-based estimates, not a calibrated model of multiplayer win probability. ConquestK's Elo expected-placement score is not used as an outright-win probability. Outcomes below 1.01× are unavailable. New accounts use their actual stored rating; missing or malformed ratings disable the market.

- Stake: $1–$100 in whole cents, subject to a maximum $1,000 gross return per bettor/match.
- Maximum quoted multiplier: 20.00×. The maximum stake decreases where necessary to respect the return cap.
- Maximum gross liability on any possible winner in a market: $10,000.
- Maximum sum of market liabilities across unresolved markets: $25,000.
- Pending reservations count toward every limit.

The synthetic house can create or remove play money. These caps bound outstanding exposure, not lifetime issuance. There is no funded reserve, cash redemption, purchase, user transfer, or rating reward.

## Outcomes, privacy, and account changes

A winner receives the quoted gross return, a loser receives nothing, and a void receives the original stake. ConquestK supplies the immutable canonical result. Changed rosters/settings, cancellation, failed starts, invalid winners, and the authoritative 30-day completion timeout produce voids. Academy never invents a result because a request failed or a record lookup was unavailable. A match completed before the deadline still pays if Academy reconnects afterward. Later administrative purges do not rewrite a previously finalized financial outcome.

Individual bets, choices, bet history, and the named Risk-escrow breakdown are returned only to their authenticated owner. Public match rosters and odds remain public. Existing public bankroll and total-net-worth features remain; net worth now includes the original value of unsettled Risk stakes, not potential winnings. Existing public totals can still reveal balance changes.

Unresolved bets block unlinking and account deletion, including the existing operator deletion path. Once an account has redeemed a link or wagered, its retained history blocks destructive account deletion even after unlinking and settlement; the player must contact the Academy operator for anonymization while retaining the ledger. This release does not add an automatic anonymization workflow. Legacy guest-account claiming cannot discard a link or bet ledger. A durable retention marker is written before link redemption, including an uncertain exchange, and survives a revoked link disappearing from ConquestK's active-link lookup. Pending link requests also block deletion; link creation, redemption, and revocation are serialized per Academy player. The account link uses immutable IDs, not a matching display name/email; limits are per linked account, not verified physical identity.

## Configuration and rollout

| Variable | Behavior |
| --- | --- |
| `CONQUESTK_URL` | ConquestK origin; defaults to `https://conquestk.com`. HTTPS is required except localhost development. |
| `CONQUESTK_SERVICE_TOKEN` | Dedicated server-to-server bearer credential of at least 32 characters. Never expose it to browsers, logs, screenshots, or fixtures. |
| `CONQUESTK_BETTING_ENABLED` | `true` or `1` enables new bets; default is disabled. |
| `CONQUESTK_PILOT_PLAYER_IDS` | Optional comma-separated Academy player IDs permitted to place new bets. Empty means all linked registered accounts. |
| `PUBLIC_URL` | Existing Academy public origin; required for account linking and must match ConquestK's fixed callback configuration. |

The production Academy origin is `https://buffalobillsacademy.com`. Set `PUBLIC_URL` to that origin and configure ConquestK's fixed callback as `https://buffalobillsacademy.com/auth/conquest/callback`. For local integration testing, use a separate localhost origin and callback in both applications. Linking, polling, existing admission recovery, and settlement remain active with the service credential configured even when new bets are disabled. The browser uses Academy's own origin and cookie; no cross-origin browser credentials or shared sessions are needed.

Release both applications with new betting disabled, verify linked-account and market reads, then use a small pilot allowlist before enabling everyone. Preserve a fresh copy of Academy's data directory and a ConquestK backup before rollout. Stopping new betting is a kill switch, not a refund or settlement shutdown. Publishing or merging the public Academy repository does not deploy the live site; its maintainer must perform and verify that release separately.

## Persistence and recovery

Durable Academy data lives only on each player record's `conquest` field in `players.json`: the link/cache, session-bound link request/receipt, and immutable wager terms, admissions, and terminal receipts. Existing player files require no destructive migration. Do not delete the ledger or use the capped transaction-display history as an idempotency record.

Every financial change stages a complete player-file snapshot, flushes the temporary file, atomically renames it, and only then publishes the changed bankroll/transaction/ConquestK fields in memory. Existing player and holdings object references survive the commit. A failed write disables further wagering until the process is recovered; it never publishes a phantom stake or credit. Malformed stored Risk state also fails wagering closed while unrelated account/game routes remain available.

Admission order is: persist stake hold and pending intent → ask ConquestK to durably accept/reject under its game-start lock → persist acceptance or a refund. The quote UUID is the stable intent ID. Retries use the identical terms. A lost response remains pending; only a durable rejection permits a refund. A lookup returning "not found" is not sufficient because an earlier request may still arrive.

Every five-second sweep retries pending intents, then fetches each unresolved market by its exact ID. Once all pending decisions for a market are resolved, its canonical terminal receipt and all affected balances/settlement markers are committed together. Replay cannot pay twice, even after restart or an outage through game completion. A market is not locally completed while an admission remains unresolved. A transport failure stops that recovery sweep instead of multiplying timeouts; the next sweep retries. After unresolved money is handled, at most one completed market is refreshed per sweep in rotation for eventual display-name anonymization.

This remains a single-process JSON store. It does not support multiple writers or concurrent replicas sharing the data directory. File flushing and rename improve process-crash consistency; power-loss and mounted-volume guarantees require deployment-specific verification. This feature does not retrofit transactions across existing poker/blackjack/other feature files.

Recovery emits structured `conquest_recovery_failure` and `conquest_ledger_status` server logs when status changes. They include pending count/age, gross exposure, recovery failures, refunds, and net issuance from the retained player ledger; no credential, session, or bet selections are logged. These are operational diagnostics, not an additional dashboard. Historical market reads also update anonymized player display names without changing frozen IDs, ratings, or payouts.

## HTTP contract

Browser routes are same-origin JSON. Mutations require a registered session and an exact `Origin` match; guest tokens cannot invoke them.

| Route | Request / response |
| --- | --- |
| `GET /api/conquest` | Public market list; authenticated owner's link, bets, bankroll, and escrow only. Includes `serverTime`, `canBet`, and connection status. |
| `POST /api/conquest/link` | `{}` → `{authorizeUrl}`. |
| `POST /api/conquest/unlink` | `{}` → `{unlinked:true}`; unresolved bets return 409. |
| `POST /api/conquest/quotes` | `{marketId,outcomeUserId,stakeCents}` → `{quote:{id,expiresAt,...terms}}`. |
| `POST /api/conquest/bets` | `{quoteId}` → `{bet}`; 202 means the durable hold is awaiting a decision. Identical retries return the existing receipt. |
| `GET /auth/conquest/callback` | One-use `code` and session-bound `state`; redirects to the Risk page. |

The server uses `Authorization: Bearer <credential>` at `/api/integrations/academy/v1` on ConquestK. All timestamps are RFC3339 UTC strings. It reads `/markets`, `/markets/:id`, `/links/:academy_player_id`, posts `/link-requests`, `/link-redemptions`, `/links/:id/revoke`, and posts stable intent IDs to `/admissions/:intent_id`.

Admission terms are exactly:

```json
{
  "academyPlayerId": "academy-player-id",
  "conquestUserId": "conquest-user-id",
  "linkId": "link-id",
  "linkVersion": 1,
  "marketId": "market-id",
  "marketVersion": 1,
  "outcomeUserId": "winner-pick-user-id",
  "stakeCents": 1000,
  "oddsHundredths": 190,
  "grossCents": 1900,
  "modelVersion": "cr-strength-v1"
}
```

ConquestK returns `{admission:{intentId,status,reason,decidedAt,terms}}`; status is `accepted` or `rejected`. Market IDs/versions bind immutable generation terms; lifecycle changes do not bump `version`. Academy validates the remote identity, terms, roster, timestamps, lifecycle, and terminal winner before changing balances.

## Checks

Run `node --test test/conquest-store.test.js test/conquest.test.js test/delete-account.test.js test/public-tables.test.js`, then `npm run build`. The focused tests cover linking/session/origin isolation, duplicate submissions, restarts, delayed responses/results, expired quotes, self-only picks, spectator picks, monetary caps, exposure including pending holds, void/rejection refunds, escrow worth, privacy, account deletion, legacy claims, disabled rollout, and storage failure/corruption. Real Store tests inject partial-write, fsync, and rename failures and interrupt a child process immediately after rename, verifying complete old/new files and atomic multi-player balance/receipt recovery. Check the Risk page on desktop and narrow mobile, including keyboard review/confirmation, closed/no-market states, sign-in, link failure, and pending history.
