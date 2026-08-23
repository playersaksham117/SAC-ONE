import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { products } from "../data/products";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  for (const product of products) {
    const threshold = product.stockCount <= 20 ? 5 : 10;
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        storeBrand: "sacvolt",
        name: product.name,
        brand: product.brand,
        category: product.category,
        price: product.price,
        mrp: product.mrp ?? null,
        sku: product.sku,
        availability: product.availability,
        stockCount: product.stockCount,
        lowStockThreshold: threshold,
        image: product.image,
        images: JSON.stringify(product.images),
        description: product.description,
        specifications: JSON.stringify(product.specifications),
        rating: product.rating,
        reviewCount: product.reviewCount,
        featured: product.featured ?? false,
      },
      create: {
        id: product.id,
        storeBrand: "sacvolt",
        name: product.name,
        brand: product.brand,
        category: product.category,
        price: product.price,
        mrp: product.mrp ?? null,
        sku: product.sku,
        availability: product.availability,
        stockCount: product.stockCount,
        lowStockThreshold: threshold,
        image: product.image,
        images: JSON.stringify(product.images),
        description: product.description,
        specifications: JSON.stringify(product.specifications),
        rating: product.rating,
        reviewCount: product.reviewCount,
        featured: product.featured ?? false,
      },
    });
  }

  const adminPassword = await bcrypt.hash("Admin@2026", 12);
  const managerPassword = await bcrypt.hash("Manager@2026", 12);

  await prisma.adminUser.upsert({
    where: { email: "admin@trysachinelectricals.com" },
    update: {
      password: adminPassword,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      active: true,
    },
    create: {
      email: "admin@trysachinelectricals.com",
      name: "Super Admin",
      password: adminPassword,
      role: "SUPER_ADMIN",
    },
  });

  await prisma.adminUser.upsert({
    where: { email: "manager@trysachinelectricals.com" },
    update: {
      password: managerPassword,
      name: "Store Manager",
      role: "MANAGER",
      active: true,
    },
    create: {
      email: "manager@trysachinelectricals.com",
      name: "Store Manager",
      password: managerPassword,
      role: "MANAGER",
    },
  });

  console.log(`Seeded ${products.length} products and admin users.`);
  console.log("Admin login: admin@trysachinelectricals.com / Admin@2026");
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
