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
        title: 'Ghostlight keeps remote Chromium sessions alive across client disconnects',
        detail: [
            'EvalOps released Ghostlight for persistent Chromium sessions streamed from Linux to a native macOS client.',
            'EvalOps says sessions reconnect over WebRTC so browser work can continue after the client disconnects.'
        ],
        why_it_matters: 'It removes a practical interruption point for long-running browser and agent work.',
        sources: [{
            author_name: 'EvalOps',
            author_username: 'evalopsdev',
            url: 'https://x.com/evalopsdev/status/2087000000000000000',
            role: 'source',
            media: [{
                type: 'photo',
                url: 'https://pbs.twimg.com/media/ghostlight.jpg',
                preview_url: 'https://pbs.twimg.com/media/ghostlight.jpg:small',
                width: 1200,
                height: 800
            }]
        }],
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
    assert.match(markup, /Media attached by EvalOps/);
    assert.match(markup, /sessions reconnect over WebRTC/i);
    assert.match(markup, /class="development-source-link"/);
    assert.match(markup, /EvalOps/);
    assert.match(markup, /@evalopsdev/);
    assert.match(markup, /href="https:\/\/x\.com\/evalopsdev\/status\/2087000000000000000"/);
    assert.match(markup, /Why it matters/);
    assert.match(markup, /Source-backed/);
    assert.match(markup, /Mark seen/);
    assert.doesNotMatch(markup, /class="development-card/);
});

test('renders a real editorial headline followed by attributed detail paragraphs', () => {
    const view = loadView();

    const markup = view.cardMarkup(development());

    assert.match(markup, /<h3 class="development-title"[^>]*>Ghostlight keeps remote Chromium sessions alive across client disconnects<\/h3>/);
    assert.match(markup, /<p>EvalOps released Ghostlight/);
    assert.match(markup, /<p>EvalOps says sessions reconnect/);
    assert.doesNotMatch(markup, /the author/i);
    assert.ok(
        markup.indexOf('development-sources') < markup.indexOf('development-story-copy'),
        'attribution should be visible before the editorial detail'
    );
});

test('labels a quoted source before the commentator and links both actual posts', () => {
    const view = loadView();
    const item = development({
        sources: [
            {
                author_name: 'Project Atlas',
                author_username: 'atlas',
                url: 'https://x.com/atlas/status/2087000000000000001',
                role: 'quoted_source',
                media: []
            },
            {
                author_name: 'Analyst Name',
                author_username: 'analyst',
                url: 'https://x.com/analyst/status/2087000000000000002',
                role: 'commentary',
                media: []
            }
        ]
    });

    const markup = view.cardMarkup(item);

    assert.ok(markup.indexOf('Project Atlas') < markup.indexOf('Analyst Name'));
    assert.match(markup, /Quoted source/);
    assert.match(markup, /Commentary/);
    assert.match(markup, /x\.com\/atlas\/status\/2087000000000000001/);
    assert.match(markup, /x\.com\/analyst\/status\/2087000000000000002/);
});

test('keeps text-only developments editorial without inventing decorative media', () => {
    const view = loadView();
    view.seen['0123456789abcdef0123456789abcdef'] = true;

    const markup = view.cardMarkup(development({
        sources: [{
            author_name: 'EvalOps',
            author_username: 'evalopsdev',
            url: 'https://x.com/evalopsdev/status/2087000000000000000',
            role: 'source',
            media: []
        }],
        external_links: []
    }));

    assert.match(markup, /development-dispatch no-visual seen/);
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /Mark unseen/);
});

test('validates schema v2 attribution and rejects mismatched or unsafe source URLs', () => {
    const view = loadView();
    const valid = view.validateDevelopment(development(), 2);
    const mismatched = view.validateDevelopment(development({
        sources: [{
            author_name: 'EvalOps',
            author_username: 'evalopsdev',
            url: 'https://x.com/imposter/status/2087000000000000000',
            role: 'source',
            media: []
        }]
    }), 2);
    const genericActor = view.validateDevelopment(development({
        title: 'Developer releases three open-source AI tools'
    }));

    assert.equal(valid.sources[0].author_name, 'EvalOps');
    assert.equal(valid.sources[0].author_username, 'evalopsdev');
    assert.equal(valid.sources[0].media[0].preview_url, 'https://pbs.twimg.com/media/ghostlight.jpg:small');
    assert.equal(mismatched, null);
    assert.equal(genericActor, null);
});

test('withholds legacy anonymous releases instead of rendering a summary fallback', () => {
    const view = loadView();

    assert.throws(
        () => view.validatePayload({ schema_version: 1, developments: [] }),
        /attributed editorial release/i
    );
    assert.equal(view.attributionUpgradePending, true);
});
