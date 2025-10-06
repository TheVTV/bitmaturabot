# 🤖 BitMaturaBot - Discord Registration Bot

Zaawansowany bot Discord do automatycznej rejestracji studentów z systemem szyfrowania danych osobowych.

## 📋 Funkcjonalności

- **🔐 Bezpieczna rejestracja** - Szyfrowanie danych AES-256-CBC
- **📧 Walidacja email** - Sprawdzanie czy email jest na liście studentów
- **🎭 Automatyczne role** - Przypisywanie ról na podstawie grupy
- **💬 Prywatne wątki** - Rejestracja w bezpiecznych thread'ach
- **⚙️ Konfiguracja serwera** - Elastyczne ustawienie ról przez właściciela
- **📊 MySQL Database** - Wydajna baza danych z szyfrowaniem
- **🤖 Automatyczne odpowiedzi** - Bot reaguje na popularne frazy
- **🏆 System punktowy** - Nagradzanie użytkowników punktami z rankingiem
- **🐄 Pogłaskaj krówcię** - Zabawna komenda do głaskania wirtualnej krówci
- **🧵 Zarządzanie wątkami** - Tworzenie i usuwanie osobistych wątków

## 🚀 Instalacja

1. **Sklonuj repozytorium**

   ```bash
   git clone <repository-url>
   cd bitmaturabot
   ```

2. **Zainstaluj zależności**

   ```bash
   npm install
   ```

3. **Konfiguracja środowiska**

   ```bash
   cp .env.example .env
   # Edytuj .env z własnymi danymi
   ```

4. **Wdróż komendy Discord**

   ```bash
   node src/deploy-commands.js
   ```

5. **Uruchom bota**
   ```bash
   node src/index.js
   ```

## ⚙️ Konfiguracja

### Zmienne środowiskowe (.env)

```env
# Discord Bot
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

# Baza danych MySQL
DATABASE_URL=mysql://username:password@host:port/database

# Szyfrowanie (generowane automatycznie)
ENCRYPTION_KEY=your_32_character_hex_key
SEARCH_SALT=your_unique_salt_for_search

# Google Sheets
SPREADSHEET_ID=your_spreadsheet_id

# Szkopuł API (opcjonalnie)
SZKOPUL_USERNAME=your_username
SZKOPUL_PASSWORD=your_password
```

## 📖 Główne Komendy

### 👤 Dla wszystkich użytkowników

- `/ping` - Test połączenia z botem
- `/rejestruj` - Rozpoczęcie procesu rejestracji

### 🎓 Dla uczniów i wyżej

- `/profil` - Sprawdzenie swojego profilu
- `/punkty` - Sprawdzenie punktów
- `/ranking` - Ranking punktów top 10
- `/ranking-grupa` - Ranking grupy
- `/grupa` - Lista uczniów z grupy
- `/pogłaszcz-krówcię` - Pogłaszcz wirtualną krówcię
- `/ranking-krówci` - Zobacz ranking głaskaczów krówci
- `/zapytaj` - Zadaj anonimowe pytanie nauczycielowi

### 👨‍🏫 Dla nauczycieli i wyżej

- `/prowadzący` - Panel prowadzącego
- `/synchronizuj-dane` - Synchronizacja z Google Sheets
- `/czy-jasne` - Ankieta sprawdzająca zrozumienie
- `/usuń-wątek` - Usuń wątek osobisty użytkownika

### 👑 Dla administratorów

- `/konfiguracja` - Ustawienie ról serwera
- `/dodaj-uczniów` - Import uczniów z pliku
- `/dodaj-prowadzącego` - Dodanie nauczyciela
- `/usuń-ucznia` - Usunięcie ucznia
- `/zmien-grupe` - Zmiana grupy użytkownika
- `/utwórz-wątki-osobiste` - Tworzenie wątków dla uczniów
- `/usuń-wszystkie-wątki` - Usunięcie wszystkich wątków

## 🔐 System Uprawnień

Bot używa systemu ról Discord do kontroli dostępu:

- **Niezarejestrowany** - tylko `/rejestruj`
- **Uczeń** - podstawowe komendy
- **Prowadzący** - komendy nauczycielskie + uczniowskie
- **Admin** - wszystkie komendy

📋 Szczegóły: `PERMISSIONS_SYSTEM.md`  
🛡️ Konfiguracja: `DISCORD_PERMISSIONS_GUIDE.md`

## 🤖 Automatyczne odpowiedzi

Bot automatycznie reaguje na określone frazy:

- **"kto pytał"** (i warianty) → "Siema, ja pytałem"

## 📂 Struktura projektu

```
src/
├── commands/           # Komendy slash Discord
├── crypto/            # Moduł szyfrowania
├── db/                # Baza danych MySQL
├── events/            # Event handlery Discord
├── scripts/           # Narzędzia pomocnicze
├── state/             # Zarządzanie stanem
├── utils/             # Narzędzia pomocnicze
└── index.js           # Główny plik aplikacji
```

## � Baza Danych

Tabele:

- `users` - Dane użytkowników (zaszyfrowane)
- `server_configs` - Konfiguracje serwerów
- `user_points` - System punktowy
- `personal_threads` - Wątki osobiste
- `teachers` - Lista nauczycieli
- `cow_pets` - Statystyki głaskania krówci

## 📝 Dodatkowa Dokumentacja

- 📋 **System uprawnień**: `PERMISSIONS_SYSTEM.md`
- 🛡️ **Konfiguracja Discord**: `DISCORD_PERMISSIONS_GUIDE.md`
- 🗳️ **Ankiety "Czy jasne?"**: `ANKIETY_CZY_JASNE.md`
- ❓ **Komenda zapytaj**: `KOMENDA_ZAPYTAJ.md`

## 📝 Licencja

Ten projekt jest prywatny i przeznaczony do użytku wewnętrznego.
