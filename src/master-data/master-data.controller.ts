import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { MasterDataService } from './master-data.service';

@ApiTags('Master Data')
@ApiBearerAuth('JWT-auth')
@Controller()
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('master-data/cache-debug')
  @ApiOperation({ summary: 'ดูสถานะและข้อมูลใน Cache ของ Master Data (Developer Diagnostics)' })
  getCacheDebug() {
    return this.masterDataService.getCacheStats();
  }

  // ==========================================
  // 1. PARENT SITES
  // ==========================================
  @Get('parent-sites')
  @ApiOperation({ summary: 'ดึงรายการ Parent Sites (โรงพยาบาลแม่ข่าย)' })
  @ApiResponse({ status: 200, description: 'คืนค่ารายการโรงพยาบาลแม่ข่าย' })
  findAllParentSites() {
    return this.masterDataService.findAllParentSites();
  }

  @Get('master-data/site-info')
  @ApiOperation({ summary: 'ดึงข้อมูลโรงพยาบาล/Site ติดตั้งของระบบ (Installation Site Info for Login & Leftbar)' })
  @ApiResponse({ status: 200, description: 'คืนค่าข้อมูลโรงพยาบาลที่ติดตั้งระบบ' })
  getSiteInfo() {
    return this.masterDataService.getSiteInfo();
  }

  @Post('parent-sites')
  @ApiOperation({ summary: 'สร้าง Parent Site ใหม่ (Create New Parent Site Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        siteCode: { type: 'string', example: '00940', description: 'รหัสโรงพยาบาลแม่ข่าย (SITE CODE)' },
        siteName: { type: 'string', example: 'โรงพยาบาลเสนา', description: 'ชื่อโรงพยาบาลแม่ข่าย (SITE NAME)' },
        siteType: { type: 'string', example: 'Parent Site' },
        siteStatus: { type: 'string', example: 'Active' },
        lnPattern: { type: 'string', example: 'LN-69{YY}{MM}{DD}{SEQ}' },
        address: { type: 'string', example: '111 หมู่ 2' },
        subdistrict: { type: 'string', example: 'ตำบลสามกอ' },
        district: { type: 'string', example: 'อำเภอเสนา' },
        province: { type: 'string', example: 'จังหวัดพระนครศรีอยุธยา' },
        zipcode: { type: 'string', example: '13110' },
      },
      required: ['siteCode', 'siteName'],
    },
  })
  createParentSite(@Body() body: any) {
    return this.masterDataService.createParentSite(body);
  }

  @Put('parent-sites/:id')
  @ApiOperation({ summary: 'แก้ไขข้อมูล Parent Site' })
  @ApiParam({ name: 'id', description: 'Parent Site ID' })
  updateParentSite(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateParentSite(id, body);
  }

  @Delete('parent-sites/:id')
  @ApiOperation({ summary: 'ลบข้อมูล Parent Site' })
  @ApiParam({ name: 'id', description: 'Parent Site ID' })
  deleteParentSite(@Param('id') id: string) {
    return this.masterDataService.deleteParentSite(id);
  }

  // ==========================================
  // 2. CLIENT SITES
  // ==========================================
  @Get('client-sites')
  @ApiOperation({ summary: 'ดึงรายการ Client Sites (รพ.สต. เครือข่ายลูกข่าย)' })
  @ApiQuery({ name: 'parentSiteId', required: false, description: 'กรองตาม Parent Site ID' })
  findAllClientSites(@Query('parentSiteId') parentSiteId?: string) {
    return this.masterDataService.findAllClientSites(parentSiteId);
  }

  @Post('client-sites')
  @ApiOperation({ summary: 'สร้าง Client Site ใหม่ (Create New Client Site Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        siteCode: { type: 'string', example: '00940-03', description: 'SITE CODE' },
        siteName: { type: 'string', example: 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านแพน', description: 'SITE NAME' },
        siteType: { type: 'string', example: 'Client Site' },
        siteStatus: { type: 'string', example: 'Active' },
        lnPattern: { type: 'string', example: 'LN-BP{SEQ}' },
        parentSiteId: { type: 'string', description: 'UUID ของ Parent Site' },
        address: { type: 'string', example: '55 หมู่ 1' },
        subdistrict: { type: 'string', example: 'ตำบลบ้านแพน' },
        district: { type: 'string', example: 'อำเภอเสนา' },
        province: { type: 'string', example: 'จังหวัดพระนครศรีอยุธยา' },
        zipcode: { type: 'string', example: '13110' },
      },
      required: ['siteCode', 'siteName'],
    },
  })
  createClientSite(@Body() body: any) {
    return this.masterDataService.createClientSite(body);
  }

  @Put('client-sites/:id')
  @ApiOperation({ summary: 'แก้ไขข้อมูล Client Site' })
  @ApiParam({ name: 'id', description: 'Client Site ID' })
  updateClientSite(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateClientSite(id, body);
  }

  @Delete('client-sites/:id')
  @ApiOperation({ summary: 'ลบข้อมูล Client Site' })
  @ApiParam({ name: 'id', description: 'Client Site ID' })
  deleteClientSite(@Param('id') id: string) {
    return this.masterDataService.deleteClientSite(id);
  }

  // ==========================================
  // 3. WARDS
  // ==========================================
  @Get('wards')
  @ApiOperation({ summary: 'ดึงรายการ Wards ทั้งหมด' })
  findAllWards() {
    return this.masterDataService.findAllWards();
  }

  @Post('wards')
  @ApiOperation({ summary: 'สร้าง Ward ใหม่ (Create New Ward Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        wardCode: { type: 'string', example: 'LR', description: 'WARD CODE (เช่น LR, ICU, OPD)' },
        wardName: { type: 'string', example: 'ห้องคลอด (Labor Room)', description: 'WARD NAME' },
        wardStatus: { type: 'string', example: 'Active' },
      },
      required: ['wardCode', 'wardName'],
    },
  })
  createWard(@Body() body: any) {
    return this.masterDataService.createWard(body);
  }

  @Put('wards/:id')
  @ApiOperation({ summary: 'แก้ไขข้อมูล Ward' })
  @ApiParam({ name: 'id', description: 'Ward ID' })
  updateWard(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateWard(id, body);
  }

  @Delete('wards/:id')
  @ApiOperation({ summary: 'ลบข้อมูล Ward' })
  @ApiParam({ name: 'id', description: 'Ward ID' })
  deleteWard(@Param('id') id: string) {
    return this.masterDataService.deleteWard(id);
  }

  // ==========================================
  // 4. DEPARTMENTS
  // ==========================================
  @Get('departments')
  @ApiOperation({ summary: 'ดึงรายการแผนกห้องปฏิบัติการ (Departments: HEM, CHM, IMM)' })
  findAllDepartments() {
    return this.masterDataService.findAllDepartments();
  }

  @Post('departments')
  @ApiOperation({ summary: 'สร้าง Department ใหม่ (Create New Department Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        departmentCode: { type: 'string', example: 'MB', description: 'DEPARTMENT CODE' },
        departmentName: { type: 'string', example: 'DEPT: MICROBIOLOGY', description: 'DEPARTMENT NAME' },
        deptStatus: { type: 'string', example: 'Active' },
      },
      required: ['departmentCode', 'departmentName'],
    },
  })
  createDepartment(@Body() body: any) {
    return this.masterDataService.createDepartment(body);
  }

  @Put('departments/:id')
  @ApiOperation({ summary: 'แก้ไขข้อมูล Department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  updateDepartment(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateDepartment(id, body);
  }

  @Delete('departments/:id')
  @ApiOperation({ summary: 'ลบข้อมูล Department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  deleteDepartment(@Param('id') id: string) {
    return this.masterDataService.deleteDepartment(id);
  }

  // ==========================================
  // 5. SAMPLE CONDITIONS
  // ==========================================
  @Get('sample-conditions')
  @ApiOperation({ summary: 'ดึงรายการสภาพสิ่งส่งตรวจ (Sample Conditions: Normal, Clot, Hemolysis)' })
  findAllSampleConditions() {
    return this.masterDataService.findAllSampleConditions();
  }

  @Post('sample-conditions')
  @ApiOperation({ summary: 'สร้าง Sample Condition ใหม่ (Create New Sample Condition Modal)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        conditionCode: { type: 'string', example: 'ICTERIC', description: 'CONDITION CODE' },
        conditionName: { type: 'string', example: 'สีเหลืองเข้ม/ดีซ่าน (Icteric)', description: 'CONDITION NAME' },
        sampleStatus: { type: 'string', example: 'Active' },
        isDefault: { type: 'boolean', example: false, description: 'ตั้งเป็นค่าเริ่มต้น' },
      },
      required: ['conditionCode', 'conditionName'],
    },
  })
  createSampleCondition(@Body() body: any) {
    return this.masterDataService.createSampleCondition(body);
  }

  @Put('sample-conditions/:id')
  @ApiOperation({ summary: 'แก้ไขข้อมูล Sample Condition' })
  @ApiParam({ name: 'id', description: 'Sample Condition ID' })
  updateSampleCondition(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateSampleCondition(id, body);
  }

  @Delete('sample-conditions/:id')
  @ApiOperation({ summary: 'ลบข้อมูล Sample Condition' })
  @ApiParam({ name: 'id', description: 'Sample Condition ID' })
  deleteSampleCondition(@Param('id') id: string) {
    return this.masterDataService.deleteSampleCondition(id);
  }

  // ==========================================
  // 6. TITLES
  // ==========================================
  @Get('titles')
  @ApiOperation({ summary: 'ดึงรายการคำนำหน้าชื่อ (Titles)' })
  findAllTitles() {
    return this.masterDataService.findAllTitles();
  }

  @Post('titles')
  @ApiOperation({ summary: 'สร้างคำนำหน้าชื่อใหม่' })
  createTitle(@Body() body: any) {
    return this.masterDataService.createTitle(body);
  }

  @Put('titles/:id')
  @ApiOperation({ summary: 'แก้ไขคำนำหน้าชื่อ' })
  updateTitle(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateTitle(id, body);
  }

  @Delete('titles/:id')
  @ApiOperation({ summary: 'ลบคำนำหน้าชื่อ' })
  deleteTitle(@Param('id') id: string) {
    return this.masterDataService.deleteTitle(id);
  }

  // ==========================================
  // 7. ETHNICITIES
  // ==========================================
  @Get('ethnicities')
  @ApiOperation({ summary: 'ดึงรายการเชื้อชาติ (Ethnicities)' })
  findAllEthnicities() {
    return this.masterDataService.findAllEthnicities();
  }

  @Post('ethnicities')
  @ApiOperation({ summary: 'สร้างเชื้อชาติใหม่' })
  createEthnicity(@Body() body: any) {
    return this.masterDataService.createEthnicity(body);
  }

  @Put('ethnicities/:id')
  @ApiOperation({ summary: 'แก้ไขเชื้อชาติ' })
  updateEthnicity(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateEthnicity(id, body);
  }

  @Delete('ethnicities/:id')
  @ApiOperation({ summary: 'ลบเชื้อชาติ' })
  deleteEthnicity(@Param('id') id: string) {
    return this.masterDataService.deleteEthnicity(id);
  }

  // ==========================================
  // 8. TEST PANELS
  // ==========================================
  @Get('test-panels')
  @ApiOperation({ summary: 'ดึงรายการชุดการตรวจ (Test Panels)' })
  findAllTestPanels() {
    return this.masterDataService.findAllTestPanels();
  }

  @Post('test-panels')
  @ApiOperation({ summary: 'สร้างชุดการตรวจใหม่' })
  createTestPanel(@Body() body: any) {
    return this.masterDataService.createTestPanel(body);
  }

  @Put('test-panels/:id')
  @ApiOperation({ summary: 'แก้ไขชุดการตรวจ' })
  updateTestPanel(@Param('id') id: string, @Body() body: any) {
    return this.masterDataService.updateTestPanel(id, body);
  }

  @Delete('test-panels/:id')
  @ApiOperation({ summary: 'ลบชุดการตรวจ' })
  deleteTestPanel(@Param('id') id: string) {
    return this.masterDataService.deleteTestPanel(id);
  }
}

