https://www.semak.com.tr/Products?Type=Products&Stock=1 -> semak ürünler sayfasını scrape edeceğiz. pagination var -> 


<div class="row">
<div class="col-12">
<nav aria-label="Page navigation semak-pagination">
<nav>
<ul class="pagination">

<li class="page-item">
<a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=6" rel="prev" aria-label="« Önceki">‹</a>
</li>

            



    <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=1">1</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=2">2</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=3">3</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=4">4</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=5">5</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=6">6</a></li>
            <li class="page-item active" aria-current="page"><span class="page-link">7</span></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=8">8</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=9">9</a></li>
            <li class="page-item"><a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=10">10</a></li>


<li class="page-item">
<a class="page-link" href="https://www.semak.com.tr/Products?Type=Products&amp;Stock=1&amp;page=8" rel="next" aria-label="Sonraki »">›</a>
</li>
</ul>
</nav>

</nav>
</div>


</div>


-> Kaç sayfa var ise tümünü çekmeliyiz. Bir senkroniz et butonu ekleyelim. Gelen bilgileri kontrol edelim. Robot musun kontrolü yok sanırım. Doğruca çekebilirsin ancak pagination var. YTüm sayfaları tek tek çekebilmelisin. İlerleyişi admin ekranında gösterelim bir progress bar ile. Güzel anlaşılır ve modern bir tasarım kullanalım. 

Örnek bir ürün kartı: 
<div class="col-md-4 col-6">
<div class="product-item">
<div class="product-item-title">
<a href="https://www.semak.com.tr/112018-wb507sc-v-eur5-cim-bicme-makinesi-saft-akloncin">WB507SC V EUR5 ÇİM BİÇME MAKİNESİ ŞAFT AK.LONCIN</a>
</div>
<div class="product-item-image">
<a href="https://www.semak.com.tr/112018-wb507sc-v-eur5-cim-bicme-makinesi-saft-akloncin">
<div class="lazy-image-wrapper loaded">
<div class="lazy-spinner"></div>
<img data-src="https://semak.ams3.digitaloceanspaces.com/Semak/Product_cwhelmdWJ8.jpg" class="img-fluid lazy-image loaded" alt="112018 WB507SC V EUR5 ÇİM BİÇME MAKİNESİ ŞAFT AK.LONCIN" src="https://semak.ams3.digitaloceanspaces.com/Semak/Product_cwhelmdWJ8.jpg">
</div>
</a>
</div>
<div class="product-item-campaigns d-flex justify-content-center">
</div>

<div class="product-item-description">
<div class="product-item-brand">

WEIBANG

</div>
<div class="product-item-code">SMK Kodu :
<span>112018</span>
</div>
<div class="product-item-code">Malzeme Kodu :
<span>WB507SC V</span>
</div>


</div>
<div class="product-item-price-holder d-flex justify-content-center">


<div class="product-item-add-basket justify-content-between">
<a href="https://www.semak.com.tr/112018-wb507sc-v-eur5-cim-bicme-makinesi-saft-akloncin" class="btn btn-semak">
Detay
</a>

</div>

</div>

</div>
</div>


--> class="product-holder product-grid-view active" içinde class="row" içinde tüm ürün listesi var. 


omergungorco@gmail.com
omergungorco.123