// Pamięć oczekujących odpowiedzi DM: userId -> guildId lub obiekt z danymi
const pending = new Map();

function addPending(userId, data) {
  pending.set(userId, data);
}
function takePending(userId) {
  const data = pending.get(userId);
  if (data) pending.delete(userId);
  return data || null;
}
function hasPending(userId) {
  return pending.has(userId);
}

// Funkcja do sprawdzania czy użytkownik ma oczekujący stan określonego typu
function hasPendingType(userId, type) {
  const data = pending.get(userId);
  if (!data) return false;
  
  // Jeśli data to string (stary format z guildId), sprawdź czy type to 'registration'
  if (typeof data === 'string') {
    return type === 'registration';
  }
  
  // Jeśli data to obiekt, sprawdź type
  return data.type === type;
}

// Funkcja do pobrania guildId z danych pending (wsteczna kompatybilność)
function getPendingGuildId(userId) {
  const data = pending.get(userId);
  if (!data) return null;
  
  // Jeśli data to string (stary format), zwróć jako guildId
  if (typeof data === 'string') {
    return data;
  }
  
  // Jeśli data to obiekt, zwróć guildId z obiektu
  return data.guildId || null;
}

module.exports = { 
  addPending, 
  takePending, 
  hasPending,
  hasPendingType,
  getPendingGuildId
};
