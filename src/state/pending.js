// Pamięć oczekujących odpowiedzi DM: userId -> guildId
const pending = new Map();

function addPending(userId, guildId) {
  pending.set(userId, guildId);
}
function takePending(userId) {
  const guildId = pending.get(userId);
  if (guildId) pending.delete(userId);
  return guildId || null;
}
function hasPending(userId) {
  return pending.has(userId);
}

module.exports = { addPending, takePending, hasPending };
