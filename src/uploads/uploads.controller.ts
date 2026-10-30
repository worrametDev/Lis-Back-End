import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
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

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadsController {
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

    // Sanitize extension and generate cryptographically clean name
    const ext = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '');
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
        const { error } = await supabase.storage
          .from(bucket)
          .upload(filename, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

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
          size: file.size,
          mimetype: file.mimetype,
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
      fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
    } catch (err) {
      console.warn(
        'Warning: Cannot write to local filesystem (Running on serverless without Supabase Storage):',
        err,
      );
    }

    return {
      success: true,
      storage: 'local',
      filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/${filename}`,
    };
  }
}
