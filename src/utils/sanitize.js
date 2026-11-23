const sanitizeHtml = require("sanitize-html");

function cleanText(input, max = 2000) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim().slice(0, max);
  return sanitizeHtml(trimmed, { allowedTags: [], allowedAttributes: {} });
}

function cleanNick(input) {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 16).replace(/[^a-zA-Z0-9_]/g, "");
}

module.exports = { cleanText, cleanNick };
