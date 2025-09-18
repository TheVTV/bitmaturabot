# 🛡️ Przewodnik Ustawiania Uprawnień Komend Discord

> **Cel:** Ukrycie komend bota dla niezarejestrowanych użytkowników i kontrola dostępu bazująca na rolach serwera.

## 📋 **Wymagania**

- Uprawnienia **Administrator** lub **Manage Server** na serwerze
- Bot **Diamentowa Krówcia** dodany do serwera
- Role: `Niezarejestrowany`, `Uczeń`, `Prowadzący`, `Admin`

## 🔧 **Instrukcja Krok po Kroku**

### **Krok 1: Dostęp do Ustawień Serwera**

1. **Kliknij prawym przyciskiem** na nazwę serwera (góra lewego panelu)
2. Wybierz **"Ustawienia serwera"** z menu kontekstowego
3. W lewym menu znajdź i kliknij **"Integrations"** (Integracje)

### **Krok 2: Zarządzanie Botem**

1. Na liście integracji znajdź **"Diamentowa Krówcia"** (nasz bot)
2. Kliknij przycisk **"Manage"** (Zarządzaj) obok nazwy bota
3. Zobaczysz listę wszystkich komend bota (18 komend)

### **Krok 3: Konfiguracja Uprawnień**

Dla każdej komendy ustaw uprawnienia zgodnie z poniższą tabelą:

---

## 📊 **Tabela Uprawnień Komend**

### **🔓 Komenda dostępna dla WSZYSTKICH (nawet niezarejestrowanych)**

| Komenda      | Dostępne dla  | Zablokowane dla   |
| ------------ | ------------- | ----------------- |
| `/rejestruj` | **@everyone** | _brak ograniczeń_ |

**Instrukcja:**

1. Znajdź `/rejestruj` na liście
2. **NIE DODAWAJ** żadnych ograniczeń
3. Pozostaw domyślne ustawienie (dostępne dla wszystkich)

---

### **👥 Komendy STUDENCKIE (Uczeń + wyżej)**

| Komenda               | Dostępne dla                   | Zablokowane dla     |
| --------------------- | ------------------------------ | ------------------- |
| `/profil`             | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/punkty`             | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/ranking`            | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/ranking-grupa`      | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/kiedy-aktualizacja` | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/dodaj-szkopul-id`   | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |
| `/ping`               | `Uczeń`, `Prowadzący`, `Admin` | `Niezarejestrowany` |

**Instrukcja dla każdej komendy:**

1. Kliknij na komendę (np. `/profil`)
2. Kliknij **"+ Add Role or Member"**
3. **Dodaj role:** `Uczeń`, `Prowadzący`, `Admin` - ustaw **✅ Allow**
4. **Dodaj rolę:** `Niezarejestrowany` - ustaw **❌ Deny**
5. Kliknij **"Save Changes"**

---

### **🎓 Komendy NAUCZYCIELSKIE (Prowadzący + wyżej)**

| Komenda              | Dostępne dla          | Zablokowane dla              |
| -------------------- | --------------------- | ---------------------------- |
| `/prowadzący`        | `Prowadzący`, `Admin` | `Uczeń`, `Niezarejestrowany` |
| `/grupa`             | `Prowadzący`, `Admin` | `Uczeń`, `Niezarejestrowany` |
| `/synchronizuj-dane` | `Prowadzący`, `Admin` | `Uczeń`, `Niezarejestrowany` |
| `/niezarejestrowany` | `Prowadzący`, `Admin` | `Uczeń`, `Niezarejestrowany` |

**Instrukcja dla każdej komendy:**

1. Kliknij na komendę (np. `/prowadzący`)
2. Kliknij **"+ Add Role or Member"**
3. **Dodaj role:** `Prowadzący`, `Admin` - ustaw **✅ Allow**
4. **Dodaj role:** `Uczeń`, `Niezarejestrowany` - ustaw **❌ Deny**
5. Kliknij **"Save Changes"**

---

### **👑 Komendy ADMINISTRACYJNE (tylko Admin)**

| Komenda               | Dostępne dla | Zablokowane dla                            |
| --------------------- | ------------ | ------------------------------------------ |
| `/konfiguracja`       | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |
| `/dodaj-uczniów`      | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |
| `/dodaj-prowadzącego` | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |
| `/usuń-ucznia`        | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |
| `/zmień-grupę`        | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |
| `/blokuj-wiadomości`  | `Admin`      | `Prowadzący`, `Uczeń`, `Niezarejestrowany` |

**Instrukcja dla każdej komendy:**

1. Kliknij na komendę (np. `/konfiguracja`)
2. Kliknij **"+ Add Role or Member"**
3. **Dodaj rolę:** `Admin` - ustaw **✅ Allow**
4. **Dodaj role:** `Prowadzący`, `Uczeń`, `Niezarejestrowany` - ustaw **❌ Deny**
5. Kliknij **"Save Changes"**

---

## ✅ **Weryfikacja Poprawności**

Po skonfigurowaniu wszystkich komend:

### **Test z kontem niezarejestrowanym:**

- ✅ Powinno widzieć **TYLKO** `/rejestruj`
- ❌ Nie powinno widzieć żadnych innych komend

### **Test z kontem ucznia:**

- ✅ Powinno widzieć: `/rejestruj`, `/profil`, `/punkty`, `/ranking`, `/ranking-grupa`, `/kiedy-aktualizacja`, `/dodaj-szkopul-id`, `/ping`
- ❌ Nie powinno widzieć komend nauczycielskich i administracyjnych

### **Test z kontem prowadzącego:**

- ✅ Powinno widzieć: wszystkie komendy studenckie + `/prowadzący`, `/grupa`, `/synchronizuj-dane`, `/niezarejestrowany`
- ❌ Nie powinno widzieć komend administracyjnych

### **Test z kontem admina:**

- ✅ Powinno widzieć **WSZYSTKIE** komendy

---

## 🎯 **Rezultat**

Po wykonaniu tych kroków:

1. **Niezarejestrowani użytkownicy** będą widzieć tylko `/rejestruj`
2. **Komendy będą ukryte** na poziomie Discord (nie będą się pojawiać w autocomplete)
3. **Nie będzie komunikatów błędów** - po prostu komenda nie istnieje dla użytkownika
4. **System jest elastyczny** - możesz łatwo dodawać/usuwać uprawnienia

---

## 🔧 **Dodatkowe Opcje**

### **Ograniczenia kanałowe:**

- Możesz dodatkowo ograniczyć komendy do określonych kanałów
- W ustawieniach komendy kliknij **"Add Channel"** i wybierz dozwolone kanały

### **Ograniczenia użytkowników:**

- Możesz dać specjalne uprawnienia konkretnym użytkownikom
- W ustawieniach komendy kliknij **"Add Role or Member"** → **"Members"**

### **Przywracanie domyślnych ustawień:**

- Aby usunąć wszystkie ograniczenia, kliknij **"Reset to Default"** przy komendzie

---

## 📞 **Pomoc**

Jeśli masz problemy z konfiguracją:

1. Sprawdź czy masz uprawnienia **Administrator** lub **Manage Server**
2. Upewnij się że bot ma wszystkie potrzebne uprawnienia
3. Przetestuj z różnymi kontami/rolami
4. W razie problemów - skontaktuj się z administratorem bota

---

_Ostatnia aktualizacja: 17.09.2025_
