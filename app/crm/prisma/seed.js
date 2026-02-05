/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function cents(n) {
  return Math.round(n * 100);
}

async function main() {
  const adminEmail = 'admin@local.dev';
  const password = 'admin1234';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Admin',
      role: 'admin',
      status: 'active',
      passwordHash,
    },
    create: {
      email: adminEmail,
      name: 'Admin',
      role: 'admin',
      status: 'active',
      passwordHash,
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@local.dev' },
    update: {
      name: 'Supervisor',
      role: 'supervisor',
      status: 'active',
      supervisorId: null,
      passwordHash,
    },
    create: {
      email: 'supervisor@local.dev',
      name: 'Supervisor',
      role: 'supervisor',
      status: 'active',
      supervisorId: null,
      passwordHash,
    },
  });

  const chatter = await prisma.user.upsert({
    where: { email: 'chatter@local.dev' },
    update: {
      name: 'Chatter',
      role: 'chatter',
      status: 'active',
      supervisorId: supervisor.id,
      hourlyRateCents: cents(8.5),
      passwordHash,
    },
    create: {
      email: 'chatter@local.dev',
      name: 'Chatter',
      role: 'chatter',
      status: 'active',
      supervisorId: supervisor.id,
      hourlyRateCents: cents(8.5),
      passwordHash,
    },
  });

  const chatter2 = await prisma.user.upsert({
    where: { email: 'chatter2@local.dev' },
    update: {
      name: 'Chatter 2',
      role: 'chatter',
      status: 'active',
      supervisorId: supervisor.id,
      hourlyRateCents: cents(9.25),
      passwordHash,
    },
    create: {
      email: 'chatter2@local.dev',
      name: 'Chatter 2',
      role: 'chatter',
      status: 'active',
      supervisorId: supervisor.id,
      hourlyRateCents: cents(9.25),
      passwordHash,
    },
  });

  const creator = await prisma.creator.upsert({
    where: {
      platform_username: { platform: 'onlyfans', username: 'demo_creator' },
    },
    update: {
      displayName: 'Demo Creator',
      status: 'active',
    },
    create: {
      platform: 'onlyfans',
      username: 'demo_creator',
      displayName: 'Demo Creator',
      status: 'active',
    },
  });

  const creator2 = await prisma.creator.upsert({
    where: {
      platform_username: { platform: 'fansly', username: 'demo_creator_2' },
    },
    update: {
      displayName: 'Demo Creator 2',
      status: 'active',
    },
    create: {
      platform: 'fansly',
      username: 'demo_creator_2',
      displayName: 'Demo Creator 2',
      status: 'active',
    },
  });

  await prisma.chatterCreator.upsert({
    where: { id: 'seed-assignment-1' },
    update: {
      chatterId: chatter.id,
      creatorId: creator.id,
      isPrimary: true,
      unassignedAt: null,
    },
    create: {
      id: 'seed-assignment-1',
      chatterId: chatter.id,
      creatorId: creator.id,
      isPrimary: true,
    },
  });

  await prisma.chatterCreator.upsert({
    where: { id: 'seed-assignment-2' },
    update: {
      chatterId: chatter2.id,
      creatorId: creator2.id,
      isPrimary: true,
      unassignedAt: null,
    },
    create: {
      id: 'seed-assignment-2',
      chatterId: chatter2.id,
      creatorId: creator2.id,
      isPrimary: true,
    },
  });

  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const hoursAgo = (n) => new Date(now.getTime() - n * 60 * 60 * 1000);

  // Seed some shifts so admin/supervisor pages + payroll generation have data.
  // (mix of approved + pending)
  await prisma.shift.upsert({
    where: { id: 'seed-shift-1' },
    update: {
      chatterId: chatter.id,
      clockIn: hoursAgo(10),
      clockOut: hoursAgo(2),
      breakMinutes: 30,
      notes: 'Seeded shift (approved)',
      approvedById: supervisor.id,
      approvedAt: hoursAgo(1.5),
    },
    create: {
      id: 'seed-shift-1',
      chatterId: chatter.id,
      clockIn: hoursAgo(10),
      clockOut: hoursAgo(2),
      breakMinutes: 30,
      notes: 'Seeded shift (approved)',
      approvedById: supervisor.id,
      approvedAt: hoursAgo(1.5),
    },
  });

  await prisma.shift.upsert({
    where: { id: 'seed-shift-2' },
    update: {
      chatterId: chatter.id,
      clockIn: daysAgo(2),
      clockOut: new Date(daysAgo(2).getTime() + 4.5 * 60 * 60 * 1000),
      breakMinutes: 15,
      notes: 'Seeded shift (pending approval)',
      approvedById: null,
      approvedAt: null,
    },
    create: {
      id: 'seed-shift-2',
      chatterId: chatter.id,
      clockIn: daysAgo(2),
      clockOut: new Date(daysAgo(2).getTime() + 4.5 * 60 * 60 * 1000),
      breakMinutes: 15,
      notes: 'Seeded shift (pending approval)',
    },
  });

  await prisma.shift.upsert({
    where: { id: 'seed-shift-3' },
    update: {
      chatterId: chatter2.id,
      clockIn: daysAgo(3),
      clockOut: new Date(daysAgo(3).getTime() + 6 * 60 * 60 * 1000),
      breakMinutes: 45,
      notes: 'Seeded shift 2 (approved)',
      approvedById: supervisor.id,
      approvedAt: daysAgo(3),
    },
    create: {
      id: 'seed-shift-3',
      chatterId: chatter2.id,
      clockIn: daysAgo(3),
      clockOut: new Date(daysAgo(3).getTime() + 6 * 60 * 60 * 1000),
      breakMinutes: 45,
      notes: 'Seeded shift 2 (approved)',
      approvedById: supervisor.id,
      approvedAt: daysAgo(3),
    },
  });

  // Ensure there is at least one open pay period so payroll generation UI has context.
  const openPeriod = await prisma.payPeriod.upsert({
    where: { id: 'seed-payperiod-1' },
    update: {
      startDate: daysAgo(7),
      endDate: now,
      status: 'open',
    },
    create: {
      id: 'seed-payperiod-1',
      startDate: daysAgo(7),
      endDate: now,
      status: 'open',
    },
  });

  // Also seed a past paid period so the “Approved/Paid” supervisor/admin tabs have something to render.
  const paidPeriod = await prisma.payPeriod.upsert({
    where: { id: 'seed-payperiod-0' },
    update: {
      startDate: daysAgo(14),
      endDate: daysAgo(7),
      status: 'paid',
    },
    create: {
      id: 'seed-payperiod-0',
      startDate: daysAgo(14),
      endDate: daysAgo(7),
      status: 'paid',
    },
  });

  // A couple of sample bonus rules so the admin page isn't empty.
  await prisma.bonusRule.upsert({
    where: { id: 'seed-bonusrule-1' },
    update: {
      name: 'Revenue % (demo)',
      type: 'percentage',
      percentageBps: 300, // 3.00%
      isActive: true,
    },
    create: {
      id: 'seed-bonusrule-1',
      name: 'Revenue % (demo)',
      type: 'percentage',
      percentageBps: 300,
      isActive: true,
    },
  });

  const flatRule = await prisma.bonusRule.upsert({
    where: { id: 'seed-bonusrule-2' },
    update: {
      name: 'Flat bonus (demo)',
      type: 'flat',
      flatAmountCents: 2500, // €25.00
      isActive: true,
    },
    create: {
      id: 'seed-bonusrule-2',
      name: 'Flat bonus (demo)',
      type: 'flat',
      flatAmountCents: 2500,
      isActive: true,
    },
  });

  // Seed payrolls so supervisor/admin pages have “pending + paid” rows.
  const seedPayroll = async ({ chatterUser, payPeriodId, status, approvedById, approvedAt, minutesWorked, bonusCents }) => {
    const basePayCents = Math.round((chatterUser.hourlyRateCents || 0) * (minutesWorked / 60));
    const bonusTotalCents = bonusCents || 0;
    const netPayCents = basePayCents + bonusTotalCents;

    const payroll = await prisma.payroll.upsert({
      where: {
        chatterId_payPeriodId: {
          chatterId: chatterUser.id,
          payPeriodId,
        },
      },
      update: {
        hoursWorkedMinutes: minutesWorked,
        basePayCents,
        bonusTotalCents,
        deductionsCents: 0,
        netPayCents,
        status,
        approvedById: approvedById || null,
        approvedAt: approvedAt || null,
      },
      create: {
        chatterId: chatterUser.id,
        payPeriodId,
        hoursWorkedMinutes: minutesWorked,
        basePayCents,
        bonusTotalCents,
        deductionsCents: 0,
        netPayCents,
        status,
        approvedById: approvedById || null,
        approvedAt: approvedAt || null,
      },
    });

    if (bonusTotalCents > 0) {
      await prisma.bonus.upsert({
        where: { id: `seed-bonus-${payroll.id}` },
        update: {
          payrollId: payroll.id,
          bonusRuleId: flatRule.id,
          description: 'Seeded flat bonus',
          amountCents: bonusTotalCents,
        },
        create: {
          id: `seed-bonus-${payroll.id}`,
          payrollId: payroll.id,
          bonusRuleId: flatRule.id,
          description: 'Seeded flat bonus',
          amountCents: bonusTotalCents,
        },
      });
    }

    return payroll;
  };

  // Pending (draft) payrolls for the current open period.
  await seedPayroll({
    chatterUser: chatter,
    payPeriodId: openPeriod.id,
    status: 'draft',
    minutesWorked: 8 * 60,
    bonusCents: 2500,
  });

  await seedPayroll({
    chatterUser: chatter2,
    payPeriodId: openPeriod.id,
    status: 'draft',
    minutesWorked: 6 * 60 + 30,
    bonusCents: 0,
  });

  // Paid payrolls for the past period.
  await seedPayroll({
    chatterUser: chatter,
    payPeriodId: paidPeriod.id,
    status: 'paid',
    approvedById: supervisor.id,
    approvedAt: daysAgo(6),
    minutesWorked: 7 * 60,
    bonusCents: 2500,
  });

  // Seed a few KPI snapshots so the admin KPI page has real rows.
  // Uses the compound unique key (chatterId, creatorId, snapshotDate).
  const seedSnapshot = async ({ chatterId, creatorId, snapshotDate, revenueCents, messagesSent, tipsReceivedCents, newSubs }) => {
    await prisma.kpiSnapshot.upsert({
      where: {
        chatterId_creatorId_snapshotDate: {
          chatterId,
          creatorId,
          snapshotDate,
        },
      },
      update: {
        revenueCents,
        messagesSent,
        tipsReceivedCents,
        newSubs,
        source: 'manual',
      },
      create: {
        chatterId,
        creatorId,
        snapshotDate,
        revenueCents,
        messagesSent,
        tipsReceivedCents,
        newSubs,
        source: 'manual',
      },
    });
  };

  await seedSnapshot({
    chatterId: chatter.id,
    creatorId: creator.id,
    snapshotDate: daysAgo(1),
    revenueCents: cents(820),
    messagesSent: 310,
    tipsReceivedCents: cents(55),
    newSubs: 12,
  });

  await seedSnapshot({
    chatterId: chatter.id,
    creatorId: creator.id,
    snapshotDate: daysAgo(2),
    revenueCents: cents(640),
    messagesSent: 255,
    tipsReceivedCents: cents(20),
    newSubs: 9,
  });

  await seedSnapshot({
    chatterId: chatter2.id,
    creatorId: creator2.id,
    snapshotDate: daysAgo(1),
    revenueCents: cents(390),
    messagesSent: 180,
    tipsReceivedCents: cents(15),
    newSubs: 6,
  });

  console.log('Seed complete. Login creds:');
  console.log(' - admin@local.dev / admin1234');
  console.log(' - supervisor@local.dev / admin1234');
  console.log(' - chatter@local.dev / admin1234');
  console.log(' - chatter2@local.dev / admin1234');
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
