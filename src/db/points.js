const { getConnection } = require("./database");

let pointsCache = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 minuty

async function loadPointsCache(guildId) {
  try {
    const connection = await getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT discord_id, points FROM user_points WHERE guild_id = ? ORDER BY points DESC",
        [guildId]
      );

      const cacheKey = `guild_${guildId}`;
      const guildPoints = new Map();
      
      rows.forEach((row) => {
        guildPoints.set(row.discord_id, row.points);
      });

      pointsCache.set(cacheKey, guildPoints);
      lastCacheUpdate = Date.now();
      
      console.log(`[POINTS] Załadowano ${rows.length} rekordów punktów dla guild ${guildId}`);
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd ładowania cache punktów:", err.message);
  }
}

async function getUserPoints(discordId, guildId) {
  // Odśwież cache jeśli jest stary
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadPointsCache(guildId);
  }

  const cacheKey = `guild_${guildId}`;
  const guildPoints = pointsCache.get(cacheKey);
  
  if (!guildPoints) {
    await loadPointsCache(guildId);
    const refreshedGuildPoints = pointsCache.get(cacheKey);
    return refreshedGuildPoints ? refreshedGuildPoints.get(discordId) || 0 : 0;
  }

  return guildPoints.get(discordId) || 0;
}

async function addUserPoints(discordId, guildId, pointsToAdd) {
  try {
    const connection = await getConnection();

    try {
      // Najpierw sprawdź czy użytkownik już istnieje
      const [existing] = await connection.execute(
        "SELECT points FROM user_points WHERE discord_id = ? AND guild_id = ?",
        [discordId, guildId]
      );

      if (existing.length > 0) {
        // Użytkownik istnieje - zaktualizuj punkty (dodaj do istniejących)
        const newPoints = existing[0].points + pointsToAdd;
        await connection.execute(
          "UPDATE user_points SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ? AND guild_id = ?",
          [newPoints, discordId, guildId]
        );
        console.log(`[POINTS] Zaktualizowano punkty dla ${discordId}: ${existing[0].points} + ${pointsToAdd} = ${newPoints}`);
      } else {
        // Użytkownik nie istnieje - stwórz nowy rekord
        await connection.execute(
          "INSERT INTO user_points (discord_id, guild_id, points) VALUES (?, ?, ?)",
          [discordId, guildId, pointsToAdd]
        );
        console.log(`[POINTS] Utworzono nowy rekord dla ${discordId} z ${pointsToAdd} punktami`);
      }
      
      // Odśwież cache dla tej gildii
      await loadPointsCache(guildId);
      return true;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd dodawania punktów:", err.message);
    return false;
  }
}

async function setUserPoints(discordId, guildId, points) {
  try {
    const connection = await getConnection();

    try {
      // Upsert - wstaw lub zaktualizuj punkty na konkretną wartość
      await connection.execute(
        `INSERT INTO user_points (discord_id, guild_id, points) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         points = VALUES(points), 
         updated_at = CURRENT_TIMESTAMP`,
        [discordId, guildId, points]
      );

      console.log(`[POINTS] Ustawiono ${points} punktów dla użytkownika ${discordId} w guild ${guildId}`);
      
      // Odśwież cache dla tej gildii
      await loadPointsCache(guildId);
      return true;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd ustawiania punktów:", err.message);
    return false;
  }
}

async function getTopUsers(guildId, limit = 10) {
  try {
    const connection = await getConnection();

    try {
      // Użyj interpolacji stringa dla LIMIT zamiast parametru
      const [rows] = await connection.execute(
        `SELECT discord_id, points FROM user_points WHERE guild_id = ? ORDER BY points DESC LIMIT ${parseInt(limit)}`,
        [guildId]
      );

      return rows;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd pobierania rankingu:", err.message);
    return [];
  }
}

async function getUserRank(discordId, guildId) {
  try {
    const connection = await getConnection();

    try {
      // Najpierw pobierz punkty użytkownika
      const [userRows] = await connection.execute(
        "SELECT points FROM user_points WHERE discord_id = ? AND guild_id = ?",
        [discordId, guildId]
      );

      if (userRows.length === 0) {
        return null; // Użytkownik nie ma punktów
      }

      const userPoints = userRows[0].points;

      // Policz ile użytkowników ma więcej punktów
      const [rankRows] = await connection.execute(
        "SELECT COUNT(*) + 1 as `rank` FROM user_points WHERE guild_id = ? AND points > ?",
        [guildId, userPoints]
      );

      return rankRows[0]?.rank || null;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd pobierania rangi:", err.message);
    return null;
  }
}

async function getTotalUsers(guildId) {
  try {
    const connection = await getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT COUNT(*) as total FROM user_points WHERE guild_id = ?",
        [guildId]
      );

      return rows[0]?.total || 0;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[POINTS] Błąd pobierania liczby użytkowników:", err.message);
    return 0;
  }
}

module.exports = {
  getUserPoints,
  addUserPoints,
  setUserPoints,
  getTopUsers,
  getUserRank,
  getTotalUsers,
  loadPointsCache,
};
