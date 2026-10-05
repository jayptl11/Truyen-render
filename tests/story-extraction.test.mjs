import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
const bundle = buildSync({ entryPoints: ['src/services/storySources/client.ts'], bundle: true, format: 'iife', globalName: 'Source', write: false }).outputFiles[0].text;
const bookBundle = buildSync({ entryPoints: ['src/services/storySources/books.ts'], bundle: true, format: 'iife', globalName: 'Books', write: false }).outputFiles[0].text;
function environment() {
  const dom = new JSDOM('', { url: 'https://reader.example', runScripts: 'outside-only' });
  dom.window.eval(bundle); dom.window.eval(bookBundle);
  dom.window.AbortSignal = AbortSignal; dom.window.AbortController = AbortController;
  return dom;
}
const source = 'https://mtruyen.net/truyen/tien-nghich/chuong-1';
const prose = 'Người lữ khách bước qua cổng làng. Hắn nhìn về phía ngọn núi xa, nơi ánh nắng đang lên.\nMột người bạn cũ đứng đợi bên đường. Hai người cùng mở cuốn sách và đọc tiếp câu chuyện còn dang dở.';
test('multiple HTML layouts preserve paragraphs and exclude ads, hidden bait and navigation', () => {
  const dom = environment();
  try {
    for (const [tag, attrs, url] of [
      ['div', 'id="chapter_content"', source],
      ['div', 'id="content-chapter"', source],
      ['div', 'class="truyen-content"', source],
      ['div', 'class="chapter-c"', 'https://truyenfull.io/tien-nghich/chuong-1/'],
      ['div', 'id="inner_chap_content_1"', 'https://truyenyy.com/truyen/tien-nghich/chuong-1/'],
      ['div', 'class="box-chap"', 'https://truyen.tangthuvien.vn/doc-truyen/tien-nghich/chuong-1'],
      ['article', 'itemprop="articleBody"', 'https://different.example/book/chapter-1.html'],
    ]) {
      const html = `<h2 class="chapter-title">Chương 1: Xa nhà</h2><${tag} ${attrs}><p>${prose.split('\n')[0]}</p><p>${prose.split('\n')[1]}</p><div class="ads-responsive">Quảng cáo</div><div style="font-size: 0px;">Văn bản ẩn</div><nav>Menu</nav><script>window.bad = 1</script></${tag}>`;
      const result = dom.window.Source.parseStoryHtml(html, url);
      assert.equal(result.content, `Chương 1: Xa nhà\n\n${prose}`); assert.equal(dom.window.bad, undefined);
    }
  } finally { dom.window.close(); }
});
test('chooses the actual story instead of the first matching menu or an empty container', () => {
  const dom = environment();
  try {
    const html = `<h1>Chương 1</h1><div id="chapter-content"></div><div class="reading-content"><a href="/a">Menu một</a><a href="/b">Menu hai</a><a href="/c">Menu ba</a></div><div class="chapter-body"><p>${prose}</p></div><div id="content"><p>Giới thiệu website.</p></div>`;
    assert.equal(dom.window.Source.parseStoryHtml(html, source).content, `Chương 1\n\n${prose}`);
    assert.throws(() => dom.window.Source.parseStoryHtml('<main><a href="/">Menu</a></main>', source), /Không tìm thấy nội dung/);
  } finally { dom.window.close(); }
});
test('generic article extraction works on unregistered websites and avoids link-dense menus', () => {
  const dom = environment();
  try {
    const html = `<h1>Chương 1</h1><main><div class="content"><ul>${Array.from({ length: 8 }, (_, n) => `<li><a href="/other/${n}">Menu và truyện đề xuất ${n}</a></li>`).join('')}</ul><article><p>${prose}</p><p>${prose}</p></article><aside>Nội dung đề xuất</aside></div></main>`;
    const content = dom.window.Source.parseStoryHtml(html, 'https://unregistered.example/book/chapter-1').content;
    assert.match(content, /Người lữ khách/); assert.ok(!/Menu|đề xuất/.test(content));
  } finally { dom.window.close(); }
});
test('chapter navigation ignores disabled/self/foreign links and uses attributes or catalog neighbors', () => {
  const dom = environment();
  try {
    const html = `<h1>Chương 1</h1><div class="chapter-content">${prose}</div><a rel="next" href="#">Chương sau</a><a rel="next" href="${source}">Chương sau</a><a href="https://ads.example/chuong-2">Chương sau</a><a href="/truyen/another/chuong-2">Chương sau</a><a class="disabled" href="chuong-0">Chương trước</a><a aria-label="Chương tiếp theo" href="chuong-2">Tiếp</a>`;
    const result = dom.window.Source.parseStoryHtml(html, source);
    assert.equal(result.nextUrl, 'https://mtruyen.net/truyen/tien-nghich/chuong-2'); assert.equal(result.prevUrl, null);
    const catalog = `<div class="chapter-content">${prose}</div><div class="chapter-list"><a href="chuong-1">Chương 1</a><a href="chuong-2">Chương 2</a><a href="chuong-3">Chương 3</a></div>`;
    const middle = dom.window.Source.parseStoryHtml(catalog, source.replace('chuong-1', 'chuong-2'));
    assert.equal(middle.prevUrl, source); assert.equal(middle.nextUrl, source.replace('chuong-1', 'chuong-3'));
  } finally { dom.window.close(); }
});
test('reads public embedded chapter JSON and JSON-LD without evaluating JavaScript or using book summaries', () => {
  const dom = environment();
  try {
    const data = { props: { pageProps: { book: { content: 'Mô tả truyện' }, chapter: { title: 'Chương 1: Xa nhà', content: `<p>${prose}</p><script>window.bad = 1</script>`, nextChapter: { url: 'chuong-2' }, prevUrl: 'https://ads.example/link' } } } };
    const html = `<div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data).replace(/<\//g, '<\\/')}</script>`;
    assert.equal(dom.window.Source.parseStoryHtml(html, source).content, `Chương 1: Xa nhà\n\n${prose}`);
    assert.equal(dom.window.Source.parseStoryHtml(html, source).nextUrl, source.replace('chuong-1', 'chuong-2'));
    assert.equal(dom.window.Source.parseStoryHtml(html, source).prevUrl, null);
    const ld = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Chapter', name: 'Chương 1', text: prose })}</script>`;
    assert.equal(dom.window.Source.parseStoryHtml(ld, source).content, `Chương 1\n\n${prose}`); assert.equal(dom.window.bad, undefined);
    assert.throws(() => dom.window.Source.parseStoryHtml('<div id="__next"></div><script type="application/json">{"book":{"content":"Mô tả"}}</script>', source), error => error.code === 'SOURCE_DYNAMIC');
    assert.throws(() => dom.window.Source.parseStoryHtml('<div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{"chapters":[{"title":"Chương khác","content":"Đây là chương khác trong mục lục"}]}</script>', source), error => error.code === 'SOURCE_DYNAMIC');
  } finally { dom.window.close(); }
});
test('reports challenge, login and client-only pages distinctly instead of reading their prompts', () => {
  const dom = environment();
  try {
    for (const [html, code] of [['<title>Just a moment...</title><form id="challenge-form"></form>', 'SOURCE_BLOCKED'], ['<h1>Đăng nhập để đọc chương</h1><form><input type="password"></form>', 'SOURCE_LOGIN_REQUIRED'], ['<div class="chapter-content">Đăng nhập để đọc chương.</div>', 'SOURCE_LOGIN_REQUIRED'], ['<div id="app"></div><script src="/client.js"></script>', 'SOURCE_DYNAMIC']]) {
      assert.throws(() => dom.window.Source.parseStoryHtml(html, source), error => error.code === code);
    }
  } finally { dom.window.close(); }
});
test('multi-site catalogs group chapters by book, skip recommendation links and keep pagination', () => {
  const dom = environment();
  try {
    const url = 'https://mtruyen.net/truyen/tien-nghich';
    const html = `<link rel="canonical" href="${url}"><h1>Tiên Nghịch</h1><a itemprop="author">Nhĩ Căn</a><div class="desc-text">Giới thiệu truyện.</div><section class="custom-list"><a href="${url}/chuong-1">Chương 1: Xa nhà</a><a href="${url}/chuong-2">Chương 2: Bắt đầu</a><a href="/truyen/other/chuong-1">Chương 1 truyện khác</a><a href="https://other.example/chuong-3">Chương 3</a></section><div class="pagination"><a rel="next" href="?page=2">Tiếp</a></div>`;
    const book = dom.window.Books.parseBook(html, url);
    assert.equal(book.id, `${url}/`); assert.equal(book.catalogUrl, url); assert.equal(book.author, 'Nhĩ Căn'); assert.equal(book.chapters.length, 2);
    assert.equal(book.catalogNext, `${url}?page=2`); assert.equal(book.description, 'Giới thiệu truyện.');
    const chapter = { url: source, title: 'Chương 1', content: prose, webName: 'mtruyen.net', timestamp: 1 };
    assert.equal(dom.window.Books.bookId(chapter), book.id); assert.equal(dom.window.Books.localBooks([chapter, { ...chapter, url: source.replace('chuong-1', 'chuong-2') }], []).length, 1);
    const legacy = { ...book, id: url };
    assert.equal(dom.window.Books.localBooks([chapter], [legacy]).length, 1);
    assert.equal(dom.window.Books.mergeCatalog(legacy, book).id, legacy.id);
    const options = `<h1>Tiên Nghịch</h1><select id="chapter"><option value="1">Chương 1</option><option value="${url}/chuong-1">Chương 1</option></select>`;
    assert.equal(dom.window.Books.parseBook(options, url).chapters.length, 1);
  } finally { dom.window.close(); }
});
test('query-based chapter links keep book identity and catalog refresh preserves the original URL', () => {
  const dom = environment();
  try {
    const url = 'https://legacy.example/read.php?book=119';
    const html = `<h1>Truyện cũ</h1><a href="?book=119&chapter=1">Chương 1</a><a href="?book=119&chapter=2">Chương 2</a><a href="?book=120&chapter=1">Chương 1 truyện khác</a>`;
    const book = dom.window.Books.parseBook(html, url);
    assert.equal(book.id, url); assert.equal(book.catalogUrl, url); assert.equal(book.chapters.length, 2);
    assert.equal(dom.window.Books.bookId({ url: `${url}&chapter=1` }), url);
    const chapter = dom.window.Source.parseStoryHtml(`<div class="chapter-content">${prose}</div><a rel="next" href="?book=120&chapter=2">Chương sai</a><a href="?book=119&chapter=2">Chương sau</a>`, `${url}&chapter=1`);
    assert.equal(chapter.nextUrl, `${url}&chapter=2`);
  } finally { dom.window.close(); }
});
test('transport stops on invalid/private sources and access challenges without sending links to fallback proxies', async () => {
  const dom = environment();
  try {
    let calls = 0;
    dom.window.fetch = async () => { calls++; return new Response(JSON.stringify({ error: 'Địa chỉ không hợp lệ', code: 'INVALID_URL' }), { status: 400 }); };
    await assert.rejects(dom.window.Source.fetchRawStoryData('http://127.0.0.1/'), error => error.code === 'INVALID_URL'); assert.equal(calls, 1);
    dom.window.fetch = async () => { calls++; return new Response(JSON.stringify({ html: '<title>Just a moment...</title><div id="challenge-form"></div>', sourceUrl: source })); };
    await assert.rejects(dom.window.Source.fetchRawStoryData(source), error => error.code === 'SOURCE_BLOCKED'); assert.equal(calls, 2);
  } finally { dom.window.close(); }
});
