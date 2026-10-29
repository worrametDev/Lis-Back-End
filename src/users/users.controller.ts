import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'ดึงรายการผู้ใช้งานและบัญชีทั้งหมด (Account List)' })
  @ApiQuery({ name: 'search', required: false, description: 'คำค้นหา (ชื่อ, สกุล, username, email)' })
  @ApiQuery({ name: 'role', required: false, description: 'กรองตามบทบาท (SYSTEM_ADMINISTRATOR, MEDICAL_TECHNOLOGIST ฯลฯ)' })
  @ApiQuery({ name: 'status', required: false, description: 'กรองตามสถานะ (Active, Inactive)' })
  @ApiResponse({ status: 200, description: 'คืนค่ารายการผู้ใช้งาน' })
  async findAll(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.findAll(search, role, status);
  }

  @Get('options')
  @ApiOperation({ summary: 'ดึงตัวเลือกสำหรับฟอร์ม Account (Roles, Statuses, Sites จาก Database)' })
  @ApiResponse({ status: 200, description: 'คืนค่ารายการตัวเลือกสำหรับ Dropdowns' })
  async getOptions() {
    return this.usersService.getOptions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ดึงข้อมูลผู้ใช้งานรายบุคคลตาม ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'สร้างบัญชีผู้ใช้งานใหม่ (Create New Account Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'สมชาย', description: 'ชื่อจริง' },
        lastName: { type: 'string', example: 'ใจดี', description: 'นามสกุล' },
        telNo: { type: 'string', example: '081-234-5678', description: 'เบอร์โทรศัพท์' },
        email: { type: 'string', example: 'somchai@healthdi.lab', description: 'อีเมล' },
        position: { type: 'string', example: 'นักเทคนิคการแพทย์', description: 'ตำแหน่งงาน' },
        organization: { type: 'string', example: 'กลุ่มงานเทคนิคการแพทย์', description: 'หน่วยงาน / องค์กร' },
        username: { type: 'string', example: 'somchai.j', description: 'Username' },
        password: { type: 'string', example: 'Admin@1234', description: 'รหัสผ่าน' },
        role: { type: 'string', example: 'System Administrator', description: 'บทบาทผู้ใช้' },
        userStatus: { type: 'string', example: 'Active', description: 'สถานะผู้ใช้ (Active/Inactive)' },
        siteName: { type: 'string', example: 'โรงพยาบาลเสนา', description: 'สังกัดโรงพยาบาล/รพ.สต.' },
      },
      required: ['firstName', 'username'],
    },
  })
  @ApiResponse({ status: 201, description: 'สร้างบัญชีผู้ใช้งานสำเร็จ' })
  async create(@Body() body: any) {
    return this.usersService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'แก้ไขข้อมูลผู้ใช้งาน' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  @Put(':id/telemedicine-access')
  @ApiOperation({ summary: 'กำหนดสิทธิการเข้าใช้งาน Telemedicine และบทบาท (Doctor, Nurse, Staff, Admin)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async updateTelemedicineAccess(
    @Param('id') id: string,
    @Body() body: { telemedicineAccess: boolean; telemedicineRole?: string },
  ) {
    return this.usersService.updateTelemedicineAccess(id, body.telemedicineAccess, body.telemedicineRole);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ระงับการใช้งานบัญชี (Deactivate/Soft Delete)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
