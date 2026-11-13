// v75: what Nurse Hikari (蛍野ヒカリ) says. All Japanese on screen; the English is the optional 訳 subtitle.
// Pure so node --test can check the branches: fainted bug, healthy bug, egg, empty stall, a grave, and "no thanks".
export const NURSE = { ja: '蛍野ヒカリ', kana: 'ほたるの ひかり', en: 'Nurse Hikari Hotaruno' };
const L = (ja, en, extra = {}) => ({ ja, en, ...extra });

/** Lines before the yes/no question (the last one carries `ask: true`), from the barn view's pen. */
export function greeting(pen) {
  const out = [L('こんにちは！バグセンターへようこそ♡', 'Hello! Welcome to the Bug Center ♡'), L('わたしはナースのヒカリです。', "I'm Nurse Hikari.")];
  if (!pen) return [...out, L('あら？あなたのバグがいませんね。鉱山で卵を探してみてくださいね♪', "Oh? You don't have a bug. Try looking for an egg in the mines ♪", { end: true })];
  if (pen.stage === 'egg') return [...out, L('卵ちゃんは元気いっぱいですよ。あたためてあげてね♡', 'Your egg is perfectly healthy. Keep it warm ♡', { end: true })];
  if (pen.stage === 'dead') return [...out, L('……ごめんなさい。この子は、もう……', "...I'm so sorry. This one is already...", { end: true })];
  const n = pen.name;
  if (pen.fainted) return [...out, L(`あら……${n}ちゃん、目がぐるぐるですね。`, `Oh dear... ${n}'s eyes are all swirly.`), L('あなたのバグを元気にしますね！', "I'll get your bug back on its feet!", { ask: true })];
  return [...out, L(`${n}ちゃんはもう元気いっぱいですね！`, `${n} is already full of energy!`), L('念のため、診ておきましょうか？', 'Shall I give it a quick check-up, just in case?', { ask: true })];
}
export const WAIT = L('少々お待ちください♪', 'Just a moment, please ♪');
export function done(pen, healed) {
  const n = pen?.name || '';
  return [healed ? L(`お待たせしました！${n}ちゃんはすっかり元気になりました！`, `Thank you for waiting! ${n} is fully healed!`) : L(`ばっちり元気です！${n}ちゃん、えらいですね♪`, `Perfectly healthy! Good job, ${n} ♪`),
    L('お代はいりませんよ。', "There's no charge."), L('またいつでも来てくださいね♡', 'Come back any time ♡', { end: true })];
}
export const NO = L('わかりました。またいつでもどうぞ♡', 'Understood. Drop by any time ♡', { end: true });
export const OOPS = (msg) => L('あら？機械の調子が……もう一度お願いします。', `Oh? The machine is acting up... please try again. (${msg})`, { end: true });

/** Signage around the room: Japanese, its reading, and English for the 訳 toggle. */
export const SIGNS = {
  title: { ja: 'バグセンター', en: 'Bug Center' },
  desk: { ja: '受付', rt: 'うけつけ', en: 'Reception' },
  machine: { ja: '回復', rt: 'かいふく', en: 'Healing' },
  pc: { ja: 'パソコン', en: 'PC' },
  wait: { ja: '待合室', rt: 'まちあいしつ', en: 'Waiting room' },
  mat: { ja: 'いらっしゃいませ', en: 'Welcome' },
  hours: { ja: '24時間 無料', rt: 'じかん むりょう', en: 'Open 24 hours · Free' },
};
