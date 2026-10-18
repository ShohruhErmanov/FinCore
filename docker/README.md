# FinCore — Docker

Uchta konteyner, bitta buyruq:

```
brauzer ──► web (nginx :8080) ──/api──► api (NestJS :3000) ──► db (PostgreSQL 18)
             SPA fayllari                 production rejim        fincore-db volume
```

- Tashqariga faqat `web` ochiladi, sukut bo‘yicha faqat shu kompyuter uchun (`127.0.0.1:8080`).
- `api` faqat nginx orqali ko‘rinadi. `db` ichki tarmoqda: unga tashqaridan ham, konteyner ichidan internetga ham yo‘l yo‘q.
- Brauzer uchun bitta manzil, shuning uchun sessiya cookie’si va CSRF tekshiruvi qo‘shimcha sozlashsiz ishlaydi.
- Ma’lumotlar `fincore-db` volume’ida saqlanadi: `docker compose down` ularni o‘chirmaydi.

Ochish: **http://localhost:8080**

## Kundalik buyruqlar

```bash
docker compose up -d --build     # ishga tushirish yoki kodni yangilash
docker compose ps                # holat (healthy bo‘lishi kerak)
docker compose logs -f api       # API logi
docker compose restart api       # API ni qayta ishga tushirish
docker compose down              # to‘xtatish (ma’lumotlar qoladi)
```

`down -v` volume’ni, ya’ni **bazani o‘chiradi**. Undan oldin albatta zaxira nusxa oling.

## Zaxira nusxa va tiklash

```bash
node docker/scripts/backup.mjs                                   # docker/backups/fincore-<vaqt>.dump
node docker/scripts/restore.mjs docker/backups/fincore-<vaqt>.dump
```

- `restore.mjs` faqat **bo‘sh** bazaga tiklaydi. `fincore` sxemasi bor bo‘lsa, hech narsani o‘zgartirmay rad etadi.
- Tiklash bitta tranzaksiyada bajariladi: xato bo‘lsa, baza avvalgidek bo‘sh qoladi.
- `docker/backups/` git’ga tushmaydi. Unda haqiqiy moliyaviy ma’lumot bor, nusxalarni boshqa diskka ham saqlang.

Nusxadan noldan tiklash:

```bash
node docker/scripts/backup.mjs            # avval joriy holatni saqlang
docker compose down -v
FINCORE_DB_INIT=empty docker compose up -d db
node docker/scripts/restore.mjs docker/backups/<fayl>.dump
docker compose up -d
```

PowerShell’da `FINCORE_DB_INIT=empty` o‘rniga avval `$env:FINCORE_DB_INIT='empty'` bering, ishdan keyin `Remove-Item env:FINCORE_DB_INIT`.

## Maxfiy sozlamalar

`docker/db.env` va `docker/api.env` git’ga tushmaydi. Ularni yaratish:

```bash
node docker/scripts/create-env.mjs                          # http://localhost:8080 uchun
node docker/scripts/create-env.mjs --frontend-url https://fincore.example.uz --force
```

- Baza uchun yangi tasodifiy parol yaratiladi.
- Actor imzo kaliti `backend/.env` dan olinadi. U tiklangan bazadagi `fincore._actor_signing_keys` bilan mos bo‘lishi shart, aks holda har bir yozuv "missing actor context" bilan rad etiladi.
- Hech qaysi qiymat ekranga chiqarilmaydi.

## Bo‘sh bazadan yangi o‘rnatish

Volume birinchi marta yaratilganda baza `docs/database/` dagi migratsiyalar (001 → 020) bilan quriladi. Bu `FINCORE_DB_INIT=schema`, sukut bo‘yicha. Keyin:

```bash
node docker/scripts/create-env.mjs
docker compose up -d --build
docker compose exec api node scripts/init-actor-key.mjs     # chiqqan 2 qatorni docker/api.env ga yozing
docker compose up -d api                                     # yangi kalit bilan qayta ko‘tariladi
docker compose exec -e BOOTSTRAP_OWNER_NAME="..." -e BOOTSTRAP_OWNER_LOGIN="..." \
  -e BOOTSTRAP_OWNER_PASSWORD="..." api node scripts/bootstrap-owner.mjs
```

Direktor uchun `bootstrap-admin.mjs` (`BOOTSTRAP_ADMIN_*`) shu tartibda ishlatiladi.

## Yangi migratsiya

Init skriptlari faqat volume birinchi yaratilganda ishlaydi. Mavjud bazaga yangi faylni qo‘lda qo‘llang, avval zaxira nusxa olib:

```bash
node docker/scripts/backup.mjs
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /fincore-migrations/021_….sql'
```

## Serverga chiqarish

1. Domen va TLS: oldiga sertifikat beradigan proxy qo‘ying (masalan, Caddy yoki Let’s Encrypt bilan nginx), u `127.0.0.1:8080` ga uzatadi.
2. `node docker/scripts/create-env.mjs --frontend-url https://<domen> --force`. Bu `COOKIE_SECURE=true` ni ham o‘rnatadi.
3. Production rejimda API `https` va secure cookie’siz ishga tushmaydi. Faqat `localhost` istisno, chunki u yerda cookie tarmoqdan o‘tmaydi.
4. Proxy boshqa mashinada tursa, `FINCORE_BIND=0.0.0.0` qiling va firewall’da faqat shu proxy’ga ruxsat bering.

## Tuzilma

| Fayl                         | Vazifasi                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| `compose.yaml`               | uchta servis, tarmoqlar, volume, healthcheck’lar                     |
| `backend/Dockerfile`         | API: build + faqat production bog‘liqliklari, `node` foydalanuvchisi |
| `docker/frontend.Dockerfile` | Vite build → unprivileged nginx                                      |
| `docker/nginx/default.conf`  | SPA, `/api` proxy, xavfsizlik sarlavhalari, kesh                     |
| `docker/db/init-fincore.sh`  | birinchi ishga tushirish: rollar va migratsiyalar                    |
| `docker/scripts/*.mjs`       | env, zaxira nusxa, tiklash                                           |
