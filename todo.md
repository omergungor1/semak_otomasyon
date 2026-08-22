@src/components/sync-panel.js:360-371 ürünleri senkronize et butonu ile ürün detay sayfasını tararken kategori bilgisini de çekelceğiz. 



shopify_categories
| id | name                   | parent_id | shopify_collection_id |
| -: | ---------------------- | --------: | --------------------- |
|  1 | Bahçe                  |      null | gid://...             |
|  2 | Motorlu Tırpanlar      |         1 | gid://...             |
|  3 | Çim Biçme Makineleri   |         1 | gid://...             |
|  4 | İlaçlama Makineleri    |         1 | gid://...             |
|  5 | Manuel Pülverizatörler |         4 | gid://...             |
|  6 | Budama                 |         1 | gid://...             |
|  7 | Budama Testereleri     |         6 | gid://...             |


-> shopify_categories isimli bir tablo ekleyelim. Bu tabloda çektiğimiz ürünlerin collection-kategori bilgisi yer alacak. Kategori çekince bakacaksın shopify_categories tablosunda var mı -> yoksa ekleyeceksin -> ürüne ilgili kategori id sini vereceksin. 


Kategori yönetimini Shopify entegrasyonu ekliyoruz daha sonra önce kategori sonra da ürünleri shopify insert edeceğiz. 


Ana sayfaya kategori listesi için bir panel ekle -> Açılan panelde shopifydaki kategorileri çekelim ve gösterelim. Bizdeki kategorikler eksik ise bunları da shopify kategori ekle ile bir ekleme butonu koyalım. Yeni kategori gelmişse onları da zaman içinde shopify ekleyeceğiz. 


Önce ürün taradığımız ekranda ürün detay sayfasında şu element var: 
<div class="row">
                <div class="col-md-12">
                    <nav aria-label="breadcrumb">
                        <ol class="breadcrumb">
                            <li class="breadcrumb-item"><a href="https://www.semak.com.tr">Anasayfa</a></li>
                                                            <li class="breadcrumb-item"><a href="https://www.semak.com.tr/dimartino-010">DIMARTINO</a>
                                </li>
                            
                                                            <li class="breadcrumb-item"><a href="https://www.semak.com.tr/ilaclama-makinesi-pompasi?Stock=1">İLAÇLAMA MAKİNESİ &amp; POMPASI</a>
                                </li>
                                                            <li class="breadcrumb-item"><a href="https://www.semak.com.tr/ilaclama-makinesi-pompasi-manuel?Stock=1">MANUEL</a>
                                </li>
                                                            <li class="breadcrumb-item"><a href="https://www.semak.com.tr/ilaclama-makinesi-pompasi-manuel-pulverizator?Stock=1">PÜLVERİZATÖR</a>
                                </li>
                                                        <li class="breadcrumb-item active" aria-current="page">EL POMPASI 2lt EVA</li>
                        </ol>
                    </nav>
                </div>
            </div>

            -> bu ürünün kategori bilgisini tutuyor. @src/components/sync-panel.js:370  butonuna basınca ürünlerin kategorilerini de çekip kategori tablomuzu güncellemen gerekiyor. Önceki ekli kategorileri bozmadan yapalım çünkü bunları shopify entegre edince idlerin uyuşması lazım tekrar tekrar bozmamamız gerekiyor. 


            Shopify kategori yönetimini otomatik yapacak bir sistem geliştiriyorum. Sadece `shopify_categories` tablosunu kullanacağız. Gereksiz kategori/collection oluşturulmamalı ve aynı kategori farklı yazım/karakter farkları nedeniyle tekrar eklenmemeli.

Kategori yolu örneği:

`Anasayfa > MARKA > KATEGORİ_1 > KATEGORİ_2 > KATEGORİ_3 > ÜRÜN_ADI`

Kurallar:

1. İlk iki bölüm her zaman ignore edilecek:

   * `Anasayfa`
   * Marka

2. Son bölüm her zaman ürün adı kabul edilecek ve ignore edilecek.

3. Geriye kalan kategorilerden:

   * İlk kalan kategori = `ana_kategori`
   * Sonraki tüm kategoriler varsa birleştirilerek = `alt_kategori`

Örnek:

