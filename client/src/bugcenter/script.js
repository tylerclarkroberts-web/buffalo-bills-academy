// v75: what Nurse Hikari (蛍野ヒカリ) says. All Japanese on screen; the English is the optional 訳 subtitle.
export const NURSE = { ja: '蛍野ヒカリ', kana: 'ほたるの ひかり', en: 'Nurse Hikari Hotaruno' };
const L = (ja, en, extra = {}) => ({ ja, en, ...extra });

/** Lines before the yes/no question (the last one carries `ask: true`), from the barn view's pen. */
export function greeting(pen) {
  const out = [L('こんにちは！バグセンターへようこそ♡', 'Hello! Welcome to the Bug Center ♡'), L('わたしはナースのヒカリです。', "I'm Nurse Hikari.")];
  if (!pen) return [...out, L('あら？あなたのバグがいませんね。鉱山で卵を探してみてくださいね♪', "Oh? You don't have a bug. Try looking for an egg in the mines ♪", { end: true })];
  if (pen.stage === 'egg') return [...out, L('卵ちゃんは元気いっぱいですよ。あたためてあげてね♡', 'Your egg is perfectly healthy. Keep it warm ♡', { end: true })];
  if (pen.stage === 'dead') return [...out, L('……ごめんなさい。この子は、もう……', "...I'm so sorry. This one is already...", { end: true })];
  const n = pen.name;
  // It drank purple acid (server/barn.js, evolution). No question at the end: nobody is asked.
  if (pen.sick) return [...out, L(`あら……${n}ちゃん、むらさき色ですね。`, `Oh dear... ${n} is purple.`), L('これは……わたしの手には負えません。', 'This is... more than I can treat.'),
    L('少々お待ちください。電話をします。', 'One moment, please. I need to make a call.', { call: true })];
  // It left with the specialist (server/barn.js, rebuild). He is paid in parts: the last line asks which bug, or says it will be money.
  if (pen.taken) return [...out, L('あら……チケットですね。', 'Oh... a ticket.'), L(`${n}ちゃんは、あの方がお預かりしています。`, `That person has ${n}.`),
    ...(pen.donors?.length ? [L('お金は、いらないそうです。部品が……いるそうです。', 'He does not want money. He wants... parts.'), L('どの子を、渡しますか？', 'Which one will you hand over?', { pick: true })]
      : [L('部品になる子がいないので……お金でいいそうです。半分。', 'With nobody to use for parts... he will take money. Half.', { call: true })])];
  if (pen.fainted) {
    const eyes = L(`あら……${n}ちゃん、目がぐるぐるですね。`, `Oh dear... ${n}'s eyes are all swirly.`);
    // Free once it has rested an hour since fainting; before that the nurse offers the paid shortcut (`pay` rides on the question).
    if (pen.recoverMs > 0) {
      const m = Math.ceil(pen.recoverMs / 60000);
      return [...out, eyes, L(`あと${m}分休んだら、無料で治療できますよ。`, `After another ${m} minute${m === 1 ? '' : 's'} of rest, I can treat ${n} for free.`),
        L(`お急ぎなら、$${pen.healCost}で今すぐ元気にできますよ。どうしますか？`, `In a hurry? For $${pen.healCost} I can have it up right now. Shall I?`, { ask: true, pay: true })];
    }
    return [...out, eyes, L('あなたのバグを元気にしますね！', "I'll get your bug back on its feet!", { ask: true })];
  }
  return [...out, L(`${n}ちゃんはもう元気いっぱいですね！`, `${n} is already full of energy!`), L('念のため、診ておきましょうか？', 'Shall I give it a quick check-up, just in case?', { ask: true })];
}
export const WAIT = L('少々お待ちください♪', 'Just a moment, please ♪');

/** The ordinary heal button vs the specialist's last-panel confirm. Used by BugCenter so a stale tab cannot evolve. */
export function healRequest(pen, { pay = false, specialist = false, donor } = {}) {
  if (specialist) return { bug: pen?.id, confirmEvolve: true, ...(donor ? { donor } : {}) };
  return { bug: pen?.id, mode: 'heal', ...(pay ? { pay: true } : {}) };
}

