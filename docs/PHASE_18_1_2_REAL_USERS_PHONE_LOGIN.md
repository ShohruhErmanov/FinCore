# PHASE 18.1.2 — Real Users + Phone Login

**Sana:** 2026-08-23 · **Holat:** BLOCKED (login ishlaydi, ruxsat lug'ati mos emas)
**Oldingi:** [Phase 18.1](PHASE_18_1_BACKEND_FOUNDATION.md) · [Phase 18.1.1](PHASE_18_1_1_BOOTSTRAP_ADMIN.md)

## 1. Maqsad

Frontend LoginPage → NestJS → PostgreSQL → bcrypt → sessiya cookie → `GET /api/me`
zanjirini haqiqiy ma'lumot bilan ishlatish. Uchta haqiqiy xodim akkaunti yaratish.

## 2. Contract tekshiruvi — mismatch yo'q

| | Maydon |
| --- | --- |
| Frontend (`contracts.ts:38`) | `authApi.login({ login, password })` |
| Frontend forma (`login-page.tsx:13`) | `login`, yorlig'i "Telefon raqamni kiriting" |
| Backend (`LoginDto`) | `{ login, password }` |

Payload ikki tomonda **aynan bir xil**. Backend'ga hech qanday mapping yoki
o'zgarish kerak bo'lmadi.

## 3. Yaratilgan foydalanuvchilar

Ro'yxat `docs/PROJECT_REQUIREMENTS.md:64-66` dan olingan (ofis Excel'ining
"Rollar" varag'i). Skript: `backend/scripts/bootstrap-users.mjs`.

| Ism | Rol(lar) | Filial | Ruxsat |
| --- | --- | --- | --- |
| Ergashev Abdulla | `director` | barcha (branch_id=NULL) | 29 |
| Soyibjonova Madina | `finance_manager` **+** `cashier` | barcha + Sayxun | 18 |
| Mamurova Maftuna | `cashier` | Xalqlar do'stligi | 6 |

Madina **ikkita alohida `user_roles` yozuvi** oladi — birlashtirilgan rol
yaratilmadi. Bu `AuthenticatedUser` da to'g'ri natija beradi:
`branchScopes = 2` (finance_manager butun kompaniyani o'qiydi),
`writeBranchScopes = 1` (faqat Sayxun, kassir tayinlovidan).

Telefon raqamlar **hech qanday manbada yo'q**, shuning uchun ular faqat
environment orqali beriladi. Tekshiruvda `+99890000000{1,2,3}` placeholder
qiymatlari ishlatilgan — ularni haqiqiy raqamlarga almashtirish kerak.

## 4. Bootstrap buyrug'i

```bash
cd backend && npm run build
BOOTSTRAP_DIRECTOR_PHONE="+998..." BOOTSTRAP_DIRECTOR_PASSWORD="..." \
BOOTSTRAP_FINANCE_PHONE="+998..."  BOOTSTRAP_FINANCE_PASSWORD="..." \
BOOTSTRAP_CASHIER_PHONE="+998..."  BOOTSTRAP_CASHIER_PASSWORD="..." \
npm run bootstrap:users
```

Parolni almashtirish uchun qo'shimcha: `BOOTSTRAP_ALLOW_PASSWORD_RESET=true`

**Idempotentlik:** mavjud foydalanuvchi qayta yaratilmaydi, mavjud rol
tayinlovi dublikat qilinmaydi, parol/status/rol jimgina o'zgartirilmaydi.
Yetishmayotgan rol tayinlovi bo'lsa — faqat o'sha qo'shiladi (`GRANT`).

**Xavfsizlik:** parol faqat environment'dan, hech qachon chop etilmaydi,
log qilinmaydi, faylga yozilmaydi, kodda yo'q. Xeshlash `dist/auth/password.js`
dagi mavjud bcryptjs cost 12 — boshqa kutubxona qo'shilmagan.

## 5. Jonli tekshiruv — hammasi PASS

| Tekshiruv | Natija |
| --- | --- |
| Director login | `200`, `director@barcha`, 29 ruxsat, read 2 / write 0 |
| Finance+Cashier login | `200`, `finance_manager@barcha + cashier@Sayxun`, 18 ruxsat, read 2 / write 1 |
| Cashier login | `200`, `cashier@Xalqlar do'stligi`, 6 ruxsat, read 1 / write 1 |
| Noto'g'ri parol | `401 INVALID_CREDENTIALS` |
| Noma'lum telefon | `401 INVALID_CREDENTIALS` |
| Nofaol hisob (`status=inactive`) | `401 ACCOUNT_DISABLED` |
| Telefon normallashtirish | `+998900000001`, `+998 (90) 000-00-01`, `+998 90 000 00 01` — uchalasi `200` |
| Cookie bilan `GET /api/me` | `200` |
| Cookie'siz `GET /api/me` | `401 UNAUTHENTICATED` |
| Logout | `204`, keyin `/api/me` → `401` |
| Rate limit | 6-urinishda `429 RATE_LIMITED` |

### Brauzerda (haqiqiy Vite dev server, mock o'chirilgan)

```
OPTIONS http://localhost:3000/api/auth/login  -> 204   (CORS preflight)
POST    http://localhost:3000/api/auth/login  -> 200
GET     http://localhost:3000/api/me          -> 200   (cookie yuborildi)
        fullName: "Ergashev Abdulla", roles: ["director"], permissions: 29
```

Cookie brauzerda ham ishlaydi: `localhost:5173` va `localhost:3000` bir xil
*site* (SameSite port'ni hisobga olmaydi), shuning uchun `SameSite=Lax`
to'sqinlik qilmadi.

## 6. BLOCKER — ruxsat lug'ati mos emas

Login to'liq ishlaydi, lekin **login'dan keyin UI "Ruxsat yo'q" sahifasini
ko'rsatadi.**

Sabab: bazadagi `fincore.permissions` (29 kod) va frontend'dagi
`PermissionCode` union (20 kod) **turli lug'atlar**. Faqat 12 tasi bir xil.

**Frontend talab qiladi, bazada YO'Q (8 ta):**

```
dashboard.view              <- UI'ni bloklayotgan asosiy kod
revenue.view_own_branch     (bazada: revenue.view_own)
revenue.view_all_branches   (bazada: revenue.view_all)
revenue.edit                (bazada: revenue.reverse)
revenue_plan.manage         (bazada: revenue_plan.create_edit/submit/approve)
notification.manage
reports.view_cashiers
reports.view_own_performance
```

**Bazada bor, frontend ishlatmaydi (17 ta):** `audit.view`, `budget.approve`,
`budget.submit`, `expense.approve`, `expense.correct_reverse`, `expense.reject`,
`expense.submit`, `import.resolve_exception`, `period.close`, `period.reopen`,
`revenue.enter_on_behalf`, `revenue.reverse`, `revenue.view_all`,
`revenue.view_own`, `revenue_plan.approve`, `revenue_plan.create_edit`,
`revenue_plan.submit`

### Kelib chiqishi

`002_seed_reference.sql` Phase 16 dagi asl loyihaga mos (29 ruxsat, to'liq
approval workflow bilan). Frontend keyinchalik ikki marta o'zgardi: avval
Excel'ga moslash uchun qisqartirildi, keyin tushum/bildirishnoma/kassir
hisoboti qo'shilganda yangi kodlar bilan kengaytirildi. Ikki tomon bir-biridan
uzoqlashdi. Bu Phase 17.1 da qayd etilgan hal qilinmagan ziddiyatlar oilasiga
kiradi.

### Nima uchun o'zim hal qilmadim

Uchta yo'lning har biri taqiqlangan hududga tegadi:

| Yo'l | To'siq |
| --- | --- |
| Bazaga 8 ta kod qo'shish | "Do NOT modify approved database SQL architecture" |
| Frontend union'ini o'zgartirish | UI gating'ini buzadi, katta refactor |
| Backend'da kod mapping qatlami | Ixtiro qilingan tarjima qatlami, ikki manba haqiqati |

Qaysi tomon haqiqat manbai ekani — **biznes/arxitektura qarori**.

## 7. Frontend integratsiyasi

`.env.local` (gitignore'da) yaratildi:

```
VITE_ENABLE_MOCKS=false
VITE_API_BASE_URL=http://localhost:3000/api
```

Backend `.env` da `FRONTEND_URL=http://localhost:5173` — CORS aynan shu
origin'ga ochiq, shuning uchun dev server porti 5173 bo'lishi shart
(`.claude/launch.json` da `autoPort: false`).

> Demo rejimiga qaytish uchun: `.env.local` da `VITE_ENABLE_MOCKS=true`.
> Ruxsat lug'ati kelishtirilgunicha real backend rejimida UI login'dan keyin
> "Ruxsat yo'q" ko'rsatadi.

## 8. O'zgargan / yaratilgan fayllar

**Yaratildi:**
- `backend/scripts/bootstrap-users.mjs`
- `docs/PHASE_18_1_2_REAL_USERS_PHONE_LOGIN.md`
- `.env.local` (gitignore'da, commit qilinmaydi)
- `.claude/launch.json`

**O'zgartirildi:**
- `backend/package.json` — `bootstrap:users` skripti

**Tegilmadi:** frontend manba kodi, `contracts.ts`, MSW handlerlar, SQL
arxitektura, Prisma sxemasi, auth mexanizmi.

**Database:** faqat `INSERT` (`users` 3 qator, `user_roles` 4 qator) va
`UPDATE` (`password_hash`, `last_login_at`). **DDL o'zgarishi yo'q.**

## 9. Ogohlantirish

- Haqiqiy parollar hech qachon Git'ga tushmasligi kerak
- Tekshiruv paytida ishlatilgan vaqtinchalik parol tasodifiy qiymatga
  almashtirildi — hozir uchala akkauntning paroli hech kimga ma'lum emas.
  Ishlatishdan oldin `BOOTSTRAP_ALLOW_PASSWORD_RESET=true` bilan o'z
  parolingizni o'rnating
- `+99890000000{1,2,3}` — placeholder raqamlar, haqiqiysiga almashtirilsin
