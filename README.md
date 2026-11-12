# CSS & JS İnceleyici

Chrome 116+ için açık kaynak bir Manifest V3 eklentisi. Bir öğenin CSS kurallarını, hesaplanan stillerini, kaydedilebilen JS olay dinleyicilerini ve sayfanın CSS/JS kaynaklarını yan panelde gösterir.

[Proje sayfası](https://taxperia.github.io/css-js-inspector/) · [Gizlilik politikası](https://taxperia.github.io/css-js-inspector/privacy.html) · [Destek](https://github.com/Taxperia/css-js-inspector/issues) · [Mağaza yayın rehberi](STORE_GUIDE_TR.md)

## Kurulum

1. [Releases](https://github.com/Taxperia/css-js-inspector/releases) bölümünden sürüm ZIP'ini indirin ve bir klasöre çıkarın.
2. Chrome'da `chrome://extensions` sayfasını açın; **Geliştirici modu → Paketlenmemiş öğe yükle** ile çıkan klasörü seçin.
3. Normal bir HTTP/HTTPS sayfası açın ve araç çubuğundaki eklenti simgesine tıklayın.
4. Yan panelde **Seçim Modu**'na basıp sayfadan bir öğe seçin. ESC ile seçimden çıkabilirsiniz.

Chrome Web Mağazası sürümü yayımlandığında bağlantısı buraya eklenecektir. Edge desteği ayrıca tarayıcıda doğrulanmalıdır.

## Özellikler

- Eşleşen CSS seçicileri ve bildirimleri; kaynak dosya, durum sözde sınıfları, `::before`/`::after` ve erişilebilen diğer sözde öğe kuralları.
- Inline stil, hesaplanan stiller, HTML ve öznitelikler; breadcrumb ile üst öğelere geçiş.
- Kaydedilmiş `addEventListener` tanımları, kaynak metni ve kayıt anındaki yığın izi; inline handler'lar ve erişilebilen jQuery kayıtları.
- Sayfada listelenen CSS/JS dosyalarını metin olarak görüntüleme, kopyalama ve indirme.
- Site bazında isteğe bağlı erken JS kaydı; inceleme verilerini temizleme ve kalıcı site izinlerini kaldırma.

## İzinler ve veri kullanımı

Kurulumda tüm sitelere erişim istenmez. `activeTab` yalnızca kullanıcının çağırdığı etkin sekmeye geçici erişim sağlar. `scripting` paket içindeki inceleme kodunu enjekte eder; `sidePanel` arayüzü açar. `tabs`, çerez, geçmiş, depolama ve debugger izinleri istenmez.

**Erken JS kaydı:** Sayfa yüklenirken eklenen dinleyicileri görmek için **Bu sitede erken JS kaydını aç** düğmesine basın, Chrome'un site erişim isteğini kabul edin ve sayfayı yenileyin. Yalnızca seçtiğiniz protokol ve ana bilgisayar için kalıcı erişim istenir. Chrome eşleşme kalıpları bu ana bilgisayarın bütün yollarını ve portlarını kapsar. Bu sitelerde kayıt panel kapalıyken de sayfa açılışında çalışır. Erken kaydı kapatmak sonraki yüklemeler için etkilidir; açık sayfaları yenileyin.

**Harici kaynaklar:** CSS kurallarını tamamlamak için panelde listelenen kaynaklara, dış CSS/JS dosyasını açmak için o dosyanın sitesine ayrıca izin verirsiniz. Bu izin kendi başına o sitede erken JS kaydını açmaz. Ağ istekleri çerez ve HTTP kimlik bilgisi eklemez, Referer göndermez, yönlendirme takip etmez. Bir dosya en fazla 2 MiB ve 12 saniyeyle sınırlandırılır. HTML/JSON yanıtları açılmaz. Kaynak sunucusu normal istek URL'sini ve ağ metaverisini görebilir; URL'nin sorgu parametreleri korunur. HTTPS şifrelidir, HTTP kaynakları şifrelenmemiştir.

İnceleme verileri yalnızca tarayıcı belleğinde tutulur; geliştiriciye aktarılmaz. Analitik, reklam, hesap veya uzak sunucu yoktur. İndirilen JavaScript **çalıştırılmaz**. Kullanıcının kopyaladığı/indirdiği içerik pano ve yerel dosyalarda kalabilir. Ayrıntılar için [gizlilik politikasını](privacy.html) okuyun.

## Sınırlar

- Varsayılan olarak panel açılmadan önce bağlanmış JS dinleyicileri görülemez. Erken kayıt yalnızca açıldığı sitede, sonraki sayfa yüklemesinden başlayarak yardımcı olur.
- Sonuçlar en iyi çabadır: iframe içleri, Shadow DOM, tarayıcı iç olayları ve bazı framework/sanal olay sistemleri kapsam dışındadır. MAIN-world verileri incelenen sayfa tarafından değiştirilebilir.
- JS listesi kaydedilmiş tanımları gösterir; `once` ile çalışmış veya AbortSignal ile kaldırılmış bir dinleyici listede kalabilir. Her hedefte en fazla 300 kayıt saklanır.
- İlk 500 eşleşen CSS kuralı gösterilir. Dinamik sözde sınıflar yaklaşık eşleştirilir; bazı `@import`, Shadow DOM ve karmaşık CSS yapıları eksik kalabilir.
- Kaynak listesi mevcut belgeyi yansıtır; bir bundler'ın bütün modüllerini, kaynak haritalarını veya sunucu kodunu çıkarmaz.
- Oturum gerektiren, yönlendiren, 2 MiB'den büyük veya desteklenmeyen MIME türündeki harici dosyalar açılamaz.
- `chrome://`, Chrome Web Mağazası, diğer eklentilerin sayfaları, `file://`, `blob:` ve `data:` belgeleri desteklenmez.
- Sayfanın daha önce kurulmuş olay işleyicileri, seçim modundaki tıklama engellemesinden önce çalışabilir. Hassas bir işlemi yalnızca inceleme amacıyla tıklamayın.

## Geliştirme ve paketleme

Bağımlılık kurulumu ve derleme gerekmez. Python 3.9+ ve Node.js 20+ ile:

```sh
node --test tests/background.test.cjs
python scripts/package.py --check
python scripts/package.py
```

Mağazaya yüklenecek dosya: `dist/css-js-inspector-1.1.0.zip`. ZIP'in kökünde `manifest.json` bulunur; testler, belgeler, Git verileri, ekran görüntüleri ve yedekler pakete girmez. SHA-256 özeti `dist/SHA256SUMS.txt` içine yazılır. Paket deterministik olarak üretilir.

`tests/background.test.cjs` ağ kullanmadan mesaj yetkilendirmesini, isteğe bağlı izinleri, yanıt türlerini, boyut sınırını ve erken kayıt akışını sınar. Gerçek tarayıcı kontrol adımları [yayın rehberindedir](STORE_GUIDE_TR.md).

## Dosyalar

- `background.js`: yan panel davranışı, site bazında erken kayıt ve sınırlandırılmış kaynak getirme.
- `content/content.js`: yalıtılmış seçim modu, CSS/HTML inceleme ve metin verisi toplama.
- `inject/main.js`: sayfa bağlamında olay tanımlarını kaydetme; ayrıcalıklı eklenti API'lerine erişmez.
- `sidepanel/`: kullanıcı arayüzü.
- `privacy.html`, `docs/`: paket içi gizlilik politikası ve herkese açık proje/gizlilik/deneme sayfaları.
- `scripts/`, `tests/`, `store/`: paketleme, doğrulama ve mağaza hazırlığı.

## Lisans

[MIT](LICENSE) — Copyright (c) 2026 Taxperia. Eklentinin lisansı, onunla incelediğiniz üçüncü taraf sitelerin kaynakları için yeniden kullanım hakkı vermez.
