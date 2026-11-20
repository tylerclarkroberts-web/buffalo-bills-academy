import { computeEquity } from '../../../server/engine/equity.js';

self.onmessage = (e) => {
  const { id, input } = e.data || {};
  try {
    self.postMessage({ id, result: computeEquity(input) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
