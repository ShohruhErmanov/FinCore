# FINCORE — moliya platformasi uchun texnik topshiriq

**Versiya:** 1.2  
**Sana:** 2026-08-20  
**Asosiy manba:** foydalanuvchi yuborgan Google Sheets — `Kopiya Moliya reja`, ID `10W6K8tbQ5KjHVC2tTG8CFrBlCVnMYTp0PbPLKzUZtCc`; filial tushumi va kassirlar bo'yicha product owner qo'shimchasi  
**Tashkilot:** IT Live Academy  
**Til:** Uzbek (lotin)  
**Holat:** ishlab chiqishga tayyor bazaviy TZ; 16-bo'limdagi product qarorlar yakuniy tasdiqni talab qiladi.

---

## 1. Maqsad va muammo

FINCORE — ikki filialli o'quv markazining tushumlari, xarajatlari, budjeti va rahbariyat hisobotlarini boshqaruvchi web-platforma.

Hozirgi jarayon Google Sheets'da yuritiladi:

```text
Sayxun kassasi + Xalqlar do'stligi kassasi
                    ↓
             Umumiy jurnal
                    ↓
  Oylik hisobot / Xulosa / Filiallar taqqoslash

Budjet tarixi ─────────────────────────────────────┘
```

Platforma quyidagilarni ta'minlashi kerak:

- har bir filialning oylik kutilgan tushum rejasini va haqiqiy tushumini yuritishi;
- har bir tushumni filial, to'lov kanali va pulni qabul qilgan kassir bilan bog'lashi;
- filial va barcha filiallar bo'yicha tushum rejasi, fakt, rejaga yetmagan summa hamda yig'ilish foizini ko'rsatishi;
- filial kassiri faqat o'z filiali xarajatini kiritishi;
- barcha faktlar bitta ishonchli jurnalga avtomatik tushishi;
- reja va fakt kategoriya, filial hamda davr kesimida solishtirilishi;
- o'tgan davr budjeti va tranzaksiyalari himoyalanishi;
- direktor barcha filiallarni, xarajat manbasini va tafovut sababini ko'ra olishi;
- formulaga, matn nomiga va qat'iy Excel diapazonlariga bog'liqlik yo'qolishi.

Bu hujjatning V1 qismi Sheets'da isbotlangan **xarajat + budjet** jarayoniga product owner tasdiqlagan **filial tushumi + kassir nazorati** talablarini qo'shadi. Refund/qaytim, to'liq buxgalteriya/GL va murakkab per-expense approval oqimi alohida kengaytma bo'lib qoladi.

---

## 2. Tahlil qilingan varaqlar va platformadagi ekvivalenti

Google Sheets'dagi barcha 12 varaq o'qildi. Eksport paketida 5 ta grafik ham bor: `Xulosa`da 2 ta, `Filiallar_taqqoslash`da 2 ta va `2_filial_bitta_jadval`da 1 ta.

| Varaq | Hozirgi vazifasi | Platformadagi modul / qaror |
|---|---|---|
| `Yoriqnoma` | 4 qadamli ishlash qoidasi, ranglar ma'nosi, yopish odati | onboarding, yordam markazi, rollarga mos yordam matni |
| `Sozlamalar` | kategoriya, xarajat turi, to'lov usuli, bo'lim va boshlang'ich namuna rejalari | master-data boshqaruvi |
| `Jurnal` | ikki kassa varag'idan `QUERY()` bilan yig'ilgan umumiy ledger | serverdagi yagona `expenses` jurnali; qo'lda tahrir qilinmaydi |
| `Oylik_hisobot` | yil/filial filtri, kategoriya x oy faktlari, reja va farq | plan-vs-actual report |
| `Xulosa` | rahbariyat KPI va grafiklari | executive dashboard |
| `Filiallar_taqqoslash` | Sayxun va Xalqlar do'stligi uchun oy/yil taqqoslanishi | branch comparison report |
| `2_filial_bitta_jadval` | bitta oy, kategoriya va ikki filial bo'yicha Reja/Fakt/Farq | operativ monthly control report |
| `Budjet_tarixi` | har oy uchun filial-kategoriya budjeti va tarix | budget planning, approval, version va period lock |
| `Sayxun_kassa` | Sayxun kassiri kiritadigan xarajatlar | filial-scoped expense form/list |
| `Xalqlar_kassa` | Xalqlar do'stligi kassiri kiritadigan xarajatlar | filial-scoped expense form/list |
| `Xarajat ` | norasmiy kanselyariya xarid satrlari | import exception yoki kelajakdagi expense line-item funksiyasi |
| `Rollar` | xodim, roli, filial, kiritish/ko'rish huquqi | RBAC va filial-scoped ruxsatlar |

### 2.1. Asl 4 qadamli jarayon

1. Foydalanuvchi o'z rolini tekshiradi.
2. Kassir o'z filialining kassasiga xarajat kiritadi.
3. Moliya rahbari oy hamda filial bo'yicha budjetni belgilaydi.
4. Jurnal va hisobotlar avtomatik hisoblanadi; keyingi oyning 1–5 kunlari oldingi oy farqi ko'rib chiqiladi.

Platformada bu jarayon harakatlar, ruxsatlar, bildirishnomalar va audit orqali majburiy bajariladi; rang yoki izohga tayanilmaydi.

---

## 3. Manbadan tasdiqlangan biznes modeli

### 3.1. Filiallar

V1 seed ma'lumotlari:

- `Sayxun`
- `Xalqlar do'stligi`

`Barchasi` filial emas. U hisobotning `all branches` filtri bo'lib, ma'lumotlar bazasida alohida filial qatori yaratilmaydi.

### 3.2. Xarajat kategoriyalari

`Sozlamalar`da 25 ta to'ldirilgan kategoriya mavjud. Har kategoriya aynan bitta turga tegishli:

- **Doimiy (10):** ijara, xodimlar oyligi, soliq va ijtimoiy to'lovlar, internet/aloqa, kommunal abonent to'lovi, dasturiy ta'minot/litsenziya, buxgalteriya, qo'riqlash, terminal/server/SMS, tozalash.
- **O'zgaruvchan (15):** mentorlar oyligi, KPI/bonus, marketing, poligrafiya, kanselyariya/o'quv materiallari, elektr, texnika xaridi, texnika ta'miri, tadbir, mehmondorchilik, transport, malaka oshirish, team-building/HR, boshqa xarajatlar, gamifikatsiya.

Kategoriya turi foydalanuvchi kiritadigan atribut emas. U kategoriya kartasining doimiy atributi bo'ladi va xarajat/budjet satriga tarixiy snapshot sifatida yoziladi.

### 3.3. To'lov usullari va bo'limlar

**To'lov usullari:** Naqd pul, Bank o'tkazmasi, Plastik karta (Uzcard/Humo), Click/Payme, Korporativ karta, Boshqa.

**Bo'limlar:** Ma'muriyat, O'quv bo'limi, Marketing, Sotuv (ROP), Texnik ta'minot, HR, Umumiy.

### 3.4. Pul va vaqt qoidasi

- Barcha summalar UZS/so'mda, tiyinlarsiz saqlanadi.
- DB/API'da pul `BIGINT` yoki `NUMERIC(18,0)` bo'ladi; `float` ishlatilmaydi.
- Operatsion vaqt zonasi: `Asia/Tashkent`.
- Xarajatning `year` va `month` qiymatlari transaction sanasidan server tomonidan olinadi. Ularni forma orqali alohida tahrirlash taqiqlanadi.

### 3.5. Filialning oylik tushum rejasi va haqiqiy tushum

