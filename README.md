<div align="center">

# 📦 Malzeme Yaratma

**Excel'den toplu malzeme yaratma ekranı: şablonu indir, doldur, yükle, kontrol et, yarat.**

[![SAPUI5](https://img.shields.io/badge/SAPUI5-1.154-0a6ed1)](https://ui5.sap.com)
[![Tema](https://img.shields.io/badge/tema-sap__horizon-1d2d3e)](https://ui5.sap.com)
[![Diller](https://img.shields.io/badge/dil-TR%20%7C%20EN-30914d)](#-dil-desteği)
[![Demo](https://img.shields.io/badge/demo-GitHub%20Pages-black)](https://alihaydarsayar.github.io/zAhs_Demo_zmatcreate/)

### 👉 [Canlı demoyu aç](https://alihaydarsayar.github.io/zAhs_Demo_zmatcreate/)

</div>

---

## ✨ Ne yapar?

| Adım | Açıklama |
| --- | --- |
| 1. **Şablon İndir** | Başlıkları hazır boş Excel şablonunu indirir. |
| 2. **Doldur** | Malzeme türü, açıklama, ölçü birimi, sektör, bölüm, üretim yeri, depo yeri. |
| 3. **Excel Seç** | Doldurduğunuz `.xlsx` dosyası tabloya yüklenir. Zorunlu alanı eksik satırlar sarı işaretlenir. |
| 4. **Malzeme Yarat** | Seçtiğiniz satırlar için işlem başlar. Her satırda **BAŞARILI / BAŞARISIZ** durumu ve mesajı görünür. |
| 5. **Tablodakini Excel İndir** | Sonuçları (durum kodu ve mesajıyla) Excel olarak indirir. |

Ek özellikler: durum filtresi (tümü / başarılı / başarısız / eksik), tabloda arama, **Hatalıları Seç** ile hatalı satırları yeniden deneme, işlem öncesi onay penceresi, hata ve uyarılar için popup, TR/EN dil desteği.

> ⚠️ **Demo notu:** GitHub Pages'te SAP sistemine bağlanılamaz. Bu yüzden *Malzeme Yarat* işlemi **simüle edilir**:
> `FERT, HALB, HAWA, VERP, ZRAW` türleri başarılı olur, diğer türler (ör. `ROH`) "malzeme türü bulunmuyor" hatası verir,
> zorunlu alanı boş satırlar hata verir. Gerçek kullanımda bu bölüm SAP servisine bağlanır.

## 📄 Excel şablonu

Birinci satır başlık, sonraki satırlar veridir. Başlıklar sırayla:

`Malzeme Türü` · `Malzeme Açıklaması` · `Temel Ölçü Birim` · `Sektör` · `Bölüm` · `Üretim Yeri` · `Depo Yeri`

- Zorunlu alanlar: **Malzeme Türü, Malzeme Açıklaması, Temel Ölçü Birim, Üretim Yeri**.
- Başlık adı bulunamazsa sütun sırası esas alınır. Yalnızca `.xlsx` desteklenir.
- Ayrıntılı kullanım için: [docs/Malzeme Yaratma Ekranı.docx](docs/Malzeme%20Yaratma%20Ekran%C4%B1.docx)

## 🚀 GitHub Pages'te yayınlama

Derleme gerekmez; uygulama SAPUI5'i `ui5.sap.com` CDN'inden yükler.

1. Değişiklikleri GitHub'a gönderin (`git push origin main`).
2. Repo sayfasında **Settings → Pages**'e gidin.
3. **Build and deployment → Source:** `Deploy from a branch`.
4. **Branch:** `main`, klasör: `/ (root)` → **Save**.
5. 1–2 dakika sonra adres hazır olur:
   **https://alihaydarsayar.github.io/zAhs_Demo_zmatcreate/**

Kökteki [index.html](index.html), kullanıcıyı `webapp/index.html` adresine yönlendirir. [.nojekyll](.nojekyll) dosyası GitHub'ın dosyaları Jekyll ile işlemesini engeller.

> Sayfa açılmazsa: Settings → Pages'te "Your site is live" yazısını bekleyin, tarayıcıda Ctrl+F5 yapın ve internet bağlantınızın `ui5.sap.com` adresine erişebildiğinden emin olun.

## 💻 Yerelde çalıştırma

```bash
npm install
npm run start-local     # SAPUI5'i yerel kaynaklardan sunar, FLP önizlemesi açılır
```

veya kökten herhangi bir statik sunucuyla:

```bash
npx http-server -p 8081
# http://localhost:8081/ adresini açın
```

## 🌍 Dil desteği

Uygulama **her zaman Türkçe açılır** (`webapp/index.html` içinde `data-sap-ui-language="tr"`). İngilizce için adrese `?sap-language=EN` ekleyin, Türkçe için `?sap-language=TR` yeterlidir.
Metinler [webapp/i18n/](webapp/i18n) altındadır: `i18n.properties` (varsayılan), `i18n_tr.properties`, `i18n_en.properties`.
Excel şablon başlıkları da seçili dile göre gelir.

## 🧱 Yapı

```text
index.html                     GitHub Pages girişi (webapp'e yönlendirir)
webapp/
├── index.html                 UI5 bootstrap (CDN)
├── Component.js, manifest.json
├── controller/Main.controller.js   Yükleme, indirme, filtre, simüle yaratma
├── model/ExcelReader.js            .xlsx okuyucu (UI5 ile gelen JSZip)
├── view/Main.view.xml              Ekran
├── i18n/                           TR / EN metinler
└── css/style.css                   Buton hover efekti vb.
docs/                          Kullanım dokümanı
```

Teknik notlar:
- Excel **indirme** UI5'in standart `sap.ui.export.Spreadsheet` sınıfıyla yapılır.
- Excel **okuma** için UI5'te standart API olmadığından `.xlsx` dosyası, UI5 çekirdeğindeki `sap/ui/thirdparty/jszip` ile açılıp XML'i ayrıştırılır; harici kütüphane gerekmez.

## 🔌 Gerçek SAP'ye bağlamak

`Main.controller.js` içindeki `_mockCreate` fonksiyonu simülasyondur. Gerçek ortamda bu fonksiyonu OData/BAPI çağrısıyla
değiştirip, dönen başarı/hata mesajını satırın `Durum Kodu` ve `Durum Mesajı` alanlarına yazmanız yeterlidir.

---

<sub>SAP Fiori Application Generator ile oluşturuldu · Namespace: `com.alihaydarsayar` · UI5 1.154 · Tema: `sap_horizon`</sub>
