# Struktur file laporan

File adalah JSON dengan empat bagian wajib. Salin [kerangka kosong](report.blank.json), isi `reportDate` dan `timezone`, lalu masukkan data yang benar-benar tersedia ke tiga daftar. Angka berupa nilai JSON, tanpa unit di dalam nilainya. Nilai yang tidak diketahui boleh dihilangkan atau diisi `null`. Semua tanggal memakai `YYYY-MM-DD` menurut zona waktu pemilik.

| Field | Isi |
|---|---|
| `version` | `1` |
| `reportDate` | Tanggal pembacaan laporan dalam zona waktu pemilik. Wajib saat membuka file. |
| `timezone` | Nama zona waktu IANA, misalnya `Asia/Jakarta`. |
| `wellness`, `activities`, `efforts` | Daftar di bawah. Gunakan `[]` jika data belum tersedia. |

`source` harus salah satu dari `Garmin Connect`, `Intervals.icu`, atau `Strava`. `sport` menggunakan `Cycling`, `Running`, atau `Strength`. `environment` adalah `Indoor` atau `Outdoor` dan boleh kosong pada ringkasan aktivitas bila klasifikasinya tidak pasti.

## Wellness

Setiap baris wajib memiliki `date` dan `source`. Isi satu baris untuk tiap tanggal dan sumber. Garmin mengisi `readiness` dan `bodyBattery` (skor 0–100), `sleepMinutes`, `sleepScore` (skor 0–100), `restingHR` (bpm), `hrv` (ms), `recoveryHours` (jam tersisa), `acuteLoad`, `chronicLoad`, dan `loadRatio` (rasio Garmin yang direkam). Intervals.icu mengisi `fitness`, `fatigue`, dan `form` menggunakan nilai harian dari sumber tersebut. Jika suatu metrik punya cakupan khusus, gunakan tanggal pembacaan sebenarnya dan pertahankan bukti sumber di catatan pribadi.

## Activities

Wajib `date`, `source`, `sport`, dan `id` berupa teks. `sessionKey` opsional, sama untuk salinan lintas sumber yang sudah diverifikasi untuk olahraga dan tanggal yang sama. ID lokal yang kebetulan sama di dua penyedia tetap terpisah. Field opsional lainnya adalah `environment`, `minutes` (timer dalam menit), `km`, `avgWatts`, `avgHR` (bpm), dan `liftedKg` (total set yang tercatat).

Untuk sesi yang terverifikasi sama, pembacaan Garmin diutamakan, lalu Intervals.icu, lalu Strava. Field yang kosong dapat diisi dari salinan yang cocok. Catat konflik penting di luar file laporan dan jangan salah menggolongkan ringkasan sebagai pengukuran blok.

## Efforts

Wajib `date`, `source`, `sport`, `environment`, `minutes`, dan `bpm` dari blok steady yang sama. Cycling memakai `watts`; running memakai `paceSeconds` (detik per km). Cadangkan satu baris untuk satu blok asli. `peakHR` bersifat opsional dan hanya diisi jika puncak HR dalam blok benar-benar terukur. Model starter menggunakan blok 8–15 menit. Cantumkan hanya blok yang sebanding. Data tanjakan, lari interval, indoor, dan outdoor bisa menghasilkan respons berbeda.

HR pada target dihitung dari median per hari pada blok sejenis di dekat target. Minimal dua hari dan target perlu berada di dalam rentang rekaman yang cocok. Angka di bawah batas HR adalah referensi dari puncak terukur di dua hari, bukan jaminan. Frekuensi melampaui batas dihitung per hari yang punya puncak HR. Model menjaga konteks indoor dan outdoor secara terpisah.
