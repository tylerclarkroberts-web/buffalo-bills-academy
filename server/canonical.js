// Send old/alternate hostnames to the one public domain with a 301, keeping path + query.
// Only hosts on an explicit list are redirected (never the canonical host itself, localhost or
// Fly's internal health-check address), so it cannot loop. Health checks are never redirected.
export const HEALTH_PATHS = new Set(['/api/health', '/healthz']);

export function canonicalRedirect({ publicUrl, extraHosts = [] } = {}) {
  let canon;
  try { canon = publicUrl ? new URL(publicUrl) : null; } catch { canon = null; }
  if (!canon || canon.protocol !== 'https:') return (req, res, next) => next();
  const target = canon.host.toLowerCase();
  const from = new Set([`www.${target}`, ...extraHosts].map((h) => String(h).toLowerCase()).filter((h) => h && h !== target));
  return (req, res, next) => {
    if (HEALTH_PATHS.has(req.path)) return next();
    // req.hostname honours X-Forwarded-Host because 'trust proxy' is set to the one Fly hop.
    const host = String(req.hostname || '').toLowerCase().replace(/\.$/, '');
    if (!from.has(host)) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    return res.redirect(301, `${canon.origin}${req.originalUrl}`);
  };
}
