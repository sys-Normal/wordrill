import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

const TEST_USERS = [
  {
    email: "tester1@wordrill.local",
    loginId: "tester1",
    name: "Test User 1",
    nickname: "Tester 1",
    password: "wordrill1"
  },
  {
    email: "tester2@wordrill.local",
    loginId: "tester2",
    name: "Test User 2",
    nickname: "Tester 2",
    password: "wordrill2"
  }
];

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed test users in production.");
}

async function main() {
  for (const user of TEST_USERS) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: user.email },
          { loginId: user.loginId }
        ]
      },
      select: { id: true }
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: user.email,
          isTestUser: true,
          loginId: user.loginId,
          name: user.name,
          nickname: user.nickname,
          passwordHash: await hashPassword(user.password)
        }
      });

      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        isTestUser: true,
        loginId: user.loginId,
        name: user.name,
        nickname: user.nickname,
        passwordHash: await hashPassword(user.password)
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
