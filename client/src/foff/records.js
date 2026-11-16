// Local outbox for Foff golf scores. Course records and holes-in-one live on the server;
// the browser only queues what still needs posting. Old saves store `best` as a total per
// won nine, with no hole scores, no date and no losses, so those backfill as totals only.
export function queueRound(save, { matchId, strokes, holes, at = Date.now() }) {
  save.outbox = [...(save.outbox || []), { matchId, strokes, holes: holes?.slice?.() ?? holes, at }];
  return save;
}

export function pendingPosts(save) {
  const outbox = save.outbox || [];
  const posts = outbox.map((row) => ({ ...row, backfill: false }));
  const boxed = new Set(outbox.map((row) => String(row.matchId)));
  const flushed = new Set((save.postedBest || []).map(String));
  for (const [id, strokes] of Object.entries(save.best || {})) {
    if (boxed.has(String(id)) || flushed.has(String(id))) continue;
    if (typeof strokes === 'number' && strokes > 0) posts.push({ matchId: Number(id), strokes, backfill: true });
  }
  return posts;
}

export function markPosted(save, item) {
  if (item.backfill) {
    save.postedBest = [...new Set([...(save.postedBest || []), String(item.matchId)])];
    return save;
  }
  save.outbox = (save.outbox || []).filter((row) => row.matchId !== item.matchId || row.at !== item.at);
  save.postedBest = [...new Set([...(save.postedBest || []), String(item.matchId)])];
  return save;
}