- Har bir filial uchun har oyga kutilgan tushum rejasi moliya rahbari tomonidan kiritiladi va direktor tasdiqlaydi.
- Umumiy markaz rejasi alohida hardcode qilinmaydi; tasdiqlangan filial rejalari yig'indisidan hisoblanadi.
- Product misoli: barcha filiallar bo'yicha kutilgan tushum `300 000 000`, 1-filial rejasi `160 000 000`. Bu raqamlar demo/acceptance misoli, doimiy konfiguratsiya emas.
- Haqiqiy tushum faqat muvaffaqiyatli (`posted`) tushum tranzaksiyalari yig'indisi; reja va fakt alohida saqlanadi.
- Tushum kanallari kamida: `Naqd`, `Plastik karta`, `Bank o'tkazmasi`. Keyinchalik Click/Payme yoki boshqa kanal master-data orqali qo'shiladi.
- `180 000 000 / 300 000 000 = 60%` — bu **tushum yig'ilish foizi**, sof foyda emas. Sof foyda faqat haqiqiy tushumdan shu davr haqiqiy xarajatlari ayrilgandan keyin hisoblanadi.

---

## 4. Rollar, filial doirasi va ruxsatlar

Sheets'dagi 3 amaldagi rol:

| Asl rol | Asl javobgarlik | Platformadagi ruxsat modeli |
|---|---|---|
| **Moliya rahbari + kassir** | Sayxun xarajatlari, ikki filial budjeti, sozlamalar | `finance_manager` + `cashier` rollari bitta userga biriktiriladi; kassir scope'i Sayxun, finance scope'i barcha filial budjetlari |
| **Kassir** | faqat Xalqlar do'stligi xarajatlarini kiritadi | `cashier`, scope = Xalqlar do'stligi |
| **Direktor** | yakuniy nazorat va tasdiqlash | `director`, barcha filial va barcha reportlar; budget/period final actionlari |

Bir userga bir nechta rol biriktirish qo'llab-quvvatlanadi. Bu Madinaning manbadagi birlashtirilgan rolini maxsus, qayta ishlatib bo'lmaydigan `finance_manager_cashier` roliga aylantirmasdan yechadi.

### 4.1. Majburiy permission katalogi

| Permission | Kassir | Moliya rahbari | Direktor |
|---|---:|---:|---:|
| O'z filiali xarajatlarini ko'rish | ✓ | ✓ | ✓ |
| Boshqa filial xom tranzaksiyalarini ko'rish | — | ko'rish | ✓ |
| Xarajat yaratish/tahrirlash (ochiq davrda) | faqat o'z filiali | Sayxun kassir scope'ida | ✓ |
| Kategoriya, bo'lim, to'lov usulini boshqarish | — | ✓ | ✓ |
| Budjet yaratish va tahrirlash | — | ✓ | ✓ |
| Budjetni tasdiqlash | — | tavsiya: yuborish | ✓ |
| Hisobot va dashboard | ruxsat berilgan filial/reportlar | ✓ | ✓ |
| Tushum kiritish | faqat o'z filiali | Sayxun kassir scope'ida | ✓ |
| O'z kassirlik tushumlarini ko'rish | faqat o'zi/o'z filiali | ✓ | ✓ |
| Barcha kassirlar kesimidagi tushum hisoboti | — | ✓ | ✓ |
| Filial tushum rejasini yaratish/tahrirlash | — | ✓ | ✓ |
| Filial tushum rejasini tasdiqlash | — | yuborish | ✓ |
| Davrni yopish/qayta ochish | — | taklif qilish | ✓ |
| User/rol sozlamalari | — | — | ✓ |
| Audit log va import exceptionlarini ko'rish | — | ✓ | ✓ |

**Muhim qoida:** frontenddagi yashirish yetarli emas. Har bir API endpoint server tomonda userning permissioni va `branch_id` scope'ini tekshirishi shart.

---

## 5. Funksional talablar

### 5.1. Autentifikatsiya va sessiya — `FR-AUTH`

- `FR-AUTH-01`: tizimda user login bilan autentifikatsiya qilinadi. Login identifikatori sifatida telefon raqami yoki korporativ email product owner tomonidan tanlanadi; V1 uchun telefon + parol tavsiya etiladi.
- `FR-AUTH-02`: user faol/nofaol/vaqtincha bloklangan holatga ega bo'ladi.
- `FR-AUTH-03`: autentifikatsiyadan keyin userning rollari, permissionlari va filial scope'i serverdan olinadi.
- `FR-AUTH-04`: session tugashi, parol almashtirish va login urinishlarini cheklash xavfsizlik siyosatida sozlanadi.

### 5.2. Master data — `FR-MD`

- `FR-MD-01`: filial, kategoriya, to'lov usuli va bo'lim alohida master jadvaldan tanlanadi.
- `FR-MD-02`: kategoriya: `code`, `name`, `expense_type`, `is_active`, `created_at`, `updated_at` maydonlariga ega bo'ladi.
- `FR-MD-03`: kategoriya nomi/aliasi bir xil ma'nodagi eski yozuvni topish uchun ishlatilishi mumkin, lekin fact/report bog'lanishi faqat immutable ID orqali bo'ladi.
- `FR-MD-04`: kategoriya inaktiv qilinsa, tarixiy xarajat va budjetdagi FK buzilmaydi; u faqat yangi formadagi tanlovdan yashiriladi.
- `FR-MD-05`: yangi kategoriya qo'shilganda hech qanday formula diapazoni yoki report satri qo'lda kengaytirilmaydi. Kategoriya avtomatik tarzda budget va reportda chiqadi.
- `FR-MD-06`: `Mas'ul` erkin matn emas. Kamida `entered_by` va `responsible_user_id` alohida saqlanadi; zarur bo'lsa `requester/payee` uchun alohida maydon qo'shiladi.

### 5.3. Xarajat kiritish — `FR-EXP`

#### Xarajat kartasi

| Maydon | Talab |
|---|---|
| `id` | server hosil qilgan global, immutable ID/UUID |
| `transaction_date` | majburiy, typed date; kelajakdagi sana siyosat bilan cheklanadi |
| `accounting_period_id` | sanadan avtomatik aniqlanadi |
| `branch_id` | kassir uchun login scope'idan avtomatik; u boshqa filialni tanlay olmaydi |
| `category_id` | majburiy master-data tanlovi |
| `expense_type_snapshot` | kategoriya turidan avtomatik, read-only |
| `description` | majburiy, nima uchun xarajat qilingani |
| `amount_uzs` | majburiy musbat butun son (`> 0`) |
| `payment_method_id` | majburiy |
| `department_id` | majburiy |
| `responsible_user_id` | majburiy yoki data-quality siyosatiga ko'ra exception |
| `comment` | ixtiyoriy izoh |
| `entered_by`, `created_at`, `updated_at` | avtomatik audit maydonlari |
| `source_sheet`, `source_row` | faqat migration qilingan tarixiy ma'lumot uchun |

#### Xarajat harakatlari

- `FR-EXP-01`: kassir faqat o'z filialining ochiq davrida yangi xarajat yaratadi.
- `FR-EXP-02`: kategoriya tanlanganda `expense_type` avtomatik ko'rsatiladi; qo'lda almashtirib bo'lmaydi.
- `FR-EXP-03`: forma yuborilishidan oldin sana, kategoriya, summa, bo'lim, to'lov usuli va filial scope'i serverda tekshiriladi.
- `FR-EXP-04`: har bir xarajat yaratish, tahrirlash, o'chirish/correction va tasdiqlash harakati auditga yoziladi.
- `FR-EXP-05`: period yopilgandan keyin original xarajatni tahrirlash/o'chirish taqiqlanadi. Xato `correction/reversal` yoki direktor ruxsatidagi reopen oqimi orqali tuzatiladi.
- `FR-EXP-06`: receipt, invoice yoki foto biriktirish V1.1'da qo'llab-quvvatlanadi; tanlangan limitdan katta xarajat uchun attachment majburiyligi sozlanadigan qoida bo'ladi.
- `FR-EXP-07`: jurnal `expenses` jadvalining filtrlangan, saralangan ko'rinishi bo'ladi. Jurnalga alohida qo'lda ma'lumot kiritish endpointi mavjud bo'lmaydi.

