import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const PROPERTIES = [
  { propertyId: "812",   shortCode: "JN", name: "Jacksonville North", address: "812 Dunn Avenue, Jacksonville, FL 32218" },
  { propertyId: "6802",  shortCode: "JW", name: "Jacksonville West",  address: "910 Suemac Road, Jacksonville, FL 32254" },
  { propertyId: "2295",  shortCode: "KE", name: "Kissimmee East",     address: "2295 E. Irlo Bronson Memorial Hwy, Kissimmee, FL 34744" },
  { propertyId: "5399",  shortCode: "KW", name: "Kissimmee West",     address: "5399 W. Irlo Bronson Memorial Hwy, Kissimmee, FL 34746" },
  { propertyId: "4645",  shortCode: "LL", name: "Lakeland",           address: "4645 N. Socrum Loop Road, Lakeland, FL 33809" },
  { propertyId: "8700",  shortCode: "OR", name: "Orlando OBT",        address: "8700 S. Orange Blossom Trail, Orlando, FL 32809" },
  { propertyId: "2535",  shortCode: "SA", name: "St. Augustine",      address: "2535 State Road 16, St. Augustine, FL 32092" },
  { propertyId: "44199", shortCode: "DP", name: "Davenport",          address: "44199 US Hwy 27, Davenport, FL 33897" },
];

const ADMIN_EMAIL   = "admin@rise8companies.com";
const MANAGER_EMAIL = "manager.lakeland@rentstayable.com";
const HK_EMAIL      = "hk.lakeland@rentstayable.com";
const DEFAULT_PASSWORD = "ChangeMe!2026";

async function main() {
  console.log("Seeding properties…");
  for (const p of PROPERTIES) {
    await db.property.upsert({
      where: { propertyId: p.propertyId },
      update: {
        shortCode: p.shortCode,
        name: p.name,
        address: p.address,
      },
      create: p,
    });
  }

  const lakeland = await db.property.findUniqueOrThrow({ where: { propertyId: "4645" } });
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log("Seeding admin…");
  await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: Role.ADMIN, name: "RISE8 Admin", active: true },
    create: {
      email: ADMIN_EMAIL,
      name: "RISE8 Admin",
      role: Role.ADMIN,
      passwordHash,
      mfaEnabled: false,
    },
  });

  console.log("Seeding Lakeland manager…");
  const manager = await db.user.upsert({
    where: { email: MANAGER_EMAIL },
    update: { role: Role.MANAGER, name: "Lakeland Manager", active: true },
    create: {
      email: MANAGER_EMAIL,
      name: "Lakeland Manager",
      role: Role.MANAGER,
      passwordHash,
    },
  });
  await db.userProperty.upsert({
    where: { userId_propertyId: { userId: manager.id, propertyId: lakeland.id } },
    update: {},
    create: { userId: manager.id, propertyId: lakeland.id },
  });

  console.log("Seeding Lakeland HK…");
  const hk = await db.user.upsert({
    where: { email: HK_EMAIL },
    update: { role: Role.HK, name: "Lakeland Housekeeper", active: true },
    create: {
      email: HK_EMAIL,
      name: "Lakeland Housekeeper",
      role: Role.HK,
      passwordHash,
    },
  });
  await db.userProperty.upsert({
    where: { userId_propertyId: { userId: hk.id, propertyId: lakeland.id } },
    update: {},
    create: { userId: hk.id, propertyId: lakeland.id },
  });

  const propertyCount = await db.property.count();
  const userCount = await db.user.count();
  console.log(`\nSeed complete — properties: ${propertyCount}, users: ${userCount}`);
  console.log(`Default password for seeded accounts: ${DEFAULT_PASSWORD}  (rotate before production use)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
