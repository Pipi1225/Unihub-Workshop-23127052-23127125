const registrationService = require("../services/registrationService");

async function registerWorkshop(req, res) {
  const { workshop_id: workshopId } = req.body || {};

  const result = await registrationService.registerWorkshop({
    userId: req.user.id,
    workshopId,
  });

  return res.status(201).json(result);
}

module.exports = {
  registerWorkshop,
};
