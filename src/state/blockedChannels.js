// System do zarządzania zablokowanymi kanałami
// Struktura: guildId -> Set(channelId)
const blockedChannels = new Map();

// Dodaj lub usuń kanał z listy zablokowanych
function setChannelBlocked(guildId, channelId, isBlocked) {
  if (!blockedChannels.has(guildId)) {
    blockedChannels.set(guildId, new Set());
  }
  
  const guildBlocked = blockedChannels.get(guildId);
  
  if (isBlocked) {
    // Dodaj kanał do zablokowanych
    if (guildBlocked.has(channelId)) {
      return false; // Kanał już był zablokowany
    }
    guildBlocked.add(channelId);
    console.log(`[BLOCK] Zablokowano kanał ${channelId} w guildzie ${guildId}`);
    return true;
  } else {
    // Usuń kanał z zablokowanych
    if (!guildBlocked.has(channelId)) {
      return false; // Kanał nie był zablokowany
    }
    guildBlocked.delete(channelId);
    console.log(`[BLOCK] Odblokowano kanał ${channelId} w guildzie ${guildId}`);
    return true;
  }
}

// Sprawdź czy kanał jest zablokowany
function isChannelBlocked(guildId, channelId) {
  const guildBlocked = blockedChannels.get(guildId);
  return guildBlocked ? guildBlocked.has(channelId) : false;
}

// Pobierz wszystkie zablokowane kanały dla gildii
function getBlockedChannels(guildId) {
  const guildBlocked = blockedChannels.get(guildId);
  return guildBlocked ? Array.from(guildBlocked) : [];
}

// Usuń wszystkie zablokowane kanały dla gildii
function clearBlockedChannels(guildId) {
  if (blockedChannels.has(guildId)) {
    const count = blockedChannels.get(guildId).size;
    blockedChannels.delete(guildId);
    console.log(`[BLOCK] Usunięto ${count} zablokowanych kanałów z gildii ${guildId}`);
    return count;
  }
  return 0;
}

// Pobierz statystyki
function getBlockingStats() {
  let totalGuilds = blockedChannels.size;
  let totalChannels = 0;
  
  for (const [guildId, channels] of blockedChannels) {
    totalChannels += channels.size;
  }
  
  return {
    guilds: totalGuilds,
    channels: totalChannels
  };
}

module.exports = {
  setChannelBlocked,
  isChannelBlocked,
  getBlockedChannels,
  clearBlockedChannels,
  getBlockingStats
};
