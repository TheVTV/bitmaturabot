# 🔐 SYSTEM UPRAWNIEŃ DISCORD BOT

## 📋 Podział ról i uprawnień

### 👤 **Niezarejestrowany użytkownik**

**Dostępne komendy:**

- `/rejestruj` - rozpoczęcie procesu rejestracji

**Ukryte komendy:** Wszystkie pozostałe

### 🎓 **Uczeń (rola: "uczeń")**

**Dostępne komendy:**

- `/ping` - test połączenia
- `/profil` - wyświetlenie profilu użytkownika
- `/punkty` - sprawdzenie punktów
- `/ranking` - ranking ogólny
- `/ranking-grupa` - ranking grupy
- `/grupa` - informacje o grupie
- `/kiedy-aktualizacja` - informacje o schedulerze

**Ukryte komendy:**

- Wszystkie komendy prowadzących i administracyjne

### 👨‍🏫 **Prowadzący (rola: "nauczyciel")**

**Dostępne komendy:**

- Wszystkie komendy ucznia
- `/prowadzący` - lista prowadzących
- `/synchronizuj-dane` - ręczna synchronizacja

**Ukryte komendy:**

- Wszystkie komendy administracyjne

### 👑 **Administrator (rola: "admin")**

**Dostępne komendy:** Wszystkie komendy systemu

- Wszystkie komendy ucznia i prowadzącego
- `/konfiguracja` - konfiguracja serwera
- `/niezarejestrowany` - zarządzanie rolą niezarejestrowanych
- `/dodaj-prowadzącego` - dodawanie nauczycieli
- `/dodaj-uczniów` - dodawanie uczniów
- `/usuń-ucznia` - usuwanie uczniów
- `/zmien-grupe` - zmiana grup
- `/blokuj-wiadomości` - zarządzanie kanałami
- `/dodaj-szkopul-id` - zarządzanie ID szkopuł

## 🔧 Implementacja techniczna

### 📁 Struktura plików

```
src/utils/permissions.js - System sprawdzania uprawnień
src/commands/*.js - Komendy z wbudowanym sprawdzaniem
```

### 🛡️ Funkcja checkUserPermissions()

```javascript
const permissions = await checkUserPermissions(interaction, "nazwa-komendy");
if (!permissions.canUseCommand) {
  await interaction.reply({
    content: `[UPRAWNIENIA] ${permissions.reason}`,
    flags: MessageFlags.Ephemeral,
  });
  return;
}
```

### 📊 Zwracane wartości

```javascript
{
  userType: 'student|teacher|admin|unregistered|unknown',
  canUseCommand: true|false,
  reason?: 'Powód odmowy dostępu'
}
```

## 🎯 Konfiguracja ról

### 🔍 Sprawdzanie ról

System automatycznie pobiera nazwy ról z konfiguracji MySQL:

- `getStudentRoleName(guildId)` - nazwa roli ucznia
- `getTeacherRoleName(guildId)` - nazwa roli prowadzącego
- `getAdminRoleName(guildId)` - nazwa roli administratora
- `getUnregisteredRoleId(guildId)` - ID roli niezarejestrowanego

### ⚙️ Domyślne nazwy ról

- Uczeń: "uczeń"
- Prowadzący: "nauczyciel"
- Administrator: "admin"

## 🚨 Komunikaty błędów

### 👤 Niezarejestrowany

> "Musisz się zarejestrować. Użyj komendy `/rejestruj`."

### 🔒 Brak uprawnień (uczeń)

> "Nie masz uprawnień do tej komendy."

### 👨‍🏫 Brak uprawnień (prowadzący)

> "Ta komenda jest dostępna tylko dla administratorów."

### ✅ Już zarejestrowany

> "Jesteś już zarejestrowany w systemie."

### ❓ Nieznana rola

> "Nie masz przypisanej żadnej roli. Skontaktuj się z administratorem."

## 🔄 Proces weryfikacji

1. **Sprawdzenie roli niezarejestrowanego**

   - Jeśli ma rolę OR brak wszystkich ról → tylko `/rejestruj`

2. **Sprawdzenie komend rejestracji**

   - Jeśli zarejestrowany próbuje `/rejestruj` → blokada

3. **Sprawdzenie uprawnień administratora**

   - Admin ma dostęp do wszystkich komend

4. **Sprawdzenie uprawnień prowadzącego**

   - Prowadzący ma dostęp do komend ucznia + własnych

5. **Sprawdzenie uprawnień ucznia**
   - Uczeń ma dostęp tylko do swoich komend

## 📈 Statystyki dostępu

### ✅ Komendy publiczne (wszystkie zarejestrowane)

- `/ping`

### 🎓 Komendy ucznia (7 komend)

- `/profil`, `/punkty`, `/ranking`, `/ranking-grupa`, `/grupa`, `/kiedy-aktualizacja`

### 👨‍🏫 Komendy prowadzącego (2 komendy)

- `/prowadzący`, `/synchronizuj-dane`

### 👑 Komendy administratora (8 komend)

- `/konfiguracja`, `/niezarejestrowany`, `/dodaj-prowadzącego`
- `/dodaj-uczniów`, `/usuń-ucznia`, `/zmien-grupe`
- `/blokuj-wiadomości`, `/dodaj-szkopul-id`

**Łączna liczba komend:** 18
