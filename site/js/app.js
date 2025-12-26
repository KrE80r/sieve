/**
 * FeedSieve Frontend Application
 * Fetches and renders AI-curated content from JSON feed
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
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterClick(e));
        });

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.applyFilters();
            });
        }

        const sortBtns = document.querySelectorAll('.sort-btn');
        sortBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleSortClick(e));
        });
    }

    async loadFeed() {
        try {
            const response = await fetch(FEED_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            this.items = data.items || [];
            this.applyFilters();
            this.updateStats(data);
            this.updateLastUpdated(data.generated_at);
        } catch (error) {
            console.error('Failed to load feed:', error);
            this.showError();
        }
    }

    handleFilterClick(e) {
        const btn = e.target;
        const filter = btn.dataset.filter;

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.currentFilter = filter;
        this.applyFilters();
    }

    handleSortClick(e) {
        const btn = e.target;
        const sort = btn.dataset.sort;

        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.sortBy = sort;
        this.applyFilters();
    }

    applyFilters() {
        this.filteredItems = this.items.filter(item => {
            if (this.currentFilter !== 'all' && item.source_type !== this.currentFilter) {
                return false;
            }

            if (this.searchQuery) {
                const searchIn = `${item.title} ${item.summary} ${item.source_name}`.toLowerCase();
                if (!searchIn.includes(this.searchQuery)) {
                    return false;
                }
            }

            return true;
        });

        this.sortItems();
        this.render();
    }

    sortItems() {
        this.filteredItems.sort((a, b) => {
            if (this.sortBy === 'rating') {
                return b.rating - a.rating;
            } else {
                const dateA = new Date(a.processed_at || a.published_at);
                const dateB = new Date(b.processed_at || b.published_at);
                return dateB - dateA;
            }
        });
    }

    render() {
        const grid = document.getElementById('card-grid');
        const noResults = document.getElementById('no-results');

        if (this.filteredItems.length === 0) {
            grid.innerHTML = '';
            noResults.classList.remove('hidden');
            return;
        }

        noResults.classList.add('hidden');
        grid.innerHTML = this.filteredItems.map(item => this.createCard(item)).join('');
    }

    createCard(item) {
        const ratingClass = this.getRatingClass(item.rating);
        const formattedDate = this.formatDate(item.processed_at || item.published_at);

        return `
            <article class="card">
                <div class="card-header">
                    <span class="source-badge ${item.source_type}">${item.source_type}</span>
                    <span class="rating ${ratingClass}">${item.rating}/100</span>
                </div>
                <h3 class="card-title">${this.escapeHtml(item.title)}</h3>
                <p class="card-summary">${this.escapeHtml(item.summary || 'No summary available.')}</p>
                <div class="card-footer">
                    <div class="card-meta">
                        <span class="source-name">${this.escapeHtml(item.source_name)}</span>
                        <span class="date">${formattedDate}</span>
                    </div>
                    <a href="${this.escapeHtml(item.original_url)}" target="_blank" rel="noopener noreferrer" class="read-link">
                        Read Original &rarr;
                    </a>
                </div>
            </article>
        `;
    }

    getRatingClass(rating) {
        if (rating >= 90) return 'high';
        if (rating >= 80) return 'mid';
        return 'low';
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    updateStats(data) {
        const stats = document.getElementById('stats');
        const typeCounts = this.items.reduce((acc, item) => {
            acc[item.source_type] = (acc[item.source_type] || 0) + 1;
            return acc;
        }, {});

        stats.innerHTML = `
            <span class="stat-item">
                <span class="stat-value">${data.total_items || this.items.length}</span> items
            </span>
            ${typeCounts.rss ? `<span class="stat-item"><span class="stat-value">${typeCounts.rss}</span> RSS</span>` : ''}
            ${typeCounts.youtube ? `<span class="stat-item"><span class="stat-value">${typeCounts.youtube}</span> YouTube</span>` : ''}
            ${typeCounts.blog ? `<span class="stat-item"><span class="stat-value">${typeCounts.blog}</span> Blogs</span>` : ''}
        `;
    }

    updateLastUpdated(timestamp) {
        const el = document.getElementById('last-updated');
        if (timestamp) {
            const date = new Date(timestamp);
            el.textContent = `Last updated: ${date.toLocaleString()}`;
        }
    }

    showError() {
        const grid = document.getElementById('card-grid');
        grid.innerHTML = `
            <div class="no-results">
                <p>Unable to load content. Please try again later.</p>
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
