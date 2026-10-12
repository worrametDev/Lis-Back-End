const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('PG CONNECTED SUCCESSFULLY');
  } catch (e) {
    console.log('PG ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