/**
 * Who Nurse Hikari talks about first: a sick or collected bug always wins (they need her now). Otherwise a pending
 * evoNews recap, then the usual greeting for the partner or a fainted bug.
 */
export function greetingFor(view) {
  const bugs = view?.stable?.bugs || [];
  const active = bugs.find((bug) => bug.sick) || bugs.find((bug) => bug.taken) || bugs.find((bug) => bug.fainted) || view?.pen || null;
  if (active?.sick || active?.taken) return { kind: 'care', pen: active, lines: greeting(active) };
  if (view?.evoNews) return { kind: 'news', pen: active, news: view.evoNews, lines: newsGreeting(view.evoNews) };
  return { kind: 'care', pen: active, lines: greeting(active) };
}

/** Nurse Hikari's one-time recap of a Stage II rebuild the owner thought was a death. English always shows (`both`). */
export function newsGreeting(news) {
  const n = news?.name || 'Empusa';
  const both = { both: true };
  return [
    L('こんにちは！バグセンターへようこそ♡', 'Hello! Welcome to the Bug Center ♡', both),
    L('わたしはナースのヒカリです。', "I'm Nurse Hikari.", both),
    L(`あ！戻ってきてくれて、よかった。${n}ちゃんのことで、大事なお知らせがあるんです…`, `Oh! I'm so glad you came back. I have important news about ${n}...`, both),
    L('さっき、あの方がいらしたとき、全部があっという間で…', 'Earlier, when the specialist came through, everything happened so fast...', both),
    L('カーテンの向こうの記録と、領収書の控えを、お見せするの、わすれてしまって。', 'I realized I forgot to show you the file from behind the curtain — and the copy of the receipt.', both),
    L('いなくなっちゃったって、思ってましたよね？', "You thought she didn't make it, didn't you?", both),
    L('あら、そんなことないですよ！ちゃんと生きてます。', "Oh dear, no! She's very much alive.", both),
    L('ほら——待合室で待っているあいだに、何があったか、お見せしますね…', 'Here — let me show you what happened while you were waiting out front...', { ...both, call: true }),
  ];
}

export function newsAfter(news) {
  const n = news?.name || 'Empusa';
  const both = { both: true };
  return [
    L('ね？いなくなったわけじゃなくて——ちょっと、おもくなっただけ。', 'See? Not gone at all — just... heavier.', both),
    L('それに、ほとんど鉄です。いまは。', 'And mostly iron now.', both),
    L('カーテンのことは、ほかの方には、ないしょですよ♡', "Please don't mention the curtain to the others ♡", { ...both, end: true }),
  ];
}

/** Shape the recap payload so Receipt and Reveal can replay the original Stage II visit without calling evolve(). */
export function newsAsEvolved(news) {
  if (!news) return null;
  return {
    id: news.id, name: news.name, species: news.species, botched: news.botched || null, stage: news.stage ?? 1, copy: true,
    levelBefore: news.levelBefore, levelAfter: news.levelAfter, bill: news.bill ? { ...news.bill } : undefined,
  };
}

export function done(pen, healed, cost = 0) {
  const n = pen?.name || '';
  return [healed ? L(`お待たせしました！${n}ちゃんはすっかり元気になりました！`, `Thank you for waiting! ${n} is fully healed!`) : L(`ばっちり元気です！${n}ちゃん、えらいですね♪`, `Perfectly healthy! Good job, ${n} ♪`),
    cost ? L(`お代は $${cost} です。ありがとうございます♪`, `That comes to $${cost}. Thank you ♪`) : L('お代はいりませんよ。', "There's no charge."), L('またいつでも来てくださいね♡', 'Come back any time ♡', { end: true })];
}
/** The specialist's visit, one still panel at a time. Nobody speaks. */
export const PANELS = [L('ドアが、ひとりでに開いた。', 'The door opened by itself.'), L('だれかが立っている。', 'Someone is standing there.'),
  L('道具。たくさんの道具。', 'Tools. A great many tools.'), L('カーテンの向こうで、音がする。', 'Noises, behind the curtain.')];
