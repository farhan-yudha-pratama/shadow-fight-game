# 🥋 Duel Bayangan (Shadow Fight 2D) - Panduan Arsitektur & Spesifikasi Agen AI
> **File:** `.antigravity/AGENTS.md`  
> **Versi Proyek:** 2.4.3  
> **Tipe Dokumen:** Dokumentasi Teknis Komprehensif & Panduan Pengembang/Agen AI

Dokumen ini merupakan referensi tunggal kebenaran (*single source of truth*) yang merangkum arsitektur, desain sistem, model matematika fisika, protokol jaringan, dan panduan teknis untuk proyek **Duel Bayangan**. Setiap agen AI atau pengembang manusia yang bekerja pada repositori ini wajib membaca dan mematuhi prinsip-prinsip yang tertuang dalam dokumen ini.

---

## 1. Ringkasan Eksekutif Proyek

**Duel Bayangan** adalah game pertarungan (*fighting game*) 2D berbasis peramban web modern yang terinspirasi oleh mekanisme dan estetika siluet *Shadow Fight*. Proyek ini dirancang dengan prinsip **Zero-Asset Architecture**, di mana 100% grafis, animasi rangka karakter, latar belakang pemandangan, dan efek suara disintesis secara prosedural murni menggunakan Web Canvas 2D dan Web Audio API tanpa mengunduh berkas gambar (PNG/JPG) maupun suara (MP3/WAV) eksternal.

### Riwayat & Evolusi Proyek
1. **Fase Legacy (v1.0):** Berkas monolitik tunggal (`Duel_Bayangan.html`, ~1000 baris) yang menggabungkan seluruh kode HTML, CSS, JavaScript, WebRTC DataChannel P2P manual, dan logika permainan dalam satu file.
2. **Fase Modularisasi & WebSocket (v2.0):** Pemisahan total berbasis *Separation of Concerns (SoC)* menjadi arsitektur modular ES Modules (`import/export`), penggantian WebRTC manual dengan arsitektur **Pure WebSocket Client-Server Lockstep Relay** yang tangguh, serta kesiapan kontainerisasi Docker & Dokploy.
3. **Fase Combat Stabilization & Cache-Busting (v2.2):** Penanganan masalah persistensi cache pada browser dengan query string terintegrasi (`?v=2.x.x`) dan header server `Cache-Control: no-store`, perbaikan sinkronisasi frame startup vs active hitboxes.
4. **Fase Anatomical Bone-Based Hitbox (v2.3.0):** Mengganti kotak AABB kasar menjadi sistem hitbox/hurtbox geometris anatomis (lingkaran & kapsul) yang diturunkan langsung dari kalkulasi *Inverse Kinematics (IK)* rangka tubuh, mendukung deteksi benturan ekstremitas (tinju/kaki), titik kontak fisik presisi, dan mekanisme *headshot*.
5. **Fase Mobile Landscape UI/UX & Ergonomic HUD (v2.4.0):** Optimalisasi penuh pengalaman layar ponsel lanskap: unifikasi floating HUD tanpa memotong pandangan arena, tata letak tombol busur jempol ergonomis (*thumb arc*), proteksi *safe-area insets* untuk notch/punch-hole, penyesuaian rasio panggung 16:9 (`object-fit: contain`) pada layar 20:9, dan penguncian orientasi native (`screen.orientation.lock`).
6. **Fase Frictionless PvP & Fast-Path Stream (v2.4.1):** Fitur tautan undangan 1-klik (`?join=XXXX`), tombol salin tautan/kode native (Web Share API & Clipboard API), auto-submit kode 4 angka, dan optimalisasi fast-path buffer byte detection (`0x69`) pada relay server WebSocket.
7. **Fase Robust Lockstep Frame Transport (v2.4.2):** Memperbaiki transmisi frame paket WebSocket ke format string teks UTF-8 murni dan menambahkan *defensive decoding* (`ArrayBuffer` & `Blob`) di sisi peramban.
8. **Fase Uninterrupted Lockstep & Live On-Screen Diagnostics (v2.4.3):** Memperbaiki deadlock beku akibat frame skipping (`while` loop vs `if`), memindahkan eksekusi hitstop setelah pemrosesan lockstep sehingga transmisi paket tetap 60Hz berkesinambungan tanpa henti, implementasi *Dual-Frame Redundancy* (`prev1, prev2`), *Proactive Resend Request* (`r${epoch},${frame}`), serta penambahan HUD Diagnostik real-time (`#netDiag`) dan logger error visual (`#errBanner`) untuk inspeksi instan di layar HP/ponsel tanpa perlu F12 DevTools.

