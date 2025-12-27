/**
 * FeedSieve Frontend Application
 * Clean, Feedly-inspired feed reader interface
 */

const FEED_URL = 'data/feed.json';

class FeedSieve {
    constructor() {
        this.items = [];
        this.filteredItems = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.sortBy = 'date';
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadFeed();
    }

    bindEvents() {
        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterClick(e));
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
            this.updateCounts();
            this.applyFilters();
            this.updateLastUpdated(data.updated_at);
        } catch (error) {
            console.error('Failed to load feed:', error);
            this.showError();
        }
    }

    handleFilterClick(e) {
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;

        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.currentFilter = filter;
        this.updateFeedTitle(filter);
        this.applyFilters();
    }

    updateFeedTitle(filter) {
        const titles = {
            all: 'All Articles',
            rss: 'RSS Feeds',
            youtube: 'YouTube',
            blog: 'Blogs',
            nitter: 'Twitter/X'
        };
        document.getElementById('feed-title').textContent = titles[filter] || 'All Articles';
    }

    applyFilters() {
        this.filteredItems = this.items.filter(item => {
            // Type filter
            if (this.currentFilter !== 'all') {
                const itemType = item.source_type || 'rss';
                if (itemType !== this.currentFilter) return false;
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
        const counts = { all: this.items.length, rss: 0, youtube: 0, blog: 0, nitter: 0 };

        this.items.forEach(item => {
            const type = item.source_type || 'rss';
            if (counts[type] !== undefined) counts[type]++;
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

        return `
            <article class="article-item" onclick="window.open('${this.escapeHtml(url)}', '_blank')">
                <div class="article-header">
                    <span class="source-badge ${sourceType}">${sourceType}</span>
                    ${sourceName ? `<span class="source-name">${this.escapeHtml(sourceName)}</span>` : ''}
                    <span class="article-date">${date}</span>
                </div>
                <h3 class="article-title">
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
                        ${this.escapeHtml(item.title)}
                    </a>
                </h3>
                <p class="article-summary">${this.escapeHtml(item.summary || '')}</p>
            </article>
        `;
    }

    renderIdeas(ideas) {
        if (!ideas || ideas.length === 0) return '';

        const tags = ideas.slice(0, 4).map(idea =>
            `<span class="idea-tag">${this.escapeHtml(idea)}</span>`
        ).join('');

        const more = ideas.length > 4 ? `<span class="idea-tag">+${ideas.length - 4} more</span>` : '';

        return `<div class="article-ideas">${tags}${more}</div>`;
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
            const date = new Date(timestamp);
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
