# FinCore Backend

NestJS 11 + Prisma 5 + PostgreSQL. **Phase 18.1 — foundation only.**

Bu bosqichda faqat quyidagilar bor: konfiguratsiya, database ulanishi,
xatolik kontrakti, sessiya/autentifikatsiya infratuzilmasi va health endpoint.
Biznes modullari (xarajat, budjet, tushum, hisobotlar, import, bildirishnoma)
keyingi bosqichlarda qo'shiladi.

## Talablar

- Node.js >= 20
- PostgreSQL >= 14 (`fincore` sxemasi bilan)

## Ishga tushirish

```bash
cd backend
npm install
cp .env.example .env      # keyin .env dagi qiymatlarni to'ldiring
npm run prisma:generate
npm run start:dev
```

`SESSION_SECRET` uchun tasodifiy qiymat:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Database hali tayyor bo'lmasa, `DATABASE_URL` ni bo'sh qoldiring — API baribir
ishga tushadi va `GET /api/health` `NOT_CONFIGURED` deb qaytaradi. Ma'lumot
talab qiladigan har qanday so'rov esa toza `503 DATABASE_UNAVAILABLE` beradi.

## Skriptlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run start:dev` | Watch rejimida ishga tushirish |
| `npm run build` | `dist/` ga kompilyatsiya |
| `npm run start:prod` | `node dist/main.js` |
| `npm run typecheck` | `tsc --noEmit` (testlar ham tekshiriladi) |
| `npm test` | Vitest, bir marta |
| `npm run test:watch` | Vitest, watch rejimida |
| `npm run prisma:generate` | Prisma client'ni qayta yaratish |
| `npm run prisma:pull` | Jonli bazadan modellarni qayta olish |

## Endpointlar (Phase 18.1)

| Metod | Yo'l | Ruxsat | Javob |
| --- | --- | --- | --- |
| `GET` | `/api/health` | ochiq | `{ status, environment, uptimeSeconds, database, checkedAt }` |
| `POST` | `/api/auth/login` | ochiq (5/min) | `200` + `AuthenticatedUser`, sessiya cookie o'rnatiladi |
| `POST` | `/api/auth/logout` | ochiq | `204`, cookie o'chiriladi |
| `GET` | `/api/me` | sessiya | `AuthenticatedUser` |

Swagger: `SWAGGER_ENABLED=true` bo'lganda `http://localhost:3000/api/docs`.

## Testlar

Vitest (frontend bilan bir xil versiya). Test fayllari kod yonida turadi:
`*.test.ts`. Ular `tsconfig.build.json` orqali production build'dan chiqarilgan —
`dist/` ga tushmaydi.

```bash
npm test
```

Qamrov: env validatsiyasi, moliyaviy serializatsiya, connection-string
redaction, xatolik filtri, ruxsat guard'i, sessiya xizmati, cookie atributlari,
sessiya guard'i va kontrakt interceptori.

## Arxitektura qoidalari

- **Sessiya cookie, Bearer token emas.** Frontend `credentials: 'include'`
  bilan ishlaydi va `Authorization` sarlavhasini yubormaydi. Cookie
  `httpOnly` + `signed`, ichida faqat tasodifiy identifikator bo'ladi.
- **Pul `string` sifatida.** `*Uzs` bilan tugaydigan har bir maydon butun
  son-string (`"1732500"`). JS `number` ishlatilmaydi. `src/common/serialization`
  yordamchilaridan foydalaning.
- **Har qanday xatolik JSON.** Global filter barcha statuslarni
  `{ code, message, details? }` shakliga keltiradi — HTML javob frontend'da
  `API_UNAVAILABLE` xatosiga aylanadi.
- **Schema o'zgartirilmaydi.** `docs/database/001_reference_schema.sql` —
  yagona haqiqat manbai. `prisma/schema.prisma` unga *moslashadi*, migratsiya
  yaratmaydi.

## Xavfsizlik

- Parollar bcrypt (cost 12) bilan xeshlanadi; plaintext hech qayerda saqlanmaydi.
- Noma'lum foydalanuvchi uchun ham bir xil vaqt sarflanadi (timing attack himoyasi).
- CORS faqat `FRONTEND_URL` origin'iga ochiq; wildcard qabul qilinmaydi.
- Log'ga parol, secret, cookie qiymati yoki connection string yozilmaydi.
- `.env` git'ga tushmaydi. Faqat `.env.example` commit qilinadi.
