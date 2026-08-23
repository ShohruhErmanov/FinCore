# PHASE 18.1.1 — Secure Bootstrap Admin

**Sana:** 2026-08-23 · **Holat:** Bajarildi
**Oldingi bosqich:** [Phase 18.1](PHASE_18_1_BACKEND_FOUNDATION.md)

## 1. Maqsad

Bazada tizimga kira oladigan birinchi haqiqiy Director akkauntini yaratish, va
mavjud cookie-session autentifikatsiyasini jonli PostgreSQL ustida tekshirish.
Yangi funksiya qurilmaydi.

## 2. Muammo

`002_seed_reference.sql` ataylab faqat bitta foydalanuvchi yaratadi — tizim
jarayoni akkaunti:

```
full_name     : FINCORE tizim jarayoni
email         : system@fincore.local
is_system     : true
status        : inactive
password_hash : '!disabled!'
```

`user_roles` esa **butunlay bo'sh**. `AuthService` faqat `status = 'active'`
foydalanuvchini qabul qilgani uchun, seed'dan keyin **hech kim login qila
olmaydi**. Bu kamchilik emas — seed ataylab shunday, chunki haqiqiy
foydalanuvchilar seed faylga yozilmasligi kerak.

## 3. Bootstrap buyrug'i

```bash
npm run bootstrap:admin
```

Skript: `backend/scripts/bootstrap-admin.mjs`

Mavjud jadvallardan foydalanadi. **Yangi rol yaratmaydi, yangi ruxsat
yaratmaydi, sxemani o'zgartirmaydi.**

## 4. Kerakli kiritish

