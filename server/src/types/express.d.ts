// ─────────────────────────────────────────────────────────────
// Extend Express Request to carry our JwtPayload as req.user
// This overrides Passport's default `Express.User` type.
// ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;   // user UUID
  email: string;
  role: 'user' | 'admin';
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends JwtPayload {}
  }
}
