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
    { title: "Respeito", body: "Trate todos bem, dentro e fora do jogo.", order: 1 },
    { title: "Sem grief", body: "Não destrua nem roube construções alheias.", order: 2 },
    { title: "Sem hacks", body: "Mods de vantagem e macros são proibidos.", order: 3 },
    { title: "Staff", body: "As decisões da equipe são finais.", order: 4 },
  ];
  for (const r of rules) await prisma.rule.create({ data: r });

  // quiz
  await prisma.quizQuestion.create({
    data: { question: "Qual minério é o mais raro?", options: JSON.stringify(["Carvão", "Ferro", "Diamante", "Ouro"]), answer: 2, createdBy: staff.id },
  });
  await prisma.quizQuestion.create({
    data: { question: "Em que dimensão ficam os piglins?", options: JSON.stringify(["Overworld", "Nether", "End", "Caverna"]), answer: 1, createdBy: staff.id },
  });

  // ranking
  for (const r of [{ nick: "Alex", score: 1280, playtime: 120 }, { nick: "Bia", score: 940, playtime: 90 }, { nick: "Caio", score: 720, playtime: 60 }]) {
    await prisma.serverRanking.create({ data: r });
  }

  // announcement
  await prisma.announcement.create({ data: { title: "Sorteio Semanal", body: "Participe do sorteio de sábado!", createdBy: staff.id } });

  // invite code
  await prisma.inviteCode.create({ data: { code: "CUBO-INVITE-001" } });

  console.log("Seed concluído.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
