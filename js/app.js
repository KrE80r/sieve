/**
 * FeedSieve Frontend Application
 * Feedly-inspired feed reader with Today view and hierarchical sources
 */

const FEED_URL = 'data/feed.json';

class FeedSieve {
    constructor() {
        this.items = [];
        this.filteredItems = [];
        this.currentFilter = 'today';
        this.currentSource = null;
        this.searchQuery = '';
        this.sortBy = 'date';
        this.sources = {};
        this.expandedGroups = new Set();
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadFeed();
    }

    bindEvents() {
        // Timeline and type filter buttons
        document.querySelectorAll('.nav-item:not(.nav-parent):not(.nav-child)').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterClick(e));
        });

        // Parent type buttons (RSS, YouTube, etc.)
        document.querySelectorAll('.nav-parent').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleParentClick(e));
        });

        // Search
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.applyFilters();
            });
        }

        // Sort
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.applyFilters();
            });
        }
    }

    async loadFeed() {
        try {
            const response = await fetch(FEED_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.items = data.items || [];
            this.buildSourceIndex();
            this.updateCounts();
            this.renderSourceLists();
            this.applyFilters();
            this.updateLastUpdated(data.updated_at);
        } catch (error) {
            console.error('Failed to load feed:', error);
            this.showError();
        }
    }

    buildSourceIndex() {
        this.sources = {};
        this.items.forEach(item => {
            const type = item.source_type || 'rss';
            const sourceName = item.source_name || 'Unknown';
            const sourceId = item.source_id;

            if (!this.sources[type]) {
                this.sources[type] = {};
            }
            if (!this.sources[type][sourceId]) {
                this.sources[type][sourceId] = {
                    name: sourceName,
                    count: 0
                };
            }
            this.sources[type][sourceId].count++;
        });
    }

    renderSourceLists() {
        const types = ['rss', 'youtube', 'blog', 'nitter'];

        types.forEach(type => {
            const container = document.getElementById(`sources-${type}`);
            if (!container) return;

            const typeSources = this.sources[type] || {};
            const sourceIds = Object.keys(typeSources);

            if (sourceIds.length === 0) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = sourceIds
                .sort((a, b) => typeSources[b].count - typeSources[a].count)
                .map(sourceId => `
                    <button class="nav-item nav-child" data-filter="source" data-source-id="${sourceId}" data-source-type="${type}">
                        <span class="nav-icon">•</span>
                        ${this.escapeHtml(typeSources[sourceId].name)}
                        <span class="nav-count">${typeSources[sourceId].count}</span>
                    </button>
                `).join('');

            // Bind click events to source items
            container.querySelectorAll('.nav-child').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleSourceClick(e));
            });
        });
    }

    handleParentClick(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;
        const group = btn.closest('.nav-group');

        // Toggle expand/collapse
        if (group) {
            group.classList.toggle('expanded');
            const toggle = btn.querySelector('.nav-toggle');
            if (toggle) {
                toggle.textContent = group.classList.contains('expanded') ? '▲' : '▼';
            }
        }

        // Also filter by this type
        this.setActiveNav(btn);
        this.currentFilter = filter;
        this.currentSource = null;
        this.updateFeedTitle(filter);
        this.applyFilters();
    }

    handleSourceClick(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const sourceId = btn.dataset.sourceId;
        const sourceType = btn.dataset.sourceType;

        this.setActiveNav(btn);
        this.currentFilter = 'source';
        this.currentSource = { id: sourceId, type: sourceType };

        const sourceName = this.sources[sourceType]?.[sourceId]?.name || 'Source';
        document.getElementById('feed-title').textContent = sourceName;
        this.applyFilters();
    }

    handleFilterClick(e) {
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;

        this.setActiveNav(btn);
        this.currentFilter = filter;
        this.currentSource = null;
        this.updateFeedTitle(filter);
        this.applyFilters();
    }

    setActiveNav(activeBtn) {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    updateFeedTitle(filter) {
        const titles = {
            today: 'Today',
            week: 'This Week',
            all: 'All Articles',
            rss: 'RSS Feeds',
            youtube: 'YouTube',
            blog: 'Blogs',
            nitter: 'Twitter/X'
        };
        document.getElementById('feed-title').textContent = titles[filter] || 'All Articles';
    }

    isToday(dateStr) {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    isThisWeek(dateStr) {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return date >= weekAgo;
    }

    applyFilters() {
        this.filteredItems = this.items.filter(item => {
            const itemDate = item.published_at || item.processed_at;

            // Time-based filters
            if (this.currentFilter === 'today') {
                if (!this.isToday(itemDate)) return false;
            } else if (this.currentFilter === 'week') {
                if (!this.isThisWeek(itemDate)) return false;
            }

            // Type filter
            if (['rss', 'youtube', 'blog', 'nitter'].includes(this.currentFilter)) {
                const itemType = item.source_type || 'rss';
                if (itemType !== this.currentFilter) return false;
            }

            // Source filter
            if (this.currentFilter === 'source' && this.currentSource) {
                if (String(item.source_id) !== String(this.currentSource.id)) return false;
            }

            // Search filter
            if (this.searchQuery) {
                const searchIn = `${item.title} ${item.summary} ${item.source_name || ''}`.toLowerCase();
                if (!searchIn.includes(this.searchQuery)) return false;
            }

            return true;
        });

        this.sortItems();
        this.render();
    }

    sortItems() {
        this.filteredItems.sort((a, b) => {
            if (this.sortBy === 'rating') {
                return (b.rating || 0) - (a.rating || 0);
            }
            const dateA = new Date(a.published_at || a.processed_at || 0);
            const dateB = new Date(b.published_at || b.processed_at || 0);
            return dateB - dateA;
        });
    }

    updateCounts() {
        const counts = {
            all: this.items.length,
            today: 0,
            week: 0,
            rss: 0,
            youtube: 0,
            blog: 0,
            nitter: 0
        };

        this.items.forEach(item => {
            const type = item.source_type || 'rss';
            const itemDate = item.published_at || item.processed_at;

            if (counts[type] !== undefined) counts[type]++;
            if (this.isToday(itemDate)) counts.today++;
            if (this.isThisWeek(itemDate)) counts.week++;
        });

        Object.keys(counts).forEach(key => {
            const el = document.getElementById(`count-${key}`);
            if (el) el.textContent = counts[key];
        });
    }

    render() {
        const list = document.getElementById('article-list');
        const noResults = document.getElementById('no-results');
        const feedCount = document.getElementById('feed-count');

        feedCount.textContent = `${this.filteredItems.length} article${this.filteredItems.length !== 1 ? 's' : ''}`;

        if (this.filteredItems.length === 0) {
            list.innerHTML = '';
            noResults.classList.remove('hidden');
            return;
        }

        noResults.classList.add('hidden');
        list.innerHTML = this.filteredItems.map(item => this.createArticle(item)).join('');
    }

    createArticle(item) {
        const sourceType = item.source_type || 'rss';
        const sourceName = item.source_name || '';
        const date = this.formatDate(item.published_at || item.processed_at);
        const url = item.original_url || item.url || '#';
        const ideas = this.renderIdeas(item.ideas);
        const summary = item.summary ? `<div class="article-summary">${this.escapeHtml(item.summary)}</div>` : '';

        return `
            <article class="article-item">
                <div class="article-header">
                    <span class="source-badge ${sourceType}">${sourceType}</span>
                    ${sourceName ? `<span class="source-name">${this.escapeHtml(sourceName)}</span>` : ''}
                    <span class="article-date">${date}</span>
                </div>
                <h3 class="article-title">
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener">
                        ${this.escapeHtml(item.title)}
                    </a>
                </h3>
                ${summary}
                ${ideas}
                <div class="article-footer">
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="read-link">
                        Read Original →
                    </a>
                </div>
            </article>
        `;
    }

    renderIdeas(ideas) {
        if (!ideas || ideas.length === 0) return '';

        const tags = ideas.map(idea =>
            `<span class="idea-tag">${this.escapeHtml(idea)}</span>`
        ).join('');

        return `<div class="article-ideas">${tags}</div>`;
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffHours < 1) return 'Just now';
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    }

    updateLastUpdated(timestamp) {
        const el = document.getElementById('last-updated');
        if (el && timestamp) {
            el.textContent = `Updated ${this.formatDate(timestamp)}`;
        }
    }

    showError() {
        const list = document.getElementById('article-list');
        list.innerHTML = `
            <div class="no-results">
                <p>Unable to load articles. Please try again later.</p>
            </div>
        `;
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FeedSieve();
});
