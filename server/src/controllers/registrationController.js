const registrationService = require("../services/registrationService");

async function registerWorkshop(req, res) {
  const { workshop_id: workshopId } = req.body || {};

  const result = await registrationService.registerWorkshop({
    userId: req.user.id,
    workshopId,
  });

  return res.status(201).json(result);
}

async function getRegistration(req, res) {
  const { id: registrationId } = req.params || {};
  const data = await registrationService.getRegistrationById({
    registrationId,
    userId: req.user.id,
  });

  return res.status(200).json({ ok: true, data });
}

async function getRegistrationByWorkshop(req, res) {
  const { workshopId } = req.params || {};
  const data = await registrationService.getRegistrationByWorkshop({
    workshopId,
    userId: req.user.id,
  });

  return res.status(200).json({ ok: true, data });
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
  getRegistration,
  getRegistrationByWorkshop,
  pullSync,
  syncRegistrations,
};
