/**
 * Finite updates view.
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

        if (window.location.hash === '#updates') {
            this.setView('updates');
        }
    }

    bindViewSwitch() {
        document.querySelectorAll('[data-sieve-view]').forEach(button => {
            button.addEventListener('click', () => this.setView(button.dataset.sieveView));
        });
    }

    setView(view) {
        if (!['articles', 'updates'].includes(view)) return;

        const switchingToUpdates = view === 'updates';
        if (switchingToUpdates && this.activeView !== 'updates') {
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
        });

        const articleOnlyIds = [
            'sidebar-nav', 'refresh-btn', 'search-toggle', 'header-right',
            'mobile-filters', 'article-list', 'no-results', 'source-sheet-overlay'
        ];
        articleOnlyIds.forEach(id => {
            document.getElementById(id)?.classList.toggle('view-hidden', switchingToUpdates);
        });
        document.getElementById('awareness-view')?.classList.toggle('hidden', !switchingToUpdates);
        document.body.classList.toggle('awareness-active', switchingToUpdates);
        document.body.style.overflow = '';

        const url = new URL(window.location.href);
        url.hash = switchingToUpdates ? 'updates' : '';
        history.replaceState(history.state, '', url);

        if (switchingToUpdates) {
            document.getElementById('feed-title').textContent = 'Updates';
            this.updateHeader();
            if (!this.loaded) this.load();
            return;
        }

        const nextUpdate = document.getElementById('awareness-next-update');
        nextUpdate?.classList.add('hidden');
        if (this.articleHeader && (this.articleHeader.lastUpdated || !this.feedApp?.lastUpdated)) {
            document.getElementById('feed-title').textContent = this.articleHeader.title;
            document.getElementById('feed-count').textContent = this.articleHeader.count;
            document.getElementById('last-updated').textContent = this.articleHeader.lastUpdated;
        } else if (this.feedApp) {
            this.feedApp.updateFeedTitle(this.feedApp.timeFilter);
            this.feedApp.applyFilters();
            this.feedApp.updateLastUpdated(this.feedApp.lastUpdated);
        }
    }

    async load() {
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
            console.error('Failed to load sealed updates:', error);
            this.renderError();
        }
    }

    validatePayload(payload) {
        if (!payload || payload.schema_version !== 1 || !Array.isArray(payload.developments)) {
            throw new Error('Invalid awareness payload');
        }
        const now = Date.now();
        const developments = payload.developments
            .map(item => this.validateDevelopment(item))
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
                message: 'This update may be incomplete.'
            },
            developments
        };
    }

    validateDevelopment(item) {
        if (!item || !/^[a-f0-9]{32}$/.test(item.id || '')) return null;
        if (typeof item.summary !== 'string' || !item.summary.trim()) return null;
        if (!['reported', 'source_backed'].includes(item.evidence_state)) return null;
        if (!this.validDate(item.occurred_at) || !this.validDate(item.expires_at)) return null;

        const links = Array.isArray(item.external_links)
            ? item.external_links.map(link => this.validateLink(link)).filter(Boolean)
            : [];
        const interests = Array.isArray(item.interest_slugs)
            ? item.interest_slugs.filter(value => /^[a-z0-9_]{2,50}$/.test(value))
            : [];
        return { ...item, external_links: links, interest_slugs: interests };
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
        list.innerHTML = this.developments.map(item => this.cardMarkup(item)).join('');
        this.bindCards();
        this.updateHeader();
        this.updateEndState();
        this.updatePublishedTime();
    }

    cardMarkup(item) {
        const [title, detail] = this.splitSummary(item.summary);
        const seen = Boolean(this.seen[item.id]);
        const evidenceLabel = item.evidence_state === 'source_backed' ? 'Source-backed' : 'Reported';
        const topics = item.interest_slugs.map(slug => this.topicLabel(slug));
        const links = item.external_links.map(link => this.linkMarkup(link, item.id)).join('');
        return `
            <article class="development-card${seen ? ' seen' : ''}" data-development-id="${item.id}">
                <div class="development-meta">
                    <time datetime="${this.escapeHtml(item.occurred_at)}">${this.formatOccurred(item.occurred_at)}</time>
                    ${topics.map(topic => `<span class="development-topic">${this.escapeHtml(topic)}</span>`).join('')}
                    <span class="development-evidence ${item.evidence_state}">${evidenceLabel}</span>
                </div>
                <h3>${this.escapeHtml(title)}</h3>
                ${detail ? `<p>${this.escapeHtml(detail)}</p>` : ''}
                ${links ? `<div class="development-links">${links}</div>` : ''}
                <div class="development-card-footer">
                    <button class="development-seen-toggle" type="button" data-seen-toggle="${item.id}"
                        aria-label="${seen ? 'Mark this development unseen' : 'Mark this development seen'}">
                        ${seen ? 'Mark unseen' : 'Mark seen'}
                    </button>
                </div>
            </article>
        `;
    }

    linkMarkup(link, developmentId) {
        const image = link.preview_image_url
            ? `<img src="${this.escapeHtml(link.preview_image_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : '';
        return `
            <a class="development-link" href="${this.escapeHtml(link.url)}" target="_blank"
                rel="noopener noreferrer" referrerpolicy="no-referrer" data-seen-link="${developmentId}">
                ${image}
                <span class="development-link-copy">
                    <strong>${this.escapeHtml(link.title)}</strong>
                    <small>${this.escapeHtml(link.domain)}</small>
                </span>
                <span class="development-link-arrow" aria-hidden="true">→</span>
            </a>
        `;
    }

    bindCards() {
        const list = document.getElementById('development-list');
        list.querySelectorAll('.development-card').forEach(card => {
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
        list.querySelectorAll('.development-link img').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
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
        this.updateEndState();
    }

    updateHeader() {
        if (this.activeView !== 'updates') return;
        const count = this.developments.length;
        document.getElementById('feed-count').textContent =
            `${count} development${count === 1 ? '' : 's'}`;
        const countBadge = document.getElementById('updates-view-count');
        countBadge.textContent = String(count);
        countBadge.classList.remove('hidden');

        const next = document.getElementById('awareness-next-update');
        if (this.payload?.next_update_at) {
            next.textContent = this.nextUpdateLabel(this.payload.next_update_at);
            next.classList.remove('hidden');
        } else {
            next.classList.add('hidden');
        }
    }

    updateEndState() {
        const end = document.getElementById('awareness-end');
        const through = this.payload?.scheduled_for
            ? this.formatClock(this.payload.scheduled_for)
            : null;
        const next = this.payload?.next_update_at
            ? this.nextUpdateLabel(this.payload.next_update_at, false)
            : 'the next scheduled release';
        const caughtUp = this.developments.length === 0 ||
            this.developments.every(item => this.seen[item.id]);
        const heading = caughtUp && through
            ? `You’re caught up through ${through}`
            : 'End of this sealed update';
        end.innerHTML = `
            <strong>${heading}</strong>
            <span>There is nothing else to load. The next update is ${this.escapeHtml(next)}.</span>
        `;
        end.classList.remove('hidden');
    }

    updatePublishedTime() {
        const lastUpdated = document.getElementById('last-updated');
        if (!lastUpdated || !this.payload?.published_at) return;
        lastUpdated.textContent = `Published ${this.formatOccurred(this.payload.published_at)}`;
    }

    renderError() {
        const loading = document.getElementById('awareness-loading');
        loading?.classList.add('hidden');
        loading?.setAttribute('aria-busy', 'false');
        const coverage = document.getElementById('awareness-coverage');
        coverage.textContent = 'The latest scheduled update could not be loaded. Sieve will try again at the next scheduled release.';
        coverage.classList.remove('hidden');
        document.getElementById('development-list').innerHTML = '';
        const end = document.getElementById('awareness-end');
        end.innerHTML = `
            <strong>No live refresh is available</strong>
            <span>This view changes only when the next sealed update is published.</span>
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

    nextUpdateLabel(value, includePrefix = true) {
        const date = new Date(value);
        const time = this.formatClock(value);
        if (!Number.isFinite(date.getTime())) return '';
        const zone = this.payload?.timezone || 'Australia/Adelaide';
        const day = this.dateKey(date, zone);
        const today = this.dateKey(new Date(), zone);
        const tomorrow = this.dateKey(new Date(Date.now() + 24 * 60 * 60 * 1000), zone);
        const relative = day === today ? `at ${time}` : day === tomorrow ? `tomorrow at ${time}` : `at ${time}`;
        return includePrefix ? `Next update ${relative}` : relative;
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
