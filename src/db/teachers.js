const { getConnection } = require("./database");

// Tworzy tabelę nauczycieli jeśli nie istnieje
async function ensureTeachersTable() {
  const connection = await getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS teachers (
        group_id INT PRIMARY KEY,
        discord_id VARCHAR(32) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    connection.release();
  }
}

// Pobiera wszystkich nauczycieli
async function getAllTeachers() {
  await ensureTeachersTable();
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT group_id as group_number, discord_id, 'Nauczyciel' as name FROM teachers ORDER BY group_id"
    );
    return rows;
  } finally {
    connection.release();
  }
}

// Przypisuje nauczyciela do grupy
async function setTeacherForGroup(groupId, discordId) {
  await ensureTeachersTable();
  const connection = await getConnection();
  try {
    await connection.execute(
      "REPLACE INTO teachers (group_id, discord_id) VALUES (?, ?)",
      [groupId, discordId]
    );
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllTeachers,
  setTeacherForGroup,
};
