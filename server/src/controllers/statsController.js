const statsService = require("../services/statsService");

async function getStatistics(req, res) {
  const stats = await statsService.getStatistics();
  return res.status(200).json({ ok: true, data: stats });
}

async function getWorkshopAnalytics(req, res) {
  const stats = await statsService.getWorkshopAnalytics(req.params?.id);
  return res.status(200).json({ ok: true, data: stats });
}

module.exports = {
  getStatistics,
  getWorkshopAnalytics,
};