### 5.4. Budjet rejalash va tarix — `FR-BUD`

`Budjet_tarixi` 2026-yanvardan 2027-dekabrgacha 24 oy blokidan iborat. Platformada bloklar o'rniga normalizatsiyalangan davr va budget line'lar ishlatiladi.

| Budget line maydoni | Talab |
|---|---|
| `budget_version_id` | budjet versiyasi/reviziyasi |
| `accounting_period_id` | yil + oy |
| `branch_id` | Sayxun yoki Xalqlar do'stligi |
| `category_id` | immutable master kategoriya |
| `expense_type_snapshot` | kategoriya turining tarixiy snapshot'i |
| `planned_amount_uzs` | manfiy bo'lmagan butun so'm |
| `reason` | izoh/sabab |
| `status` | `draft`, `submitted`, `approved`, `locked` |
| audit maydonlari | kim/qachon yaratdi, yubordi, tasdiqladi, lock qildi |

- `FR-BUD-01`: `(budget_version, period, branch, category)` kombinatsiyasi yagona bo'lishi shart.
- `FR-BUD-02`: moliya rahbari ikki filial uchun budjet tuzadi; direktor yakuniy tasdiqlaydi.
- `FR-BUD-03`: tasdiqlangan budjetdagi o'zgartirish yangi revision yaratadi. Eski qiymat overwrite qilinmaydi.
- `FR-BUD-04`: o'tgan/yopilgan oy budjeti oddiy edit bilan o'zgarmaydi.
- `FR-BUD-05`: nol reja va reja yo'q holati semantik jihatdan farqlanadi. `0` — reja nol; `NULL/no line` — kategoriya rejalashtirilmagan.
- `FR-BUD-06`: category label o'zgarsa ham tarixiy budget line va reportlar o'sha paytdagi snapshot bilan reproducible qoladi.
- `FR-BUD-07`: budjet shablonida bo'sh rezerv satrlar bo'lmaydi; yangi kategoriya DB'da paydo bo'lganda yangi period budjetiga avtomatik qo'shiladi yoki “rejalashtirilmagan” sifatida ko'rsatiladi.

### 5.5. Umumiy jurnal — `FR-LEDGER`

- `FR-LEDGER-01`: Jurnal barcha filiallarning haqiqiy xarajatlarini bitta server-side so'rov bilan birlashtiradi.
- `FR-LEDGER-02`: ro'yxat filtrlar: sana oralig'i, yil, oy, filial/Barchasi, kategoriya, xarajat turi, bo'lim, to'lov usuli, mas'ul, status, kiritgan user.
- `FR-LEDGER-03`: saralash standart tartibi `transaction_date DESC`, keyin `created_at DESC`, keyin immutable `id DESC`; bir kundagi tranzaksiyalar ham deterministic bo'ladi.
- `FR-LEDGER-04`: pagination server tomonda bo'ladi; 500 yoki 1 000 satr limitiga bog'liq formula/range ishlatilmaydi.
- `FR-LEDGER-05`: eksport CSV/XLSX/PDF faqat user ko'rishga haqli satrlar bilan hosil qilinadi.

### 5.6. Hisobotlar va dashboard — `FR-REP`

#### Majburiy filtrlar

