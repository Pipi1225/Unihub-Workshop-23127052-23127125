const prisma = require("../config/prisma");

async function getStatistics() {
  const [totalWorkshops, totalRegistrations, paidRegistrations, revenueAgg] =
    await Promise.all([
      prisma.workshops.count(),
      prisma.registrations.count(),
      prisma.registrations.count({ where: { payment_status: "PAID" } }),
      prisma.payments.aggregate({
        _sum: { amount: true },
        where: { status: "SUCCESS" },
      }),
    ]);

  const totalRevenue = revenueAgg?._sum?.amount || 0;

  return {
    total_workshops: totalWorkshops,
    total_registrations: totalRegistrations,
    paid_registrations: paidRegistrations,
    total_revenue: totalRevenue,
  };
}

async function getWorkshopAnalytics(workshopId) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop id"), { statusCode: 400 });
  }

  const workshop = await prisma.workshops.findUnique({
    where: { id: workshopId },
    select: { id: true },
  });

  if (!workshop) {
    throw Object.assign(new Error("Workshop not found"), { statusCode: 404 });
  }

  const [totalRegistrations, paidRegistrations, registrationIds] =
    await Promise.all([
      prisma.registrations.count({ where: { workshop_id: workshopId } }),
      prisma.registrations.count({
        where: { workshop_id: workshopId, payment_status: "PAID" },
      }),
      prisma.registrations.findMany({
        where: { workshop_id: workshopId },
        select: { id: true },
      }),
    ]);

  const ids = registrationIds.map((item) => item.id);
  const revenueAgg = ids.length
    ? await prisma.payments.aggregate({
        _sum: { amount: true },
        where: { status: "SUCCESS", registration_id: { in: ids } },
      })
    : { _sum: { amount: null } };

  const totalRevenue = revenueAgg?._sum?.amount || 0;

  return {
    workshop_id: workshopId,
    total_registrations: totalRegistrations,
    paid_registrations: paidRegistrations,
    total_revenue: totalRevenue,
  };
}

module.exports = {
  getStatistics,
  getWorkshopAnalytics,
};
