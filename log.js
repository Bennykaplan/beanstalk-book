// One JSON object per line on stdout, so Render's log search can filter on any field.
// Never pass photos, tokens, keys or email addresses in here: user ids only.
export function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

// Skips the polling and image requests a book page makes constantly, unless they fail.
const QUIET = /^\/(healthz|api\/books\/[^/]+(\/images\/.*)?)$/;

export function requestLog(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (res.statusCode < 400 && req.method === 'GET' && QUIET.test(req.path)) return;
    log('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, user: req.user?.id });
  });
  next();
}
