import { PrismaClient } from '@prisma/client';
import { ensureDefaultMasterData } from '../src/master-data/default-master-data';
const prisma = new PrismaClient();
ensureDefaultMasterData(prisma)
  .then(() => console.log('Shared master data initialized'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