- yil;
- oy yoki sana oralig'i;
- filial: bitta filial yoki `Barchasi`;
- kategoriya/kategoriya turi;
- bo'lim;
- to'lov usuli;
- pulni qabul qilgan kassir, tushum reportlarida;
- mas'ul;
- status (agar approval oqimi yoqilgan bo'lsa).

#### Majburiy hisoblash qoidalari

| Ko'rsatkich | Formula | Izoh |
|---|---|---|
| Fakt | `SUM(expenses.amount_uzs)` | tegishli period, branch, category va filterlar bo'yicha |
| Reja | `SUM(approved budget lines.planned_amount_uzs)` | mos period, branch, category bo'yicha |
| Farq | `reja − fakt` | musbat = tejash, manfiy = reja oshishi |
| Bajarilish % | `fakt / reja × 100` | reja 0 bo'lsa `—` yoki `Unplanned`, hech qachon xato/Infinity emas |
| Doimiy ulush % | `doimiy fakt / umumiy fakt × 100` | umumiy fakt 0 bo'lsa `—` |
| Yillik fakt/reja | oylar qiymatlari yig'indisi | formula range emas, query aggregation |

#### Hisobot ekranlari

1. **Oylik hisobot**
   - kategoriya × Yanvar–Dekabr faktlari;
   - o'rtacha oylik reja, yillik fakt, yillik reja, farq;
   - doimiy/o'zgaruvchan subtotal hamda umumiy jami;
   - category/oy summasidan transaksiya ro'yxatiga drill-down.

2. **Rahbariyat dashboardi (`Xulosa`)**
   - yillik fakt, doimiy, o'zgaruvchan, doimiy ulushi;
   - o'rtacha xarajat uchun maxraj aniq nomlanadi: `12 oy`, `o'tgan oylar` yoki `fakt mavjud oylar`; manbadagi noaniq o'rtacha qayta takrorlanmaydi;
   - eng qimmat oy qiymati bilan birga oy nomi va filialni ko'rsatadi;
   - oylar bo'yicha doimiy/o'zgaruvchan grafik;
   - yillik xarajat strukturasi pie/donut chart.

3. **Filiallar taqqoslash**
   - har oy uchun Sayxun fakt, Xalqlar fakt, jami fakt, ikki filial rejasi va jami reja;
   - filial bo'yicha yillik fakt, reja, bajarilish %;
   - ikki filial fakt grafik va yillik Fakt/Reja grafik.

4. **Ikki filial — bitta oy jadvali**
   - tanlangan yil/oy hamda har kategoriya uchun Sayxun Reja/Fakt/Farq, Xalqlar Reja/Fakt/Farq, jami Reja/Fakt/Farq;
   - oshib ketgan va budjetsiz xarajatlarni rangli status bilan ajratish.

5. **Data quality / reconciliation report**
   - branch source total = unified ledger total;
   - sana formatidagi xato, noma'lum kategoriya, bo'sh bo'lim, bo'sh mas'ul, budjetsiz xarajat, duplicate yoki noto'g'ri davr transactionlari;
   - import exceptionlarini tuzatish navbati.

### 5.7. Davrni yopish — `FR-CLOSE`

- `FR-CLOSE-01`: accounting period `open` yoki `closed` holatiga ega.
- `FR-CLOSE-02`: tizim keyingi oyning 1–5 kunlari oldingi oy bo'yicha closure reminder ko'rsatadi.
- `FR-CLOSE-03`: yopishdan oldin data-quality exceptionlari, budjetsiz xarajatlar va reconciliation natijasi ko'rinadi.
- `FR-CLOSE-04`: direktor (yoki berilgan permission egasi) periodni yopadi; `closed_at`, `closed_by`, closure note saqlanadi.
- `FR-CLOSE-05`: yopilgan davrning expense/budget/revenue faktlari immutable bo'ladi.
- `FR-CLOSE-06`: reopen faqat ruxsatli user, majburiy sabab va to'liq audit orqali; reopen policy product owner tasdig'i bilan yoqiladi.
- `FR-CLOSE-07`: yopishda report snapshot yoki PDF/XLSX export rekordi saqlanishi tavsiya qilinadi.

### 5.8. Tasdiqlash oqimi — `FR-APR` (konfiguratsiyalangan kengaytma)

Sheets'da xarajat uchun aniq `pending/approved/rejected` status yo'q. Shuning uchun V1 default oqimi **auto-approved** bo'ladi. Kelajakda director nazoratini qat'iylashtirish zarur bo'lsa, konfiguratsiya orqali quyidagi oqim yoqiladi:

```text
draft → submitted → approved
                  └→ rejected (reason required)
```

- Xarajat jadvali `status`, `reviewed_by`, `reviewed_at`, `rejection_reason` maydonlarini qo'llab-quvvatlaydi.
- Approval yoqilmagan bo'lsa, yangi xarajat `approved` holatida yaratiladi.
- Threshold qiymati (masalan, ma'lum summadan yuqori xarajat) hardcode qilinmaydi; system setting sifatida saqlanadi.

### 5.9. Filial tushumi va kassir nazorati — `FR-REV`

#### Oylik tushum rejasi

- `FR-REV-01`: har hisob oyida har filial uchun bitta amaldagi tushum rejasi bo'ladi.
- `FR-REV-02`: tushum rejasini moliya rahbari yaratadi/tahrirlaydi, direktor tasdiqlaydi; tasdiqlangan qiymatni o'zgartirish yangi revision yaratadi.
- `FR-REV-03`: markazning umumiy tushum rejasi tasdiqlangan filial rejalari yig'indisidan avtomatik hisoblanadi.
- `FR-REV-04`: yopilgan davr tushum rejasi oddiy edit bilan o'zgarmaydi; reopen yoki yangi auditli revision talab qilinadi.

#### Tushum tranzaksiyasi

| Maydon | Talab |
|---|---|
| `id` | server hosil qilgan immutable UUID |
| `branch_id` | kassir uchun login scope'idan avtomatik; boshqa filialni tanlay olmaydi |
| `payment_date` | majburiy typed date/time, `Asia/Tashkent` |
| `amount_uzs` | majburiy musbat butun so'm |
| `payment_method_id` | Naqd / Plastik karta / Bank o'tkazmasi va keyingi master kanallar |
| `collector_user_id` | pulni qabul qilgan yoki bank/karta tushumiga mas'ul kassir; kassir hisoboti shu maydon bo'yicha hisoblanadi |
| `entered_by` | yozuvni tizimga kiritgan user; `collector_user_id` bilan bir xil bo'lishi shart emas |
| `external_reference` | bank tranzaksiya ID, terminal slip yoki kvitansiya raqami; mavjud bo'lsa saqlanadi |
| `description` | tushumning qisqa izohi |
| `status` | `posted`, `reversed` |
| audit maydonlari | created/updated/reversed kim va qachon; reversal sababi |

- `FR-REV-05`: kassir faqat o'z filialiga tushum kiritadi; server `branch_id` scope'ini tekshiradi.
- `FR-REV-06`: `collector_user_id` backendda autentifikatsiyalangan kassirdan avtomatik qo'yiladi. Moliya rahbari boshqa kassir nomidan kiritsa, alohida permission va audit sababi majburiy.
- `FR-REV-07`: to'lov kanali kesimidagi fakt faqat `posted` tranzaksiyalar bo'yicha hisoblanadi: naqd, karta, bank va jami.
- `FR-REV-08`: noto'g'ri tushum hard-delete yoki overwrite qilinmaydi; sabab bilan reversal yaratiladi. Reversed summa tushum faktiga kiritilmaydi, original auditda qoladi.
- `FR-REV-09`: bir bank/slip reference takror kelganda duplicate warning yoki unique policy ishlaydi; bir tushum ikki marta sanalmaydi.
- `FR-REV-10`: tushum muvaffaqiyatli saqlanganda raqamli kvitansiya ID hosil qilinadi.

#### Hisoblash formulalari

| Ko'rsatkich | Formula |
|---|---|
| Kutilgan tushum | `SUM(approved revenue_plans.planned_amount_uzs)` |
| Haqiqiy tushum | `SUM(revenue_transactions.amount_uzs WHERE status = 'posted')` |
| Rejaga yetmagan summa | `MAX(kutilgan tushum − haqiqiy tushum, 0)` |
| Rejadan ortiq tushum | `MAX(haqiqiy tushum − kutilgan tushum, 0)` |
| Tushum yig'ilish % | `haqiqiy tushum / kutilgan tushum × 100` |
| Kanal ulushi % | `kanal bo'yicha tushum / umumiy haqiqiy tushum × 100` |
| Kassir ulushi % | `collector bo'yicha tushum / filial haqiqiy tushumi × 100` |
| Sof moliyaviy natija | `haqiqiy tushum − haqiqiy xarajat` |
| Sof marja % | `sof moliyaviy natija / haqiqiy tushum × 100` |

Maxraj `0` bo'lsa foiz `—` ko'rsatiladi; `Infinity`, `NaN` yoki chalg'ituvchi `0%` chiqarilmaydi. Manfiy sof moliyaviy natija `Zarar`, musbat natija `Foyda` deb belgilanadi.

#### Filial va kassir hisobotlari

- `FR-REV-11`: har filial uchun tanlangan oyda kutilgan tushum, haqiqiy tushum, rejaga yetmagan/ortiq summa va yig'ilish foizi ko'rsatiladi.
- `FR-REV-12`: filial ichida Naqd/Karta/Bank bo'yicha summa va ulush foizi ko'rsatiladi; segment ustiga bosilganda tegishli tranzaksiyalar ro'yxatiga drill-down qilinadi.
- `FR-REV-13`: kassirlar hisoboti tanlangan oy va filial uchun har kassirning F.I.Sh., qabul qilgan jami summa, tranzaksiyalar soni, kanal bo'yicha summa va filial tushumidagi ulushini ko'rsatadi.
- `FR-REV-14`: kassir qatoridan sana/vaqt, summa, kanal, kvitansiya/reference, izoh va status ko'rsatilgan tranzaksiyalar ro'yxatiga o'tiladi.
- `FR-REV-15`: umumiy dashboard filiallar yig'indisini ko'rsatadi va `all branches total = branch totals sum` reconciliation majburiy.

---

## 6. Ma'lumotlar modeli

### 6.1. Asosiy entitylar

```text
users ──< user_roles >── roles ──< role_permissions >── permissions
                 │
                 └── branch_id scope (NULL = all branches)

branches ──< expenses >── expense_categories
                │   ├── payment_methods
                │   ├── departments
                │   └── accounting_periods

branches ──< revenue_plans >── accounting_periods
    │
    └──< revenue_transactions >── payment_methods
                         └─────── users (collector)

accounting_periods ──< budget_versions ──< budget_lines >── expense_categories

all mutable business actions ──< audit_logs
```

| Entity | Minimal maydonlar | Asosiy cheklov |
|---|---|---|
| `branches` | id, code, name, is_active | code unique |
| `users` | id, full_name, phone/email, status | login unique; hard delete yo'q |
| `roles` | id, code, name, is_active | code unique |
| `permissions` | id, code, description | code unique |
| `user_roles` | user_id, role_id, branch_id | branch `NULL` = barcha filiallar |
| `expense_categories` | id, code, name, type, is_active | type = fixed/variable; code unique |
| `payment_methods` | id, code, name, is_active | code unique |
| `departments` | id, code, name, is_active | code unique |
| `accounting_periods` | id, year, month, status, closed_at/by | `(year, month)` unique |
| `expenses` | 5.3 jadvalidagi xarajat maydonlari | open period, mandatory FKs, positive amount |
| `budget_versions` | id, period_id, status, revision_no, submitted/approved fields | bir periodda revision no unique |
| `budget_lines` | version_id, branch_id, category_id, amount, reason | `(version, branch, category)` unique |
| `audit_logs` | actor_id, action, entity, entity_id, before_json, after_json, created_at | append-only |
| `attachments` | owner type/id, file metadata, uploaded_by | kengaytma sifatida |
| `revenue_plans` | id, period_id, branch_id, planned_amount_uzs, revision_no, status, approved_by/at | `(period, branch, revision)` unique; bitta amaldagi approved revision |
| `revenue_transactions` | id, branch_id, payment_date, amount, payment_method_id, collector_user_id, entered_by, external_reference, description, status | musbat amount; posted/reversed; append-only moliyaviy tarix |
| `revenue_reversals` | original_transaction_id, reason, reversed_by/at | original overwrite/hard-delete qilinmaydi |

### 6.2. Referential va tarixiy yaxlitlik

- Fakt jadvalida category/branch/department/payment method nomi bilan emas, FK ID bilan bog'laniladi.
- Category type expense va budget line'ga snapshot qilinadi. Aks holda keyinchalik kategoriya `fixed`dan `variable`ga o'zgarsa, eski hisobotlar retrospektiv buziladi.
- Reference ma'lumotlar soft-delete (`is_active=false`) qilinadi; faktlarni cascade delete qilish man etiladi.
- User hard-delete qilinmaydi, aks holda tarixdagi `entered_by` va `approved_by` yo'qoladi.
- `collector_user_id` va `entered_by` alohida saqlanadi; kassir hisoboti faqat `collector_user_id` bo'yicha hisoblanadi.
- Posted/reversed tushum tranzaksiyalari period closure va audit qoidalariga bo'ysunadi; tarixiy tushum hard-delete qilinmaydi.
- Ochiq davrdagi xato xarajat correction/reversal modeli orqali yoki cheklangan delete orqali boshqariladi; yopilgan davrda original fakt overwrite qilinmaydi.

---

## 7. API kontrakti (REST tavsiya etiladi)

Quyidagi endpointlar TypeScript SPA va backend o'rtasidagi minimal kontraktni beradi. Har endpoint server-side authorization qiladi.

| Method | Endpoint | Vazifa |
|---|---|---|
| `POST` | `/auth/login` | login va session/token olish |
| `POST` | `/auth/logout` | sessionni tugatish |
| `GET` | `/me` | joriy user, role va branch scope |
| `GET/POST/PATCH` | `/master/categories` | kategoriya boshqaruvi |
| `GET/POST/PATCH` | `/master/departments` | bo'lim boshqaruvi |
| `GET/POST/PATCH` | `/master/payment-methods` | to'lov usuli boshqaruvi |
| `GET` | `/branches` | user ko'ra oladigan filiallar |
| `GET/POST` | `/expenses` | jurnal ro'yxati / yangi xarajat |
| `GET/PATCH` | `/expenses/:id` | detail / ochiq perioddagi tahrir |
| `POST` | `/expenses/:id/correct` | correction/reversal yaratish |
| `POST` | `/expenses/:id/submit` | approval yoqilgan bo'lsa yuborish |
| `POST` | `/expenses/:id/approve` | tasdiqlash |
| `POST` | `/expenses/:id/reject` | rad etish, sabab majburiy |
| `GET/POST` | `/budget-periods/:periodId/versions` | budjet versiyasi yaratish/ko'rish |
| `PUT` | `/budget-versions/:id/lines` | budget lines bulk upsert |
| `POST` | `/budget-versions/:id/submit` | tasdiqqa yuborish |
| `POST` | `/budget-versions/:id/approve` | budjetni tasdiqlash |
| `GET` | `/reports/monthly` | oylik/yillik plan-fact agregatlari |
| `GET` | `/reports/branch-comparison` | ikki filial taqqoslashi |
| `GET` | `/reports/dashboard` | KPI va chart series |
| `GET` | `/reports/data-quality` | exception/reconciliation ro'yxati |
| `GET/POST` | `/revenue-plans` | filial/oy tushum rejasi ro'yxati / yangi revision |
| `POST` | `/revenue-plans/:id/approve` | tushum rejasini direktor tasdiqlashi |
| `GET/POST` | `/revenue-transactions` | filial-scoped tushum jurnali / yangi tushum |
| `GET` | `/revenue-transactions/:id` | kvitansiya va to'liq audit detaili |
| `POST` | `/revenue-transactions/:id/reverse` | sabab bilan noto'g'ri tushumni reversal qilish |
| `GET` | `/reports/revenue` | markaz/filial reja, fakt, yetishmagan summa, kanal va foizlar |
| `GET` | `/reports/cashiers` | filial/oy/kassir kesimidagi tushum va drill-down |
| `GET` | `/reports/profit-loss` | haqiqiy tushum − haqiqiy xarajat va sof marja |
| `POST` | `/periods/:id/close` | davrni yopish |
| `POST` | `/periods/:id/reopen` | sabab bilan qayta ochish |
| `GET` | `/audit-logs` | audit filterlari |
| `POST` | `/imports/sheets` | nazorat qilinadigan migration/import |

API xatosi standart ko'rinishda bo'ladi:

```json
{
  "code": "PERIOD_CLOSED",
  "message": "2026-08 davri yopilgan; xarajatni tahrirlab bo'lmaydi.",
  "details": { "periodId": "..." }
}
```

---

## 8. UI/UX ekranlari

### V1 majburiy ekranlari

1. **Login** — autentifikatsiya va tushunarli access-denied holati.
2. **Dashboard** — current period xarajat Reja/Fakt, tushum Reja/Fakt/Rejaga yetmagan summa/Yig'ilish %, sof moliyaviy natija, kanal ulushlari, doimiy/o'zgaruvchan xarajat va filial filtri.
3. **Xarajatlar / Unified ledger** — filtreli ro'yxat, export, detail, audit va drill-down.
4. **Yangi xarajat** — filial scope'li, form validationli kassa formasi.
5. **Xarajat detaili** — amount, status, attachment, correction va audit timeline.
6. **Budjet** — yil/oy/filial/kategoriya matrisi, reason, version va tasdiq holati.
7. **Oylik hisobot** — kategoriya x oy, Reja/Fakt/Farq, drill-down.
8. **Filiallar taqqoslash** — ikki filial, oylar va yillik grafiklar.
9. **Data quality / Reconciliation** — import va live ma'lumot exceptionlari.
10. **Davrni yopish / Arxiv** — checklist, close/reopen history.
11. **Sozlamalar** — kategoriya, bo'lim, payment method, filial.
12. **User va role boshqaruvi** — direktor uchun.
13. **Audit log** — filterli append-only operatsiya tarixi.
14. **Tushum rejasi** — oy va filial bo'yicha reja, revision va tasdiqlash holati.
15. **Yangi tushum** — Naqd/Karta/Bank, summa, reference, izoh va kassirni avtomatik bog'lash.
16. **Tushumlar jurnali** — sana, filial, kassir, kanal, summa, status, export va reversal detaili.
17. **Tushum hisoboti** — markaz va ikki filial bo'yicha Reja/Fakt/Rejaga yetmagan summa/Yig'ilish % hamda kanal kesimi.
18. **Kassirlar hisoboti** — oy/filial bo'yicha kassir summasi, tranzaksiyalar soni, kanal kesimi, ulushi va tranzaksiyaga drill-down.

### UX qoidalari

- Qo'lda kiritiladigan maydonlar aniq belgilangan bo'ladi; computed maydonlar read-only.
- Cashier formida filial selector ko'rinmasligi yoki faqat read-only ko'rinishi mumkin; API baribir scope'ni tekshiradi.
- Farq musbat bo'lsa yashil/neytral, manfiy bo'lsa xavf rangi; rangning o'zi emas, matnli status ham bo'lishi kerak.
- `0`, `reja yo'q`, `ma'lumot yo'q`, `import xatosi` holatlari bir-biridan ajratiladi.
- Har bir KPI kategoriyaga, so'ng tranzaksiyalarga drill-down qilinadi.
- Desktop-first, ammo cashier formi mobil responsive bo'lishi shart. PWA/offline rejimi alohida product qaroridan keyin qo'shiladi.

---

## 9. Muhim data-quality va reconciliation talablari

Bu bo'lim P0 hisoblanadi, chunki manbadagi haqiqiy ma'lumotda reportni buzayotgan holatlar bor.

### 9.1. Aniqlangan kritik tafovut

`Jurnal` quyidagi Google Sheets formulasi bilan tuzilgan:

```text
QUERY(
  {Sayxun_kassa!A4:M1000; Xalqlar_kassa!A4:M1000},
  "select * where Col2 is not null order by Col2 asc",
  0
)
```

Hozirgi ma'lumotda Xalqlar kassasining 43 ta yozuvida sana `dd.mm.yyyy` ko'rinishidagi **text**, birinchi satrda esa haqiqiy Date bo'lib kiritilgan. `QUERY()` birlashtirilgan `Col2`ni date deb infer qiladi va text sanalarni `null` sifatida chiqarib tashlaydi.

| Manba | Kassa jadvalidagi summa | Jurnalga tushgan summa | Farq |
|---|---:|---:|---:|
| Sayxun | 29 435 000 | 29 435 000 | 0 |
| Xalqlar do'stligi | 22 998 400 | 16 680 000 | 6 318 400 |
| Jami | 52 433 400 | 46 115 000 | 6 318 400 |

Bu export cache muammosi emas; Google Sheets data type va `QUERY()` dizayni muammosi. Platforma bunday fakt yo'qolishiga yo'l qo'ymaydi.

### 9.2. Majburiy quality qoidalari — `DQ`

- `DQ-01`: transaction date faqat typed date/timestamp bo'ladi; text date API orqali qabul qilinmaydi.
- `DQ-02`: importda invalid sana, bo'sh kategoriya, bo'sh bo'lim, bo'sh mas'ul, noto'g'ri yil yoki unknown master value normal ledgerga jim o'tmaydi; `import_exception` queue'ga tushadi.
- `DQ-03`: har importdan so'ng branch bo'yicha source total va platform ledger total avtomatik reconciliate qilinadi.
- `DQ-04`: category alias mapping qo'llab-quvvatlanadi. Masalan, `Terminal,server,sms` va `Terminal, server, sms` bir canonical kategoriya ID'ga moslanadi.
- `DQ-05`: data-quality issue hal qilinmaguncha reportda ularning summasi `unclassified/excluded` sifatida ochiq ko'rsatiladi; tizim uni yashirmaydi.
- `DQ-06`: duplicate nazorati transaction date, amount, branch, category, description va import source hash kombinatsiyasi bilan ishlaydi; avtomatik o'chirish emas, review qilinadigan flag bo'ladi.
- `DQ-07`: har davr uchun `umumiy tushum = filiallar jami = kanallar jami = kassirlar jami` tekshiruvi avtomatik ishlaydi.
- `DQ-08`: umumiy markaz tushum rejasi amaldagi tasdiqlangan filial rejalari yig'indisiga teng bo'lmasa reconciliation exception yaratiladi.
- `DQ-09`: collector'i, payment method'i yoki filiali aniqlanmagan tushum posted holatiga o'tmaydi.

### 9.3. Qo'shimcha manba muammolari

- Xalqlar varag'ida bir qatorda yil `20269` bo'lib qolgan; platformada year date'dan olinadi.
- Kategoriya bo'sh, ammo 250 000 so'mlik xarajat mavjud; importda manual classification kerak.
- Ayrim satrlarda bo'lim yoki mas'ul bo'sh.
- `Mas'ul` bir joyda ism, boshqa joyda rol yoki turli yozilishdagi matn sifatida ishlatilgan.
- Jurnal raqami filiallar birlashganda unique emas; platforma server-generated global ID ishlatadi.
- Report formulalari `Jurnal!4:503` va budget `1:900` kabi qat'iy diapazonlarga bog'langan; platformada bu cheklov bo'lmaydi.
- `Budjet_tarixi`dagi kategoriya ro'yxati ayrim oylar orasida o'zgaradi. Bu category version/snapshot talabini kuchaytiradi.
- `Xarajat ` varag'i 5 satrli kanselyariya ro'yxati bo'lib, sana, filial, supplier, receipt, category va total semanticsiga ega emas. U migration exception sifatida ko'rib chiqiladi yoki keyinchalik `expense_lines`ga normallashtiriladi.

---

## 10. Migration talablari

### 10.1. Import manba → target mapping

| Sheets manbasi | Platforma targeti | Qoida |
|---|---|---|
| `Sozlamalar` kategoriyalari | `expense_categories` | canonical code + type bilan seed |
| `Sozlamalar` bo'lim/to'lov usuli | `departments`, `payment_methods` | lookup seed |
| `Rollar` | `users`, `roles`, `user_roles` | branch scope'li role assignment |
| `Sayxun_kassa`, `Xalqlar_kassa` | `expenses` | har satr uchun typed/normalized transaction |
| `Budjet_tarixi` | `accounting_periods`, `budget_versions`, `budget_lines` | period/branch/category/revision bo'yicha import |
| `Jurnal` | import manbasi emas | kassa importidan keyin reconciliation uchun tekshirish view'i |
| `Xarajat ` | exception yoki `expense_lines` | product owner tasdig'isiz avtomatik fact qilinmaydi |

### 10.2. Import oqimi

1. Original fayl read-only snapshot sifatida saqlanadi.
2. Har satrga `source_workbook`, `source_sheet`, `source_row`, `raw_payload` beriladi.
3. Sana normalizatsiya qilinadi; `15.08.2026` kabi text sana true datega parse qilinadi.
4. `20269` kabi derived yil noto'g'riligi transaction sanasiga qarab tuzatiladi, lekin raw value auditda saqlanadi.
5. Kategoriya, bo'lim, mas'ul va type xatolari exception queue'ga yuboriladi.
6. Import preview: satrlar soni, summa, branch totals, exceptionlar, duplicate flaglar ko'rsatiladi.
7. Moliya rahbari previewni tasdiqlaydi; direktor yakuniy importni tasdiqlashi mumkin.
8. Importdan keyin source totals, ledger totals va report totals reconciliation qilinadi.

### 10.3. Migration qabul mezoni

- Sayxun va Xalqlar kassa satrlari yo'qolmasdan alohida count/sum bilan import qilinadi.
- 6 318 400 so'mlik jurnal-kassa farqi exception yoki normalized transaction sifatida ko'rinadi; u yashirin qolmaydi.
- Har imported transaction source satriga trace qilinadi.
- Reja line'lari branch/category/period bo'yicha duplicate qilinmaydi.

---

## 11. Texnik arxitektura va non-functional talablar

### 11.1. Tavsiya etilgan stack

| Qatlam | Tavsiya |
|---|---|
| Frontend | React + TypeScript, responsive SPA |
| Backend | NestJS/TypeScript yoki shunga teng typed REST API |
| DB | PostgreSQL |
| ORM/migration | Prisma, Drizzle yoki TypeORM; migration majburiy |
| Auth | HTTP-only secure cookie/JWT session, server-side RBAC |
| Fayllar | S3-compatible private object storage (attachmentlar uchun) |
| Background jobs | report export, import validation, reminder/notification |
| Observability | structured log, error tracking, health check, backup monitoring |

Bu single-tenant ichki platforma uchun mo'ljallangan. Multi-tenant SaaS qo'shish alohida mahsulot qarori bo'lsa, barcha fact va reference jadvallariga `organization_id` strategy'si qayta ko'rib chiqiladi.

### 11.2. Xavfsizlik — `NFR-SEC`

- `NFR-SEC-01`: permission va filial scope backendda tekshiriladi; ID almashtirish orqali boshqa filialga kirib bo'lmaydi.
- `NFR-SEC-02`: parollar kuchli xesh bilan saqlanadi; plaintext log qilinmaydi.
- `NFR-SEC-03`: audit log append-only bo'ladi; oddiy user uni tahrirlay olmaydi.
- `NFR-SEC-04`: barcha ishlab chiqarish trafik HTTPS orqali.
- `NFR-SEC-05`: attachmentlar private bucketda, signed URL bilan ko'rsatiladi.
- `NFR-SEC-06`: DB backup kamida kunlik, restore testi davriy bajariladi.

### 11.3. Ishlash va ishonchlilik — `NFR-PERF`

- `NFR-PERF-01`: odatiy report 3 soniyadan kam, ledger sahifasi 2 soniyadan kam yuklanishi maqsad qilinadi.
- `NFR-PERF-02`: transactionlar uchun branch+period, period+category, date va status indekslari ishlatiladi.
- `NFR-PERF-03`: hisoblashlar SQL/query service orqali qilinadi; client faqat tayyor agregatni ko'rsatadi.
- `NFR-PERF-04`: export va katta importlar async job bo'ladi; UI progress/status ko'rsatadi.
- `NFR-PERF-05`: barcha yozish amallari idempotency kaliti yoki duplicate-policy bilan himoyalanadi.

### 11.4. Test va monitoring — `NFR-QA`

- unit test: calculation, permission, period-lock, validation;
- integration test: endpoint + DB constraint;
- e2e test: cashier, finance manager, director oqimlari;
- regression test: import → ledger → report total reconciliation;
- monitoring: failed import, failed export, authorization denial, report mismatch, close failure alertlari.

---

## 12. Business rules registri

| ID | Qoida |
|---|---|
| `BR-01` | Kassir boshqa filial uchun expense create/update qila olmaydi. |
| `BR-02` | Director barcha filial ma'lumotlarini ko'ra oladi va yakuniy amallarni bajaradi. |
| `BR-03` | Xarajat sanasi typed date; year/month server tomonidan hosil qilinadi. |
| `BR-04` | Summa musbat, butun UZS qiymati. |
| `BR-05` | Category master orqali tanlanadi; type avtomatik va read-only. |
| `BR-06` | Jurnal alohida kiritiladigan jadval emas, barcha expense'larning server-side ko'rinishi. |
| `BR-07` | Reja = branch × category × period bo'yicha unique budget line. |
| `BR-08` | Farq = Reja − Fakt; musbat tejash, manfiy overspend. |
| `BR-09` | Actual/Reja = bajarilish %, reja nol bo'lsa aniq `Unplanned` holati. |
| `BR-10` | Fixed/variable chegarasi category darajasida saqlanadi; tarixiy snapshot saqlanadi. |
| `BR-11` | Yopilgan period fakt va budjetini ordinary edit/delete qilish taqiqlanadi. |
| `BR-12` | Master data rename/inactivation tarixiy report bog'lanishlarini buzmaydi. |
| `BR-13` | Har import va har period close'da branch source totals = ledger totals reconciliation o'tadi. |
| `BR-14` | Data-quality exceptionlar reportdan jim yo'qolmaydi; ular alohida status/summa bilan ko'rinadi. |
| `BR-15` | Kategoriya, bo'lim, filial va to'lov usuli string name emas, immutable foreign key bilan bog'lanadi. |
| `BR-16` | Tushum rejasi branch × period bo'yicha revisionli qiymat; umumiy reja amaldagi tasdiqlangan filial rejalari yig'indisi. |
| `BR-17` | Tushum yig'ilish % = haqiqiy tushum / kutilgan tushum × 100; bu ko'rsatkich sof foyda deb nomlanmaydi. |
| `BR-18` | Sof moliyaviy natija = haqiqiy tushum − haqiqiy xarajat; sof marja haqiqiy tushumga nisbatan hisoblanadi. |
| `BR-19` | Har tushum tranzaksiyasi filial, payment method va collector user bilan majburiy bog'lanadi. |
| `BR-20` | Kassir faqat o'z filialiga tushum kirita oladi; filial serverda user scope orqali tekshiriladi. |
| `BR-21` | Kassir tushumi `entered_by` emas, pulni amalda qabul qilgan `collector_user_id` bo'yicha hisoblanadi. |
| `BR-22` | Posted tushum hard-delete qilinmaydi; xato yozuv reasonli reversal bilan bekor qilinadi. |
| `BR-23` | Umumiy tushum = filiallar yig'indisi = kassir/kanal kesimlarining reconciliation qilingan yig'indisi. |
| `BR-24` | Yopilgan davr tushum rejasi va tranzaksiyasi ordinary edit/delete bilan o'zgarmaydi. |

---

## 13. Qabul mezonlari (Acceptance Criteria)

| ID | Scenario | Kutiladigan natija |
|---|---|---|
| `AC-01` | Xalqlar kassiri Sayxun `branch_id` bilan POST yuboradi | `403 BRANCH_SCOPE_DENIED`; satr yaratilmaydi |
| `AC-02` | Xarajatga `15.08.2026` text yoki invalid date yuboriladi | validation xatosi yoki import exception; jurnalga tushmaydi |
| `AC-03` | Moliya rahbari yangi kategoriya yaratadi | category type bilan saqlanadi; formula o'zgartirmasdan budget/report tanlovlarida chiqadi |
| `AC-04` | Xarajat yaratilib, category tanlanadi | type avtomatik snapshot qilinadi va qo'lda tahrirlanmaydi |
| `AC-05` | Bir period/branch/category uchun 2-budget line yaratiladi | unique constraint yoki yangi revision oqimi ishlaydi |
| `AC-06` | Fakt reja qiymatidan oshadi | Farq manfiy, visual overbudget status va drill-down chiqadi |
| `AC-07` | Reja 0, fakt > 0 | report `Unplanned` holatini ko'rsatadi; division error yo'q |
| `AC-08` | Direktor periodni yopadi | period `closed`; expense/budget edit endpointlari bloklanadi |
| `AC-09` | Reopen so'rovi beriladi | faqat ruxsatli user, majburiy sabab, audit event bilan bajariladi |
| `AC-10` | Import Xalqlarning text-date satrlarini oladi | 43 satr normalize/exception sifatida hisobda ko'rinadi; 6 318 400 so'm yashirin qolmaydi |
| `AC-11` | Ledger va branch report solishtiriladi | bir xil filterda sum/count 100% mos keladi |
| `AC-12` | 500 dan ortiq transaction yaratiladi | pagination/reportlar to'liq ishlaydi; hardcoded range sabab satr yo'qolmaydi |
| `AC-13` | Kategoriya nomi o'zgartiriladi | eski reportlar va budget line'lar o'z tarixiy category snapshot'i bilan tiklanadi |
| `AC-14` | Dashboard KPI ustiga bosiladi | foydalanuvchi mos filtered transaction detailiga o'tadi |
| `AC-15` | 1-filial oylik rejasi 160 000 000, posted tushumi 150 000 000 | dashboard Fakt 150 000 000, Rejaga yetmagan summa 10 000 000, Yig'ilish 93.75% ko'rsatadi |
| `AC-16` | Ikki filial jami rejasi 300 000 000, jami posted tushum 180 000 000 | umumiy dashboard Rejaga yetmagan summa 120 000 000 va Yig'ilish 60% ko'rsatadi; 180 mln `sof foyda` deb belgilanmaydi |
| `AC-17` | Bir filialdagi posted tushumlar Naqd 60 mln, Karta 50 mln, Bank 40 mln | filial Fakt 150 mln; kanal summalari 150 mln va ulushlari mos ravishda 40%, 33.33%, 26.67% |
| `AC-18` | Kassir A 70 mln, Kassir B 80 mln qabul qiladi | filial kassirlar hisoboti jami 150 mln; har kassir qatoridan o'z transactionlariga drill-down ishlaydi |
| `AC-19` | Xalqlar kassiri Sayxun `branch_id` bilan tushum POST qiladi | `403 BRANCH_SCOPE_DENIED`; tushum yaratilmaydi |
| `AC-20` | Tasdiqlangan yoki yopilgan oy tushum rejasi oddiy PATCH qilinadi | overwrite bloklanadi; yangi revision yoki reopen talab qilinadi |
| `AC-21` | 500 minglik posted tushum xato kiritilib reversal qilinadi | original saqlanadi, reversal reason/audit mavjud, tushum faktidan 500 ming chiqariladi |
| `AC-22` | Umumiy, filial, kanal va kassir tushumlari bir oy uchun tekshiriladi | barcha kesimlarda net posted total 100% teng; tafovut reconciliation exception yaratadi |

---

## 14. Ishga tushirish bosqichlari

### Phase 0 — ma'lumotni tozalash va qarorlar

- canonical category/alias mapping;
- Xalqlar text-date va noto'g'ri yil exceptionlarini ko'rib chiqish;
- categoryless 250 000 so'mlik xarajat bo'yicha qo'lda klassifikatsiya;
- budget category mismatchlarini canonical list bilan kelishtirish;
- role, approval va reopen siyosatini tasdiqlash;
- har filialning oylik tushum rejasi, uni tasdiqlash va revision siyosatini tasdiqlash;
- eski tushumlar import qilinsa filial, kanal va kassir mappingini tayyorlash.

### Phase 1 — core V1

- auth + RBAC + filial scope;
- master data;
- expense form va unified ledger;
- budget/period model;
- plan-vs-actual, branch comparison, dashboard;
- import/reconciliation;
- audit log va period lock;
- filial tushum rejasi va tushum kiritish;
- tushum, rejaga yetmagan summa, kanal va kassir hisobotlari;
- tushum − xarajat asosidagi sof moliyaviy natija.

### Phase 2 — operatsion nazorat

- attachmentlar;
- configurable expense approval;
- reminders/notifications;
- correction/reversal UX;
- PDF/XLSX scheduled exports.

### Phase 3 — alohida product tasdig'i bilan

- to'liq refund/qaytim jarayoni va qaytim approvali;
- break-even uchun kengaytirilgan xarajat taqsimoti va prognoz;
- PWA/offline sync;
- multi-tenant SaaS.

---

## 15. V1 doirasidan tashqari narsalar

Quyidagilar Sheets'da tasdiqlanmagan yoki yetarli manbaga ega emas, shuning uchun V1'ga avtomatik kiritilmaydi:

- refund/qaytim va chargeback jarayoni (xato payment reversal bundan mustasno);
- umumiy ledger/double-entry accounting;
- bank/payment provider integratsiyasi;
- notification kanali (Telegram, SMS, email, push);
- offline/PWA sync;
- yangi filial yaratish admin UI;
- per-expense approvalni default majburiy qilish;
- murakkab forecast/scenario va kurs/guruh profitability modeli.

Arxitektura keyingi kengaytmalarni qo'shishga to'sqinlik qilmaydi, lekin ular isbotlanmagan scope sifatida V1 muddatini kengaytirmaydi.

---

## 16. Product owner tasdiqlashi kerak bo'lgan qarorlar

| Qaror | Tavsiya | Sabab |
|---|---|---|
| Xarajat approval | schema-ready, default OFF | Sheets'da direct expense approval yo'q, lekin direktor nazorati bor |
| Budget approval | finance submit → director approve | budget bloklari “tasdiqlangan” deb nomlangan, lekin texnik oqim yo'q |
| Reopen | faqat direktor + sabab + audit | tarixni buzmaslik uchun |
| Attachment threshold | system setting | source numeric threshold bermaydi |
| Login identifikatori | telefon + parol (tavsiya) | source login bermaydi, lekin kichik ichki jamoa uchun qulay |
| Filial kengayishi | DB dynamic, V1 UI 2 filial | bugungi manbada faqat 2 filial tasdiqlangan |
| Tushum rejasi manbasi | moliya rahbari filial kesimida kiritadi, direktor tasdiqlaydi | umumiy markaz rejasi filial rejalari yig'indisidan avtomatik hosil bo'ladi |
| Bank/karta integratsiyasi | V1 manual/reference, integratsiya alohida bosqich | provider va API hali tasdiqlanmagan |
| Sof foyda terminologiyasi | tushumdan alohida ko'rsatish | tushgan pulning o'zi foyda emas; xarajat ayrilgandan keyingi natija foyda/zarar |
| Refund/breakeven | Phase 3 alohida scope | refund policy va kengaytirilgan allocation hali berilmagan |
| O'rtacha KPI | denominatorni product owner belgilaydi | manbadagi “o'rtacha” fakt mavjud oylar bo'yicha chiqadi, label esa noaniq |

---

## 17. Definition of Done

V1 quyidagi shartlar bajarilganda tayyor hisoblanadi:

1. Uchta seed rol va ikkita filial bilan RBAC ishlaydi.
2. Kassir boshqa filial ma'lumotiga create/update qila olmaydi.
3. Har xarajat typed date va valid FKlarsiz saqlanmaydi.
4. Unified ledger kassa/import ma'lumotlaridan transaction yo'qotmasdan hosil bo'ladi.
5. Budget line version va period lock tarixni overwrite qilishdan saqlaydi.
6. Oylik report, dashboard va filial comparison bir xil source-of-truthdan hisoblanadi va o'zaro reconciliate bo'ladi.
7. Source spreadsheetdagi 6 318 400 so'mlik jurnal-kassa tafovuti import/report orqali aniq ko'rinadi va yashirilmaydi.
8. Auditor har bir muhim fact o'zgarishi uchun kim, qachon va nimani o'zgartirganini ko'ra oladi.
9. Tushum rejasi va posted/reversed tushumlar bo'yicha filial, kanal, kassir va umumiy total 100% reconcile bo'ladi.
10. Kassirning oylik tushumi, payment soni va transaction drill-downi faqat `collector_user_id` bo'yicha to'g'ri chiqadi.
11. Tushum dashboardi kutilgan tushum, haqiqiy tushum, rejaga yetmagan summa, yig'ilish %, haqiqiy xarajat va sof moliyaviy natijani terminologik jihatdan alohida ko'rsatadi.
12. AC-01…AC-22 avtomatlashtirilgan yoki hujjatlashtirilgan QA bilan o'tadi.
13. Production backup/restore, access control va report export sinovdan o'tgan bo'ladi.

---

## Ilova A — manba hisoblaridagi aniqlangan nomuvofiqliklar

Bu qiymatlar platforma KPI'si emas; ular source data migratsiyasida nazorat qilinishi kerak bo'lgan faktlardir.

- `Filiallar_taqqoslash` 2026 jami rejani 198 726 000 so'm ko'rsatadi, `2_filial_bitta_jadval` esa 197 526 000 so'm ko'rsatadi. 1 200 000 so'm tafovut `Terminal,server,sms` va `Terminal, server, sms` nom farqidan keladi.
- Sayxun bo'yicha report reja qiymatlarida 600 000 so'm farq bor, shu category string mismatch'i tufayli.
- `Budjet_tarixi`ning ayrim oy shablonlarida `Bank xizmat haqi`, `Sovg'a va rag'batlantirish` kabi category variantlari bor; Avgust blokida esa `Terminal, server, sms`, `Team building, HR`, `Gaminifikatsiya` mavjud.
- Source reportlar hozir Jurnalga tushgan ma'lumotdan hisoblanadi; shu sabab Xalqlarning text-date satrlari dashboard/reportda to'liq aks etmaydi.
- Sheets'dagi “o'rtacha oylik xarajat” hozir 12 ga emas, fakt mavjud oylar soniga bo'linadi. Platforma KPI label va denominatorini bir xil ma'noda beradi.

---

**Yakun:** platformaning source of truth'i Google Sheets formula emas, normalizatsiyalangan server-side fact jadvallari bo'ladi. Sheets faqat tarixiy import va migration auditining manbasi sifatida qoladi.
