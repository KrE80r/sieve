/**
 * Finite developments view.
 *
 * Loads one sealed static batch, never polls, and offers no manual refresh.
 */

const AWARENESS_URL = 'data/awareness.json';
const AWARENESS_SEEN_KEY = 'feedsieve_awareness_seen_v1';
const X_HOSTS = ['x.com', 'twitter.com', 't.co', 'twimg.com'];

class AwarenessView {
    constructor(feedApp) {
        this.feedApp = feedApp;
        this.activeView = 'articles';
        this.loaded = false;
        this.payload = null;
        this.developments = [];
        this.seen = this.loadSeenState();
        this.articleHeader = null;
        this.bindViewSwitch();

        const initialHash = window.location.hash;
        const initialView = ['#updates', '#developments'].includes(initialHash)
            ? 'developments'
            : 'articles';
        this.load().finally(() => {
            if (initialView === 'developments') this.setView('developments');
        });
    }

    bindViewSwitch() {
        document.querySelectorAll('[data-sieve-view]').forEach(button => {
            button.addEventListener('click', () => this.setView(button.dataset.sieveView));
        });
    }

    setView(view) {
        if (view === 'updates') view = 'developments';
        if (!['articles', 'developments'].includes(view)) return;

        const switchingToDevelopments = view === 'developments';
        if (switchingToDevelopments && this.activeView !== 'developments') {
            this.articleHeader = {
                title: document.getElementById('feed-title')?.textContent || 'Today',
                count: document.getElementById('feed-count')?.textContent || '0 articles',
                lastUpdated: document.getElementById('last-updated')?.textContent || ''
            };
        }
        this.activeView = view;

        document.querySelectorAll('[data-sieve-view]').forEach(button => {
            const active = button.dataset.sieveView === view;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
            if (button.getAttribute('role') === 'tab') {
                button.setAttribute('aria-selected', String(active));
            }
        });

        const articleOnlyIds = [
            'sidebar-nav', 'refresh-btn', 'search-toggle', 'header-right',
            'mobile-filters', 'article-list', 'no-results', 'source-sheet-overlay'
        ];
        articleOnlyIds.forEach(id => {
            document.getElementById(id)?.classList.toggle('view-hidden', switchingToDevelopments);
        });
        document.getElementById('awareness-view')?.classList.toggle('hidden', !switchingToDevelopments);
        document.body.classList.toggle('awareness-active', switchingToDevelopments);
        document.body.style.overflow = '';

        const url = new URL(window.location.href);
        url.hash = switchingToDevelopments ? 'developments' : '';
        history.replaceState(history.state, '', url);

        if (switchingToDevelopments) {
            document.getElementById('feed-title').textContent = 'Developments';
            this.updateHeader();
            this.updatePublishedTime();
            return;
        }

        if (this.feedApp) {
            this.feedApp.updateFeedTitle(this.feedApp.timeFilter);
            this.feedApp.applyFilters();
            this.feedApp.updateLastUpdated(this.feedApp.lastUpdated);
        } else if (this.articleHeader) {
            document.getElementById('feed-title').textContent = this.articleHeader.title;
            document.getElementById('feed-count').textContent = this.articleHeader.count;
            document.getElementById('last-updated').textContent = this.articleHeader.lastUpdated;
        }
    }

    async load() {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const response = await fetch(`${AWARENESS_URL}?sealed=1`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            this.payload = this.validatePayload(payload);
            this.developments = this.payload.developments;
            this.pruneSeenState();
            this.render();
        } catch (error) {
            console.error('Failed to load sealed developments:', error);
            this.renderError();
        }
    }

    validatePayload(payload) {
        if (!payload || ![1, 2].includes(payload.schema_version) || !Array.isArray(payload.developments)) {
            throw new Error('Invalid awareness payload');
        }
        const now = Date.now();
        const developments = payload.developments
            .map(item => this.validateDevelopment(item, payload.schema_version))
            .filter(Boolean)
            .filter(item => new Date(item.expires_at).getTime() > now)
            .sort((a, b) => {
                const dateOrder = new Date(a.occurred_at) - new Date(b.occurred_at);
                return dateOrder || a.id.localeCompare(b.id);
            });

        return {
            ...payload,
            timezone: payload.timezone || 'Australia/Adelaide',
            coverage: payload.coverage || {
                state: 'incomplete',
                message: 'These developments may be incomplete.'
            },
            developments
        };
    }

