const { getConnection } = require("./database");

/**
 * Zwiększ liczbę pogłaszeń krówci dla użytkownika
 * @param {string} discordId - Discord ID użytkownika
 * @returns {Promise<{userPets: number, totalPets: number, onCooldown?: boolean, remainingTime?: number, needsBarka?: boolean, atLimit?: boolean}>} Liczba pogłaszeń użytkownika i łącznie wszystkich
 */
async function petCow(discordId) {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Sprawdź czy użytkownik już głaskał krówcię i czy jest na cooldown
    const [existingRows] = await connection.execute(
      "SELECT pet_count, last_pet FROM cow_pets WHERE discord_id = ?",
      [discordId]
    );

    if (existingRows.length > 0) {
      const lastPet = new Date(existingRows[0].last_pet);
      const now = new Date();
      const timeDiff = now - lastPet;
      const cooldownMs = 60 * 1000; // 1 minuta w milisekundach

      // Sprawdź cooldown (1 minuta)
      if (timeDiff < cooldownMs) {
        const remainingTime = Math.ceil((cooldownMs - timeDiff) / 1000);
        await connection.rollback();
        return {
          userPets: existingRows[0].pet_count,
          totalPets: 0, // Nie pobieramy total gdy jest cooldown
          onCooldown: true,
          remainingTime,
        };
      }
    }

    // Sprawdź aktualną liczbę globalnych pogłaszeń PRZED dodaniem nowego
    const [totalRows] = await connection.execute(
      "SELECT SUM(pet_count) as total FROM cow_pets"
    );

    const currentTotal = totalRows[0].total || 0;

    // Sprawdź czy następne pogłaskanie będzie 2137-tym
    if (currentTotal >= 2136) {
      const barkaSung = process.env.BARKA_SUNG === "1";

      if (currentTotal === 2136 && !barkaSung) {
        // To będzie 2137-me pogłaskanie, ale barka nie została zaśpiewana
        await connection.rollback();
        return {
          userPets: existingRows.length > 0 ? existingRows[0].pet_count : 0,
          totalPets: currentTotal,
          needsBarka: true,
        };
      } else if (currentTotal > 2136 && !barkaSung) {
        // Już po limicie, ale barka nie została zaśpiewana
        await connection.rollback();
        return {
          userPets: existingRows.length > 0 ? existingRows[0].pet_count : 0,
          totalPets: currentTotal,
          atLimit: true,
        };
      }
    }

    let userPets;

    if (existingRows.length > 0) {
      // Zwiększ licznik o 1
      const newCount = existingRows[0].pet_count + 1;
      await connection.execute(
        "UPDATE cow_pets SET pet_count = ?, last_pet = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?",
        [newCount, discordId]
      );
      userPets = newCount;
    } else {
      // Pierwszy raz głaska krówcię
      await connection.execute(
        "INSERT INTO cow_pets (discord_id, pet_count) VALUES (?, 1)",
        [discordId]
      );
      userPets = 1;
    }

    // Pobierz nową łączną liczbę pogłaszeń wszystkich użytkowników
    const [newTotalRows] = await connection.execute(
      "SELECT SUM(pet_count) as total FROM cow_pets"
    );

    const totalPets = newTotalRows[0].total || 0;

    await connection.commit();

    return {
      userPets,
      totalPets,
    };
  } catch (error) {
    await connection.rollback();
    console.error("[COW] Błąd w petCow:", error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Pobierz statystyki głaskania krówci dla użytkownika
 * @param {string} discordId - Discord ID użytkownika
 * @returns {Promise<{userPets: number, totalPets: number, userRank: number|null}>}
 */
async function getCowStats(discordId) {
  const connection = await getConnection();

  try {
    // Sprawdź czy tabela istnieje
    const [tableExists] = await connection.execute(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cow_pets'"
    );

    if (tableExists[0].count === 0) {
      return { userPets: 0, totalPets: 0, userRank: null }; // Tabela nie istnieje
    }

    // Pobierz dane użytkownika
    const [userRows] = await connection.execute(
      "SELECT pet_count FROM cow_pets WHERE discord_id = ?",
      [discordId]
    );

    const userPets = userRows.length > 0 ? userRows[0].pet_count : 0;

    // Pobierz łączną liczbę pogłaszeń
    const [totalRows] = await connection.execute(
      "SELECT SUM(pet_count) as total FROM cow_pets"
    );

    const totalPets = totalRows[0].total || 0;

    // Pobierz ranking użytkownika (jeśli głaskał krówcię)
    let userRank = null;
    if (userPets > 0) {
      const [rankRows] = await connection.execute(
        "SELECT COUNT(*) + 1 as `rank` FROM cow_pets WHERE pet_count > ?",
        [userPets]
      );
      userRank = rankRows[0].rank;
    }

    return {
      userPets,
      totalPets,
      userRank,
    };
  } catch (error) {
    console.error("[COW] Błąd w getCowStats:", error);
    return { userPets: 0, totalPets: 0, userRank: null }; // W przypadku błędu zwróć domyślne wartości
  } finally {
    connection.release();
  }
}

/**
 * Pobierz ranking top użytkowników głaskających krówcię
 * @param {number} limit - Maksymalna liczba wyników (domyślnie 10)
 * @returns {Promise<Array<{discord_id: string, pet_count: number, rank: number}>>}
 */
async function getCowLeaderboard(limit = 10) {
  const connection = await getConnection();

  try {
    // Sprawdź czy tabela istnieje
    const [tableExists] = await connection.execute(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cow_pets'"
    );

    if (tableExists[0].count === 0) {
      return []; // Tabela nie istnieje, zwróć pustą tablicę
    }

    const [rows] = await connection.execute(
      "SELECT discord_id, pet_count FROM cow_pets ORDER BY pet_count DESC, created_at ASC LIMIT " +
        parseInt(limit),
      []
    );

    // Dodaj ranking manualnie
    return rows.map((row, index) => ({
      discord_id: row.discord_id,
      pet_count: row.pet_count,
      rank: index + 1,
    }));
  } catch (error) {
    console.error("[COW] Błąd w getCowLeaderboard:", error);
    return []; // W przypadku błędu zwróć pustą tablicę
  } finally {
    connection.release();
  }
}

/**
 * Pobierz słowo "raz" w odpowiedniej formie gramatycznej
 * @param {number} count - Liczba
 * @returns {string} Poprawna forma słowa
 */
function getTimesWord(count) {
  if (count === 1) {
    return "raz";
  } else if (
    count % 10 >= 2 &&
    count % 10 <= 4 &&
    (count % 100 < 10 || count % 100 >= 20)
  ) {
    return "razy";
  } else {
    return "razy";
  }
}

module.exports = {
  petCow,
  getCowStats,
  getCowLeaderboard,
  getTimesWord,
};
