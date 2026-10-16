// In-memory, per-IP sliding-window limiter. Counters reset when the server restarts.
function rateLimit(maxRequests, windowMs) {
  const attempts = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of attempts) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length) attempts.set(key, recent);
      else attempts.delete(key);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maxRequests) return res.status(429).json({ message: "Too many attempts. Please wait and try again." });
    recent.push(now);
    attempts.set(key, recent);
    return next();
  };
}

// Shared instances: owner code checks and employee logins count against the same login limit.
export const SMS_LIMIT = rateLimit(4, 15 * 60 * 1000);
export const LOGIN_LIMIT = rateLimit(10, 15 * 60 * 1000);
export const SETUP_LIMIT = rateLimit(8, 60 * 60 * 1000);
