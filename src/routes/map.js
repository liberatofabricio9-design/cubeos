const express = require("express");
const config = require("../config");

const router = express.Router();
router.get("/config", (req, res) => {
  res.json({ url: config.mapUrl });
});
module.exports = router;
