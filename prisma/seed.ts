import { PrismaClient, UserRole, UserStatus, OrderStatus, SpecimenStatus, ResultFlag } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding for Healthdi Lab LIS...');

  // 1. Create Parent Site (โรงพยาบาลเสนา)
  const parentSite = await prisma.parentSite.upsert({
    where: { siteCode: '00940' },
    update: {},
    create: {
      siteCode: '00940',
      siteName: 'โรงพยาบาลเสนา',
      siteType: 'Parent Site',
      siteStatus: 'Active',
      address: '111 หมู่ 2 ตำบลสามกอ อำเภอเสนา จังหวัดพระนครศรีอยุธยา 13110',
    },
  });
  console.log(`✅ Parent Site created: ${parentSite.siteName} (${parentSite.siteCode})`);

  // 2. Create Client Sites (รพ.สต. เครือข่าย)
  const clientSite1 = await prisma.clientSite.upsert({
    where: { siteCode: '00940-01' },
    update: {},
    create: {
      siteCode: '00940-01',
      siteName: 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
      parentSiteId: parentSite.id,
      address: 'ตำบลทุ่งแสลงหลวง',
    },
  });

  const clientSite2 = await prisma.clientSite.upsert({
    where: { siteCode: '00940-02' },
    update: {},
    create: {
      siteCode: '00940-02',
      siteName: 'โรงพยาบาลส่งเสริมสุขภาพตำบลบางด้วน',
      parentSiteId: parentSite.id,
      address: '120/4 หมู่ 5 ตำบลบางด้วน อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10270',
    },
  });
  console.log(`✅ Client Sites created: ${clientSite1.siteName}, ${clientSite2.siteName}`);

  // 3. Create Wards
  const wards = [
    { wardCode: 'OPD', wardName: 'ผู้ป่วยนอก (OPD)' },
    { wardCode: 'IPD1', wardName: 'หอผู้ป่วยใน 1 (IPD)' },
    { wardCode: 'ER', wardName: 'อุบัติเหตุและฉุกเฉิน (ER)' },
  ];
  const createdWards = [];
  for (const w of wards) {
    const ward = await prisma.ward.upsert({
      where: { id: `ward-${w.wardCode.toLowerCase()}` },
      update: {},
      create: {
        id: `ward-${w.wardCode.toLowerCase()}`,
        wardCode: w.wardCode,
        wardName: w.wardName,
        parentSiteId: parentSite.id,
      },
    });
    createdWards.push(ward);
  }
  console.log('✅ Wards initialized');

  // 4. Create Departments
  const departments = [
    { departmentCode: 'HEM', departmentName: 'DEPT: HEMATOLOGY' },
    { departmentCode: 'CHM', departmentName: 'DEPT: CHEMISTRY' },
    { departmentCode: 'IMM', departmentName: 'DEPT: IMMUNOLOGY' },
  ];

  let hemDept = null;
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { departmentCode: dept.departmentCode },
      update: {},
      create: dept,
    });
    if (d.departmentCode === 'HEM') hemDept = d;
  }
  console.log('✅ Laboratory Departments initialized');

  // 5. Create Sample Conditions
  const conditions = [
    { conditionCode: 'NORMAL', conditionName: 'ปกติ (Normal)' },
    { conditionCode: 'HEMOLYSIS', conditionName: 'เม็ดเลือดแดงแตก (Hemolysis)' },
    { conditionCode: 'CLOT', conditionName: 'มีลิ่มเลือด (Clot)' },
    { conditionCode: 'LIPEMIC', conditionName: 'สารไขมันสูง (Lipemic)' },
    { conditionCode: 'VOL_INSUF', conditionName: 'ปริมาตรไม่เพียงพอ (Insufficient Volume)' },
  ];

  for (const cond of conditions) {
    await prisma.sampleCondition.upsert({
      where: { conditionCode: cond.conditionCode },
      update: {},
      create: cond,
    });
  }
  console.log('✅ Sample Conditions initialized');

  // 6. Create Users
  const defaultPasswordHash = bcrypt.hashSync('Admin@1234', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      userRole: UserRole.SYSTEM_ADMINISTRATOR,
      userStatus: UserStatus.ACTIVE,
    },
    create: {
      username: 'admin',
      passwordHash: defaultPasswordHash,
      email: 'admin@healthdi.lab',
      firstName: 'System',
      lastName: 'Administrator',
      userRole: UserRole.SYSTEM_ADMINISTRATOR,
      userStatus: UserStatus.ACTIVE,
      licenseNo: '19935',
      province: 'พระนครศรีอยุธยา',
      healthRegion: 'เขตสุขภาพที่ 4',
      parentSiteId: parentSite.id,
    },
  });

  const mtUser = await prisma.user.upsert({
    where: { username: 'thititada.p' },
    update: {
      userRole: UserRole.SYSTEM_ADMINISTRATOR,
      userStatus: UserStatus.ACTIVE,
    },
    create: {
      username: 'thititada.p',
      passwordHash: defaultPasswordHash,
      email: 'thititada.p@mpgroup.co.th',
      firstName: 'ธิติธาดา',
      lastName: 'พัฒลักษณ์',
      userRole: UserRole.SYSTEM_ADMINISTRATOR,
      userStatus: UserStatus.ACTIVE,
      licenseNo: '19935',
      province: 'พระนครศรีอยุธยา',
      healthRegion: 'เขตสุขภาพที่ 4',
      parentSiteId: parentSite.id,
    },
  });

  console.log(`👑 Super Admin users ready: admin, thititada.p`);

  // 7. Seed Sample Orders and Test Results matching PDF design
  const samplePatients = [
    { hn: '68/01254', name: 'นายธิติธาดา พัฒลักษณ์', lab: '691006002' },
    { hn: '68/01255', name: 'นางสาวสมศรี สุขเกษม', lab: '691006003' },
    { hn: '68/01256', name: 'นายสมบัติ รักชาติ', lab: '691006004' },
    { hn: '68/01257', name: 'นางวิไลวรรณ มีสุข', lab: '691006005' },
    { hn: '68/01258', name: 'นายบุญมา ทวีทรัพย์', lab: '691006006' },
  ];

  for (const p of samplePatients) {
    const existingOrder = await prisma.order.findFirst({ where: { hn: p.hn } });
    if (!existingOrder) {
      const order = await prisma.order.create({
        data: {
          hn: p.hn,
          patientName: p.name,
          clientSiteId: clientSite1.id,
          parentSiteId: parentSite.id,
          wardId: createdWards[0].id,
          status: OrderStatus.REGISTERED,
          samples: {
            create: {
              labNumber: p.lab,
              barcode: p.lab,
              specimenType: 'Heparinized Blood',
              status: SpecimenStatus.REGISTERED,
            },
          },
        },
        include: { samples: true },
      });

      if (hemDept && order.samples[0]) {
        const tests = [
          { testPanel: 'CBC', testName: 'WBC Count', unit: '10^3 cell/ul', referenceRange: '4.00 - 10.00', testResult: '4.52', flag: ResultFlag.NORMAL, lastResult: '4.16', repeatResult: '4.48' },
          { testPanel: 'CBC', testName: 'RBC Count', unit: '10^6 cell/ul', referenceRange: '4.00 - 10.00', testResult: '4.52', flag: ResultFlag.NORMAL, lastResult: '4.16', repeatResult: '4.48' },
          { testPanel: 'CBC', testName: 'Hemoglobin', unit: 'g/dL', referenceRange: '12.00 - 16.00', testResult: '14.2', flag: ResultFlag.NORMAL, lastResult: '13.8', repeatResult: '14.1' },
          { testPanel: 'CBC', testName: 'Hematocrit', unit: '%', referenceRange: '36.0 - 48.0', testResult: '42.5', flag: ResultFlag.NORMAL, lastResult: '41.0', repeatResult: '42.3' },
          { testPanel: 'CBC', testName: 'Platelet Count', unit: '10^3 cell/ul', referenceRange: '140 - 400', testResult: '285', flag: ResultFlag.NORMAL, lastResult: '270', repeatResult: '280' },
        ];
        for (const t of tests) {
          await prisma.testResult.create({
            data: {
              sampleId: order.samples[0].id,
              departmentId: hemDept.id,
              ...t,
            },
          });
        }
      }
    }
  }
  console.log('✅ Sample Orders and Test Results seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
