# Chrome Web Mağazası için hazır metinler

## Ad

CSS & JS İnceleyici

## Kısa açıklama

Seçtiğiniz öğenin CSS kurallarını, kaydedilen JS olaylarını ve sayfanın CSS/JS kaynaklarını yan panelde inceleyin.

## Ayrıntılı açıklama

Bir web sayfasındaki öğenin nasıl tasarlandığını ve hangi JavaScript olaylarıyla ilişkili olduğunu inceleyin.

CSS & JS İnceleyici, seçtiğiniz öğenin erişilebilen CSS kurallarını, hesaplanan stillerini, HTML'sini ve kaydedilebilen JS olay dinleyicilerini Chrome'un yan panelinde gösteren bir geliştirici aracıdır.

• CSS seçicilerini, bildirimlerini, kaynak dosyalarını, hover durumlarını ve before/after kurallarını görün.
• HTML, öznitelikler ve hesaplanan stilleri inceleyin; üst öğelere geçin.
• Kaydedilen olay dinleyicilerinin fonksiyon metnini ve erişilebilen kaynak/satır bilgisini görüntüleyin.
• Sayfanın CSS ve JS dosyalarını metin olarak açın, kopyalayın veya indirin.

NASIL KULLANILIR?
Normal bir HTTP/HTTPS sayfasında araç çubuğundaki eklenti simgesine tıklayın, Seçim Modu'nu açın ve bir öğe seçin. İlk yüklemede bağlanan JS dinleyicilerini görmek için Bu sitede erken JS kaydını aç seçeneğini etkinleştirin, yalnızca o siteye erişim izni verin ve sayfayı yenileyin. Bu özellik açık olan sitelerde olay tanımları panel kapalıyken de sayfa yüklenirken tarayıcı belleğine kaydedilir.

İZİNLER VE GİZLİLİK
Kurulumda tüm sitelere kalıcı erişim istenmez. Etkin sekmeye erişim kullanıcı çağrısıyla başlar. Erken kayıt ve dış kaynak metinlerini getirme için ilgili sitenin erişim izni ayrıca istenir. Kalıcı izinleri panelden kaldırabilirsiniz.

İncelenen sayfanın URL'si, HTML/CSS içeriği ve JS kaynak metinleri tarayıcınızda işlenir. Geliştiriciye gönderilmez; reklam, analitik, kullanıcı hesabı veya geliştirici sunucusu yoktur. Dış kaynaklar kendi sunucularından, çerez ve HTTP kimlik bilgisi eklenmeden istenir; bu sunucular normal ağ metaverisini ve istenen kaynak URL'sini görebilir. İndirilen JavaScript çalıştırılmaz.

SINIRLAR
Bu araç DevTools'un bütün yeteneklerini sunmaz. Erken kayıt açılmadan önce bağlanan olaylar, iframe içleri, Shadow DOM ve bazı framework olayları görünmeyebilir. Sonuçlar yaklaşık olabilir; CSS kuralları ilk 500, JS kayıtları hedef başına 300 ile sınırlıdır. Yönlendiren, oturum gerektiren veya 2 MiB'den büyük dış dosyalar açılamaz. Chrome ve mağaza gibi korumalı sayfalarda çalışmaz.

Açık kaynak ve MIT lisanslıdır.
Kaynak ve destek: https://github.com/Taxperia/css-js-inspector
Gizlilik: https://taxperia.github.io/css-js-inspector/privacy.html

## Tek amaç / Single purpose

Kullanıcının seçtiği web sayfası öğesinin erişilebilir HTML/CSS özelliklerini, kaydedilebilir JavaScript olay tanımlarını ve ilgili CSS/JS kaynak metinlerini yan panelde incelemesini sağlamak.

## İzin gerekçeleri

### activeTab

Kullanıcı araç çubuğu simgesiyle eklentiyi çağırdığında etkin sekmeye geçici erişim sağlar. Seçilen öğeyi ve ilgili sayfa kaynaklarını incelemek için kullanılır; bütün sekmelere kalıcı erişim veya tarayıcı geçmişini okuma izni vermez.

### scripting

Paketin içindeki content/content.js ve inject/main.js dosyalarını kullanıcının çağırdığı sekmeye enjekte eder. Kullanıcı isteğe bağlı erken kaydı açarsa yalnızca izin verilen site için document_start anında çalışan paket içi bir script kaydeder. Uzak kod çalıştırmaz.

### sidePanel

İnceleme sonuçlarını ve seçim/izin kontrollerini Chrome'un yan panelinde gösterir.

### İsteğe bağlı HTTP/HTTPS site erişimi

Yalnızca kullanıcı eylemiyle ilgili protokol ve ana bilgisayar için istenir. Bir kullanım, seçilmiş sitede sayfa yüklenirken JS olay tanımlarını kaydetmektir; diğeri, incelenen sayfanın CSS/JS kaynak metnini kaynak sitesinden getirmektir. Kurulumda gerekli host izni veya otomatik tüm-site content script kaydı bulunmaz. Kullanıcı kalıcı izinleri kaldırabilir.

## Remote code

Hayır / No. All executable extension logic is included in the submitted package. Downloaded website JavaScript is displayed as plain text using textContent and is never evaluated, imported or injected as executable code. CSS text is parsed only to inspect rules.

## Veri kullanım beyanı için açıklama

İşlenen veriler: Website content (seçilen HTML/CSS, kaynak metinleri ve olay tanımları) ve Web history kapsamında incelenen etkin sayfanın/kaynakların URL'leri. Tam tarayıcı geçmişi alınmaz ve history API kullanılmaz. İşleme yereldir; geliştiriciye aktarım yoktur. Kullanıcı izin verirse kaynak dosyanın sunucusuna normal GET isteği yapılır.

Mağaza formundaki veri türlerini bu gerçek davranışla uyumlu doldurun; yalnızca sunucuya aktarım olmadığını gerekçe göstererek “hiçbir veri işlenmiyor” beyanında bulunmayın. Satış, reklam, ilgisiz kullanım ve kredi değerlendirmesi yapılmadığına ilişkin sertifikaları okuyup doğrulayın.

## Destek ve gizlilik adresleri

- Website: https://taxperia.github.io/css-js-inspector/
- Support: https://github.com/Taxperia/css-js-inspector/issues
- Privacy: https://taxperia.github.io/css-js-inspector/privacy.html
- Yedek herkese açık gizlilik bağlantısı: https://github.com/Taxperia/css-js-inspector/blob/main/privacy.html

## İncelemeci test talimatı (İngilizce)

No account, login, subscription or test credentials are required. Open https://taxperia.github.io/css-js-inspector/demo.html in a normal tab. Click the extension's toolbar action and select “Seçim Modu”. Click the sample card or button to view CSS/HTML data. For load-time JavaScript listeners, click “Bu sitede erken JS kaydını aç”, accept the permission for this host, and reload the demo page. Select the sample button again and open the “JS / Olaylar” tab. External resource actions request access only to the resource's host and retrieve text without credentials. “Verileri temizle” clears current inspection data; “Verilen site izinlerini kaldır” revokes persistent host grants. Reload open pages after disabling early recording or revoking access. Downloaded JavaScript is never executed.
