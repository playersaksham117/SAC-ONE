import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("Admin@2026", 12);
  const managerPassword = await bcrypt.hash("Manager@2026", 12);

  await prisma.adminUser.upsert({
    where: { email: "admin@trysachinelectricals.com" },
    update: { password: adminPassword, active: true, role: "SUPER_ADMIN" },
    create: {
      email: "admin@trysachinelectricals.com",
      name: "Super Admin",
      password: adminPassword,
      role: "SUPER_ADMIN",
    },
  });

  await prisma.adminUser.upsert({
    where: { email: "manager@trysachinelectricals.com" },
    update: { password: managerPassword, active: true, role: "MANAGER" },
    create: {
      email: "manager@trysachinelectricals.com",
      name: "Store Manager",
      password: managerPassword,
      role: "MANAGER",
    },
  });

  const valid = await bcrypt.compare(
    "Admin@2026",
    (
      await prisma.adminUser.findUnique({
        where: { email: "admin@trysachinelectricals.com" },
      })
    )!.password
  );

  console.log("Admin password reset complete.");
  console.log("Email: admin@trysachinelectricals.com");
  console.log("Password: Admin@2026");
  console.log("Verification:", valid ? "OK" : "FAILED");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
