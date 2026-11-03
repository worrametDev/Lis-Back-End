import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { Response } from 'express';

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
  @Get(':filename')
  async getLocalFile(
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const safeName = path.basename(filename);
    const filePath = path.join(process.cwd(), 'uploads', safeName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('ไม่พบไฟล์รูปภาพในระบบจัดเก็บ');
    }
    return response.sendFile(filePath);
  }

  @Post()
  @ApiOperation({
    summary:
      'อัปโหลดไฟล์ (Logo โรงพยาบาล, ใบรับรอง ISO, ลายเซ็นดิจิทัล ว.ท.) — รองรับ Supabase Storage & Local Disk',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'ไฟล์รูปภาพ (PNG, JPG) หรือเอกสาร (PDF)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'อัปโหลดสำเร็จ คืนค่า URL และข้อมูลไฟล์',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadFile(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('ไม่พบไฟล์ที่ต้องการอัปโหลด');
    }

    // Whitelist allowed MIME types (Prevent uploading malicious executable or script files)
    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException(
        'ประเภทไฟล์ไม่ถูกต้อง อนุญาตเฉพาะรูปภาพ (PNG, JPG, WEBP, SVG) และเอกสาร PDF เท่านั้น',
      );
    }

    const isImage = file.mimetype.toLowerCase().startsWith('image/');
    let storedBuffer = file.buffer;
    let storedMimeType = file.mimetype;
    let ext = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '');

    // Normalize every uploaded raster/vector image to a bounded WebP file.
    // This is enforced server-side so API callers cannot bypass browser resize.
    // Normalize raster/vector image to a bounded WebP file via Sharp.
    // If Sharp fails or is unavailable, gracefully fall back to the original uploaded file.
    if (isImage) {
      try {
        const sharpFn =
          typeof sharp === 'function'
            ? sharp
            : (sharp as any)?.default ||
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              require('sharp');

        if (typeof sharpFn === 'function') {
          const image = sharpFn(file.buffer, { failOn: 'none' })
            .rotate()
            .resize({
              width: 1600,
              height: 1600,
              fit: 'inside',
              withoutEnlargement: true,
            });
          storedBuffer = await image
            .webp({ quality: 80, effort: 4 })
            .toBuffer();
          if (storedBuffer.length > 220 * 1024) {
            storedBuffer = await image
              .webp({ quality: 60, effort: 4 })
              .toBuffer();
          }
          if (storedBuffer.length > 220 * 1024) {
            storedBuffer = await image
              .webp({ quality: 45, effort: 4 })
              .toBuffer();
          }
          storedMimeType = 'image/webp';
          ext = '.webp';
        }
      } catch (sharpError: any) {
        console.warn(
          'Sharp image optimization failed, saving original buffer:',
          sharpError?.message || sharpError,
        );
        storedBuffer = file.buffer;
        storedMimeType = file.mimetype;
      }
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'healthdi-uploads';

    // 1. ถ้ามี Supabase Credentials ให้บันทึกลง Supabase Storage Bucket
    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const upload = () =>
          supabase.storage.from(bucket).upload(filename, storedBuffer, {
            contentType: storedMimeType,
            upsert: true,
          });
        let { error } = await upload();

        // A fresh Supabase project does not contain our storage bucket yet.
        // Create it on first use when the configured key has admin permission,
        // then retry the exact same upload once.
        if (error && /bucket not found/i.test(error.message)) {
          const { error: createError } = await supabase.storage.createBucket(
            bucket,
            {
              public: true,
              fileSizeLimit: 10 * 1024 * 1024,
              allowedMimeTypes,
            },
          );
          if (createError && !/already exists/i.test(createError.message)) {
            throw new BadRequestException(
              `ไม่พบ Supabase bucket "${bucket}" และสร้างอัตโนมัติไม่ได้: ${createError.message} กรุณาสร้าง bucket แบบ Public หรือกำหนด SUPABASE_SERVICE_ROLE_KEY`,
            );
          }
          ({ error } = await upload());
        }

        if (error) {
          throw new BadRequestException(
            `อัปโหลดไปยัง Supabase Storage ไม่สำเร็จ: ${error.message}`,
          );
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
        return {
          success: true,
          storage: 'supabase',
          filename,
          originalName: file.originalname,
          size: storedBuffer.length,
          originalSize: file.size,
          mimetype: storedMimeType,
          url: publicUrl,
        };
      } catch (err: any) {
        throw new BadRequestException(
          `เกิดข้อผิดพลาดในการอัปโหลด Supabase: ${err.message}`,
        );
      }
    }

    // 2. Fallback: สำหรับ Local Development บันทึกลงโฟลเดอร์ uploads บนดิสก์
    const uploadDir = path.join(process.cwd(), 'uploads');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, filename), storedBuffer);
    } catch (err) {
      console.warn(
        'Warning: Cannot write to local filesystem (Running on serverless without Supabase Storage):',
        err,
      );
    }

    // Serverless/local disks may be discarded between requests. For images,
    // return the optimized bytes inline so the URL stored in the database
    // remains self-contained and survives a refresh without persistent disk.
    const localUrl = isImage
      ? `data:${storedMimeType};base64,${storedBuffer.toString('base64')}`
      : `/api/v1/uploads/${filename}`;

    return {
      success: true,
      storage: 'local',
      filename,
      originalName: file.originalname,
      size: storedBuffer.length,
      originalSize: file.size,
      mimetype: storedMimeType,
      url: localUrl,
    };
  }
}