/** The second visit skips the door: he is already in. `art` is which of the four pictures goes with each line. */
export const PANELS2 = [L('道具。前より、多い。', 'Tools. More than last time.', { art: 2 }), L('カーテンの向こうで、音がする。長いあいだ。', 'Noises, behind the curtain. For a long while.', { art: 3 })];
export const PICK = { warn: L('渡した子は、戻ってきません。', 'The one you hand over does not come back.'), not: L('やめておく', 'Not now') };
/** The receipt is in both languages whatever the 訳 button says: it is the only place the cost is stated. */
export const RECEIPT = { title: L('領収書', 'Receipt'), copy: L('控え', 'Copy · Already paid'), arm: L('腕 ×1', 'Arm (1)'), labour: L('技術料', 'Labour'), hush: L('口止め料', 'Not asking questions'),
  wrong: L('部品ちがい', 'Wrong part'), free: L('無料', 'no charge'), parts: L('部品', 'Parts'), included: L('込み', 'included'), body: L('ボディ ×1', 'Body (1)'), total: L('合計', 'Total'), had: L('お預かり', 'You had'), left: L('残高', 'You have'), foot: L('返品不可', 'No returns.') };
export const BACK = (n) => L(`${n}ちゃんが帰ってきた。`, `${n} is back.`);
export const STAGE = (botched, stage = 1) => { const n = stage === 2 ? 'III' : 'II'; return botched ? L(`ステージ ${n}（だいたい）`, `Stage ${n}, more or less`) : L(`ステージ ${n}`, `Stage ${n}`); };
/** What else is wrong with a botched bug (server/engine/bout.js, QUIRKS), as the nurse puts it. */
const QUIRK_LINE = {
  lazy: L('それと……とても、ねむそうです。ずっと。', 'Also... it seems very sleepy. Permanently.'),
  berserk: L('それと……カーテンをかみました。あの方も。', 'Also... it bit the curtain. And that person.'),
  haywire: L('それと……腕が、勝手に動きます。', 'Also... the arm moves on its own.'),
  polite: L('それと……わたしに、おじぎをしました。二回。', 'Also... it bowed to me. Twice.'),
  salaried: L('それと……勤務時間を、聞かれました。', 'Also... it asked about its hours.'),
  squeamish: L('それと……トレーを見て、たおれました。', 'Also... it saw the tray and fainted.'),
};
/** What the nurse says once the curtain is open. */
export function after(evolved) {
  const n = evolved.name;
  if (evolved.stage === 2) return [...(evolved.botched ? [L(`あら……${n}ちゃん、自分を人間だと思っています。`, `Oh... ${n} believes it is a person.`), ...(QUIRK_LINE[evolved.botched] ? [QUIRK_LINE[evolved.botched]] : []), L('でも、元気ですよ♡', 'But it is healthy ♡')]
    : [L(`${n}ちゃんは……大きくなりましたね。`, `${n} has... grown.`)]),
  ...(evolved.donor ? [L(`${evolved.donor.name}ちゃんのことは……聞かないでくださいね♡`, `Please do not ask me about ${evolved.donor.name} ♡`)] : []), L('お大事に♡', 'Take care ♡', { end: true })];
  return [...(evolved.botched ? [L(`あら……${n}ちゃんの腕、逆ですね。`, `Oh... ${n}'s arm is on backwards.`), ...(QUIRK_LINE[evolved.botched] ? [QUIRK_LINE[evolved.botched]] : []), L('でも、元気ですよ♡', 'But it is healthy ♡')] : [L(`${n}ちゃんは……元気です。たぶん。`, `${n} is... healthy. Probably.`)]),
    L('あの方のことは、聞かないでくださいね♡', 'Please do not ask me about that person ♡'), L('お大事に♡', 'Take care ♡', { end: true })];
}
/** His counter (mech parts, server/catalog/mine.js). Prices and what a part does are in English whatever the 訳 button says. */
export const COUNTER = { title: L('部品', 'Parts'), hand: L('カーテンのうしろから、手が出てきた。値段表を持っている。', 'A hand comes out from behind the curtain. It is holding a price list.'),
  none: L('あの方は、手がけた子にしか部品をつけません。', 'He only fits parts to a bug he has already worked on.'), one: L('一匹に、ひとつ。', 'One part a bug.'), close: L('とじる', 'Close') };
