const fs = require("node:fs");
const path = require("node:path");

let emailToUserData = new Map();

function loadUsers() {
  try {
    const file = path.join(__dirname, "..", "..", "data", "users.json");
    const raw = fs.readFileSync(file, "utf8");
    const users = JSON.parse(raw);
    emailToUserData = new Map(
      users
        .filter(
          (u) =>
            typeof u.email === "string" &&
            (typeof u.group === "number" || typeof u.group === "string")
        )
        .map((u) => [
          u.email.trim().toLowerCase(),
          {
            group: String(u.group).trim(),
            fullname: u.fullname ? u.fullname.trim() : null,
          },
        ])
    );
    console.log(`[DB] Załadowano ${emailToUserData.size} użytkowników`);
  } catch (err) {
    console.error("[DB] Nie udało się załadować data/users.json:", err.message);
    emailToUserData = new Map();
  }
}

function getUserByEmail(email) {
  if (!email) return null;
  return emailToUserData.get(email.trim().toLowerCase()) || null;
}

function getGroupByEmail(email) {
  const userData = getUserByEmail(email);
  return userData ? userData.group : null;
}

function getFullnameByEmail(email) {
  const userData = getUserByEmail(email);
  return userData ? userData.fullname : null;
}

loadUsers();

module.exports = {
  getGroupByEmail,
  getFullnameByEmail,
  getUserByEmail,
  loadUsers,
};
