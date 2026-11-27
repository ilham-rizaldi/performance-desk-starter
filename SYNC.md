# Panduan Connect Garmin dan Intervals.icu

Gunakan satu dashboard privat per orang dengan **Garmin Connect Personal API** dan **Intervals.icu**. Hubungkan akun sekali, lalu data muncul di dashboard tanpa memilih file laporan. Sinkronisasi berjalan selama aplikasi lokal terbuka. Preview GitHub Pages menampilkan template kosong.

## 1. Buka aplikasi di komputer Anda

1. Unduh **Code → Download ZIP** dari [repo starter](https://github.com/ilham-rizaldi/performance-desk-starter), lalu ekstrak foldernya.
2. Pasang [Node.js LTS](https://nodejs.org/) jika belum tersedia. Jika menggunakan Codex di komputer sendiri, minta Codex menjalankan **`npm start`** di folder yang baru diekstrak. Untuk menjalankannya sendiri, buka Terminal di folder itu dan ketik `npm start`. Tidak ada paket tambahan yang perlu diinstal.
3. Buka [dashboard privat di komputer ini](http://127.0.0.1:4176/) dan klik **Connect accounts**. Biarkan aplikasi berjalan selama Anda ingin mendapatkan pembaruan.

## 2. Hubungkan akun yang dipakai

### Garmin Connect

Klik **Connect** di kartu Garmin, lalu buka **Open provider settings**. Masuk ke Garmin, buat **Personal API key**, dan isi key sekali di dashboard lokal. Ini adalah akses personal untuk akun Garmin Anda sendiri. Garmin menyediakan beberapa tanggal kedaluwarsa. Saat key habis, gunakan **Reconnect** dengan key baru. [Garmin Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)

### Intervals.icu

Klik **Connect** di kartu Intervals.icu. Untuk instalasi personal biasa, buat atau salin API key dari **Settings** Intervals.icu dan isi key sekali di dashboard lokal. Intervals.icu memberi akses sesuai jenis key. Starter mengambil aktivitas dan wellness melalui permintaan baca. [Panduan API Intervals.icu](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)

Jika pengelola instalasi sudah memiliki aplikasi OAuth yang disetujui Intervals.icu, tombol **Connect** langsung membuka halaman persetujuan Intervals.icu. Pengelola perlu mengisi `INTERVALS_CLIENT_ID` dan, untuk OAuth client yang membutuhkan secret, `INTERVALS_CLIENT_SECRET` di pengaturan lokal proses. Daftarkan alamat callback `http://127.0.0.1:4176/api/intervals/callback`. Aplikasi meminta `ACTIVITY:READ,WELLNESS:READ` dan memakai PKCE. [Registrasi aplikasi dan OAuth Intervals.icu](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)

## 3. Cek pembaruan dan hentikan akses bila perlu

- Pembacaan pertama dimulai setelah koneksi berhasil. Selama aplikasi berjalan, starter mengecek Garmin setiap **60 menit** dan Intervals.icu setiap **15 menit**. Buka **Connect accounts** untuk melihat **Last synced**. Tombol **Sync now** tersedia untuk meminta pemeriksaan lebih awal dan mengikuti jeda dari sumber.
- Starter membaca hingga **42 hari** termasuk hari ini. Garmin memasok aktivitas, resting HR, HRV dan tidur bila tersedia. Intervals.icu memasok aktivitas dan Fitness/Fatigue. Form dihitung sebagai Fitness dikurangi Fatigue. Aktivitas yang muncul di keduanya dicocokkan hanya ketika waktunya, durasinya, olahraganya dan jaraknya sesuai.
- Prediksi tetap menunggu blok usaha dengan watt atau pace dan HR yang benar-benar berpasangan. Sinkronisasi ringkasan aktivitas ini tidak membuat blok tersebut. Angka tanpa pembacaan tetap kosong. Jika sync gagal, dashboard mempertahankan pembacaan terakhir dan menampilkan status sumbernya.
- **Disconnect** menghapus koneksi dan data sumber tersebut dari aplikasi. Untuk mencabut key personal di layanan asal, gunakan pengaturan akun Garmin atau Intervals.icu. Simpan key hanya di aplikasi privat di perangkat milik Anda. File pengaturan lokal berada di folder `.private/` yang dikecualikan dari GitHub.

## Kalau belum muncul data

| Yang terlihat | Yang bisa dilakukan |
|---|---|
| **Ready to connect** | Klik **Connect** untuk sumber yang ingin dipakai. |
| **Access expired or was denied** | Klik **Reconnect**. Pakai key baru bila key sudah kedaluwarsa. |
| **Last synced** masih menunjukkan waktu lama | Cek koneksi internet dan pastikan aplikasi lokal masih berjalan. Pilih **Sync now** setelah jeda dari sumber selesai. |
| Halaman browser hanya menampilkan starter kosong | Buka alamat aplikasi privat di langkah 1. Halaman GitHub adalah preview. |
