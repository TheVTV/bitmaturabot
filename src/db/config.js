const fs = require("node:fs");
const path = require("node:path");

let serverConfigs = new Map();

function loadConfig() {
  try {
    const file = path.join(__dirname, "..", "..", "data", "server-config.json");
    const raw = fs.readFileSync(file, "utf8");
    const configs = JSON.parse(raw);
    serverConfigs = new Map(Object.entries(configs));
    console.log(
      `[CONFIG] Załadowano konfigurację dla ${serverConfigs.size} serwerów`
    );
  } catch (err) {
    console.log(
      "[CONFIG] Brak pliku konfiguracji lub błąd odczytu, używam domyślnych ustawień"
    );
    serverConfigs = new Map();
  }
}

function saveConfig() {
  try {
    const file = path.join(__dirname, "..", "..", "data", "server-config.json");
    const configObj = Object.fromEntries(serverConfigs);
    fs.writeFileSync(file, JSON.stringify(configObj, null, 2), "utf8");
    console.log("[CONFIG] Zapisano konfigurację");
  } catch (err) {
    console.error("[CONFIG] Błąd zapisu konfiguracji:", err.message);
  }
}

function getServerConfig(guildId) {
  return serverConfigs.get(guildId) || null;
}

function setServerConfig(guildId, config) {
  serverConfigs.set(guildId, config);
  saveConfig();
}

function getGroupRoleName(guildId, groupNumber) {
  const config = getServerConfig(guildId);
  if (!config || !config.groupRoles) {
    return `grupa ${groupNumber}`; // fallback do starych nazw
  }
  return config.groupRoles[groupNumber] || `grupa ${groupNumber}`;
}

function getStudentRoleName(guildId) {
  const config = getServerConfig(guildId);
  if (!config || !config.studentRole) {
    return "uczeń"; // fallback do starej nazwy
  }
  return config.studentRole;
}

loadConfig();

module.exports = {
  getServerConfig,
  setServerConfig,
  getGroupRoleName,
  getStudentRoleName,
  loadConfig,
  saveConfig,
};
