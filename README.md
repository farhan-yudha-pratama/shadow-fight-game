# 🥋 Duel Bayangan (Shadow Fight 2D) - Modular & WebSocket Edition

Game pertarungan 2D bergaya *Shadow Fight* berbasis web dengan arsitektur modular (*Separation of Concerns*), multiplayer online berbasis **WebSocket**, dan siap di-deploy ke **Dokploy / Docker**.

---

## 📁 Struktur Proyek (Separation of Concerns)

Proyek ini telah direfaktor dari file monolitik menjadi struktur modular yang bersih dan terorganisir:

```
shadow-fight/
├── server/
│   └── index.js             # HTTP server (static files, healthcheck) & WebSocket Room/Lockstep Engine
├── public/
│   ├── index.html           # Struktur UI semantic HTML, HUD, dialogs, & touch pad
│   ├── css/
│   │   └── main.css         # Styling dark theme, animsi HUD, responsive 90° mobile portrait rotation
│   └── js/
│       ├── config.js        # Konfigurasi konstan, balance data (ATK), palet warna, & localStorage
│       ├── audio.js         # Procedural Audio Engine (Web Audio API synthesizer, 0 audio assets)
│       ├── physics.js       # 2D physics simulation, collision detection, attack box & combat logic
│       ├── renderer.js      # Canvas 2D engine, 2-bone Inverse Kinematics (IK), scarf, particles
│       ├── input.js         # Keyboard listener, virtual analog joystick, touch buttons & bitmasking
│       ├── ai.js            # State machine AI untuk mode solo dengan scaling level adaptif
│       ├── network.js       # WebSocket client, lockstep frame synchronization, & latency ping monitor
│       ├── ui.js            # HUD controller, health trail, banners, combo counter, & modal dialogs
│       └── main.js          # Main game loop orchestrator (60 FPS fixed timestep accumulator)
├── Dockerfile               # Production Docker container (Node 20 Alpine, non-root user, healthcheck)
├── docker-compose.yml       # Konfigurasi multi-container / local deployment
├── .dockerignore            # Optimasi build context Docker
├── package.json             # Manifest dependencies (Node.js ES Module + ws)
└── README.md                # Dokumentasi & panduan deployment Dokploy
```

---

## 🚀 Menjalankan Secara Lokal

### Prasyarat:
* Node.js v18 atau yang lebih baru.

### Langkah-langkah:
1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Jalankan Server:**
   ```bash
   npm start
   ```

3. **Buka di Browser:**
   Akses `http://localhost:3000` di laptop atau perangkat Anda.
   Untuk healthcheck: `http://localhost:3000/healthz`.

---

## 🐳 Menjalankan dengan Docker di Komputer Lokal

Tersedia file **`docker-compose.yml`** khusus untuk pengujian lokal dengan fitur **Live-Reload**:

```bash
# Jalankan container lokal (dengan live-reload & auto-watch)
docker compose up -d

# Cek status & healthcheck container
docker ps

# Lihat logs server real-time
docker compose logs -f

# Hentikan container
docker compose down
```

> **Keunggulan Mode Lokal:**
> * Folder `server/` dan `public/` di-mount langsung ke container. Setiap Anda mengedit kode di VS Code/editor, server akan **langsung ter-update secara otomatis** tanpa perlu build ulang image Docker!
> * Healthcheck berjalan setiap 10 detik.

---

## 🚀 Menjalankan Mode Production

Untuk simulasi production persis seperti di Dokploy, gunakan file **`docker-compose.production.yml`**:
```bash
docker compose -f docker-compose.production.yml up -d
```

---

## 🌐 Panduan Deploy ke Dokploy

[Dokploy](https://dokploy.com) adalah platform PaaS open-source berbasis Docker yang mendukung deployment via GitHub/GitLab repository secara otomatis dengan SSL Traefik.

### Langkah Deploy di Dokploy:

1. **Push Proyek ke Repository Git (GitHub / GitLab / Gitea):**
   ```bash
   git init
   git add .
   git commit -m "feat: modular websocket shadow fight game"
   git remote add origin https://github.com/USERNAME/duel-bayangan.git
   git push -u origin main
   ```

2. **Buat Aplikasi Baru di Dashboard Dokploy:**
   * Buka dashboard Dokploy Anda.
   * Masuk ke **Projects** $\rightarrow$ Pilih atau buat project baru.
   * Klik **Create Service** $\rightarrow$ Pilih **Application**.

3. **Konfigurasi Sumber (Source):**
   * Pilih Provider: **GitHub** (atau Git Repository publik/privat).
   * Pilih repository `duel-bayangan` dan branch `main`.

4. **Konfigurasi Build Type:**
   * Pilih **Dockerfile** (Dokploy akan otomatis mendeteksi file `Dockerfile` di root).
   * **Port Aplikasi:** Masukkan `3000`.

5. **Konfigurasi Domain & SSL:**
   * Pada tab **Domains**, tambahkan domain Anda (contoh: `duel.domainanda.com`).
   * Aktifkan **HTTPS (Let's Encrypt)**.
   * Dokploy secara otomatis mengonfigurasi Traefik untuk mendukung WebSocket (`ws://` dan `wss://`) tanpa konfigurasi tambahan!

6. **Deploy:**
   * Klik tombol **Deploy**.
   * Dokploy akan melakukan build image Docker, menjalankan container, memverifikasi healthcheck di `/healthz`, dan mengarahkan domain Anda langsung ke game.
