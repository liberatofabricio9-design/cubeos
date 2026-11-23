require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  const ownerPass = await bcrypt.hash("admin123", 10);
  const staff = await prisma.staff.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash: ownerPass, role: "owner", teamCode: process.env.STAFF_TEAM_CODE || "CUBO-STAFF" },
  });
  console.log("Staff:", staff.username, "senha: admin123");

  // rules
  const rules = [
    { title: "Regra 01", body: "Não olhe para trás quando ouvir seu nome.", order: 1 },
    { title: "Regra 02", body: "Não responda a nada que não tenha identificação.", order: 2 },
    { title: "Regra 03", body: "Nunca fique sozinho depois das 03:00.", order: 3 },
    { title: "Regra 04", body: "Se a tela piscar, desligue e saia.", order: 4 },
  ];
  for (const r of rules) await prisma.rule.create({ data: r });

  // quiz
  await prisma.quizQuestion.create({
    data: { question: "Qual sinal é o mais estável?", options: JSON.stringify(["Sinal 01", "Sinal 02", "Sinal 03", "Sinal 07"]), answer: 0, createdBy: staff.id },
  });
  await prisma.quizQuestion.create({
    data: { question: "O que fazer se a tela piscar?", options: JSON.stringify(["Ignorar", "Desligar e sair", "Responder", "Chamar"]), answer: 1, createdBy: staff.id },
  });

  // ranking
  for (const r of [{ nick: "Sujeito 0001", score: 1280, playtime: 120 }, { nick: "Sujeito 0002", score: 940, playtime: 90 }, { nick: "Sujeito 0003", score: 720, playtime: 60 }]) {
    await prisma.serverRanking.create({ data: r });
  }

  // announcement
  await prisma.announcement.create({ data: { title: "Sinal 03", body: "Ele ainda está ouvindo. Não responda.", createdBy: staff.id } });

  // invite code
  await prisma.inviteCode.create({ data: { code: "CUBO-INVITE-001" } });

  console.log("Seed concluído.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
