import { ExecutionContext } from '@nestjs/common';
import { RbacGuard } from './rbac.guard';

function context(
  method: string,
  path: string,
  role: string,
  clientSiteId?: string,
  requestedSite?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        route: { path },
        user: { role, clientSiteId },
        body: requestedSite ? { clientSiteId: requestedSite } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RbacGuard', () => {
  const guard = new RbacGuard();

  it('allows system administrators to perform restricted actions', () => {
    expect(
      guard.canActivate(
        context('POST', '/workstation/approve', 'SYSTEM_ADMINISTRATOR'),
      ),
    ).toBe(true);
  });

  it('denies lab administrators from approving results', () => {
    expect(() =>
      guard.canActivate(
        context('POST', '/workstation/approve', 'LAB_ADMINISTRATOR'),
      ),
    ).toThrow();
  });

  it('denies client users from receiving samples', () => {
    expect(() =>
      guard.canActivate(
        context('POST', '/samples/receive', 'CLIENT_SITE_USER'),
      ),
    ).toThrow();
  });

  it('allows read access to workstation queue', () => {
    expect(
      guard.canActivate(
        context('GET', '/workstation/queue', 'CLIENT_SITE_USER'),
      ),
    ).toBe(true);
  });

  it('denies client users from mutating another client site', () => {
    expect(() =>
      guard.canActivate(
        context('POST', '/orders', 'CLIENT_SITE_USER', 'site-a', 'site-b'),
      ),
    ).toThrow();
  });
});
