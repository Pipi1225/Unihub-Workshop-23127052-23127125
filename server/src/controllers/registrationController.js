const registrationService = require("../services/registrationService");

async function registerWorkshop(req, res) {
  const { workshop_id: workshopId } = req.body || {};

  const result = await registrationService.registerWorkshop({
    userId: req.user.id,
    workshopId,
  });

  return res.status(201).json(result);
}

async function pullSync(req, res) {
  const { workshop_id: workshopId } = req.query || {};
  const data = await registrationService.getSyncData({ workshopId });
  return res.status(200).json(data);
}

async function syncRegistrations(req, res) {
  const payload = req.body;
  const result = await registrationService.syncCheckins({ items: payload });
  return res.status(200).json(result);
}

module.exports = {
  registerWorkshop,
  pullSync,
  syncRegistrations,
};
