import type { Request } from 'express';

export interface AuthenticatedUser {
  sub: string;
  username?: string;
  role?: string;
  clientSiteId?: string;
  parentSiteId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  requestId?: string;
}