---

## 2. Tech Stack & Spesifikasi Lingkungan

* **Runtime:** Node.js `>= 18.0.0` (Docker Container: `node:24-alpine` / `node:20-alpine`)
* **Format Modul:** ECMAScript Modules (`"type": "module"` pada `package.json`)
* **Backend:** Native Node.js `http` Server (zero third-party web frameworks, static file serving, `/healthz`) + `ws` (`^8.18.0`) untuk WebSocket room & relay server
* **Frontend:**
  * Vanilla Modern JavaScript (ES2022+, Web Canvas API, Web Audio API)
  * CSS3 Modern (CSS Custom Properties, Flexbox, CSS Grid, Media Queries, Viewport Units, Orientation Handling 90° portrait-to-landscape)
  * Semantic HTML5 (Custom Canvas HUD, Responsive Touch Controls)
* **DevOps & Kontainerisasi:**
  * Docker & Docker Compose v2
  * Dokploy PaaS Ready (Traefik automatic WebSocket upgrade, SSL Let's Encrypt)
* **Port Layanan:** `3000` (dapat dikonfigurasi via env `PORT`)

---

## 3. Peta Struktur Direktori & Separation of Concerns (SoC)

```
shadow-fight/
├── .antigravity/
│   └── AGENTS.md                  # Dokumentasi arsitektur & panduan agen (file ini)
├── server/
│   └── index.js                   # HTTP static server, healthcheck (/healthz), WebSocket matchmaking & relay
├── public/
│   ├── index.html                 # Struktur markup semantik, HUD, dialog modal, & controller sentuh
│   ├── css/
│   │   └── main.css               # Styling tema gelap, animasi HUD, tata letak responsif & rotasi mobile
│   └── js/
│       ├── config.js              # Konstanta global, frame data (ATK), palet warna, & sinkronisasi setting
│       ├── audio.js               # Sintesis suara prosedural (Web Audio API, zero audio files)
│       ├── input.js               # Keyboard input, virtual joystick analog, tombol sentuh, & bitmasking
│       ├── ai.js                  # State Machine AI untuk mode solo dengan scaling level adaptif
│       ├── network.js             # WebSocket client, sinkronisasi frame lockstep, & ping latency tracker
│       ├── physics.js             # Simulasi fisika 2D, IK 2-tulang, hitbox/hurtbox anatomis, & combat engine
│       ├── renderer.js            # Engine Canvas 2D, rendering rangka IK, partikel, & overlay visualizer
│       ├── ui.js                  # Controller HUD, indikator damage trail, banner pengumuman, & dialog menu
│       └── main.js                # Game loop orchestrator (60 FPS fixed timestep accumulator)
├── legacy/
│   └── Duel_Bayangan_WebRTC_Original.html # Arsip kode monolitik lama untuk referensi historis
├── Dockerfile                     # Image production Alpine non-root dengan healthcheck
├── docker-compose.yml             # Live-reload local development container (volume mount ./ -> /app)
├── docker-compose.production.yml  # Simulasi production deployment lokal
├── package.json                   # Manifest dependensi & script runner
└── README.md                      # Panduan umum penggunaan & deployment Dokploy
```

### Tanggung Jawab Masing-Masing Modul

#### A. Backend Server (`server/index.js`)
* **Static File Server:** Menyajikan aset statis dari direktori `public/` dengan proteksi *directory traversal* (`path.normalize`).
* **Cache Management:** Pada file `.html`, `.js`, dan `.css` (atau saat `NODE_ENV !== 'production'`), server mengirimkan header:
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` untuk mencegah peramban menyimpan cache basi kode logika.
* **Healthcheck:** Menanggapi `GET /healthz` dan `GET /api/health` dengan kode status `200 OK` dan data uptime JSON.
* **WebSocket Room & Lockstep Matchmaking:**
  * Mengelola *room* dengan kode 4 karakter unik (huruf kapital acak).
  * Menugaskan peran `P1` (Host, slot 0) dan `P2` (Guest, slot 1).
  * Merelai masukan frame pertarungan (*lockstep inputs*) antar pemain tanpa lag server.
  * Menangani ping/pong periodik untuk menjaga koneksi tetap hidup (*keepalive*) dan pembersihan memori room saat pemain disconnect.

#### B. Modul Konfigurasi (`public/js/config.js`)
* **Dimensi Canvas:** Resolusi acuan internal `CANVAS_WIDTH = 800`, `CANVAS_HEIGHT = 450`, `GROUND_Y = 372`.
* **Fixed Timestep:** `FIXED_STEP = 1000 / 60` (16.666 ms per tick).
* **Tabel Serangan (`ATK`):**
  * `punch`: Startup 4f, Active 4f, Recovery 9f, Damage 7, Knockback 3.5, Stun 16f, Hitstop 3f.
  * `kick`: Startup 9f, Active 5f, Recovery 14f, Damage 13, Knockback 8.0, Stun 22f, Hitstop 5f.
* **Palet Warna:** Koleksi palet bertema dojo malam, senja, fajar berdarah, dan malam berbintang (`PALETTES`).
* **Settings Persistence:** Menyimpan preferensi pengguna (volume, mute, grafik, getaran layar, debug hitbox) ke `localStorage`.

#### C. Modul Fisika & Kinematika (`public/js/physics.js`)
* Menjalankan kalkulasi gerak horizontal, inersia gesekan, gravitasi loncatan (`vy += 0.62`), penahan batas arena (28px - 772px), serta tolakan antar petarung (`separateFighters`).
* Mengimplementasikan kalkulasi rangka anatomi berbasis *Inverse Kinematics* (`getFighterSkeleton`), volume *hurtbox* tubuh (`getFighterHurtboxes`), *hitbox* aktif di ujung tinju/kaki (`getFighterAttackHitbox`), uji tabrakan geometris (`checkHitbox`), dan penerapan kerusakan presisi (`applyDamageAndEffects`).

#### D. Modul Grafika & Partikel (`public/js/renderer.js`)
* Menggambar latar belakang siluet bertingkat (*multi-layer parallax ridges*) dengan PRNG `mulberry32`.
* Merender karakter siluet bayangan berlapis (garis tepi bercahaya + tubuh hitam siluet) menggunakan pose turunan dari `physics.js`.
* Menghasilkan animasi kain syal yang berkibar dinamis (*procedural scarf*) dengan kurva Bézier kuadratik.
* Menjalankan sistem partikel percikan api benturan (*sparks*), gelombang kejut (*shockwave rings*), dan debu bara (*embers*).
* Menyediakan fitur `drawHitboxes` untuk memvisualisasikan hurtbox dan hitbox saat mode debug diaktifkan.

#### E. Modul Input (`public/js/input.js`)
* Mengakomodasi keyboard (WASD / Panah / J, K / Space) dengan pemfilteran input form.
* Mengakomodasi analog joystick sentuh virtual: kalkulasi sudut polar, zona mati (*deadzone*), dan normalisasi koordinat untuk mode portrait 90°.
* Serialisasi input menjadi representasi bitmask 6-bit (`ACTION_KEYS = ['left', 'right', 'block', 'jump', 'punch', 'kick']`) untuk efisiensi transmisi data jaringan lockstep.

#### F. Modul Kecerdasan Buatan AI (`public/js/ai.js`)
* Mesin status AI offline (*Finite State Machine*) dengan kondisi: `wait`, `approach`, `retreat`, `attack`, `block`.
* Algoritma penyesuaian kesulitan progresif berdasarkan level musuh (`getAIParameters(level)`): kecepatan, agresivitas, probabilitas menangkis (*block chance*), waktu berpikir (*think delay*), dan probabilitas kombo bersambung.

#### G. Modul Jaringan Multiplayer (`public/js/network.js`)
* Klien WebSocket dengan kemampuan *auto-reconnect* dan penanganan status koneksi.
* Implementasi sistem input terindeks frame (*Lockstep Input Buffer*) dengan delay buffer `inputDelay = 5` frame untuk menjamin determinisme fisika antar dua pemain tanpa rubberbanding.
* Pengukuran latensi bolak-balik (RTT) dan visualisasi ping badge.

#### H. Modul Tampilan Pengguna UI (`public/js/ui.js`)
* Pengendali bilah darah (*health bar*) dengan efek *damage trail* kuning animasi mundur.
* Jam penghitung waktu mundur (*round timer*), penghitung kemenangan ronde (*pips*), dan indikator kombo hit bertingkat.
* Sistem banner pengumuman pop-up ("Round 1", "Fight!", "KO!", "Menang!") dan modal dialog lobby/pengaturan.

#### I. Modul Audio Prosedural (`public/js/audio.js`)
* Zero-asset synthesizer berbasis Web Audio API:
  * `hit`: Osilasi segitiga frekuensi rendah + noise burst singkat terfilter bandpass.
  * `big` (kick): Osilasi frekuensi menurun eksponensial (90Hz -> 30Hz) + distorsi gain untuk efek tendangan berat.
  * `block`: Osilasi frekuensi tinggi (700Hz) cepat menyerupai denting logam perisai.
  * `whoosh`: Noise putih terfilter bandpass dengan modulasi frekuensi menyapu untuk ayunan tinju/kaki.
  * `jump`: Osilasi sinus dengan nada meluncur naik (140Hz -> 260Hz).
  * `gong`: Tiga osilator harmonik (180Hz, 274Hz, 388Hz) dengan decay panjang untuk pembukaan ronde.
  * `ko`: Ledakan frekuensi rendah sub-bass + penurunan filter dramatis.

#### J. Modul Orkestrasi Utama (`public/js/main.js`)
* Titik masuk aplikasi (*entry point*).
* Menjalankan *Fixed-Timestep Game Loop* dengan akumulator waktu (`FIXED_STEP = 16.66ms`).
* Mengelola transisi fase pertarungan: `title` $\to$ `intro` $\to$ `fight` $\to$ `roundEnd` $\to$ `matchEnd`.
* Mengatur efek visual global: *Hitstop* (jeda waktu beku sesaat ketika pukulan telak masuk) dan *Screen Shake*.

---

## 4. Matematika Fisika, Kinematika, & Sistem Hitbox Anatomis

### A. Algoritma 2-Bone Inverse Kinematics (IK)
Posisi lutut/siku ($k$) dan telapak/kaki ($e$) dihitung analitis menggunakan Hukum Cosinus dua dimensi pada `solve2BoneIK(origin, target, l1, l2, bend)`:

$$\text{dist} = \text{clamp}(\sqrt{\Delta x^2 + \Delta y^2}, |l_1 - l_2| + 0.01, l_1 + l_2 - 0.01)$$

$$\cos(\alpha) = \text{clamp}\left(\frac{l_1^2 + \text{dist}^2 - l_2^2}{2 \cdot l_1 \cdot \text{dist}}, -1, 1\right)$$

$$\theta_{\text{knee}} = \text{atan2}(\Delta y, \Delta x) + \text{bend} \cdot \arccos(\cos(\alpha))$$

$$\vec{k} = \text{origin} + [l_1 \cdot \cos(\theta_{\text{knee}}), l_1 \cdot \sin(\theta_{\text{knee}})]$$

$$\vec{e} = \text{origin} + [\text{dist} \cdot \cos(\text{angle}), \text{dist} \cdot \sin(\text{angle})]$$

* Panjang tulang lengan: Bahu ke Siku $l_1 = 22$, Siku ke Tangan $l_2 = 22$.
* Panjang tulang kaki: Pinggul ke Lutut $l_1 = 28$, Lutut ke Kaki $l_2 = 28$.
* Arah tekukan (*bend*): Kaki $-1$ (lutut menekuk ke depan), Lengan $+1$ (siku menekuk ke bawah/belakang).

---

### B. Geometri Hurtbox Tubuh Penerima
Tubuh petarung dibagi menjadi 6 volume geometri pelindung di dunia (*world coordinates*):
1. **Kepala (`head`):** Lingkaran $R = 13\text{px}$ berpusat di koordinat kepala $H_d$.
2. **Torso (`torso`):** Kapsul garis dengan radius $R = 16\text{px}$ dari Bahu ($S$) ke Pinggul ($hip$).
3. **Paha Depan (`leg`):** Kapsul garis $R = 12\text{px}$ dari Pinggul ke Lutut Depan ($kneeF$).
4. **Betis Depan (`leg`):** Kapsul garis $R = 12\text{px}$ dari Lutut Depan ke Kaki Depan ($footF$).
5. **Paha Belakang (`leg`):** Kapsul garis $R = 11\text{px}$ dari Pinggul ke Lutut Belakang ($kneeB$).
6. **Betis Belakang (`leg`):** Kapsul garis $R = 11\text{px}$ dari Lutut Belakang ke Kaki Belakang ($footB$).

---

### C. Geometri Hitbox Penyerang pada Ujung Anggota Tubuh
Hitbox penyerang hanya diinisialisasi ketika serangan berada pada fase frame aktif (`f.atk.f > A.su && f.atk.f <= A.su + A.ac`):
* **Pukulan (`punch`):** Lingkaran $R = 15\text{px}$ berpusat tepat pada ujung kepalan tangan depan ($handF = \text{armF.e}$).
* **Tendangan (`kick`):** Lingkaran $R = 17\text{px}$ berpusat tepat pada ujung telapak kaki depan ($footF = \text{legF.e}$).

---

### D. Algoritma Uji Tabrakan & Titik Kontak (*Contact Point Calculation*)
Uji tabrakan pada `checkHitbox(attacker, defender)` mengevaluasi dua skenario analitis:

#### 1. Lingkaran ke Lingkaran (Tinju/Kaki vs Kepala)
Dua lingkaran dengan pusat $P_1, P_2$ dan radius $r_1, r_2$:
$$\text{dist} = \sqrt{(P_1.x - P_2.x)^2 + (P_1.y - P_2.y)^2}$$
Tabrakan terjadi jika $\text{dist} \le r_1 + r_2$.
Titik kontak fisik dihitung pada garis batas terluar:
$$\text{Contact} = P_1 + (P_2 - P_1) \cdot \frac{r_1}{\text{dist}}$$

#### 2. Lingkaran ke Kapsul Segmen Garis (Tinju/Kaki vs Torso / Kaki)
Diberikan segmen garis kapsul dari $A$ ke $B$ dan pusat lingkaran serang $P$:
$$\vec{d} = B - A, \quad t = \text{clamp}\left(\frac{(P - A) \cdot \vec{d}}{|\vec{d}|^2}, 0, 1\right)$$
Titik proyeksi terdekat pada segmen garis:
$$Q = A + t \cdot \vec{d}$$
Tabrakan terjadi jika $|P - Q| \le r_{\text{circle}} + r_{\text{capsule}}$.
Titik benturan kontak percikan api:
$$\text{Contact} = P + (Q - P) \cdot \frac{r_{\text{circle}}}{|P - Q|}$$

---

### E. Mekanisme Kerusakan (*Damage & Combat Rules*)
* **Headshot Bonus:** Serangan yang menyentuh hurtbox `'head'` menerima pengganda kerusakan **$+20\%$** (`Math.round(dmg * 1.2)`), memicu 18 partikel percikan emas (`#ffe785`), dan suara pukulan keras.
* **Tangkisan (*Block*):** Jika musuh menahan tombol blok dan menghadap ke arah penyerang (`defender.face === -attacker.face`), kerusakan diredam hingga **85%** (hanya terkena *chip damage* 15% dari total), knockback penyerang terpantul balik, memicu efek denting 6 partikel sian (`#8fe9ff`), dan hitstop 3 frame.
* **Hitstop:** Membekukan game loop sesaat saat benturan masuk (3 frame untuk punch, 5 frame untuk kick) guna memberikan bobot fisik impak serangan (*game juice*).
* **KO:** Saat HP menyentuh $\le 0$, petarung terlempar ke udara dengan kecepatan vertikal $v_y = -6$ dan knockback lateral kuat $kb = \text{face} \cdot 10$.

---

## 5. Protokol Komunikasi Jaringan (WebSocket Lockstep)

### A. Arsitektur Jaringan
Sistem multiplayer beroperasi menggunakan topologi **Client-Server-Client Relay**. Server tidak melakukan simulasi fisika secara penuh (*unauthoritative relay*), melainkan bertindak sebagai penjamin urutan frame (*Lockstep Clock Coordinator*).

```
   [ Pemain 1 - Host ]                     [ Server WebSocket ]                     [ Pemain 2 - Guest ]
            │                                       │                                       │
            ├──── create_room { name: "Kamu" } ────>│                                       │
            │<─── room_created { code: "ABCD" } ───┤                                       │
            │                                       │<── join_room { code, name: "Lawan" } ─┤
            │<─── opponent_joined ──────────────────┼─── room_joined ──────────────────────>│
            │                                       │                                       │
            ├──── match_start ─────────────────────>│──── match_start ─────────────────────>│
            │                                       │                                       │
            │ === Pertarungan Dimulai (Lockstep Loop: 60 FPS) ===                          │
            ├──── frame { f: N, inp: bitmask } ────>│──── frame_relay { f: N, p2: inp } ───>│
            │<─── frame_relay { f: N, p1: inp } ────│<─── frame { f: N, inp: bitmask } ────┤
```

### B. Spesifikasi Skema Pesan JSON

| Perintah (`cmd`) | Pengirim | Deskripsi Payload |
|---|---|---|
| `create_room` | Klien $\to$ Server | `{ cmd: 'create_room', playerName: string }` |
| `room_created` | Server $\to$ Klien | `{ cmd: 'room_created', code: string, playerIndex: 0 }` |
| `join_room` | Klien $\to$ Server | `{ cmd: 'join_room', code: string, playerName: string }` |
| `room_joined` | Server $\to$ Klien | `{ cmd: 'room_joined', code: string, playerIndex: 1, hostName: string }` |
| `opponent_joined`| Server $\to$ Host | `{ cmd: 'opponent_joined', guestName: string }` |
| `match_start` | Host $\to$ Server $\to$ Guest | `{ cmd: 'match_start', seed: number }` |
| `frame` | Klien $\to$ Server | `{ cmd: 'frame', f: number, input: number (bitmask) }` |
| `frame_relay` | Server $\to$ Kedua Klien | `{ cmd: 'frame_relay', f: number, pIndex: number, input: number }` |
| `round_start` | Host $\to$ Server $\to$ Guest | `{ cmd: 'round_start', round: number }` |
| `ping` / `pong`| Klien $\leftrightarrow$ Server | `{ cmd: 'ping', t: timestamp }` / `{ cmd: 'pong', t: timestamp }` |

### C. Determinisme & Penanganan Jitter
* **Input Delay ($D = 5$):** Tombol yang ditekan pada frame $N$ dijadwalkan untuk dieksekusi pada frame $N + D$. Selang waktu ini memberi ruang bagi transmisi paket jaringan antar peramban sehingga kedua petarung mensimulasikan keadaan fisika frame yang sama secara deterministik.
* **Seed Sinkronisasi:** Latar belakang arena dan partikel diinisialisasi menggunakan *pseudo-random number generator* (`mulberry32`) yang di-seed sama antara kedua pemain melalui perintah `match_start`.

---

## 6. Prosedural Visual & Audio Engine (Zero-Asset)

### A. Rendering Siluet Berlapis
Karakter dirender dalam dua lintasan (*two-pass canvas rendering*):
1. **Pass 1 (Glow Aura / Rim):** Menggambar seluruh tulang dengan warna aksen neon (`palette.you` atau `palette.foe`) dengan garis lebih lebar ($+3.2\text{px}$) dan transparansi $0.92$.
2. **Pass 2 (Silhouette Body):** Menggambar tulang di lapisan atas dengan warna hitam pekat `#08060d` (atau `#ffe7df` jika terkena pukulan/fase flash).
3. **Mata Bercahaya (*Glowing Eye*):** Elips bercahaya $2.5 \times 1.5\text{px}$ pada kepala petarung dengan `shadowBlur` dinamis.

### B. Simulasi Syal Prosedural (*Fluttering Scarf*)
Syal di leher karakter digambar menggunakan kurva kuadratik Bézier bertingkat dua yang dipengaruhi oleh:
* Posisi pangkal leher: $N = [S[0] - 1, S[1] - 4]$.
* Inersia kecepatan jalan: $mv = \text{clamp}(v_x \cdot \text{face}, -3, 4)$.
* Gelombang angin sinus harmonik: $\text{wave} = t \cdot 0.22$.

---

## 7. DevOps, Docker, & Panduan Deployment

### A. Menjalankan Docker Secara Lokal (Development)
Gunakan `docker-compose.yml` untuk lingkungan pengembangan dengan live-reload:
```bash
docker compose up -d
```
* **Volume Mount:** `./:/app` sehingga setiap perubahan kode pada folder `public/` atau `server/` langsung tercermin di container.
* **Auto-Restart:** Server Node.js dijalankan dengan flag `--watch`.

### B. Healthcheck Container
Container memiliki konfigurasi healthcheck otomatis:
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3000/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 3s
```

### C. Deployment Produksi ke Dokploy
Proyek ini sepenuhnya kompatibel dengan Dokploy:
1. Hubungkan repositori Git di dashboard Dokploy.
2. Pilih tipe deployment **Dockerfile**.
3. Tentukan port **3000**.
4. Pasang domain SSL. Traefik Dokploy secara otomatis menangani protokol upgrade WebSocket (`ws://` ke `wss://`) tanpa konfigurasi reverse-proxy tambahan.

---

## 8. Panduan untuk Agen AI Berikutnya (Agent Working Rules)

Bagi agen AI yang akan memodifikasi, memperluas, atau memperbaiki codebase ini di masa depan, patuhi aturan mutlak berikut:

1. **Aturan Zero-Asset:**
   * DILARANG menambahkan berkas aset biner seperti `.png`, `.jpg`, `.mp3`, `.wav`, atau `.ogg` ke dalam direktori proyek.
   * Seluruh grafis baru, efek jurus, senjata, atau suara wajib disintesis secara matematika menggunakan Canvas 2D atau Web Audio API.

2. **Aturan Cache-Busting Modul:**
   * Di dalam `public/index.html` dan seluruh modul `public/js/*.js`, pemanggilan `import` WAJIB menyertakan query string versi (contoh: `./physics.js?v=2.4.2`).
   * Jika Anda memperbarui logika file inti, naikkan nomor versi pada seluruh import terkait untuk mencegah kesalahan pembacaan cache browser pengguna.

3. **Aturan Pemisahan Tanggung Jawab (SoC):**
   * Jangan meletakkan logika fisika, kalkulasi koordinat, atau deteksi tabrakan di dalam `renderer.js`. Seluruh kalkulasi wajib berada di `physics.js`.
   * Jangan memanggil manipulasi DOM visual secara langsung di dalam `physics.js` atau `main.js`. Gunakan modul `ui.js`.
   * Jangan memanggil `new AudioContext()` di tempat sembarang; gunakan fasad terpusat pada `audio.js`.

4. **Aturan Determinisme Lockstep:**
   * DILARANG menggunakan fungsi non-deterministik seperti `Math.random()` di dalam fungsi simulasi fisika per-frame (`stepFighter`, `applyPhysics`, `checkHitbox`).
   * Gunakan PRNG dengan seed terkontrol (`mulberry32`) jika memerlukan keacakan yang identik pada kedua sisi pemain.

5. **Pintasan Pengujian Visual (Debug Mode):**
   * Tekan tombol **`H`** pada keyboard atau jalankan `window.toggleHitboxes()` di konsol untuk menyalakan overlay visualizer hitbox geometris saat menguji atau menyelaraskan jangkauan serangan baru.

---
*Dokumen ini dibuat secara otomatis dan disetujui untuk dijadikan standar pengkodean repositori Duel Bayangan.*
