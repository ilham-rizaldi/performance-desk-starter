# Performance Desk Starter

Dashboard latihan pribadi untuk cycling, running, dan strength. Hubungkan **Garmin Connect Personal API** dan **Intervals.icu** di komputer Anda. Setelah terhubung, aktivitas dan metrik yang tersedia akan diperbarui otomatis selama aplikasi berjalan.

[**Panduan Connect langkah demi langkah**](SYNC.md) · [**Lihat preview dashboard**](https://ilham-rizaldi.github.io/performance-desk-starter/)

## Mulai dalam 3 langkah

1. **Unduh starter.** Di halaman repo ini, klik **Code → Download ZIP** dan ekstrak foldernya. Pasang [Node.js LTS](https://nodejs.org/) jika belum tersedia.
2. **Jalankan aplikasi.** Jika memakai Codex, buka folder tadi di Codex dan kirim “Jalankan Performance Desk Starter di folder ini, lalu buka dashboard lokalnya.” Jika menjalankan sendiri, buka Terminal di folder tersebut, ketik `npm start`, lalu buka [dashboard lokal Anda](http://127.0.0.1:4176/).
3. **Klik Connect accounts.** Pilih **Connect** di kartu Garmin atau Intervals.icu. Ambil API key dari pengaturan resmi sumber yang Anda pilih dan masukkan di dashboard lokal. Ulangi untuk sumber kedua bila perlu. Cek **Last synced** untuk memastikan data sudah masuk.

Baca [panduan Connect](SYNC.md) untuk lokasi API key, cara menyambungkan ulang, dan pengaturan sinkronisasi. Selama aplikasi berjalan, Garmin diperiksa setiap **60 menit** dan Intervals.icu setiap **15 menit**. **Sync now** meminta pemeriksaan lebih awal sesuai jeda yang diizinkan sumber.

## Isi dashboard

| Tab | Yang bisa Anda lihat |
|---|---|
| **Daily** | Training Load Garmin, Workout Suggestion, Training Status, Body metrics, dan target pacing yang tersedia. |
| **Trends** | Acute load, chronic load, rasio dan rentang optimal yang tersedia, Fitness/Fatigue/Form Intervals.icu, Load Focus, resting HR, serta perkembangan cycling, running, dan strength. Gunakan filter Indoor atau Outdoor untuk membandingkan sesi. |
| **Benchmarks** | Rekor pribadi dan metrik dari sesi yang tersedia. |
| **Predictions** | Perkiraan HR pada target watt atau pace, referensi usaha di bawah batas HR, dan perbandingan prediksi dengan catatan aktual jika data mendukung. |
| **Plan** | Rencana dan target yang tersimpan di laporan. |
| **Archive** | Riwayat data dan aktivitas berdasarkan tanggal. |
| **Reference** | Sumber yang tersedia dan cakupan datanya. |

Klik **Details** pada kartu untuk membaca grafik, lalu tabel riwayat. Grafik yang mendukung penunjuk menampilkan tanggal dan nilai saat Anda mengarahkan kursor. Tata letak menyesuaikan layar desktop, tablet, dan ponsel.

## Menggunakan riwayat yang sudah ada

- Jika sudah punya arsip Performance Desk, ikuti bagian [impor arsip pribadi](SYNC.md#jika-sudah-punya-arsip-performance-desk). Arsip membantu melengkapi metrik dan rekaman historis yang tersedia. Jika tanggal dan sumbernya sama, pembacaan API terbaru didahulukan untuk tiap nilai yang tersedia.
- Untuk membaca laporan JSON yang sudah jadi, pilih **Open report file** di browser. Ini juga tersedia di preview. [Prompt untuk ChatGPT](SETUP-PROMPT.md) dapat membantu menyiapkan file laporan. Koneksi akun dan sinkronisasi rutin berjalan langsung di aplikasi lokal.
- Prediksi memerlukan rekaman HR dan watt atau pace yang terukur bersama pada usaha sebanding. Cakupan tiap kartu bergantung pada data yang disediakan akun Anda.

## Privasi dan berbagi

[Preview GitHub Pages](https://ilham-rizaldi.github.io/performance-desk-starter/) berisi template kosong yang siap dibagikan. Koneksi akun, arsip, dan data sinkronisasi disimpan di komputer Anda. Masukkan API key hanya di dashboard lokal dan gunakan **Disconnect** untuk memutus koneksi dari aplikasi.

Format laporan tersedia di [DATA-FORMAT.md](DATA-FORMAT.md). [report.blank.json](report.blank.json) adalah contoh struktur kosong.
