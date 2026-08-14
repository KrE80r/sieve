import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/awareness.js', import.meta.url), 'utf8');

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function loadView() {
    const document = {
        addEventListener() {},
        createElement() {
            let html = '';
            return {
                set textContent(value) {
                    html = escapeHtml(value ?? '');
                },
                get innerHTML() {
                    return html;
                }
            };
        }
    };
    const context = vm.createContext({
        console,
        Date,
        document,
        Intl,
        localStorage: { getItem: () => null, setItem() {} },
        URL,
        window: {}
    });
    vm.runInContext(`${source}\n;globalThis.AwarenessViewForTest = AwarenessView;`, context);

    const view = Object.create(context.AwarenessViewForTest.prototype);
    view.seen = {};
    view.payload = {
        timezone: 'Australia/Adelaide',
        scheduled_for: '2026-08-14T03:30:00+00:00',
        next_update_at: '2026-08-14T08:30:00+00:00',
        window: {
            starts_at: '2026-08-12T03:30:00+00:00',
            ends_at: '2026-08-14T03:30:00+00:00'
        }
    };
    view.nextReleaseLabel = () => 'today at 18:00';
    return view;
}

function development(overrides = {}) {
    return {
        id: '0123456789abcdef0123456789abcdef',
        occurred_at: '2026-08-14T01:42:00+00:00',
        expires_at: '2026-08-16T01:42:00+00:00',
        summary: 'Ghostlight provides persistent Chromium sessions streamed from Linux to a native macOS client. Sessions reconnect over WebRTC so browser work can continue after the client disconnects.',
        evidence_state: 'source_backed',
        interest_slugs: ['ai', 'linux'],
        external_links: [{
            url: 'https://github.com/evalops/ghostlight',
            domain: 'github.com',
            title: 'Ghostlight persistent browser sessions',
            preview_image_url: 'https://opengraph.githubassets.com/example/evalops/ghostlight'
        }],
        ...overrides
    };
}

test('renders the sealed batch as an editorial release masthead', () => {
    const view = loadView();
    view.developments = [development(), development({ id: 'fedcba9876543210fedcba9876543210' })];

    const markup = view.mastheadMarkup();

    assert.match(markup, /class="awareness-masthead"/);
    assert.match(markup, /Friday · 13:00 sealed release/);
    assert.match(markup, /What changed in your 48-hour window/);
    assert.match(markup, /Complete through 13:00/);
    assert.match(markup, /2 developments/);
    assert.match(markup, /Next release today at 18:00/);
});

test('renders a development as a long-form editorial dispatch with meaningful evidence media', () => {
    const view = loadView();

    const markup = view.cardMarkup(development());

    assert.match(markup, /class="development-dispatch/);
    assert.match(markup, /class="development-dispatch-copy"/);
    assert.match(markup, /class="development-visual"/);
    assert.match(markup, /alt="Ghostlight persistent browser sessions"/);
    assert.match(markup, /Sessions reconnect over WebRTC/);
    assert.match(markup, /class="development-source-link"/);
    assert.match(markup, /Source-backed/);
    assert.match(markup, /Mark seen/);
    assert.doesNotMatch(markup, /class="development-card/);
});

test('keeps text-only developments editorial without inventing decorative media', () => {
    const view = loadView();
    view.seen['0123456789abcdef0123456789abcdef'] = true;

    const markup = view.cardMarkup(development({ external_links: [] }));

    assert.match(markup, /development-dispatch no-visual seen/);
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /Mark unseen/);
});
