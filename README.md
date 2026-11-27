# Performance Desk Starter

Dashboard latihan pribadi untuk cycling, running, dan strength. Template ini mulai kosong. Gunakan data dari akun Anda sendiri.

**Mau pembaruan otomatis tanpa memilih file laporan?** Mulai dari [panduan Connect dan sinkron otomatis](SYNC.md). Mode ini berjalan di aplikasi privat di komputer Anda. Langkah berikut untuk preview dan mode file.

## Mulai dalam 3 langkah

### 1. Unduh dan buka dashboard

Buka [dashboard kosong di browser](https://ilham-rizaldi.github.io/performance-desk-starter/). Halaman **Daily** yang masih kosong berarti dashboard siap digunakan.

Untuk salinan offline, klik tombol hijau **Code → Download ZIP** di halaman repo ini. Buka ZIP, lalu klik dua kali **index.html** di folder hasil ekstrak. Gunakan Chrome, Edge, atau Safari di komputer.

Tidak perlu memasang Node.js, menjalankan Terminal, atau membuat akun GitHub untuk membuka dashboard.

### 2. Salin prompt ke ChatGPT

Buka [SETUP-PROMPT.md](SETUP-PROMPT.md), salin isi promptnya, lalu kirim di chat pribadi Anda. Jika punya Codex atau opsi Work dengan kontrol browser, gunakan itu agar GPT bisa membantu cek halaman yang sudah Anda masuki. Di ChatGPT biasa, pilih cara ekspor file saat GPT tidak bisa membaca situs akun Anda.

Ikuti langkah yang muncul satu per satu. Masukkan password dan kode verifikasi hanya di halaman login resmi masing-masing layanan. Anda bisa mulai dari satu akun dan menambahkan sumber lain nanti.

| Sumber | Data yang bisa dipakai | Cara mendapatkannya |
|---|---|---|
| **Garmin Connect** | Recovery, wellness, aktivitas, dan rekaman asli dari perangkat | Masuk ke [Garmin Connect](https://connect.garmin.com/). Untuk ekspor sesi, buka **Activities → All Activities** dan pilih **Export CSV**, atau buka satu aktivitas dan pilih ekspor versi asli. Ekspor ini punya cakupan berbeda. [Panduan ekspor Garmin](https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8) |
| **Intervals.icu** | Fitness, Fatigue, Form, riwayat aktivitas, dan wellness yang tersedia | Masuk ke [Intervals.icu](https://intervals.icu/). Buka **Fitness** untuk membaca grafik harian, dan kalender atau detail aktivitas untuk riwayat. Kirim ekspor yang tersedia ke chat pengaturan pribadi Anda. [Dokumentasi integrasi Intervals.icu](https://www.intervals.icu/features/open-api/) |
| **Strava** | Riwayat aktivitas, waktu, jarak, dan rekaman asli bila tersedia | Masuk ke [Strava](https://www.strava.com/). Di web, **Settings → My Account → Download your account** untuk meminta arsip. Untuk satu sesi, buka aktivitas dan pilih **Export Original** jika tersedia. [Panduan ekspor Strava](https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data) |

### 3. Buka laporan

Unduh **performance-report.json** yang dibuat GPT untuk Anda. Di dashboard, klik **Open report file**, lalu pilih file itu. Cek tanggal laporan dan sumber di bawah angka. Klik **Details** pada kartu untuk melihat grafik dan tabel.

Saat ingin memperbarui laporan, kirim **“Perbarui Performance Desk saya dengan hasil terbaru dari akun yang sudah tersedia.”** di chat pengaturan yang sama. Ambil file terbaru, kemudian buka lagi di dashboard. File JSON dibaca di browser dan perlu dipilih kembali jika halaman ditutup.

## Isi dashboard

- **Daily** menampilkan recovery, metrik Garmin, Fitness Intervals.icu, dan saran latihan ringan bila pembacaan recovery berasal dari hari yang sama.
- **Trends** menampilkan kecepatan cycling dan pace running, dengan filter Indoor dan Outdoor. Strength menampilkan total kg untuk sesi yang mencatat beban.
- **Predictions** menampilkan perkiraan HR pada target watt atau pace, dan referensi dari latihan yang sebelumnya berada di bawah batas HR. Estimasi memerlukan data berpasangan yang sebanding. Kolom kosong berarti bukti belum cukup.
- **Details** membuka grafik di atas tabel sumber dan tanggal. Grafik mengikuti pembacaan yang tersedia.

## Privasi dan batas integrasi

Template ini membaca file laporan di browser. Simpan file JSON dan ekspor Anda di komputer atau tempat penyimpanan pribadi. Repo ini boleh dibagikan karena isinya hanya kode, prompt, dan struktur laporan kosong. Tambahkan integrasi akun hanya melalui akses resmi yang Anda setujui. Halaman ini tidak menjalankan sinkronisasi otomatis atau menyimpan sesi login akun olahraga.

Akses browser yang sudah login bergantung pada alat dan izin yang tersedia di chat Anda. Ekspor file tetap bisa dipakai tanpa akses browser otomatis. Jika ingin membuka laporan dari beberapa perangkat, minta GPT membangun salinan pribadi dengan izin pemilik. Simpan hanya template kosong di hosting atau repo publik.

## Bantuan cepat

| Yang terlihat | Langkah berikutnya |
|---|---|
| **No report open** | Klik **Open report file** dan pilih file JSON dari GPT. |
| **Choose a Performance Desk JSON report** | Pastikan file yang dipilih adalah hasil akhir dari GPT. Arsip ZIP, CSV, dan FIT adalah bahan untuk GPT. |
| Data Garmin atau Intervals.icu kosong | Cek rentang tanggal ekspor, izin, atau apakah metrik memang direkam. Minta GPT mengisi daftar data yang masih diperlukan. |
| **Needs paired efforts** | Gunakan rekaman yang memiliki HR dan watt atau pace dari blok steady yang sama. Rerata dari dua aktivitas berbeda tidak cukup. |
| Aktivitas muncul dua kali | Minta GPT mencocokkan sumber berdasarkan waktu mulai, olahraga, durasi, dan jarak, lalu memberi salinan yang terverifikasi satu `sessionKey`. |

Spesifikasi yang dipakai GPT ada di [DATA-FORMAT.md](DATA-FORMAT.md). File [report.blank.json](report.blank.json) adalah kerangka kosong untuk dokumentasi.
