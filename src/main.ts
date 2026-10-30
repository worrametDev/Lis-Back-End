import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as path from 'path';
import * as fs from 'fs';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. Enterprise Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger and CDN static resources
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. Performance & Cookies
  app.use(compression());
  app.use(cookieParser());

  // 3. Global Input Sanitization & Mass-assignment Protection
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 4. Strict CORS Whitelist Configuration
  const rawOrigins = process.env.CORS_ORIGIN || '';
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app');

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`CORS Error: Origin '${origin}' is not authorized.`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (fs.existsSync(uploadDir)) {
    app.useStaticAssets(uploadDir, {
      prefix: '/uploads/',
    });
  }

  app.setGlobalPrefix('api/v1');

  // Swagger API Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Healthdi Lab (LIS) — API Documentation & Test Center')
    .setDescription(
      'ระบบสารสนเทศห้องปฏิบัติการ (LIS) — โรงพยาบาลเสนา (Sena Hospital) & เครือข่าย รพ.สต.\n\n' +
      '🏢 พัฒนาโดย: MP GROUP (Thailand) CO.,LTD\n' +
      '📄 ออกแบบตาม: Healthdi LAB Design Version 1.0.0 (01-12-2026)\n\n' +
      '💡 **คำแนะนำการทดสอบ:**\n' +
      '1. เริ่มต้นด้วยการทดสอบ `POST /api/v1/auth/login` โดยใช้ Username `thititada.p` และ Password `Admin@1234`\n' +
      '2. นำ `accessToken` ที่ได้รับไปกดปุ่ม **Authorize 🔓** ด้านขวาบน เพื่อปลดล็อกทุก Endpoint\n' +
      '3. สามารถทดสอบยิง API ได้โดยตรงผ่านปุ่ม **Try it out** ในแต่ละ Endpoint',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'กรอก JWT Bearer Token ที่ได้จาก /auth/login',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'ระบบเข้าสู่ระบบและตรวจสอบสิทธิ์ (JWT Login & Profile)')
    .addTag('Users', 'จัดการข้อมูลบัญชีผู้ใช้งาน (Account / User Settings)')
    .addTag('Master Data', 'จัดการข้อมูลแม่ข่าย ลูกข่าย วอร์ด แผนก และสภาพสิ่งส่งตรวจ (Parent Site, Client Site, Ward, Dept, Condition)')
    .addTag('Order Entry', 'ทะเบียนคำสั่งตรวจและออกรหัสสิ่งส่งตรวจ (LN / Barcode)')
    .addTag('Sample Receiving', 'กระบวนการตรวจรับและปฏิเสธสิ่งส่งตรวจ (Sample Receiving & Reject)')
    .addTag('Workstation', 'ห้องตรวจวิเคราะห์ผลแล็บ บันทึกผล คำนวณ Flag H/A/N และ Verify/Approve')
    .addTag('Dashboard', 'ตัวเลขสถิติและตัวชี้วัด KPI ของห้องปฏิบัติการ (KPI Cards)')
    .addTag('Uploads', 'บริการอัปโหลดไฟล์ (Logo โรงพยาบาล, ใบรับรอง ISO, ลายเซ็น ว.ท.)')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const swaggerOptions = {
    customSiteTitle: 'Healthdi Lab LIS — Swagger UI & API Test Center',
    customCss: `
      .swagger-ui .topbar { background: linear-gradient(90deg, #0288d1 0%, #00897b 100%) !important; padding: 12px 0; }
      .swagger-ui .topbar-wrapper .link { font-weight: bold; font-size: 18px; color: #ffffff !important; }
      .swagger-ui .info .title { color: #0277bd; }
      .swagger-ui .btn.authorize { background-color: #00897b; border-color: #00897b; color: white; }
      .swagger-ui .btn.authorize svg { fill: white; }
    `,
  };

  SwaggerModule.setup('docs', app, document, swaggerOptions);
  SwaggerModule.setup('api/docs', app, document, swaggerOptions);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Healthdi Lab Backend running on: http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger API Docs available at: http://localhost:${port}/docs`);
}
bootstrap();
