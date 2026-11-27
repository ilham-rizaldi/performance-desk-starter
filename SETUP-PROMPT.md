# Setup Performance Desk dengan GPT

Klik tombol **Copy** pada blok di bawah, lalu tempel di chat **Codex desktop** agar GPT bisa mengambil kode dan menjalankan dashboard di komputer Anda. Jika memakai chat yang hanya bisa memberi instruksi, prompt ini akan memandu Anda menjalankan aplikasi di komputer sendiri.

Siapkan akun Garmin Connect dan Intervals.icu milik Anda. Hubungkan satu akun dulu jika akun lainnya belum siap. Sinkronisasi berjalan lewat koneksi akun tanpa unduh atau upload laporan JSON.

## Prompt siap salin

```text
Siapkan Performance Desk pribadi saya di komputer ini. Pakai versi terbaru dari branch main di https://github.com/ilham-rizaldi/performance-desk-starter. Gunakan template dan fitur yang sudah ada di repo, termasuk desain dan navigasi terbaru. Baca README.md dan SYNC.md, lalu mulai kerjakan sekarang. Gunakan Bahasa Indonesia yang mudah dipahami dan beri saya satu tindakan pada satu waktu jika saya perlu klik atau masuk sendiri.

1. Siapkan aplikasi. Ambil repo ke folder pribadi saya. Jika sudah ada salinan, cek versinya dan pertahankan pengaturan serta koneksi lokal yang sudah tersimpan. Periksa versi Node.js sesuai package.json, jalankan npm test jika tersedia, kemudian npm start. Buka http://127.0.0.1:4176/ di browser saya dan pastikan dashboard benar-benar terbuka. Jika chat ini tidak bisa menjalankan program di komputer saya, langsung pandu saya lewat Code → Download ZIP, instal Node.js LTS bila perlu, buka folder hasil ekstrak, dan jalankan npm start. Gunakan alamat lokal untuk sambungan akun. GitHub Pages dipakai untuk preview template kosong.

2. Bantu hubungkan Garmin Connect. Di dashboard lokal pilih Connect accounts → Connect pada kartu Garmin Connect → Open provider settings. Saya akan masuk ke Garmin sendiri, membuat Personal API key di halaman resmi bila perlu, lalu menempelkannya langsung ke form di dashboard lokal dan menekan Connect and sync. Tunggu sampai Last synced muncul, lalu periksa apakah ada aktivitas atau pembacaan wellness Garmin.

3. Bantu hubungkan Intervals.icu. Pilih Connect pada kartu Intervals.icu. Untuk instalasi pribadi, saya akan mengambil key dari Settings → Developer Settings di Intervals.icu, menempelkannya ke form lokal, lalu menekan Connect and sync. Jika instalasi saya sudah memakai OAuth resmi, arahkan saya untuk menyetujui akses baca di halaman Intervals.icu. Cek Last synced serta Fitness, Fatigue, Form, atau aktivitas yang tersedia. Bila salah satu akun belum siap, lanjutkan dengan akun yang sudah terhubung dan beri tahu saya apa yang perlu dilakukan untuk akun kedua.

4. Verifikasi hasil dan biarkan aplikasi berjalan. Cek tanggal pembacaan dan satu contoh data nyata dari tiap sumber yang berhasil tersambung. Bedakan koneksi berhasil, data terlihat, dan pembaruan otomatis berikutnya. Jelaskan bahwa saat aplikasi lokal aktif, Garmin diperiksa setiap 60 menit dan Intervals.icu setiap 15 menit. Sync now meminta pemeriksaan lebih awal sesuai jeda dari sumber. Setelah komputer atau aplikasi ditutup, jalankan kembali npm start untuk melanjutkan sinkronisasi. Gunakan fitur Connect untuk semua langkah ini, tanpa ekspor atau upload JSON.

Gunakan Garmin Connect Personal API dan Intervals.icu untuk membaca data akun saya. Saya akan memasukkan password dan kode verifikasi di situs resmi masing-masing, dan API key di dashboard lokal. Jaga data dan pengaturan di komputer saya. Jangan minta kredensial di chat, mengubah data atau jadwal latihan di akun saya, atau memublikasikan laporan dan kredensial.

Mulai di Daily, Trends, dan Archive. Setelah satu akun tersambung, tunjukkan satu pembacaan bertanggal dan cara membuka riwayatnya lewat Details atau Archive. Training Load, Training Status, dan Workout Suggestion tetap terlihat. Menu More muncul saat ada data untuk Benchmarks, Predictions, Plan, atau Reference. Cari Pacing Cards di Plan saat target sudah tersimpan. Jelaskan singkat bila ada data penting yang belum disediakan akun saya. Gunakan data yang benar-benar tercatat, termasuk HR, watt, dan pace. Akhiri dengan tautan dashboard lokal, status dan waktu Last synced masing-masing akun, serta langkah yang masih perlu saya lakukan.
```

[Panduan Connect langkah demi langkah](SYNC.md) · [README](README.md)
