const express = require("express");
const QRCode = require("qrcode");

const router = express.Router();

router.get("/:hash", async (req, res) => {
  const hash = String(req.params.hash || "").trim();
  if (!hash) {
    return res.status(400).json({ error: "Missing qr hash" });
  }

  const width = Number(process.env.QR_CODE_WIDTH || 256);
  const margin = Number(process.env.QR_CODE_MARGIN || 1);
  const errorCorrectionLevel = String(process.env.QR_CODE_ERROR_LEVEL || "M").toUpperCase();

  try {
    const buffer = await QRCode.toBuffer(hash, {
      type: "png",
      width: Number.isFinite(width) ? width : 256,
      margin: Number.isFinite(margin) ? margin : 1,
      errorCorrectionLevel,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (error) {
    console.error("[qrRoute] Failed to generate QR:", error.message);
    return res.status(500).json({ error: "Failed to generate QR" });
  }
});

module.exports = router;
