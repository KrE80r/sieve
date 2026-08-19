import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

const deployedStylePath = index.match(/href="(css\/style\.\d+\.css)"/)?.[1];
const deployedScriptPath = index.match(/src="(js\/app\.\d+\.js)"/)?.[1];

function control() {
    const listeners = new Map();
    return {
        innerHTML: '',
        value: '',
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        dispatch(type) {
            listeners.get(type)?.({ currentTarget: this });
        }
    };
}

function loadApp(elements) {
    const document = {
        addEventListener() {},
        getElementById(id) {
            return elements[id] || null;
        },
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
    const context = vm.createContext({ console, Date, document, localStorage: {}, Set, URL, window: {} });
    vm.runInContext(`${source}\n;globalThis.FeedSieveForTest = FeedSieve;`, context);
    return Object.create(context.FeedSieveForTest.prototype);
}

test('mobile filters use bounded facets instead of horizontal pill strips', () => {
    assert.match(index, /class="mobile-filter-grid"/);
    assert.match(index, /id="mobile-time-select"/);
    assert.match(index, /id="mobile-category-select"/);
    assert.match(index, /class="source-filter-label">All sources</);
    assert.match(index, /class="mobile-order-row"/);
    assert.doesNotMatch(index, /filter-row-scroll|mobile-category-pills|active-source-chip/);

    assert.match(styles, /\.mobile-filter-grid\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
    assert.match(styles, /\.mobile-filter-control\s*{[^}]*min-width:\s*0/s);
    assert.match(styles, /\.mobile-filter-select\s*{[^}]*width:\s*100%/s);
    assert.match(styles, /\.mobile-order-row\s+\.sort-pill\s*{[^}]*flex:\s*1/s);
    assert.match(styles, /\.mobile-order-row\s+\.sort-pill\s*{[^}]*min-height:\s*44px/s);
    assert.match(styles, /\.source-filter-btn\s*{[^}]*min-height:\s*51px/s);
    assert.doesNotMatch(styles, /\.filter-row-scroll\s*{[^}]*overflow-x:\s*auto/s);
});

test('cache-busted production assets contain the verified mobile filter fix', () => {
    assert.ok(deployedStylePath);
    assert.ok(deployedScriptPath);
    assert.equal(readFileSync(new URL(`../${deployedStylePath}`, import.meta.url), 'utf8'), styles);
    assert.equal(readFileSync(new URL(`../${deployedScriptPath}`, import.meta.url), 'utf8'), source);
});

test('mobile window and topic changes preserve the other active facets', () => {
    const timeSelect = control();
    const categorySelect = control();
    const app = loadApp({
        'mobile-time-select': timeSelect,
        'mobile-category-select': categorySelect
    });
    let renders = 0;

    app.categories = { Tech: 12, AI: 7 };
    app.timeFilter = 'today';
    app.categoryFilter = 'Tech';
    app.sourceFilter = { id: '42', type: 'rss' };
    app.applyFilters = () => { renders += 1; };

    app.renderMobileFilters();
    app.bindMobileFilters();

    assert.match(categorySelect.innerHTML, /<option value="">All topics<\/option>/);
    assert.match(categorySelect.innerHTML, /<option value="Tech">Tech \(12\)<\/option>/);
    assert.equal(categorySelect.value, 'Tech');

    categorySelect.value = 'AI';
    categorySelect.dispatch('change');
    assert.equal(app.categoryFilter, 'AI');
    assert.deepEqual(app.sourceFilter, { id: '42', type: 'rss' });

    timeSelect.value = 'week';
    timeSelect.dispatch('change');
    assert.equal(app.timeFilter, 'week');
    assert.equal(app.categoryFilter, 'AI');
    assert.deepEqual(app.sourceFilter, { id: '42', type: 'rss' });
    assert.equal(renders, 2);
});