export const NO = L('わかりました。またいつでもどうぞ♡', 'Understood. Drop by any time ♡', { end: true });
export const REST = L('わかりました。ゆっくり休ませてあげましょうね♡', "Understood. We'll let it rest ♡", { end: true });
export const OOPS = (msg) => L('あら？機械の調子が……もう一度お願いします。', `Oh? The machine is acting up... please try again. (${msg})`, { end: true });

/** Signage around the room: Japanese, its reading, and English for the 訳 toggle. */
export const SIGNS = {
  title: { ja: 'バグセンター', en: 'Bug Center' },
  desk: { ja: '受付', rt: 'うけつけ', en: 'Reception' },
  machine: { ja: '回復', rt: 'かいふく', en: 'Healing' },
  pc: { ja: 'パソコン', en: 'PC' },
  wait: { ja: '待合室', rt: 'まちあいしつ', en: 'Waiting room' },
  mat: { ja: 'いらっしゃいませ', en: 'Welcome' },
  hours: { ja: '24時間 営業', rt: 'じかん えいぎょう', en: 'Open 24 hours' },
};

/**
 * Everyone the nurse can treat in one go: every knocked-out bug in the stalls. A sick or collected bug needs the
 * specialist first, so then there is no plan (null) and she talks about that one. Rested bugs are free; the rest are
 * `healCost` each. `afford` is the paid ones the bankroll covers, partner first and then the longest wait.
 */
export function healPlan(view) {
  const bugs = view?.stable?.bugs || [];
  if (bugs.some((bug) => bug.sick || bug.taken)) return null;
  const out = bugs.filter((bug) => bug.stage === 'creature' && bug.fainted && !bug.heesheeHeld);
  if (!out.length) return null;
  const free = out.filter((bug) => !(bug.recoverMs > 0));
  const paid = out.filter((bug) => bug.recoverMs > 0).sort((a, b) => (b.partner ? 1 : 0) - (a.partner ? 1 : 0) || b.recoverMs - a.recoverMs);
  const cost = (list) => list.reduce((sum, bug) => sum + (bug.healCost || 0), 0);
  const bankroll = Math.max(0, Number(view?.bankroll) || 0), afford = [];
  for (const bug of paid) if (cost([...afford, bug]) <= bankroll) afford.push(bug);
  return { bugs: out, free, paid, total: cost(paid), bankroll, afford, affordCost: cost(afford) };
}

/** The body for POST /barn/heal-all: which paid bugs, and the most the owner agreed to. */
export function healAllRequest(plan, kind) {
  const pay = kind === 'all' ? plan.paid : kind === 'afford' ? plan.afford : [];
  return { pay: pay.map((bug) => bug.id), total: pay.reduce((sum, bug) => sum + (bug.healCost || 0), 0) };
}

const names = (list) => list.map((bug) => bug.name).join(', ');
const nameJa = (list) => list.map((bug) => `${bug.name}ちゃん`).join('、');
const mins = (ms) => Math.ceil(ms / 60000);

