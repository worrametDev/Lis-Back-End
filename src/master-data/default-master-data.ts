import { PrismaClient } from '@prisma/client';

// Installation-independent defaults only. Existing edits and inactive rows are preserved.
export async function ensureDefaultMasterData(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.title.createMany({
      skipDuplicates: true,
      data: [
        { titleCode: '01', titleNameTh: 'นาย', titleNameEn: 'Mr.' },
        { titleCode: '02', titleNameTh: 'นาง', titleNameEn: 'Mrs.' },
        { titleCode: '03', titleNameTh: 'นางสาว', titleNameEn: 'Miss' },
        { titleCode: '04', titleNameTh: 'เด็กชาย', titleNameEn: 'Master' },
        { titleCode: '05', titleNameTh: 'เด็กหญิง', titleNameEn: 'Girl' },
      ],
    }),
    prisma.ethnicity.createMany({
      skipDuplicates: true,
      data: [
        {
          ethnicityCode: 'TH',
          ethnicityNameTh: 'ไทย',
          ethnicityNameEn: 'Thai',
        },
        {
          ethnicityCode: 'MM',
          ethnicityNameTh: 'เมียนมา',
          ethnicityNameEn: 'Myanmar',
        },
        { ethnicityCode: 'LA', ethnicityNameTh: 'ลาว', ethnicityNameEn: 'Lao' },
        {
          ethnicityCode: 'KH',
          ethnicityNameTh: 'กัมพูชา',
          ethnicityNameEn: 'Cambodian',
        },
        {
          ethnicityCode: 'CN',
          ethnicityNameTh: 'จีน',
          ethnicityNameEn: 'Chinese',
        },
        {
          ethnicityCode: 'OTHER',
          ethnicityNameTh: 'อื่นๆ',
          ethnicityNameEn: 'Other',
        },
      ],
    }),
    prisma.department.createMany({
      skipDuplicates: true,
      data: [
        { departmentCode: 'HEM', departmentName: 'DEPT: HEMATOLOGY' },
        { departmentCode: 'CHM', departmentName: 'DEPT: CHEMISTRY' },
        { departmentCode: 'IMM', departmentName: 'DEPT: IMMUNOLOGY' },
        { departmentCode: 'MIC', departmentName: 'DEPT: MICROBIOLOGY' },
        { departmentCode: 'UA', departmentName: 'DEPT: URINALYSIS' },
        { departmentCode: 'TOX', departmentName: 'DEPT: TOXICOLOGY' },
        { departmentCode: 'GEN', departmentName: 'DEPT: GENERAL LAB' },
      ],
    }),
    prisma.sampleCondition.createMany({
      skipDuplicates: true,
      data: [
        { conditionCode: 'NORMAL', conditionName: 'ปกติ (Normal)' },
        {
          conditionCode: 'HEMOLYSIS',
          conditionName: 'เม็ดเลือดแดงแตก (Hemolysis)',
        },
        { conditionCode: 'CLOT', conditionName: 'มีลิ่มเลือด (Clot)' },
        { conditionCode: 'LIPEMIC', conditionName: 'สารไขมันสูง (Lipemic)' },
        {
          conditionCode: 'VOL_INSUF',
          conditionName: 'ปริมาตรไม่เพียงพอ (Insufficient Volume)',
        },
        {
          conditionCode: 'WRONG_TUBE',
          conditionName: 'ใส่หลอดผิดประเภท (Wrong Tube)',
        },
        { conditionCode: 'OTHER', conditionName: 'อื่นๆ (ระบุ)' },
      ],
    }),
  ]);
}
