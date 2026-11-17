import type { Messages } from "@/locales/en"

export const tr: Messages = {
  "banked.available": "{count} kullanılabilir",
  "banked.expiresIn": "{count} sıfırlamanın süresi {time} sonra dolacak",
  "banked.unknownExpiry": "{count} sıfırlama: son kullanma tarihi bilinmiyor",
  "banked.kind.session": "5 saatlik sıfırlama",
  "banked.kind.weekly": "Haftalık sıfırlama",
  "banked.kind.fable": "Fable sıfırlaması",
  "banked.kind.full": "Tam sıfırlama",
  "banked.kind.any": "Sıfırlama",
  "banked.fableNote": "5 saatlik sınırı ve Fable sınırını sıfırlar. Haftalık sınıra yalnızca Fable'ın kullandığı kısım geri gelir.",
  "banked.openUsage": "Sıfırlama kullanmak için kullanım sayfasını aç",
  "banked.linkFailed": "Kullanım sayfası açılamadı. Tekrar deneyin.",
  "banked.alertTitle": "{provider}: sıfırlamaların süresi yakında doluyor",
  "banked.alertBody": "{count} sıfırlamanın süresi {time} sonra dolacak. Kullanmak için sağlayıcının kullanım sayfasını açın.",
  "app.minimize": "Bildirim alanına küçült",
  "app.close": "Kapat",
  "app.pin": "Üstte tut",
  "app.unpin": "Üstte tutmayı bırak",
  "tray.showStats": "İstatistikleri göster",
  "tray.goToSettings": "Ayarlar",
  "tray.debugLevel": "Günlük düzeyi",
  "tray.copyLogPath": "Günlük yolunu kopyala",
  "tray.about": "OpenTokenUsage hakkında",
  "tray.quit": "Çıkış",

  "nav.home": "Ana sayfa",
  "nav.help": "Yardım",
  "nav.settings": "Ayarlar",
  "nav.refreshUsage": "Kullanımı yenile",
  "nav.disablePlugin": "Eklentiyi devre dışı bırak",
  "nav.inspect": "Öğeyi incele",

  "footer.downloading": "Güncelleştirme indiriliyor: %{progress}",
  "footer.downloadingIndeterminate": "Güncelleştirme indiriliyor…",
  "footer.restartToUpdate": "Güncelleştirmek için yeniden başlat",
  "footer.installing": "Yükleniyor…",
  "footer.updatesSoon": "Güncelleştirme yakında",
  "footer.updateFailed": "Güncelleştirme başarısız oldu",
  "footer.updateCheckFailed": "Güncelleştirmeler denetlenemedi",
  "footer.updateDownloadFailed": "Güncelleştirme indirilemedi",
  "footer.updateInstallFailed": "Güncelleştirme yüklenemedi",
  "footer.refreshing": "Yenileniyor…",
  "footer.paused": "Duraklatıldı",
  "footer.nextUpdate": "Sonraki yenileme: {time} sonra",
  "footer.refreshNow": "Şimdi yenile",

  "duration.dh": "{d} g {h} sa",
  "duration.hm": "{h} sa {m} dk",
  "duration.ms": "{m} dk {s} sn",
  "duration.m": "{m} dk",
  "duration.s": "{s} sn",
  "duration.lt1m": "<1 dk",

  "settings.autoRefresh.title": "Otomatik yenileme",
  "settings.autoRefresh.desc": "Kullanım verilerinin alınma sıklığı",
  "settings.autoRefresh.minutes": "{n} dk",
  "settings.autoRefresh.smart": "Akıllı",
  "settings.autoRefresh.smartHint": "Kullanım değiştikten sonra 2 dakikada bir kontrol eder. Birkaç kontrol boyunca değişiklik olmazsa hesap başına kontrol aralığını 5, 10 ve ardından 15 dakikaya çıkarır.",
  "settings.autoRefresh.hour": "1 saat",
  "settings.usageMode.title": "Kullanım modu",
  "settings.usageMode.desc": "Kalan veya kullanılan miktarı göster",
  "settings.usageMode.left": "Kalan",
  "settings.usageMode.used": "Kullanılan",
  "settings.usageMode.workdays": "Haftalık tempo iş günlerine göre",
  "settings.usageMode.workdaysHint": "Yalnızca pazartesiden cumaya sayılır; sakin bir hafta sonu fazladan pay gibi görünmez.",
  "settings.currency.title": "Para birimi",
  "settings.currency.desc": "Maliyetleri girdiğiniz kurla başka bir para biriminde gösterir",
  "settings.currency.rate": "1 USD kaç {code}",
  "settings.currency.hint": "Kur internetten alınmaz: ara sıra güncelleyin. Sağlayıcılar ABD doları üzerinden ücretlendirir.",
  "settings.resetTimers.title": "Sıfırlanma zamanı",
  "settings.resetTimers.desc": "Geri sayım veya saat",
  "settings.resetTimers.relative": "Göreli",
  "settings.resetTimers.absolute": "Mutlak",
  "settings.resetTimers.todayAt": "bugün {time}",
  "settings.timeFormat.title": "Saat biçimi",
  "settings.timeFormat.desc": "12 saatlik veya 24 saatlik gösterim",
  "settings.timeFormat.auto": "Otomatik",
  "settings.timeFormat.12h": "12 saat",
  "settings.timeFormat.24h": "24 saat",
  "settings.tray.title": "Bildirim alanı simgesi",
  "settings.tray.desc": "Görev çubuğunda saatin yanında gösterilen",
  "settings.tray.icon": "Simge",
  "settings.tray.percent": "Yüzde",
  "settings.tray.bars": "Çubuklar",
  "settings.tray.numbers": "Sağlayıcı başına sayı",
  "settings.tray.logos": "Sağlayıcı başına logo",
  "settings.tray.logoColors": "Renkli logolar",
  "settings.strip.title": "Görev çubuğu şeridi (deneysel)",
  "settings.strip.desc": "Görev çubuğunda sağlayıcı logoları ile oturum ve haftalık kullanım.",

  "settings.widgets.title": "Masaüstü widget'ları",

  "settings.widgets.desc": "Masaüstünde istediğiniz yerde sağlayıcı logoları ile oturum ve haftalık kullanım.",

  "settings.stripLook.title": "Şerit ve widget görünümü",

  "settings.stripLook.desc": "Şeridin ve widget'ların ortak sağlayıcıları, yazı tipi ve renkleri.",

  "settings.categories": "Ayar kategorileri",


  "settings.strip.desktopEdgeSide": "Kenar",


  "settings.strip.desktopEdgeRight": "Sağ",


  "settings.strip.desktopEdgeLeft": "Sol",


  "settings.strip.desktopEdgeTop": "Üst",


  "settings.strip.desktopPinned": "Ekran kenarı şeridi açık kalsın (raptiye düğmesi de yapar)",


  "settings.strip.onlyWhileRunning": "Yalnızca bir yapay zekâ aracı çalışırken",


  "settings.strip.onlyWhileRunningHint": "Şeritteki sağlayıcıların uygulamalarından veya komut satırı araçlarından (Claude Code, Codex, …) hiçbiri çalışmıyorken şerit gizlenir.",


  "settings.strip.desktopSlide": "Ekran kenarı şeridi yumuşakça kayarak açılsın",


  "settings.strip.desktopSlideMs": "Kayma süresi",


  "settings.strip.desktopGradient": "Ekran kenarı şeridinde yumuşak renk geçişi",


  "whatsNew.title": "Yenilikler",


  "whatsNew.close": "Kapat",


  "whatsNew.video": "Bu sürümdeki yenilikleri gösteren kısa bir video",


  "settings.whatsNew.title": "Yenilikler",


  "settings.whatsNew.label": "Güncellemeden sonra yenilikleri göster",


  "settings.whatsNew.hint": "Güncellemeden sonra panel ilk açıldığında bir kez: sürüm notları ve güncelleme getirdiyse kısa bir video. Video, pencereyi kapattığında silinir.",


  "rate.perMinute": "{tokens}/dk",


  "settings.strip.tokenRate": "Dakikadaki canlı token (Claude, Codex), tepsi ipucunda da",


  "settings.strip.desktopEdge": "Ekran kenarı",


  "settings.strip.desktopEdgeHint": "Ekranın bir kenarına (sağ, sol veya üst) yerleşir, neredeyse görünmez; işaretçi gelince dışarı kayar.",


  "settings.cards.tokscale": "tokscale ile 30 kadar araç daha (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Açık kaynaklı tokscale'i bunx veya npx ile çalıştırır (bun ya da Node.js gerekir); tokscale kendini ve fiyat listesini indirir. Bu araçların yerel kayıtlarını en çok 30 dakikada bir okur.",


  "settings.balances.title": "Özel bakiyeler",


  "settings.balances.desc": "New API, One API, Sub2API ya da kendi uç noktanız: bakiyeleri Özel bakiyeler kartında",


  "settings.balances.name": "Ad",


  "settings.balances.preset": "Tür",


  "settings.balances.custom": "Özel uç nokta",


  "settings.balances.url": "Adres",


  "settings.balances.env": "Anahtarı tutan ortam değişkeni (OTU_…)",


  "settings.balances.userId": "Kullanıcı kimliği",


  "settings.balances.path": "Yol",


  "settings.balances.remaining": "Bakiye alanı",


  "settings.balances.used": "Kullanılan alanı",


  "settings.balances.total": "Toplam alanı",


  "settings.balances.divisor": "Bölen",


  "settings.balances.currency": "Para birimi",


  "settings.balances.auth": "Anahtar başlığı",


  "settings.balances.remove": "Kaldır",


  "settings.balances.add": "Bakiye ekle",


  "settings.balances.save": "Kaydet",


  "settings.balances.saved": "Kaydedildi. Görmek için Özel bakiyeler kartını açın.",


  "settings.balances.invalid": "Kaydedilmedi: adresi, değişken adını (OTU_ ile başlar, sonra A–Z, 0–9, _) ve yolları denetleyin.",


  "settings.balances.hint": "Anahtarın kendisi asla kaydedilmez: onu bir ortam değişkenine koyup değişkenin adını girin. Yollar yanıtın içini gösterir, örneğin data.balance.",


  "year.title": "Yıllık kullanım",


  "year.streak": "{days} günlük seri",


  "year.summary": "En uzun seri {longest} gün · {active} aktif gün · {tokens} token",


  "year.cell": "{date}: {tokens} token",


  "settings.cards.yearHeatmap": "Claude ve Codex ayrıntı sayfalarında serileriyle bir yıllık günlük kullanım",


  "settings.cards.keepUsage": "Kayıtları silinen kullanımı koru",


  "settings.cards.keepUsageHint": "Claude Code kayıtlarını varsayılan olarak 30 gün sonra siler. Her günün tokenleri uygulamanın veri klasöründe tutulur; yıllık görünüm ve dışa aktarma onları saymaya devam eder.",


  "settings.export.title": "Kullanım dışa aktarma",


  "settings.export.desc": "Günlük tokenler ve son limitler, İndirilenler klasörüne CSV ve JSON olarak",


  "settings.export.now": "Şimdi dışa aktar",


  "settings.export.done": "Kaydedildi: {path}",


  "settings.export.failed": "Dışa aktarma yazılamadı.",


  "settings.export.daily": "Her gün yeniden yaz",


  "card.sessions.cache": "önbellek {time}",


  "card.sessions.cacheHint": "Bu oturumun istem önbelleğinin kalan süresi. Süre dolunca sonraki istem tüm bağlamı yeniden gönderir ve limitten daha çok harcar.",


  "settings.cards.cacheTimer": "Claude oturumunun istem önbelleğinde kalan süre",


  "settings.cards.contextFill": "Her oturumun bağlam penceresinin doluluğu",


  "spend.planMultiple": "{name}: planının {times} katı",


  "spend.planMultipleHint": "API fiyatlarıyla 30 gün ({cost}), planın aylık fiyatının ({price}) {times} katı.",


  "settings.plans.title": "Abonelikler",


  "settings.plans.desc": "Her planın aylık fiyatı; API fiyatlarıyla kullanımıyla karşılaştırmak için",


  "settings.plans.multiple": "Harcama özetinde her planın kullanımını fiyatının katı olarak göster",


  "settings.plans.price": "{name}: aylık fiyat",


  "settings.claudeCode.retention": "Claude Code kayıtlarını sakla:",


  "settings.claudeCode.retentionDays": "{days} gün",


  "settings.claudeCode.retentionHint": "Claude Code başlarken daha eski konuşma kayıtlarını siler. Saat ızgarası, projeler ve harcama bu kayıtlardan okunur.",


  "settings.alerts.refills": "Bir limit sıfırlanmadan önce dolduğunda (sıfırlama hakkı veya kısmi dolma)",


  "settings.alerts.refillPoints": "En az",


  "settings.alerts.points": "{points} puan",


  "settings.strip.followDetail": "Ayrıntılı: her limit sıfırlanmaya kalan süresiyle",


  "settings.strip.activityDots": "Ajanı çalışırken (mavi) veya seni beklerken (sarı) logoda nokta",


  "settings.strip.desktopClickThroughKey": "Tıklamak veya sürüklemek için basılı tutulacak tuş",


  "settings.cards.title": "Kartlarda",


  "settings.cards.desc": "Genel bakışın limitler dışında gösterdikleri",


  "settings.cards.liveSessions": "Claude Code ve Codex kartlarında canlı oturumlar",


  "settings.cards.spend": "Kartların altında harcama özeti",


  "settings.cards.spendTools": "Bu araçların kendi kayıtlarını da say",


  "alert.refill.title": "{provider}: {label} erken doldu",


  "alert.refill.body": "%{percent} yeniden kullanılabilir.",


  "settings.strip.followActive": "Odaktaki uygulamayı izle",


  "settings.strip.followActiveHint": "Kullandığın penceredeki yapay zekâ aracı başa geçer.",


  "settings.strip.desktopClickThrough": "Tıklamalar arkadaki pencereye geçsin",


  "spend.title": "Harcama",


  "spend.today": "Bugün",


  "spend.yesterday": "Dün",


  "spend.month": "30 gün",


  "spend.cost": "Maliyet",


  "spend.tokens": "Token",


  "spend.models": "Modeller, son 30 gün (token'a göre)",


  "settings.strip.desktopCycle": "Sırayla",


  "settings.strip.desktopCycleHint": "Her sağlayıcıyı 8 saniye gösteren tek bir widget",


  "settings.theme.halloween": "Cadılar Bayramı",


  "settings.theme.glass": "Cam",


  "settings.theme.glassHint": "Panelin arkasındaki masaüstünü bulanıklaştırır (Windows 11)",


  "label.Installed models": "Yüklü modeller",


  "label.Loaded now": "Şu an bellekte",


  "label.Vouchers": "Kuponlar",


  "label.Cash": "Nakit",


  "label.Requests today": "Bugünkü istekler",


  "label.Requests this month": "Bu ayki istekler",


  "label.Models": "Modeller",


  "label.Token Plan usage": "Token Plan kullanımı",


  "card.customize": "Satırları özelleştir",


  "card.customizeHint": "Satırları sürükleyerek sıralayın, gerekmeyenleri gizleyin. Ctrl+Z geri alır, Esc kapatır.",


  "card.customizeMove": "{row} satırını taşı",


  "card.customizeShow": "{row} satırını göster",


  "card.customizeHide": "{row} satırını gizle",


  "card.customizeReset": "Varsayılana dön",


  "card.customizeDone": "Bitti",


  "weekDays.capacity": "Bu haftaki model karışımıyla limitin tamamı yaklaşık {tokens} token; API fiyatlarıyla {cost} değerinde.",


  "weekDays.capacityTokens": "Bu haftaki model karışımıyla limitin tamamı yaklaşık {tokens} token.",


  "card.copyImage": "Resim olarak kopyala",


  "card.imageCopied": "Panoya kopyalandı",


  "card.imageCopyFailed": "Resim kopyalanamadı",


  "settings.privacy.title": "Gizlilik",


  "settings.privacy.hideWhenSharing": "Ekran paylaşımında gizle",


  "settings.privacy.hideWhenSharingHint": "Panel ve masaüstü widget'ları ekran paylaşımlarında, kayıtlarda ve ekran görüntülerinde hiç görünmez; siz yine görürsünüz. Windows ekranın paylaşıldığını uygulamalara bildirmediği için bildirim alanındaki sayılar ve görev çubuğu şeridi yalnızca sunum yaparken veya biri bu bilgisayarı uzaktan yönetirken gizlenir.",


  "settings.backup.reset": "Tüm ayarları sıfırla",


  "settings.backup.resetHint": "Tüm tercihler varsayılanına döner. Sağlayıcılarınız, hesaplarınız ve proje bütçeleriniz kalır. Uygulama yeniden başlar.",


  "settings.backup.resetConfirm": "Sıfırla ve yeniden başlat",


  "settings.backup.resetCancel": "İptal",


  "settings.backup.resetError": "Ayarlar sıfırlanamadı.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Sağlayıcı, durum sayfası ve güncelleme isteklerini bir proxy sunucusu üzerinden gönderin.",


  "settings.proxy.enable": "Proxy kullan",


  "settings.proxy.url": "Proxy adresi",


  "settings.proxy.save": "Kaydet",


  "settings.proxy.saved": "Kaydedildi; bir sonraki istekten itibaren geçerli.",


  "settings.proxy.invalid": "Bu bir proxy adresi değil. Bir sunucu adıyla http://, https://, socks5:// veya socks5h:// kullanın, örneğin http://127.0.0.1:8080.",


  "settings.proxy.error": "Proxy kaydedilemedi.",


  "card.showUsed": "Kullanılanı göster",


  "card.showLeft": "Kalanı göster",

  "settings.category.usage": "Kullanım",

  "settings.category.taskbar": "Görev çubuğu ve masaüstü",

  "settings.category.appearance": "Görünüm",

  "settings.category.app": "Uygulama",
  "settings.strip.position": "Konum",
  "settings.strip.positionLeft": "Sol",
  "settings.strip.positionRight": "Sağ",

  "settings.strip.positionCenter": "Orta",
  "settings.strip.offset": "Boşluk (px)",
  "settings.strip.positionHint": "Sağ, tepsinin yanında durur. Diğer seçenek Windows'taki simge hizalamasına uyar: simgeler ortadaysa sol kenar, soldaysa görev çubuğunun ortası. Şerit Başlat'ın, uygulamaların ve Widget'ların üstüne binmez. Boşluk ekran ölçeğine göre ayarlanır.",
  "settings.strip.enable": "Görev çubuğunda göster",
  "settings.strip.enableHint": "Windows'ta bunun resmi bir yeri yok; bir güncelleme yerini kaydırabilir veya gizleyebilir. Açıkken bildirim alanında yalnızca uygulama simgesi kalır; başka bir simge stili seçmek şeridi kapatır.",
  "settings.strip.preview": "Önizleme",
  "settings.strip.providers": "Sağlayıcılar (en fazla {max})",
  "settings.strip.providersHint": "Göstermek için işaretleyin, sıralamak için sürükleyin. Bu sıra yalnızca şerit içindir.",
  "settings.strip.monitors": "Gösterileceği yer",
  "settings.strip.monitorsPrimary": "Ana görev çubuğu",
  "settings.strip.monitorsAll": "Tüm görev çubukları",
  "settings.strip.monitorsPick": "Monitör seçin",
  "settings.strip.monitorMain": "{name} (ana)",
  "settings.strip.monitorDisconnected": "{name} (bağlı değil)",
  "settings.strip.monitorNoTaskbar": "{name} (görev çubuğu yok)",
  "settings.strip.monitorsHint": "Şerit yalnızca görev çubuğu olan monitörlerde görünür: Windows'un görev çubuğu ayarlarında görev çubuğunu tüm ekranlarda göstermeyi açın.",
  "settings.accounts.title": "Ek hesaplar",
  "settings.accounts.desc": "İş ve kişisel gibi ikinci bir Claude ya da Codex girişini, her biri kendi kartında izleyin.",
  "settings.accounts.provider": "Sağlayıcı",
  "settings.accounts.label": "Hesap adı",
  "settings.accounts.labelPlaceholder": "İş, Kişisel…",
  "settings.accounts.add": "Ekle ve giriş yap",
  "settings.accounts.signIn": "Giriş yap",
  "settings.accounts.copyPath": "Klasör yolunu kopyala",
  "settings.accounts.remove": "Kaldır",
  "settings.accounts.confirmRemove": "Kaldırmak için tekrar tıklayın",
  "settings.accounts.addFailed": "Hesap eklenemedi.",
  "settings.accounts.hint": "Eklediğinizde bir terminal açılır ve bir kez giriş yaparsınız. Giriş, hesabın kendi klasöründe kalır; her zamanki girişinize dokunulmaz. Hesabı terminalde de kullanmak için CLAUDE_CONFIG_DIR ya da CODEX_HOME değişkenini o klasöre ayarlayın.",
  "settings.claudeCode.title": "Claude Code durum satırı",
  "settings.claudeCode.desc": "Claude Code kendi 5 saatlik ve haftalık kullanımını uygulamaya iletsin; Claude kartı Anthropic'e çok daha seyrek sorar ve hız sınırına daha az takılır.",
  "settings.claudeCode.label": "Claude Code'un durum satırını kullan",
  "settings.claudeCode.hint": "Claude'un settings.json dosyasına bir durum satırı komutu ekler; kapatınca kaldırır. Claude Code durum satırında bir şey göstermez ve kullanımını Windows ile gelen curl ile gönderir.",
  "settings.claudeCode.other": "Claude Code zaten size ait bir durum satırı çalıştırıyor. Ona dokunulmaz, bu yüzden bu ayar kapalı kalır.",
  "settings.claudeCode.unreadable": "Claude'un settings.json dosyası JSON olarak okunamadı, bu yüzden değiştirilmedi.",
  "settings.strip.lineMode": "{name} için gösterilen değerler",
  "settings.strip.lineBoth": "İkisi",
  "settings.strip.colorMode": "Kullanıma göre renklendir",
  "settings.strip.colorHeat": "Isı (sarı → turuncu → kırmızı)",
  "settings.strip.colorTraffic": "Trafik ışığı (yeşil → sarı → kırmızı)",
  "settings.strip.colorCool": "Serin (mavi → mor → kırmızı)",
  "settings.strip.colorMono": "Sade, yalnızca limite yakın kırmızı",

  "settings.strip.colorPace": "Tempoya göre",
  "settings.strip.colorThresholds": "Özel eşikler",
  "settings.strip.colorOff": "Kapalı",
  "settings.strip.drag": "{name} öğesini sürükle",
  "settings.strip.font": "Yazı tipi",
  "settings.strip.size": "Boyut",
  "settings.strip.bold": "Kalın",
  "settings.strip.showPercentSign": "% işaretini göster",
  "settings.strip.customTextColor": "Özel yazı rengi",
  "settings.strip.warnAt": "Uyarı eşiği",
  "settings.strip.criticalAt": "Kritik eşik",
  "settings.strip.usageColorsHint": "Limitin ne kadarının kullanıldığına göre.",
  "settings.strip.reset": "Görünümü sıfırla",
  "settings.strip.desktop": "Masaüstünde göster",
  "settings.strip.desktopHint": "İstediğiniz yere sürükleyebileceğiniz widget'lar; tıklayınca panel açılır, fareyle üstüne gelince limitlerin ne zaman sıfırlanacağı görünür. Artan bir sayı yanıp söner, sonra bir dakika vurgu renginde kalır. Tam ekran bir uygulama öndeyken gizlenirler. Aşağıdaki sağlayıcılar ve görünüm onlar için de geçerlidir.",
  "settings.strip.desktopLayout": "Widget'lar",
  "settings.strip.desktopRow": "Yan yana",

  "settings.strip.desktopColumn": "Alt alta",
  "settings.strip.desktopSeparate": "Ayrı",
  "settings.strip.desktopPlate": "Arka plan opaklığı",
  "settings.strip.desktopLogo": "Logolar",
  "settings.strip.desktopLogoBrand": "Renkli",
  "settings.strip.desktopLogoWhite": "Beyaz",
  "settings.strip.desktopLogoBlack": "Siyah",
  "settings.strip.desktopOnTop": "Her zaman üstte",
  "settings.strip.desktopSnap": "Ekran kenarlarına ve birbirine yapışsın",
  "settings.strip.desktopLocked": "Yerine kilitle (fare üstündeyken saydamlaşır)",

  "settings.strip.desktopBars": "Rakamların altında çubuk",
  "settings.tray.perProviderHint": "Bir ikon ^ altına düşerse, saatin yanında kalması için görev çubuğu ayarlarından açın.",
  "settings.tray.openTaskbarSettings": "Görev çubuğu ayarlarını aç",
  "settings.tray.provider": "Sağlayıcı",
  "settings.tray.metric": "Ölçüm",
  "settings.tray.color": "Renk",
  "settings.tray.colorTitle": "Bildirim alanı yüzde metni rengi",
  "settings.tray.paceColor": "Tempoya göre renklendir",
  "settings.tray.paceColorHint": "Yeşil: bol pay var. Sarı: tam hedefte. Kırmızı: sıfırlanmadan önce tükenecek.",
  "settings.tray.auto": "Otomatik",
  "settings.tray.tightest": "En çok kullanılan",
  "settings.theme.title": "Tema",
  "settings.theme.desc": "Koyu (tam siyah), açık veya Cadılar Bayramı",
  "settings.theme.light": "Açık",
  "settings.theme.dark": "Koyu",
  "settings.theme.darkHint": "Tam siyah, OLED ekranlar için ideal",
  "settings.language.title": "Dil",
  "settings.language.desc": "Uygulama metinlerinin dili",
  "settings.language.system": "Windows varsayılanı",
  "settings.shortcut.title": "Genel kısayol",
  "settings.shortcut.desc": "Paneli her yerden göster",
  "settings.shortcut.pressKeys": "Tuşlara basın…",
  "settings.shortcut.clickToSet": "Ayarlamak için tıklayın",
  "settings.shortcut.record": "Kısayolu kaydetmek için tuşlara basın",
  "settings.shortcut.clear": "Kısayolu temizle",
  "settings.shortcut.hint": "Kayıt sırasında temizlemek için Esc tuşuna basın.",
  "settings.startOnLogin.title": "Başlangıç",
  "settings.startOnLogin.desc": "Windows'ta oturum açıldığında OpenTokenUsage başlasın",
  "settings.startOnLogin.label": "Oturum açıldığında başlat",
  "settings.backup.title": "Ayar yedeği",
  "settings.backup.desc": "Tercihlerinizi başka bir bilgisayara taşıyın. Girişler ve hesaplar dahil değildir.",
  "settings.backup.export": "Dışa aktar",
  "settings.backup.import": "İçe aktar ve yeniden başlat",
  "settings.backup.saved": "Şuraya kaydedildi: {path}",
  "settings.backup.exportError": "Yedek kaydedilemedi.",
  "settings.backup.importError": "Dosya okunamadı.",
  "settings.backup.notBackup": "Bu bir OpenTokenUsage ayar yedeği değil.",
  "settings.alerts.title": "Bildirimler",
  "settings.alerts.desc": "Kullanım eşikleri, tüketim hızı, limit sıfırlamaları ve yedi gün veya 24 saat içinde süresi dolacak birikmiş sıfırlamalar",
  "settings.alerts.label": "Kullanım bildirimleri",
  "settings.panel.title": "Panel",
  "settings.panel.desc": "Panelin açıldığı yer. Başlık çubuğundaki raptiye paneli diğer pencerelerin üstünde tutar.",
  "settings.panel.remember": "Konumumu hatırla",
  "settings.panel.rememberHint": "Paneli başlık çubuğundan tutup istediğiniz yere sürükleyin; bir dahaki sefere görev çubuğunun üstü yerine aynı yerde açılır.",
  "settings.panel.navSide": "Sağlayıcı çubuğu",
  "settings.panel.navLeft": "Sol",
  "settings.panel.navRight": "Sağ",
  "settings.alerts.levels": "Bildirim seviyeleri",
  "settings.alerts.ticksHint": "Çubuklarda her seviye bir çentikle gösterilir.",
  "settings.alerts.perProvider": "Sağlayıcıya göre",
  "settings.alerts.sameAsAll": "Tüm sağlayıcılarla aynı",
  "settings.alerts.spikes": "Bir oturum her zamankinden çok daha hızlı token harcadığında (çoğu zaman döngüye takılmış bir ajan)",
  "settings.alerts.none": "yok",
  "settings.alerts.sound": "Ses",
  "settings.alerts.play": "Çal",
  "settings.alerts.chooseFile": "Kendi sesimi kullan…",
  "settings.alerts.fileHint": "MP3, WAV, OGG veya M4A. Daha uzun sesler {seconds} saniyede kesilir.",
  "settings.alerts.fileError": "Bu dosya çalınamıyor. MP3 veya WAV dosyası deneyin.",
  "settings.alerts.fileTooLarge": "Bu dosya {mb} MB'tan büyük. Daha kısa bir ses seçin.",
  "sound.windows": "Windows varsayılanı",
  "sound.chime": "Zil",
  "sound.glass": "Cam",
  "sound.steel": "Çelik davul",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Retro",
  "sound.two-tone": "İki ton",
  "sound.three-tone": "Üç ton",
  "sound.rise": "Yükseliş",
  "sound.none": "Ses yok",
  "sound.custom": "Benim sesim: {name}",
  "settings.plugins.title": "Sağlayıcılar",
  "settings.plugins.desc": "Sağlayıcıyı açmak için işaretleyin, sıralamak için sürükleyin. Göz simgesi, sağlayıcıyı saatin yanındaki bildirim alanı simgesinde gösterir veya gizler.",
  "settings.plugins.inTray": "Bildirim alanı simgesinde gösteriliyor. Oradan gizlemek için tıklayın (yan menüde kalır).",
  "settings.plugins.notInTray": "Bildirim alanı simgesinde gizli. Göstermek için tıklayın.",

  "overview.noProviders": "Etkin sağlayıcı yok",
  "status.minor": "Hizmette aksama",
  "status.major": "Kısmi kesinti",
  "status.critical": "Büyük kesinti",
  "status.maintenance": "Bakım",
  "status.open": "Durum sayfasını aç",

  "card.retry": "Yeniden dene",
  "error.runInTerminal": "{cmd} komutunu terminalde çalıştır",
  "error.envSteps": "Anahtarınızı API anahtarları butonundan kopyalayın, ardından Ortam Değişkenleri'ni açıp {name} adında bir kullanıcı değişkeni oluşturun ve anahtarı yapıştırın. Bir sonraki yenilemede algılanır.",
  "error.openEnvEditor": "Ortam Değişkenlerini aç",
  "card.updated": "Güncellendi: {time}",
  "card.justNow": "az önce",
  "card.minutesAgo": "{n} dk önce",
  "card.hoursAgo": "{n} sa önce",
  "card.daysAgo": "{n} g önce",
  "card.availableIn": "{time} sonra kullanılabilir",
  "card.limitReached": "Sınıra ulaşıldı",
  "card.valueLeft": "{value} kaldı",
  "card.percentCap": "Sınır: %{value}",
  "card.amountLimit": "Sınır: {value}",
  "card.sessions.title": "Canlı oturumlar",
  "card.sessions.busy": "Çalışıyor",
  "card.sessions.shell": "Komut çalıştırıyor",
  "card.sessions.idle": "Boşta",
  "card.sessions.waiting": "Seni bekliyor",
  "card.sessions.context": "Bağlam %{percent}",
  "card.sessions.compactSoon": "Yakında sıkıştırılacak",
  "detail.cost": "Maliyet",
  "detail.models": "Modeller",
  "heatmap.title": "Saate göre kullanım, son 4 hafta",
  "weekDays.title": "Günlere göre haftalık limit",
  "weekDays.day": "{day}: haftalık limitin yaklaşık {percent} kadarı",
  "weekDays.note": "Haftalık limitin şimdiye kadar kullanılan {percent} kısmı, her günün token maliyetine göre paylaştırıldı (yerel kayıtlardan).",
  "weekDays.loadFailed": "Günler okunamadı. Birkaç dakika içinde yeniden denenecek.",
  "heatmap.peak": "En yoğun: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} token",
  "heatmap.dayTotal": "{day}, 4 haftanın toplamı: {tokens} token",
  "heatmap.unreadable": "Okunamayan günlük dosyası: {count}",
  "projects.title": "Projeler",
  "projects.thisMonth": "Bu ay",
  "projects.lastMonth": "Geçen ay",
  "projects.weeklyLimit": "Haftalık limit",
  "projects.total": "Toplam",
  "projects.tokens": "{tokens} token",
  "projects.noBranch": "Dal yok",
  "projects.unknown": "Bilinmeyen klasör",
  "projects.more": "{count} tane daha göster",
  "projects.less": "Daha az göster",
  "projects.empty": "Bu ayda kullanım yok.",
  "projects.emptyWeek": "Bu haftalık limitte kullanım yok.",
  "projects.unattributed": "{cost} bir projeyle eşleşmedi.",
  "projects.apiPrices": "API liste fiyatlarıyla: bu kullanım API üzerinden ne tutardı; planınızın faturası değil.",
  "projects.unpriced": "Maliyet için bun veya Node.js (ccusage) gerekir; bu yüzden token gösteriliyor.",
  "projects.unpricedFailed": "ccusage bu ayı şu an fiyatlayamadı, bu yüzden token gösteriliyor; birkaç dakika içinde yeniden dener.",
  "projects.unpricedFailedWeek": "ccusage bu haftalık limiti şu an fiyatlayamadı, bu yüzden token gösteriliyor; birkaç dakika içinde yeniden dener.",
  "projects.loadFailed": "Projeler okunamadı. Birkaç dakika içinde yeniden denenecek.",
  "projects.forecast": "Bu hızla ay sonunda {cost}",
  "projects.budget": "Aylık bütçe",
  "projects.budgetSave": "Kaydet",
  "projects.budgetRemove": "Kaldır",
  "projects.budgetInvalid": "50 veya 1.250,50 gibi bir tutar yazın.",
  "projects.budgetUsed": "Bütçenin {percent} kadarı kullanıldı ({spent} / {budget})",
  "projects.export": "CSV olarak dışa aktar",
  "projects.saved": "Kaydedildi: {path}",
  "projects.exportFailed": "Dosya kaydedilemedi.",
  "projects.alert.title": "{project} bütçesi ({provider})",
  "projects.alert.body": "{budget} aylık bütçenin {percent} kadarı kullanıldı: şu ana kadar {spent}.",

  "pace.ahead": "Bol pay var",
  "pace.onTrack": "Tam hedefte",
  "pace.behind": "Tükenecek",
  "pace.limitIn": "Sınıra {time} kaldı",
  "pace.usedAtReset": "Sıfırlanırken %{percent} kullanılmış",
  "pace.leftAtReset": "Sıfırlanırken %{percent} kalmış",
  "pace.runsOutIn": "{time} sonra tükenir",
  "pace.short": "{value} eksik",
  "pace.deficit": "{value} fazla",
  "pace.markerHint": "Çizgi eşit kullanım temposunu gösterir: dönemin %{percent} kadarı geçti",

  "reset.soon": "Yakında sıfırlanır",
  "reset.in": "{time} sonra sıfırlanır",
  "reset.todayAt": "Sıfırlanma: bugün {time}",
  "reset.tomorrowAt": "Sıfırlanma: yarın {time}",
  "reset.onDateAt": "Sıfırlanma: {date} {time}",
  "alert.threshold.title": "{provider}: {label} %{percent} kullanıldı",
  "alert.threshold.left": "{provider}: {label} %{percent} kaldı",
  "alert.reset.title": "{provider}: {label} sıfırlandı",
  "alert.reset.body": "Limitiniz yeniden kullanılabilir.",
  "alert.pace.title": "{provider}: {label} tükenmek üzere",
  "alert.pace.body": "Bu tempoyla limit, sıfırlanmadan önce {time} içinde dolacak.",
  "alert.spike.title": "{provider}: {folder} hızla token harcıyor",
  "alert.spike.body": "Bir çeyrek saatte {tokens} token, olağanın {times} katı. Bir ajan döngüye mi takıldı?",
  "alert.update.title": "OpenTokenUsage {version} hazır",
  "alert.update.body": "Paneli açıp Güncelleştirmek için yeniden başlat butonuna basın.",
  "alert.signIn.title": "{provider}: yeniden giriş yapın",
  "alert.signIn.body": "Yeniden giriş yapana kadar kullanımı güncellenmez.",

  "sparkline.peak": "en yüksek {value}",
  "sparkline.summary": "{label}: {days} gün, son değer {latest} ({date}), en yüksek {peak}.",

  "about.viewChangelog": "Değişiklik günlüğünü görüntüle",
  "about.windowsPort": "Windows uyarlaması",
  "about.source": "Kaynak kod",
  "support.buyMeACoffee": "Bana bir kahve ısmarlayın",
  "support.navLabel": "OpenTokenUsage'ı destekleyin",
  "support.title": "OpenTokenUsage ücretsiz kalsın",
  "support.body": "OpenTokenUsage'da reklam, abonelik ve takip yok. Yeni sağlayıcıları, bir sağlayıcı API'sini değiştirdiğinde gelen düzeltmeleri ve her çeviriyi tek bir geliştirici yapıyor.",
  "support.ask": "Sizi bir kez bile beklenmedik bir limitten kurtardıysa, bir kahve en güzel teşekkür olur. Harcanan saatleri karşılar ve güncellemelerin sürmesini sağlar.",
  "support.later": "Belki sonra",
  "support.starAsk": "Ya da GitHub'da bir yıldız verin: ücretsiz ve uygulamayı başkalarının bulmasına yardım ediyor.",
  "star.title": "OpenTokenUsage'ı beğendiniz mi?",
  "star.body": "GitHub'da bir yıldız ücretsiz ve başkalarının da uygulamayı bulmasına yardım ediyor.",
  "star.button": "GitHub'da yıldız ver",
  "faq.title": "Sık sorulan sorular",
  "faq.notDetected.q": "Bir sağlayıcı algılanmadı diyor. Ne yapmalıyım?",
  "faq.notDetected.a": "OpenTokenUsage, sağlayıcının kendi uygulamasının veya CLI'ının bu bilgisayara kaydettiği oturumu okur. Orada oturum açın ya da kartta bir düğme görünüyorsa ona basın (oturum açma komutunu bir terminalde çalıştırır), ardından yenileyin.",
  "faq.refresh.q": "Kullanım ne sıklıkla yenileniyor?",
  "faq.refresh.a": "{settings} → {autoRefresh} bölümünden ayarlanır. {smart}, kullanım değiştikçe 2 dakikada bir (Claude'da 10 dakikada bir) bakar; değişmediğinde 15 dakikaya kadar yavaşlar. Sağ alttaki geri sayıma tıklamak hemen yeniler; elle yenilenen bir sağlayıcı bir sonrakine kadar 5 dakika bekler.",
  "faq.rateLimited.q": "Claude neden hız sınırına ulaşıldı diyor?",
  "faq.rateLimited.a": "Anthropic, oturum başına saatte yaklaşık 30 kullanım okumasına izin verir; bu hak Claude Code ve kullanımınızı gösteren diğer araçlarla paylaşılır. Hak bitince Anthropic bir saate kadar beklemeyi ister ve uygulama, yeniden başlatılsa bile buna uyar. Daha seyrek sormak için {settings} → {claudeCode} seçeneğini açın: Claude Code o zaman kendi kullanımını uygulamaya iletir.",
  "faq.accounts.q": "İkinci bir Claude veya Codex hesabını izleyebilir miyim?",
  "faq.accounts.a": "Evet: {settings} → {accounts} bölümü, kendi oturumu ve kartı olan bir hesap ekler. Çalışan bir WSL dağıtımındaki farklı bir oturum da sonu “· WSL” ile biten kendi kartını alır.",
  "faq.taskbar.q": "Paneli açmadan kullanımı görebilir miyim?",
  "faq.taskbar.a": "Evet. {settings} → {tray}, saatin yanında her sağlayıcı için bir sayı veya logo gösterebilir; {strip} oturum ve haftalık kullanımı doğrudan görev çubuğuna koyar; {alerts} ise seçtiğiniz seviyelerde sizi uyarır.",
  "faq.privacy.q": "Verilerim bu bilgisayardan çıkıyor mu?",
  "faq.privacy.a": "Telemetri, analiz veya uygulamaya ait bir sunucu yok. Uygulama, kullandığınız sağlayıcılarla bu bilgisayarda zaten bulunan oturumla, onların durum sayfalarıyla ve güncellemeler için GitHub ile konuşur. Ayarlar ve önbellekteki kullanım bu bilgisayarda kalır.",
  "faq.update.q": "Nasıl güncellerim?",
  "faq.update.a": "Uygulama 15 dakikada bir kontrol eder ve yeni sürümü kendisi indirir. Hazır olduğunda bir bildirim gelir ve sol altta “{restart}” görünür. WinGet ile: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "Cevabınızı bulamadınız mı? GitHub'da sorun",
  "changelog.title": "Sürüm notları",
  "changelog.back": "Geri",
  "changelog.loading": "Sürüm bilgileri alınıyor…",
  "changelog.failed": "Sürüm notları yüklenemedi",
  "changelog.failedHint": "İnternet bağlantınızı kontrol edin veya birkaç dakika sonra yeniden deneyin.",
  "changelog.tryAgain": "Yeniden dene",
  "changelog.releasedOn": "Yayımlanma tarihi: {date}",
  "changelog.unpublished": "Yayımlanmamış sürüm",
  "changelog.olderVersions": "Eski sürümleri mi arıyorsunuz?",
  "changelog.fullChangelog": "Tüm değişiklik günlüğünü görün",
  "changelog.noNotes": "v{version} için sürüm notu yok",
  "changelog.noNotesHint": "Bu bir ön sürüm veya yerel derleme olabilir.",
  "changelog.viewAll": "Tüm sürümleri GitHub'da görüntüle",

  "label.Session": "Oturum",
  "label.Weekly": "Haftalık",
  "label.Claude Weekly": "Claude haftalık",
  "label.Argon Weekly": "Argon haftalık",
  "label.Monthly": "Aylık",
  "label.Today": "Bugün",
  "label.Yesterday": "Dün",
  "label.Last 30 Days": "Son 30 gün",
  "label.Cache Hit Rate": "Önbellek isabet oranı",
  "label.Credits": "Krediler",
  "label.Balance": "Bakiye",
  "label.Status": "Durum",
  "label.API keys": "API anahtarları",
  "label.Dashboard": "Panel",
  "label.Usage dashboard": "Kullanım paneli",
  "label.Usage Trend": "Kullanım eğilimi",
  "label.Rate Limit Resets": "Sınır sıfırlama hakları",
  "label.Extra usage spent": "Harcanan ek kullanım",
  "label.Reviews": "İncelemeler",
  "label.Requests": "İstekler",
  "label.Total usage": "Toplam kullanım",
  "label.Auto usage": "Otomatik kullanım",
  "label.API usage": "API kullanımı",
  "label.On-demand": "İsteğe bağlı",
}
