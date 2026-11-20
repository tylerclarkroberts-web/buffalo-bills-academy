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
export function done(pen, healed, cost = 0) {
  const n = pen?.name || '';
  return [healed ? L(`お待たせしました！${n}ちゃんはすっかり元気になりました！`, `Thank you for waiting! ${n} is fully healed!`) : L(`ばっちり元気です！${n}ちゃん、えらいですね♪`, `Perfectly healthy! Good job, ${n} ♪`),
    cost ? L(`お代は $${cost} です。ありがとうございます♪`, `That comes to $${cost}. Thank you ♪`) : L('お代はいりませんよ。', "There's no charge."), L('またいつでも来てくださいね♡', 'Come back any time ♡', { end: true })];
}
/** The specialist's visit, one still panel at a time. Nobody speaks. */
export const PANELS = [L('ドアが、ひとりでに開いた。', 'The door opened by itself.'), L('だれかが立っている。', 'Someone is standing there.'),
  L('道具。たくさんの道具。', 'Tools. A great many tools.'), L('カーテンの向こうで、音がする。', 'Noises, behind the curtain.')];
/** The receipt is in both languages whatever the 訳 button says: it is the only place the cost is stated. */
export const RECEIPT = { title: L('領収書', 'Receipt'), arm: L('腕 ×1', 'Arm (1)'), labour: L('技術料', 'Labour'), hush: L('口止め料', 'Not asking questions'),
  wrong: L('部品ちがい', 'Wrong part'), free: L('無料', 'no charge'), total: L('合計', 'Total'), had: L('お預かり', 'You had'), left: L('残高', 'You have'), foot: L('返品不可', 'No returns.') };
export const BACK = (n) => L(`${n}ちゃんが帰ってきた。`, `${n} is back.`);
export const STAGE = (botched) => (botched ? L('ステージ II（だいたい）', 'Stage II, more or less') : L('ステージ II', 'Stage II'));
/** What else is wrong with a botched bug (server/engine/bout.js, QUIRKS), as the nurse puts it. */
const QUIRK_LINE = {
  lazy: L('それと……とても、ねむそうです。ずっと。', 'Also... it seems very sleepy. Permanently.'),
  berserk: L('それと……カーテンをかみました。あの方も。', 'Also... it bit the curtain. And that person.'),
  haywire: L('それと……腕が、勝手に動きます。', 'Also... the arm moves on its own.'),
};
/** What the nurse says once the curtain is open. */
export function after(evolved) {
  const n = evolved.name;
  return [...(evolved.botched ? [L(`あら……${n}ちゃんの腕、逆ですね。`, `Oh... ${n}'s arm is on backwards.`), ...(QUIRK_LINE[evolved.botched] ? [QUIRK_LINE[evolved.botched]] : []), L('でも、元気ですよ♡', 'But it is healthy ♡')] : [L(`${n}ちゃんは……元気です。たぶん。`, `${n} is... healthy. Probably.`)]),
    L('あの方のことは、聞かないでくださいね♡', 'Please do not ask me about that person ♡'), L('お大事に♡', 'Take care ♡', { end: true })];
}
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
