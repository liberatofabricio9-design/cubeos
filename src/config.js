const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  staffTeamCode: process.env.STAFF_TEAM_CODE || "CUBO-STAFF",
  nodeEnv: process.env.NODE_ENV || "development",
  uploadDir: process.env.UPLOAD_DIR || "./public/uploads",
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || "5", 10),
  mapUrl: process.env.MAP_URL || "",
  cookieSecure: process.env.NODE_ENV === "production",
};
