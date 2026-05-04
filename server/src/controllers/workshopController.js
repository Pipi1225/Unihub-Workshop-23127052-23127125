const workshopService = require("../services/workshopService");

async function listWorkshops(req, res) {
  const includeAll = req.query?.include_all === "true";
  const workshops = await workshopService.listWorkshops({ includeAll });
  return res.status(200).json({ ok: true, data: workshops });
}

async function createWorkshop(req, res) {
  const workshop = await workshopService.createWorkshop({
    payload: req.body || {},
    file: req.file,
  });
  return res.status(201).json({ ok: true, data: workshop });
}

async function updateWorkshop(req, res) {
  const workshop = await workshopService.updateWorkshop({
    workshopId: req.params?.id,
    payload: req.body || {},
    file: req.file,
  });
  return res.status(200).json({ ok: true, data: workshop });
}

async function deleteWorkshop(req, res) {
  const result = await workshopService.deleteWorkshop({
    workshopId: req.params?.id,
  });
  return res.status(200).json(result);
}

module.exports = {
  listWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
};