    validateDevelopment(item, schemaVersion = 2) {
        if (!item || !/^[a-f0-9]{32}$/.test(item.id || '')) return null;
        if (!['reported', 'source_backed'].includes(item.evidence_state)) return null;
        if (!this.validDate(item.occurred_at) || !this.validDate(item.expires_at)) return null;

        const links = Array.isArray(item.external_links)
            ? item.external_links.map(link => this.validateLink(link)).filter(Boolean)
            : [];
        const interests = Array.isArray(item.interest_slugs)
            ? item.interest_slugs.filter(value => /^[a-z0-9_]{2,50}$/.test(value))
            : [];
        if (schemaVersion === 1) {
            if (typeof item.summary !== 'string' || !item.summary.trim()) return null;
            const [title, remaining] = this.splitSummary(item.summary);
            return {
                ...item,
                title,
                detail: remaining ? [remaining] : [],
                why_it_matters: '',
                sources: [],
                external_links: links,
                interest_slugs: interests,
                legacy: true
            };
        }

        const title = this.editorialText(item.title, 240);
        const detail = Array.isArray(item.detail)
            ? item.detail.slice(0, 3).map(value => this.editorialText(value, 1400)).filter(Boolean)
            : [];
        const why = this.editorialText(item.why_it_matters, 600);
        const sources = Array.isArray(item.sources)
            ? item.sources.map(source => this.validateSource(source)).filter(Boolean)
            : [];
        if (!title || !detail.length || !why || !sources.length || sources.length !== item.sources.length) {
            return null;
        }
        return {
            ...item,
            title,
            detail,
            why_it_matters: why,
            sources,
            external_links: links,
            interest_slugs: interests,
            legacy: false
        };
    }

    editorialText(value, maximum) {
        if (typeof value !== 'string') return '';
        const text = value.trim().replace(/\s+/g, ' ');
        if (!text || text.length > maximum || /\bthe (author|poster|user|post|account)\b/i.test(text)) {
            return '';
        }
        return text;
    }

    validateSource(source) {
        if (!source || typeof source.author_name !== 'string' ||
            typeof source.author_username !== 'string') return null;
        const name = source.author_name.trim().replace(/\s+/g, ' ').slice(0, 100);
        const username = source.author_username.trim().replace(/^@/, '');
        const role = String(source.role || '');
        if (!name || !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
            !['source', 'quoted_source', 'commentary'].includes(role) ||
            !this.safeSourceUrl(source.url, username)) return null;
        const media = Array.isArray(source.media)
            ? source.media.map(item => this.validateMedia(item)).filter(Boolean)
            : [];
        return { author_name: name, author_username: username, url: source.url, role, media };
    }

