// Verify tokens on the server; never trust a UID supplied in the request body.
function authenticate(verifyToken) {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Sign in to continue' });
    try {
      const identity = await verifyToken(match[1]);
      if (!identity.uid) throw new Error('Invalid identity');
      req.user = identity;
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }
    next();
  };
}
module.exports = { authenticate };