`Anasayfa > VETA > İLAÇLAMA MAKİNESİ & POMPASI > MANUEL > PÜLVERİZATÖR > VETA2B KOLLU POMPA 2LT`

Sonuç:

`ana_kategori = İLAÇLAMA MAKİNESİ & POMPASI`

`alt_kategori = MANUEL PÜLVERİZATÖR`

Başka örnek:

`Anasayfa > PALMERA > BUDAMA GRUBU > BUDAMA TESTERESİ > ÜRÜN`

Sonuç:

`ana_kategori = BUDAMA GRUBU`

`alt_kategori = BUDAMA TESTERESİ`

Eğer yalnızca tek kategori kalıyorsa:

`Anasayfa > GF > HORTUM ADAPTÖRLERİ > ÜRÜN`

Sonuç:

`ana_kategori = HORTUM ADAPTÖRLERİ`

`alt_kategori = NULL`

Birleştirme sırasında kategori isimleri normalize edilmelidir. Büyük/küçük harf, Türkçe karakter, fazla boşluk, gereksiz noktalama ve benzeri küçük yazım farklılıkları aynı kategori olarak kabul edilmelidir.

Örneğin:

* `PÜLVERİZATÖR`
* `Pülverizatör`
* `pülverizatör`
* `PÜLVERİZATÖR `
* `PÜLVERİZATÖR  `

aynı kategori kabul edilmeli ve Shopify'da ikinci bir Collection oluşturulmamalıdır.

Aynı şekilde:

* `İLAÇLAMA MAKİNESİ & POMPASI`
* `İlaçlama Makinesi & Pompasi`
* `İLAÇLAMA MAKİNESİ & POMPASI `

gibi varyasyonlar mümkün olduğunca aynı kategoriye normalize edilmelidir.

`shopify_categories` tablosunda her kategori için benzersiz bir kayıt tutulmalıdır. Kategorinin Shopify Collection ID'si de aynı kayıtta saklanmalıdır.

Önerilen mantık:

1. Kaynak kategori yolunu parçala.
2. İlk iki bölümü ve son bölümü çıkar.
3. Kalan ilk bölümü ana kategori olarak belirle.
4. Kalan diğer bölümleri sıralarını koruyarak tek bir alt kategori adı haline getir.
5. Kategori isimlerini karşılaştırmadan önce normalize et.
6. `shopify_categories` tablosunda normalize edilmiş isim/path üzerinden mevcut kategori ara.
7. Varsa mevcut kaydın `shopify_collection_id` değerini kullan.
8. Yoksa Shopify'da yeni Collection oluştur.
9. Oluşturulan Collection ID'yi `shopify_categories` tablosuna kaydet.
10. Aynı kategori daha sonra başka bir ürünle geldiğinde kesinlikle yeni Collection oluşturma; mevcut kaydı ve Shopify Collection ID'sini kullan.
11. Veritabanı seviyesinde de mümkün olduğunca unique constraint kullanarak aynı kategori kaydının yarış durumlarında iki kez oluşmasını engelle.

Kategori kimliği sadece kategori adından değil, mümkünse kategori yolundan oluşturulmalıdır.

Örneğin:

`İLAÇLAMA MAKİNELERİ > MANUEL PÜLVERİZATÖRLER`

ile

`HORTUM ADAPTÖRLERİ > MANUEL PÜLVERİZATÖRLER`

aynı alt kategori adına sahip olsa bile farklı ana kategorilerin altında oldukları için farklı kategori kayıtlarıdır.

Bu nedenle benzersiz anahtar mantığı:

`normalize(ana_kategori) + "|" + normalize(alt_kategori)`

şeklinde olmalıdır.

Önemli: Aynı kategori mevcutsa Shopify API'ye tekrar `collectionCreate` isteği gönderme. Önce `shopify_categories` tablosunda ara ve mevcut `shopify_collection_id` değerini kullan. Böylece her kategori için tek bir Shopify Collection ID'si olur ve ürünler her zaman doğru Collection'a bağlanır.



Shopify için iki yeni key ekledim env.locale dosyasına -> SHOPIFY_CLIENT_ID , SHOPIFY_CLIENT_SECRET

Ana sayfaya shopify kategorileri çeken ve listeleyen bir buton ve modal ekleyelim. Daha sonra kategori insert etme özelliği de ekleyeceğiz. gerekli güncellemeyi yap