    safeSourceUrl(value, username) {
        if (typeof value !== 'string') return false;
        try {
            const url = new URL(value);
            const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{5,30})$/);
            return url.protocol === 'https:' && url.hostname.toLowerCase() === 'x.com' &&
                !url.username && !url.password && !url.search && !url.hash && match &&
                match[1].toLowerCase() === username.toLowerCase();
        } catch {
            return false;
        }
    }

    validateMedia(media) {
        if (!media || !this.safeTwimgUrl(media.url)) return null;
        const type = ['photo', 'video', 'animated_gif'].includes(media.type) ? media.type : 'photo';
        const preview = this.safeTwimgUrl(media.preview_url) ? media.preview_url : null;
        const width = Number.isInteger(media.width) && media.width > 0 ? media.width : null;
        const height = Number.isInteger(media.height) && media.height > 0 ? media.height : null;
        return { type, url: media.url, preview_url: preview, width, height };
    }

    safeTwimgUrl(value) {
        if (typeof value !== 'string' || !value) return false;
        try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase().replace(/\.$/, '');
            return url.protocol === 'https:' && !url.username && !url.password &&
                (host === 'twimg.com' || host.endsWith('.twimg.com'));
        } catch {
            return false;
        }
    }

    validateLink(link) {
        if (!link || !this.safeExternalUrl(link.url)) return null;
        const url = new URL(link.url);
        const preview = this.safeExternalUrl(link.preview_image_url) ? link.preview_image_url : null;
        return {
            url: link.url,
            domain: url.hostname,
            title: String(link.title || url.hostname).slice(0, 300),
            preview_image_url: preview
        };
    }

    safeExternalUrl(value) {
        if (typeof value !== 'string' || !value) return false;
        try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase().replace(/\.$/, '');
            return url.protocol === 'https:' && !url.username && !url.password &&
                !X_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`));
        } catch {
            return false;
        }
    }

    validDate(value) {
        return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
    }

    render() {
        const loading = document.getElementById('awareness-loading');
        loading?.classList.add('hidden');
        loading?.setAttribute('aria-busy', 'false');
        const coverage = document.getElementById('awareness-coverage');
        const incomplete = this.payload.coverage?.state === 'incomplete';
        coverage.classList.toggle('hidden', !incomplete);
        coverage.textContent = incomplete ? this.payload.coverage.message : '';

        const list = document.getElementById('development-list');
        list.innerHTML = `
            ${this.mastheadMarkup()}
            <div class="development-release" role="feed" aria-label="Sealed developments release">
                ${this.developments.map(item => this.cardMarkup(item)).join('')}
            </div>
        `;
        this.bindCards();
        this.updateHeader();
        this.updateProgress();
        this.updateEndState();
        this.updatePublishedTime();
    }

    mastheadMarkup() {
        const count = this.developments.length;
        const scheduled = this.payload?.scheduled_for;
        const through = scheduled ? this.formatClock(scheduled) : '';
        const next = this.payload?.next_update_at
            ? this.nextReleaseLabel(this.payload.next_update_at)
            : 'at the next scheduled release';
        const hours = this.windowHours();
        const heading = hours
            ? `What changed in your ${hours}-hour window`
            : 'What changed in this sealed release';
        const edition = scheduled
            ? `${this.formatEditionDay(scheduled)} · ${through} sealed release`
            : 'Sealed developments release';

        return `
            <header class="awareness-masthead">
                <div class="awareness-masthead-copy">
                    <p class="awareness-edition-label">${this.escapeHtml(edition)}</p>
                    <h2>${this.escapeHtml(heading)}</h2>
                    <div class="awareness-release-meta">
                        ${through ? `<span class="awareness-complete">Complete through ${this.escapeHtml(through)}</span>` : ''}
                        <span>${count} development${count === 1 ? '' : 's'}</span>
                        <span>Next release ${this.escapeHtml(next)}</span>
                    </div>
                </div>
                <div class="awareness-progress" role="status" aria-live="polite" aria-label="Developments marked seen">
                    <strong data-awareness-progress>0 / ${count}</strong>
                    <span>marked seen</span>
                </div>
            </header>
        `;
    }

    cardMarkup(item) {
        const titleId = `development-${item.id}-title`;
        const seen = Boolean(this.seen[item.id]);
        const evidenceLabel = item.evidence_state === 'source_backed' ? 'Source-backed' : 'Reported';
        const topics = item.interest_slugs.map(slug => this.topicLabel(slug));
        const links = item.external_links.map(link => this.linkMarkup(link, item.id)).join('');
        const sources = item.sources.map(source => this.sourceMarkup(source, item.id)).join('');
        const visual = this.pickVisual(item);
        const visualMarkup = visual ? this.visualMarkup(visual, item.id) : '';
        const paragraphs = item.detail
            .map(paragraph => `<p>${this.escapeHtml(paragraph)}</p>`)
            .join('');
        return `
            <article class="development-dispatch${visualMarkup ? '' : ' no-visual'}${seen ? ' seen' : ''}"
                data-development-id="${item.id}" aria-labelledby="${titleId}">
                <div class="development-dispatch-copy">
                    <div class="development-meta">
                        <time datetime="${this.escapeHtml(item.occurred_at)}">${this.formatOccurred(item.occurred_at)}</time>
                        ${topics.map(topic => `<span class="development-topic">${this.escapeHtml(topic)}</span>`).join('')}
                    </div>
                    <h3 class="development-title" id="${titleId}">${this.escapeHtml(item.title)}</h3>
                    ${sources
                        ? `<div class="development-sources" aria-label="Sources">${sources}</div>`
                        : '<div class="development-sources legacy">From selected lists</div>'}
                </div>
                ${visualMarkup}
                <div class="development-story-body">
                    <div class="development-story-copy">${paragraphs}</div>
                    ${item.why_it_matters ? `
                        <aside class="development-why">
                            <strong>Why it matters</strong>
                            <span>${this.escapeHtml(item.why_it_matters)}</span>
                        </aside>` : ''}
                    <div class="development-provenance">
                        <span class="development-evidence ${item.evidence_state}">${evidenceLabel}</span>
                        <span>${item.sources.length} source post${item.sources.length === 1 ? '' : 's'}</span>
                    </div>
                    ${links ? `<div class="development-links" role="group" aria-label="Linked evidence">${links}</div>` : ''}
                    <div class="development-dispatch-footer">
                        <button class="development-seen-toggle" type="button" data-seen-toggle="${item.id}"
                            aria-label="${seen ? 'Mark this development unseen' : 'Mark this development seen'}">
                            ${seen ? 'Mark unseen' : 'Mark seen'}
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    sourceMarkup(source, developmentId) {
        const roleLabels = {
            source: 'Source',
            quoted_source: 'Quoted source',
            commentary: 'Commentary'
        };
        return `
            <a class="development-attribution-link ${source.role}" href="${this.escapeHtml(source.url)}"
                target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"
                data-seen-link="${developmentId}">
                <span class="development-source-identity">
                    <strong>${this.escapeHtml(source.author_name)}</strong>
                    <span>@${this.escapeHtml(source.author_username)}</span>
                </span>
                <small>${roleLabels[source.role]}</small>
                <span class="development-link-arrow" aria-hidden="true">↗</span>
            </a>
        `;
    }

    linkMarkup(link, developmentId) {
        return `
            <a class="development-source-link" href="${this.escapeHtml(link.url)}" target="_blank"
                rel="noopener noreferrer" referrerpolicy="no-referrer" data-seen-link="${developmentId}">
                <span class="development-source-copy">
                    <strong>${this.escapeHtml(link.title)}</strong>
                    <small>${this.escapeHtml(link.domain)}</small>
                </span>
                <span class="development-link-arrow" aria-hidden="true">↗</span>
            </a>
        `;
    }

    pickVisual(item) {
        for (const source of item.sources) {
            for (const media of source.media) {
                const url = media.type === 'photo' ? media.url : media.preview_url;
                if (!url) continue;
                return {
                    url,
                    link: source.url,
                    alt: `Media attached by ${source.author_name} (@${source.author_username})`,
                    label: 'Source media',
                    caption: `${source.author_name} (@${source.author_username})`
                };
            }
        }
        const link = item.external_links.find(candidate => candidate.preview_image_url);
        return link ? {
            url: link.preview_image_url,
            link: link.url,
            alt: link.title,
            label: 'Linked evidence',
            caption: link.domain
        } : null;
    }

    visualMarkup(visual, developmentId) {
        return `
            <figure class="development-visual">
                <a href="${this.escapeHtml(visual.link)}" target="_blank" rel="noopener noreferrer"
                    referrerpolicy="no-referrer" data-seen-link="${developmentId}">
                    <img src="${this.escapeHtml(visual.url)}"
                        alt="${this.escapeHtml(visual.alt)}" loading="lazy" decoding="async"
                        referrerpolicy="no-referrer">
                </a>
                <figcaption>
                    <span>${this.escapeHtml(visual.label)}</span>
                    <strong>${this.escapeHtml(visual.caption)}</strong>
                </figcaption>
            </figure>
        `;
    }

    bindCards() {
        const list = document.getElementById('development-list');
        list.querySelectorAll('.development-dispatch').forEach(card => {
            card.addEventListener('click', event => {
                if (event.target.closest('a, button')) return;
                this.markSeen(card.dataset.developmentId, true);
            });
        });
        list.querySelectorAll('[data-seen-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.dataset.seenToggle;
                this.markSeen(id, !this.seen[id]);
            });
        });
        list.querySelectorAll('[data-seen-link]').forEach(link => {
            link.addEventListener('click', () => this.markSeen(link.dataset.seenLink, true));
        });
        list.querySelectorAll('.development-visual img').forEach(image => {
            image.addEventListener('error', () => {
                const card = image.closest('.development-dispatch');
                image.closest('.development-visual')?.remove();
                card?.classList.add('no-visual');
            }, { once: true });
        });
    }

    markSeen(id, seen) {
        if (seen) this.seen[id] = true;
        else delete this.seen[id];
        this.saveSeenState();
        const card = document.querySelector(`[data-development-id="${id}"]`);
        card?.classList.toggle('seen', seen);
        const button = card?.querySelector('[data-seen-toggle]');
        if (button) {
            button.textContent = seen ? 'Mark unseen' : 'Mark seen';
            button.setAttribute('aria-label', seen
                ? 'Mark this development unseen'
                : 'Mark this development seen');
        }
        this.updateProgress();
        this.updateEndState();
    }

    updateProgress() {
        const seenCount = this.developments.filter(item => this.seen[item.id]).length;
        document.querySelectorAll('[data-awareness-progress]').forEach(element => {
            element.textContent = `${seenCount} / ${this.developments.length}`;
        });
    }

    updateHeader() {
        this.updateSchedule();
        if (this.activeView !== 'developments') return;
        const count = this.developments.length;
        document.getElementById('feed-count').textContent =
            `${count} development${count === 1 ? '' : 's'}`;
    }

    updateSchedule() {
        const label = this.payload?.next_update_at
            ? this.nextReleaseLabel(this.payload.next_update_at)
            : 'next scheduled release';
        document.querySelectorAll('[data-developments-schedule-time]').forEach(element => {
            element.textContent = label;
        });
    }

    updateEndState() {
        const end = document.getElementById('awareness-end');
        const through = this.payload?.scheduled_for
            ? this.formatClock(this.payload.scheduled_for)
            : null;
        const next = this.payload?.next_update_at
            ? this.nextReleaseLabel(this.payload.next_update_at)
            : 'the next scheduled release';
        const caughtUp = this.developments.length === 0 ||
            this.developments.every(item => this.seen[item.id]);
        const heading = caughtUp && through
            ? `You’re caught up through ${through}`
            : 'End of these sealed developments';
        end.innerHTML = `
            <strong>${heading}</strong>
            <span>There is nothing else to load. The next Developments release is ${this.escapeHtml(next)}.</span>
        `;
        end.classList.remove('hidden');
    }

    updatePublishedTime() {
        if (this.activeView !== 'developments') return;
        const lastUpdated = document.getElementById('last-updated');
        if (!lastUpdated || !this.payload?.published_at) return;
        lastUpdated.textContent = `Published ${this.formatOccurred(this.payload.published_at)}`;
    }

    renderError() {
        const loading = document.getElementById('awareness-loading');
        loading?.classList.add('hidden');
        loading?.setAttribute('aria-busy', 'false');
        const coverage = document.getElementById('awareness-coverage');
        coverage.textContent = 'The latest scheduled developments could not be loaded. Sieve will try again at the next scheduled release.';
        coverage.classList.remove('hidden');
        document.getElementById('development-list').innerHTML = '';
        const end = document.getElementById('awareness-end');
        end.innerHTML = `
            <strong>No live refresh is available</strong>
            <span>This view changes only when the next sealed Developments release is published.</span>
        `;
        end.classList.remove('hidden');
        this.updateHeader();
    }

    splitSummary(summary) {
        const match = summary.trim().match(/^(.+?[.!?])(?:\s+([\s\S]+))?$/);
        return match ? [match[1], match[2] || ''] : [summary.trim(), ''];
    }

    topicLabel(slug) {
        const labels = {
            ai: 'AI',
            linux: 'Linux',
            web_security: 'Web security',
            os_security: 'OS security'
        };
        return labels[slug] || slug.replaceAll('_', ' ');
    }

    formatOccurred(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: this.payload?.timezone || 'Australia/Adelaide',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    }

    formatClock(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: this.payload?.timezone || 'Australia/Adelaide',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    }

    formatEditionDay(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: this.payload?.timezone || 'Australia/Adelaide',
            weekday: 'long'
        }).format(date);
    }

    windowHours() {
        const start = new Date(this.payload?.window?.starts_at).getTime();
        const end = new Date(this.payload?.window?.ends_at).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        return Math.round((end - start) / (60 * 60 * 1000));
    }

    nextReleaseLabel(value) {
        const date = new Date(value);
        const time = this.formatClock(value);
        if (!Number.isFinite(date.getTime())) return '';
        const zone = this.payload?.timezone || 'Australia/Adelaide';
        const day = this.dateKey(date, zone);
        const today = this.dateKey(new Date(), zone);
        const tomorrow = this.dateKey(new Date(Date.now() + 24 * 60 * 60 * 1000), zone);
        return day === today ? `today at ${time}` : day === tomorrow ? `tomorrow at ${time}` : `at ${time}`;
    }

    dateKey(date, timeZone) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    }

    loadSeenState() {
        try {
            const value = JSON.parse(localStorage.getItem(AWARENESS_SEEN_KEY) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    pruneSeenState() {
        const current = new Set(this.developments.map(item => item.id));
        Object.keys(this.seen).forEach(id => {
            if (!current.has(id)) delete this.seen[id];
        });
        this.saveSeenState();
    }

    saveSeenState() {
        try {
            localStorage.setItem(AWARENESS_SEEN_KEY, JSON.stringify(this.seen));
        } catch {
            // Reading still works when storage is unavailable.
        }
    }

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.awarenessView = new AwarenessView(window.feedSieve);
});
