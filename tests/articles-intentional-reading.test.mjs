import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function loadApp(initialStorage = {}) {
    const storage = new Map(Object.entries(initialStorage));
    const document = {
        addEventListener() {},
        createElement() {
            let html = '';
            return {
                set textContent(value) {
                    html = String(value ?? '')
                        .replaceAll('&', '&amp;')
                        .replaceAll('<', '&lt;')
                        .replaceAll('>', '&gt;')
                        .replaceAll('"', '&quot;')
                        .replaceAll("'", '&#39;');
                },
                get innerHTML() {
                    return html;
                }
            };
        }
    };
    const localStorage = {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        },
        removeItem(key) {
            storage.delete(key);
        }
    };
    const context = vm.createContext({ console, Date, document, localStorage, Set, URL, window: {} });
    vm.runInContext(`${source}\n;globalThis.FeedSieveForTest = FeedSieve;`, context);

    const app = Object.create(context.FeedSieveForTest.prototype);
    app.filteredItems = [];
    app.previouslySeenIds = new Set();
    app.sessionSeenIds = new Set();
    return { app, storage };
}

function article(id, overrides = {}) {
    return {
        id,
        title: `Article ${id}`,
        summary: `Summary for article ${id}.`,
        rating: 88,
        rating_reason: `Article ${id} earned its place because it contains concrete, useful detail.`,
        source_name: 'Selected source',
        source_type: 'rss',
        published_at: '2026-08-18T03:30:00Z',
        original_url: `https://example.com/${id}`,
        labels: ['Tech'],
        ...overrides
    };
}

test('builds one finite review without dropping filtered articles and places prior items below the boundary', () => {
    const { app } = loadApp();
    app.filteredItems = [article(1), article(2), article(3)];
    app.previouslySeenIds = new Set(['2']);

    const review = app.buildArticleReview();

    assert.deepEqual(Array.from(review.newItems, item => item.id), [1, 3]);
    assert.deepEqual(Array.from(review.seenItems, item => item.id), [2]);
    assert.deepEqual(Array.from(review.items, item => item.id), [1, 3, 2]);
    assert.equal(review.items.length, app.filteredItems.length);
});

test('renders a known inventory, a real history boundary, and an honest terminal state without a completion counter', () => {
    const { app } = loadApp();
    app.filteredItems = [article(1), article(2), article(3)];
    app.previouslySeenIds = new Set(['2']);

    const markup = app.articleReviewMarkup(app.buildArticleReview());

    assert.match(markup, /3 things worth a deliberate look/);
    assert.match(markup, /2 not seen here before/);
    assert.match(markup, /Previously seen below/);
    assert.match(markup, /You reached the end of this review/);
    assert.match(markup, /Nothing else loads after the final item/);
    assert.match(markup, /Open a source when it earns your attention/);
    assert.doesNotMatch(markup, /\d+ of \d+ considered/);
    assert.doesNotMatch(markup, /\bSave\b/);
    assert.doesNotMatch(markup, /\bSkip\b/);
});

test('renders deliberate article cards with optional source imagery and only useful actions', () => {
    const { app } = loadApp();
    const markup = app.createArticle(article(7, {
        image_url: 'https://images.example.com/article.jpg',
        image_width: 1200,
        image_height: 630,
        image_alt: 'A useful diagram from the source article'
    }));

    assert.match(markup, /class="article-rating-badge rating-good">88<\/div>/);
    assert.doesNotMatch(markup, /class="article-score"/);
    assert.match(markup, /class="article-source-visual"/);
    assert.match(markup, /A useful diagram from the source article/);
    assert.match(markup, /width="1200" height="630"/);
    assert.match(markup, /loading="lazy" decoding="async" fetchpriority="low"/);
    assert.match(markup, /Why it earned a place:/);
    assert.match(markup, />Read original ↗<\/a>/);
    assert.match(markup, /aria-label="Mark as unread"/);
    assert.doesNotMatch(markup, /data-decision=/);
    assert.doesNotMatch(markup, /article-decision-btn/);
    assert.doesNotMatch(markup, />Save<\/button>/);
    assert.doesNotMatch(markup, />Skip<\/button>/);
    assert.doesNotMatch(markup, /No decision needed/);
    assert.doesNotMatch(markup, /<figcaption/);
    assert.ok(markup.indexOf('article-title') < markup.indexOf('article-source-visual'));
    assert.ok(markup.indexOf('article-source-visual') < markup.indexOf('article-preview'));
});

test('shows worthwhile images without cropping them on desktop or mobile', () => {
    assert.match(styles, /\.article-source-visual img\s*{[^}]*object-fit:\s*contain;/s);
    assert.match(styles, /\.article-source-visual img\s*{[^}]*max-height:\s*360px;/s);
    assert.match(styles, /@media \(max-width: 768px\)[\s\S]*\.article-source-visual img\s*{[^}]*max-height:\s*260px;/);
    assert.doesNotMatch(styles, /\.article-source-visual img\s*{[^}]*object-fit:\s*cover;/s);
});

test('keeps the score circle color-coded across the existing rating bands', () => {
    const { app } = loadApp();

    const good = app.createArticle(article(10, { rating: 85 }));
    const great = app.createArticle(article(11, { rating: 92 }));
    const excellent = app.createArticle(article(12, { rating: 97 }));

    assert.match(good, /article-rating-badge rating-good">85/);
    assert.match(great, /article-rating-badge rating-great">92/);
    assert.match(excellent, /article-rating-badge rating-excellent">97/);
});

test('does not invent a visual when the feed has no source image', () => {
    const { app } = loadApp();

    const markup = app.createArticle(article(8));

    assert.match(markup, /article-card-grid no-visual/);
    assert.doesNotMatch(markup, /article-source-visual/);
    assert.doesNotMatch(markup, /<img/);

    const insecureMarkup = app.createArticle(article(9, {
        image_url: 'http://images.example.com/insecure.jpg',
        image_width: 1200,
        image_height: 630
    }));
    assert.doesNotMatch(insecureMarkup, /<img/);
});

test('removes a source image cleanly when the remote asset fails at render time', () => {
    assert.match(source, /setupArticleImageFallbacks\(list\)/);
    assert.match(source, /addEventListener\('error'/);
    assert.match(source, /visual\.remove\(\)/);
});

test('records visibility for the next visit without moving the boundary during the current session', () => {
    const { app, storage } = loadApp();
    app.previouslySeenIds = new Set(['1']);

    app.recordArticleSeen(2);

    assert.deepEqual(Array.from(app.previouslySeenIds), ['1']);
    assert.deepEqual(Array.from(app.sessionSeenIds), ['2']);
    assert.deepEqual(JSON.parse(storage.get('sieve_seen_articles_v1')), ['1', '2']);
});
