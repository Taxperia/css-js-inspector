# Chrome Web Mağazası yayın rehberi

Hazırlık tarihi: 12 Kasım 2026. Paket sürümü: 1.1.0.

## Hazır dosyalar

- Yüklenecek paket: `dist/css-js-inspector-1.1.0.zip` veya GitHub Releases'taki aynı dosya.
- Mağaza simgesi: `icons/icon128.png`.
- Kopyalanacak başlık, açıklama, izin gerekçeleri ve incelemeci talimatı: [store/LISTING_TR.md](store/LISTING_TR.md).
- Gizlilik adresi: https://taxperia.github.io/css-js-inspector/privacy.html
- Destek: https://github.com/Taxperia/css-js-inspector/issues
- Proje: https://taxperia.github.io/css-js-inspector/

GitHub'ın “Code → Download ZIP” arşivi yerine yayın için üretilen sürüm ZIP'ini yükleyin. Paket kökünde manifest.json bulunmalıdır.

## Önce gerçek tarayıcıda kontrol

1. `chrome://extensions` sayfasında geliştirici modunu açın ve projenin çalışma klasörünü paketlenmemiş olarak yükleyin. Eski 1.0.0 sürümünü kullanıyorsanız yenileyin veya kaldırın; önceden enjekte edilmiş kodu temizlemek için test sayfalarını da yenileyin.
2. Projenin [deneme sayfasını](https://taxperia.github.io/css-js-inspector/demo.html) açın; araç çubuğu simgesine tıklayın.
3. Seçim modunda örnek kartı seçin; CSS, hesaplanan stiller ve HTML'nin geldiğini doğrulayın. ESC ile çıkışı sınayın.
4. Erken JS kaydını açıp Chrome'un o site için istediği erişimi onaylayın. Sayfayı yenileyin, örnek butonu seçin ve JS / Olaylar sekmesinde showClickCount kaydını görün.
5. Dosyalar sekmesinde demo.css ve demo.js'yi açın. Gerekiyorsa yalnızca ilgili sitenin kaynak erişimini onaylayın. Kopyalama ve indirmeyi sınayın.
6. İki sekme arasında geçiş yapın; eski sekmenin seçimi yeni sayfa altında görünmemelidir. “Verileri temizle” ile sonuçlar kaldırılmalıdır.
7. Erken kaydı kapatın veya site izinlerini kaldırın, açık test sayfalarını yenileyin. Devam eden erken kayıt kalmamalıdır.
8. `chrome://extensions` içindeki eklenti hata alanını kontrol edin. Korumalı bir Chrome/mağaza sayfasında anlaşılır bir erişim hatası gösterildiğini doğrulayın.

## Ekran görüntüleri

Mağaza için en az bir gerçek kullanım ekran görüntüsü zorunludur. Önerilen boyut 1280×800; 640×400 de kabul edilir. En fazla beş görüntü yüklenebilir. Sürümle birlikte store/ klasörüne görüntü konduysa bunları kullanabilirsiniz; aksi halde gerçek Chrome'da deneme sayfası ve açık yan panelin ekran görüntüsünü alın.

Görüntüde gerçek kişisel veri, başka sekmelerinizin başlıkları veya hesap bilgileri bulunmasın. CSS, JS / Olaylar ve Dosyalar sekmelerini gösteren üç görüntü uygundur. İsteğe bağlı küçük tanıtım görseli 440×280'dir; eksik olması yayını engellemez.

## Geliştirici hesabını hazırlama

1. [Chrome Web Mağazası geliştirici panelini](https://chrome.google.com/webstore/devconsole) açın ve yayıncı Google hesabınızla oturum açın.
2. İlk yayınsa geliştirici kaydını tamamlayın; tek seferlik kayıt ücretini ekranda gösterilen tutar üzerinden ödeyin.
3. İletişim e-postası, doğrulama ve istenen yayıncı bilgilerini doldurun. Tacir/ticari durum ve adres gibi kişisel veya hukuki beyanları kendi gerçek durumunuza göre yanıtlayın.

## Yeni öğe ve mağaza sayfası

1. **Add new item / Yeni öğe ekle → Choose file** yoluyla `css-js-inspector-1.1.0.zip` dosyasını yükleyin.
2. **Store listing / Mağaza girişi** bölümünde Türkçe dili seçin, [hazır metinleri](store/LISTING_TR.md) girin. Uygun geliştirici aracı/araç kategorisini seçin.
3. `icon128.png` ve en az bir kullanım ekran görüntüsü ekleyin; destek ve proje adreslerini doldurun.
4. **Privacy practices / Gizlilik uygulamaları** bölümünde tek amaç açıklamasını ve üç gerekli izin ile isteğe bağlı site erişimi gerekçelerini hazır dosyadan alın.
5. **Remote code** sorusuna **No / Hayır** yanıtı verin. Eklentide indirilen JS kaynakları yalnızca metin olarak gösterilir.
6. Veri kullanımında yerelde işlenen Website content ve incelenen sayfa/kaynak URL'lerini Web history kapsamında beyan edin; geçmiş API'si veya genel gezinme geçmişi toplanmadığını açıklayın. Formdaki beyanlar yayımlanan gizlilik politikasıyla aynı davranışı anlatmalıdır.
7. Gizlilik politikası alanına yukarıdaki herkese açık HTTPS adresini yapıştırın. Bağlantıyı oturum açmadan açabildiğinizi kontrol edin.
8. **Distribution** bölümünde ücretsiz erişim, görünürlük ve hedef ülkeleri seçin.
9. **Test instructions** alanına hazır incelemeci talimatını ekleyin. Hesap veya şifre gerekmiyor.
10. Eksik alan kalmadığında **Submit for review / İncelemeye gönder**'e basın. Onaydan sonra otomatik yayın veya elle yayın seçeneğini kendi tercihinize göre belirleyin.

Mağaza incelemesini Google yapar; teknik hazırlık kabul garantisi vermez. İade/ret olursa paneldeki gerekçeyi kaydedip aynı öğede düzeltme yapın. Her güncellemede manifest sürümünü artırın ve paketi yeniden üretin.

## Paket ve otomatik kontroller

```sh
node --test tests/background.test.cjs
python scripts/package.py --check
python scripts/package.py
```

Yedek arşiv proje klasörünün yanında tutulur ve GitHub'a/mağaza paketine eklenmez. `dist/`, test tarayıcısı profilleri ve anahtar dosyaları Git tarafından dışlanır.

## Resmî kaynaklar

- [İlk yayın adımları](https://developer.chrome.com/docs/webstore/publish)
- [Geliştirici kaydı](https://developer.chrome.com/docs/webstore/register)
- [Mağaza gizlilik formu](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Görsel gereklilikleri](https://developer.chrome.com/docs/webstore/images)
- [Yerel veri işleme dahil gizlilik gereklilikleri](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [İzinleri en aza indirme](https://developer.chrome.com/docs/webstore/program-policies/permissions)
