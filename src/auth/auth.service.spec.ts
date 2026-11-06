import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService refresh-token rotation', () => {
  const refreshToken = {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const prisma = { refreshToken };
  const jwt = { sign: jest.fn().mockReturnValue('new-access-token') };
  const service = new AuthService(prisma as never, jwt as never);

  beforeEach(() => jest.clearAllMocks());

  it('revokes the used refresh token and creates a replacement', async () => {
    refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        username: 'tester',
        userRole: 'MEDICAL_TECHNOLOGIST',
        userStatus: 'ACTIVE',
        clientSiteId: 'site-1',
        parentSiteId: null,
      },
    });

    const result = await service.refresh('old-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).not.toBe('old-refresh-token');
    expect(refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'refresh-1' } }),
    );
    expect(refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('rejects revoked or expired refresh tokens', async () => {
    refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.refresh('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
