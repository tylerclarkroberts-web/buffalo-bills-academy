// Plain public pages Google asks for before it will publish the sign-in consent screen.
const STYLE = `body{margin:0;background:#04161a;color:#fdf3e7;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
main{max-width:68ch;margin:0 auto;padding:40px 20px 60px}h1{font:400 40px/1 Impact,'Anton',sans-serif;text-transform:uppercase;margin:0 0 6px}
h2{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#2ee6d6;margin:28px 0 6px}p,li{color:#cfe0dc}a{color:#ffb547}
.k{font:12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7fa6a2}nav{margin-top:36px;font-size:14px}`;
const UPDATED = 'October 29, 2026';

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Buffalo Bill's Academy</title><link rel="icon" href="/favicon.svg"><style>${STYLE}</style></head>
<body><main><p class="k">Buffalo Bill's Academy · updated ${UPDATED}</p><h1>${title}</h1>${body}
<nav><a href="/">Back to the card room</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></nav></main></body></html>`;
}

export const PRIVACY_HTML = page('Privacy', `
<p>Buffalo Bill's Academy is a small play-money poker game for friends. This page says what it keeps about you and why.</p>
<h2>What we store</h2>
<ul>
<li><b>If you sign in with Google:</b> your Google account id, name, email address and profile picture link, so your account and chips follow you between devices.</li>
<li><b>If you make a username account:</b> your username, your email address if you give one, and a scrambled one-way hash of your password (the password itself is never stored).</li>
<li><b>Your avatar:</b> the low-poly drawing you make at sign-in (a small picture, about 240×300 pixels), or the settings for a generated avatar if you skip that step.</li>
<li><b>Game data:</b> your display name, play-money bankroll, tables you joined, hands and results, mine shifts, play-money coin trades and the stats built from them.</li>
<li><b>Optional ConquestK link and Risk bets:</b> linked account IDs, your selected match outcomes, fixed-odds quotes, play-money stakes and settlement receipts. ConquestK receives the linked IDs and wager terms to authorize admission and supply match results. Your wager history is shown only to you; existing public balances and total net worth remain public. Passwords and session cookies are not shared between the sites.</li>
<li><b>Slack alerts:</b> when it's your turn, we look up your account email (or the Slack email you entered) in our Slack workspace and remember the Slack user id it matches, so Guntrad the Pit Boss can message you. The messages say the table, hand number, street, pot, what it costs you to stay in and how long you have, with a link. At blackjack the message says the table, whether it needs your bet, your hand played or an insurance call, and how long you have, with a link. Never your cards, at either game. If you host a table that has players waiting but hasn't started, Guntrad may also nudge you to start it (at most 3 times per table). Turn alerts off any time in Profile → Settings.</li>
<li><b>A sign-in cookie</b> that keeps you logged in. No advertising or tracking cookies.</li>
</ul>
<h2>Your face photo</h2>
<p>The selfie or photo you use for your avatar is never uploaded or stored. It is turned into a low-poly drawing inside your own browser and thrown away straight after; only the finished drawing is sent to the server.</p>
<h2>What we don't do</h2>
<p>We don't sell or share your data, show ads, or use it for anything except running the game. Other players can see your display name, avatar and game stats (for example on the leaderboard). Your email is shown only to you.</p>
<h2>Deleting your data</h2>
<p>You can retake or replace your avatar from your profile at any time. To have your account and data removed, ask the person who invited you to the game and it will be deleted.</p>
<h2>No real money</h2>
<p>Everything in the game is play money with no cash value. Not affiliated with any casino, resort or golf course.</p>`);

export const TERMS_HTML = page('Terms', `
<p>By using Buffalo Bill's Academy you agree to these short terms.</p>
<h2>Play money only</h2>
<p>All chips, bankrolls, mine payouts and coin holdings are play money. They have no cash value, cannot be bought, sold or cashed out, and nothing here is gambling or financial advice. Coin prices are shown for fun from public market data.</p>
<h2>Be decent</h2>
<p>This is a game for friends. Don't cheat, don't abuse other players, and don't upload pictures of anyone but yourself for your avatar.</p>
<h2>No guarantees</h2>
<p>The game is provided as is, free of charge, and may change, pause or be reset at any time. We aren't liable for lost play money, stats or downtime.</p>
<h2>Not affiliated</h2>
<p>Buffalo Bill's Academy is an independent fan project. It is not affiliated with, endorsed by or connected to any casino, resort or golf course, in Nevada or anywhere else.</p>
<h2>Privacy</h2>
<p>See the <a href="/privacy">privacy page</a> for what is stored about you.</p>`);
