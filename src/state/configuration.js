// Stan konfiguracji: userId -> { guildId, channelId, step, groupCount, currentGroup, groupRoles, studentRole }
const configurations = new Map();

function startConfiguration(userId, guildId, channelId) {
  configurations.set(userId, {
    guildId,
    channelId,
    step: "group_count", // group_count -> group_roles -> student_role -> done
    groupCount: 0,
    currentGroup: 1,
    groupRoles: {},
    studentRole: null,
  });
}

function getConfiguration(userId) {
  return configurations.get(userId) || null;
}

function updateConfiguration(userId, updates) {
  const config = configurations.get(userId);
  if (config) {
    Object.assign(config, updates);
  }
}

function finishConfiguration(userId) {
  const config = configurations.get(userId);
  configurations.delete(userId);
  return config;
}

function hasConfiguration(userId) {
  return configurations.has(userId);
}

module.exports = {
  startConfiguration,
  getConfiguration,
  updateConfiguration,
  finishConfiguration,
  hasConfiguration,
};
