const { getConnection } = require("./database");

let configCache = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minut

async function loadConfigs() {
  try {
    const connection = await getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT guild_id, student_role, group_roles, configured_by, configured_at FROM server_configs"
      );

      configCache.clear();
      rows.forEach((row) => {
        try {
          let groupRoles;
          // MySQL2 może automatycznie parsować JSON
          if (typeof row.group_roles === "object" && row.group_roles !== null) {
            groupRoles = row.group_roles;
          } else if (typeof row.group_roles === "string") {
            groupRoles = JSON.parse(row.group_roles);
          } else {
            console.warn(
              `[CONFIG] Nieprawidłowy format group_roles dla serwera ${row.guild_id}`
            );
            groupRoles = {};
          }

          configCache.set(row.guild_id, {
            studentRole: row.student_role,
            groupRoles: groupRoles,
            configuredBy: row.configured_by,
            configuredAt: row.configured_at,
          });
        } catch (parseError) {
          console.error(
            `[CONFIG] Błąd parsowania konfiguracji dla serwera ${row.guild_id}:`,
            parseError.message
          );
          // Użyj domyślnej konfiguracji
          configCache.set(row.guild_id, {
            studentRole: row.student_role,
            groupRoles: {},
            configuredBy: row.configured_by,
            configuredAt: row.configured_at,
          });
        }
      });

      lastCacheUpdate = Date.now();
      console.log(
        `[CONFIG] Załadowano konfigurację dla ${configCache.size} serwerów z MySQL`
      );
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[CONFIG] Błąd ładowania konfiguracji z MySQL:", err.message);
  }
}

async function getServerConfig(guildId) {
  // Odśwież cache jeśli jest stary
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadConfigs();
  }

  return configCache.get(guildId) || null;
}

async function setServerConfig(guildId, config) {
  try {
    const connection = await getConnection();

    try {
      await connection.execute(
        `INSERT INTO server_configs (guild_id, student_role, group_roles, configured_by) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         student_role = VALUES(student_role), 
         group_roles = VALUES(group_roles), 
         configured_by = VALUES(configured_by), 
         updated_at = CURRENT_TIMESTAMP`,
        [
          guildId,
          config.studentRole,
          JSON.stringify(config.groupRoles),
          config.configuredBy,
        ]
      );

      console.log(`[CONFIG] Zapisano konfigurację dla serwera ${guildId}`);

      // Odśwież cache
      await loadConfigs();
      return true;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[CONFIG] Błąd zapisywania konfiguracji:", err.message);
    return false;
  }
}

async function getGroupRoleName(guildId, groupNumber) {
  const config = await getServerConfig(guildId);
  if (!config || !config.groupRoles) {
    return `grupa ${groupNumber}`; // fallback do starych nazw
  }
  return config.groupRoles[groupNumber] || `grupa ${groupNumber}`;
}

async function getStudentRoleName(guildId) {
  const config = await getServerConfig(guildId);
  if (!config || !config.studentRole) {
    return "uczeń"; // fallback do starej nazwy
  }
  return config.studentRole;
}

module.exports = {
  getServerConfig,
  setServerConfig,
  getGroupRoleName,
  getStudentRoleName,
  loadConfigs,
};
