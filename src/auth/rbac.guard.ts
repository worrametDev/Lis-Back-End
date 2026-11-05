import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const normalize = (value: unknown) => String(value || '').toUpperCase();

@Injectable()
export class RbacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true;
    if (
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS'
    )
      return true;

    const role = normalize(user.role);
    if (role === 'SYSTEM_ADMINISTRATOR') return true;
    const path = String(request.route?.path || request.path || '');

    // Client users may mutate only records belonging to their assigned site.
    // Read requests remain available for filtering and queue visibility.
    if (role === 'CLIENT_SITE_USER') {
      const assignedSite = String(
        user.clientSiteId || user.clientSite?.id || user.siteId || '',
      );
      const payload = request.body || {};
      const requestedSite = String(
        payload.clientSiteId || payload.siteId || payload.clientSite?.id || '',
      );
      if (assignedSite && requestedSite && assignedSite !== requestedSite) {
        throw new ForbiddenException('ไม่สามารถดำเนินการข้าม Client Site ได้');
      }
    }

    if (path.startsWith('/auth/') || path.startsWith('/middleware/'))
      return true;
    if (path.startsWith('/users')) {
      if (role !== 'LAB_ADMINISTRATOR')
        throw new ForbiddenException('ไม่มีสิทธิ์จัดการบัญชีผู้ใช้');
      return true;
    }
    if (path.startsWith('/master-data/site-info')) {
      throw new ForbiddenException('เฉพาะ System Administrator เท่านั้น');
    }
    if (
      path.startsWith('/parent-sites') ||
      path.startsWith('/client-sites') ||
      path.startsWith('/wards') ||
      path.startsWith('/departments') ||
      path.startsWith('/sample-conditions') ||
      path.startsWith('/titles') ||
      path.startsWith('/ethnicities') ||
      path.startsWith('/test-panels') ||
      path.startsWith('/value-lists') ||
      path.startsWith('/tests') ||
      path.startsWith('/test-profiles') ||
      path.startsWith('/analyzers')
    ) {
      if (role !== 'LAB_ADMINISTRATOR')
        throw new ForbiddenException('ไม่มีสิทธิ์แก้ไข Master Data');
      return true;
    }
    if (path.startsWith('/workstation') && role === 'CLIENT_SITE_USER') {
      throw new ForbiddenException('Client User ไม่มีสิทธิ์แก้ไขผลตรวจ');
    }
    const workstationRestricted = [
      '/workstation/report',
      '/workstation/approve',
      '/workstation/repeat',
      '/workstation/delete-results',
      '/workstation/re-status',
      '/workstation/transfer-repeat',
    ];
    if (
      workstationRestricted.some((route) => path.startsWith(route)) &&
      (role === 'CLIENT_SITE_USER' || role === 'LAB_ADMINISTRATOR')
    ) {
      throw new ForbiddenException('ไม่มีสิทธิ์ดำเนินการกับผลตรวจรายการนี้');
    }
    if (
      path.startsWith('/samples/receive') ||
      path.startsWith('/samples/reject')
    ) {
      if (role === 'CLIENT_SITE_USER') {
        throw new ForbiddenException(
          'Client User ไม่มีสิทธิ์ตรวจรับหรือปฏิเสธสิ่งส่งตรวจ',
        );
      }
    }
    if (path.startsWith('/uploads') && role === 'CLIENT_SITE_USER') {
      throw new ForbiddenException('ไม่มีสิทธิ์อัปโหลดไฟล์');
    }
    return true;
  }
}
