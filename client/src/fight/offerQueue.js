/**
 * The multi-table fight offer queue: one prompt at a time, in the order the offers first appeared.
 * `book` is a mutable { seen: {code: {k, n}}, seq } kept across renders; `open` lists the open table codes and
 * `offerOf(code)` gives that table's current offer key (or null). A new hand's offer at the same table
 * counts as new (joins the back of the queue). Returns the queue; its first entry is the one to show.
 */
export function offerQueue(book, open, offerOf) {
  const live = open.filter((c) => offerOf(c));
  for (const c of live) { const k = offerOf(c); if (book.seen[c]?.k !== k) book.seen[c] = { k, n: ++book.seq }; }
  for (const c of Object.keys(book.seen)) if (!live.includes(c)) delete book.seen[c];
  return live.sort((a, b) => book.seen[a].n - book.seen[b].n);
}