/** The nurse sees the whole waiting room and asks once. The last line carries `choices`, each priced on the button. */
export function greetingAll(plan) {
  const hello = [L('こんにちは！バグセンターへようこそ♡', 'Hello! Welcome to the Bug Center ♡'), L('わたしはナースのヒカリです。', "I'm Nurse Hikari.")];
  const { bugs, free, paid, total, bankroll, afford, affordCost } = plan, n = bugs.length;
  const both = { both: true }; // the money is always said in English too
  const who = n === 1 ? L(`あら……${bugs[0].name}ちゃん、目がぐるぐるですね。`, `Oh dear... ${bugs[0].name}'s eyes are all swirly.`)
    : L(`あら……${n}匹とも、目がぐるぐるですね。${nameJa(bugs)}。`, `Oh dear... all ${n} of them are swirly-eyed: ${names(bugs)}.`);
  const NOPE = { kind: 'no', ja: 'いいえ', en: 'Not now' };
  if (!paid.length) {
    return [...hello, who, L(n === 1 ? 'ゆっくり休めたので、無料ですよ♡' : 'みんなゆっくり休めたので、全員無料ですよ♡', n === 1 ? 'It has rested, so it is free ♡' : 'They have all rested, so everyone is free ♡'),
      L('まとめて元気にしましょうか？', n === 1 ? 'Shall I get it back on its feet?' : 'Shall I heal them all at once?', { choices: [{ kind: 'free', ja: n === 1 ? 'はい · 無料' : '全員 · 無料', en: n === 1 ? 'Yes · free' : 'Heal all · free', main: true }, NOPE] })];
  }
  const wait = L(free.length ? `${nameJa(free)}は無料。${nameJa(paid)}は、あと${mins(Math.max(...paid.map((b) => b.recoverMs)))}分以内に無料になります。`
    : `あと${mins(Math.max(...paid.map((b) => b.recoverMs)))}分休めば、全員無料になります。`,
  free.length ? `${names(free)} ${free.length === 1 ? 'has' : 'have'} rested: free. ${names(paid)} would be free within ${mins(Math.max(...paid.map((b) => b.recoverMs)))} min.`
    : `Within ${mins(Math.max(...paid.map((b) => b.recoverMs)))} min of rest they would all be free.`);
  const each = paid[0].healCost;
  if (afford.length === paid.length) {
    // The bill rides on the question itself, so it is on screen with the buttons.
    return [...hello, who, wait, L(`今すぐなら、${paid.length}匹 × $${each} で、合計 $${total} です。どうしますか？`, `Right now it is ${paid.length} × $${each}, $${total} in all. What would you like?`, { ...both, choices: [
      { kind: 'all', ja: `全員 · $${total}`, en: `Heal all ${n} · $${total}`, main: true },
      ...(free.length ? [{ kind: 'free', ja: '無料の子だけ', en: `Free ones only (${free.length})` }] : []), NOPE] })];
  }
  // Short of money: what everyone costs, what you have and what that covers, all in the line with the buttons.
  const short = { ja: `全員だと $${total} ですが、お手持ちは $${Math.floor(bankroll)} ですね。`, en: `Healing everyone now is $${total}, and you have $${Math.floor(bankroll)}.` };
  const can = afford.length ? L(`${short.ja}${afford.length}匹分（$${affordCost}）なら、今すぐできますよ。${nameJa(afford)}。`, `${short.en} I can do ${afford.length} of the ${paid.length} now for $${affordCost}: ${names(afford)}.${free.length ? ` ${names(free)} ${free.length === 1 ? 'is' : 'are'} free either way.` : ''}`, both)
    : L(`${short.ja}${free.length ? '今は、無料の子だけにしましょうか。' : 'ゆっくり休ませてあげましょうね。'}`, `${short.en} ${free.length ? 'For now I can do the free ones.' : 'Let them rest a little; it gets free.'}`, both);
  const choices = [
    ...(afford.length ? [{ kind: 'afford', ja: `${afford.length + free.length}匹 · $${affordCost}`, en: `Heal ${afford.length + free.length} · $${affordCost}`, main: true }] : []),
    ...(free.length ? [{ kind: 'free', ja: '無料の子だけ', en: `Free ones only (${free.length})`, main: !afford.length }] : []), NOPE];
  if (!afford.length && !free.length) return [...hello, who, wait, { ...can, end: true }];
  return [...hello, who, wait, { ...can, choices }];
}

/** After the machine: everyone it healed, then the bill (or none). */
export function allHealed(healed, cost = 0, waiting = []) {
  const n = healed.length;
  return [n > 1 ? L(`お待たせしました！みんな、すっかり元気です！`, `Thank you for waiting! Everyone is fully healed!`) : L(`お待たせしました！${healed[0]?.name || ''}ちゃんはすっかり元気です！`, `Thank you for waiting! ${healed[0]?.name || ''} is fully healed!`),
    cost ? L(`お代は $${cost} です。ありがとうございます♪`, `That comes to $${cost}. Thank you ♪`, { both: true }) : L('お代はいりませんよ。', "There's no charge."),
    ...(waiting.length ? [L(`${nameJa(waiting)}は、もう少し休ませましょうね。`, `${names(waiting)} will rest a little longer.`)] : []),
    L('またいつでも来てくださいね♡', 'Come back any time ♡', { end: true })];
}