| O'zgaruvchi | Majburiy | Izoh |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_NAME` | ha | To'liq ism |
| `BOOTSTRAP_ADMIN_LOGIN` | ha | Email (`@` bo'lsa) yoki telefon |
| `BOOTSTRAP_ADMIN_PASSWORD` | ha | Kamida 12 belgi |
| `BOOTSTRAP_ALLOW_PASSWORD_RESET` | yo'q | `true` — mavjud director parolini almashtirish |

`BOOTSTRAP_ADMIN_LOGIN` `AuthService` bilan bir xil normallashtiriladi: email
kichik harfga, telefondan bo'sh joy/qavs/tire olib tashlanadi.

## 5. Xavfsizlik xatti-harakati

- Parol **faqat** environment o'zgaruvchisidan olinadi
- Parol **chop etilmaydi**, **log qilinmaydi**, faylga **yozilmaydi**
- Parol manba kodida **yo'q**, `.env.example` da **yo'q**
- Xeshlash `dist/auth/password.js` dagi **mavjud** `hashPassword` (bcryptjs cost 12) —
  boshqa kutubxona qo'shilmagan, login yo'li bilan bayt-ma-bayt bir xil
- Xatolik xabaridan connection string olib tashlanadi
- `granted_by` uchun seed'dagi tizim akkaunti ishlatiladi — aynan shu maqsad uchun

## 6. Idempotentlik

| Holat | Natija | Exit |
| --- | --- | --- |
| Foydalanuvchi yo'q | `BOOTSTRAP_USER_CREATED` | 0 |
| Mavjud, director roli bor | `BOOTSTRAP_USER_ALREADY_EXISTS` — **hech narsa o'zgarmaydi** | 0 |
| Mavjud, director roli yo'q | `BOOTSTRAP_USER_EXISTS_WITHOUT_DIRECTOR_ROLE` — **ma'lumot o'zgartirilmaydi** | 1 |
| `BOOTSTRAP_ALLOW_PASSWORD_RESET=true` + director | `BOOTSTRAP_PASSWORD_RESET` — **faqat xesh** yangilanadi | 0 |
| `director` roli yo'q | `BOOTSTRAP_ROLE_MISSING` | 1 |
| Tizim akkaunti yo'q | `BOOTSTRAP_SYSTEM_USER_MISSING` | 1 |
| Parol qisqa | `BOOTSTRAP_PASSWORD_TOO_SHORT` | 1 |

Parolni jimgina almashtirish, rolni jimgina o'zgartirish yoki dublikat yaratish —
hech biri sodir bo'lmaydi. Parol almashtirish faqat aniq opt-in bilan.

Yaratish bitta tranzaksiyada: `users` + `user_roles`. Biri yiqilsa, ikkalasi ham
qaytariladi.

## 7. Bajarilgan tekshiruv

Jonli PostgreSQL 18.6 (`fincore`) ustida:

| Tekshiruv | Natija |
| --- | --- |
| Bootstrap yaratish | `BOOTSTRAP_USER_CREATED`, director, 29 ruxsat |
| Qayta ishga tushirish | `BOOTSTRAP_USER_ALREADY_EXISTS`, o'zgarish yo'q |
| Parolni almashtirish (opt-in) | `BOOTSTRAP_PASSWORD_RESET`, faqat xesh |
| `POST /api/auth/login` | `200`, bazadan foydalanuvchi, bcrypt taqqoslash |
| Sessiya cookie | `fincore_session` o'rnatildi (signed, httpOnly) |
| `GET /api/me` sessiya bilan | `200`, 29 ruxsat bazadan |
| `GET /api/me` sessiyasiz | `401 UNAUTHENTICATED` |
| Noto'g'ri parol | `401 INVALID_CREDENTIALS` |
| `POST /api/auth/logout` | `204`, keyin `/api/me` → `401` |
| Javobda parol/xesh | topilmadi |
| Log'da parol/secret/cookie/connection string | topilmadi |

Login javobidagi proyeksiya:

```
roles             : director @ barcha filiallar
permissions       : 29 ta
branchScopes      : 2 ta filial
writeBranchScopes : 0
```

`writeBranchScopes = 0` — **to'g'ri**. Director `branch_id = NULL` bilan
tayinlangan, ya'ni butun kompaniya bo'ylab **o'qish** huquqiga ega, yozish
huquqiga emas. Bu seed'ning hujjatlashtirilgan qoidasiga va "direktor xarajat
kiritmaydi" talabiga mos.

### RBAC haqida cheklov

`PermissionsGuard` va `@RequirePermissions` tayyor va 5 ta unit test bilan
qoplangan, lekin **hozircha ularni ishlatadigan route yo'q** — Phase 18.1 da
faqat auth endpointlari qurilgan. Shu sababli "ruxsati yetmagan foydalanuvchi →
403" holatini jonli API'da sinab bo'lmadi. Buning uchun yangi endpoint yaratish
bu bosqichda taqiqlangan edi. Jonli tekshirilgani: ruxsatlar ro'yxati haqiqiy
bazadan (`role_permissions` → `permissions`) to'g'ri yig'ilishi.

## 8. O'zgargan fayllar

- `backend/package.json` — `bootstrap:admin` skripti qo'shildi

## 9. Birinchi foydalanuvchini yaratish

```bash
cd backend
npm run build
BOOTSTRAP_ADMIN_NAME="Ism Familiya" BOOTSTRAP_ADMIN_LOGIN="siz@fincore.local" BOOTSTRAP_ADMIN_PASSWORD="uzun-va-kuchli-parol" npm run bootstrap:admin
```

Parolni almashtirish:

```bash
BOOTSTRAP_ADMIN_NAME="Ism Familiya" BOOTSTRAP_ADMIN_LOGIN="siz@fincore.local" BOOTSTRAP_ADMIN_PASSWORD="yangi-uzun-parol" BOOTSTRAP_ALLOW_PASSWORD_RESET=true npm run bootstrap:admin
```

> Windows'da terminaldan yashirin parol kiritish (`readline` bilan echo
> o'chirish) Git Bash muhitida ishonchli ishlamagani uchun environment
> o'zgaruvchisi tanlandi. Shell tarixiga tushmasligi uchun buyruq oldiga bo'sh
> joy qo'ying yoki `HISTCONTROL=ignorespace` dan foydalaning.

## 10. Ogohlantirish

**Haqiqiy parollar hech qachon Git'ga tushmasligi kerak.**

- `backend/.env` `.gitignore` da — tekshirilgan
- `.env.example` da faqat placeholder, `BOOTSTRAP_ADMIN_PASSWORD` umuman yo'q
- Bootstrap parolini skript, hujjat yoki commit xabariga yozmang
- Production'da bu skript bir marta ishlatiladi, so'ng parol almashtiriladi
