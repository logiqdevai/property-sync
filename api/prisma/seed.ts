import { PrismaClient, AuthRole } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = 'Password123!';

const SEED_USERS: { email: string; role: AuthRole }[] = [
    { email: 'superadmin@propertysync.dev', role: AuthRole.SUPER_ADMIN },
    { email: 'admin@propertysync.dev', role: AuthRole.ADMIN },
    { email: 'support@propertysync.dev', role: AuthRole.SUPPORT },
    { email: 'user@propertysync.dev', role: AuthRole.USER },
];

async function main() {
    const password = await bcrypt.hash(DEV_PASSWORD, 10);

    for (const seedUser of SEED_USERS) {
        await prisma.user.upsert({
            where: { email: seedUser.email },
            update: { role: seedUser.role },
            create: { email: seedUser.email, password, role: seedUser.role },
        });
    }

    console.log('Seeded dev users (password for all: %s):', DEV_PASSWORD);
    for (const seedUser of SEED_USERS) {
        console.log(`  ${seedUser.role.padEnd(11)} ${seedUser.email}`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
