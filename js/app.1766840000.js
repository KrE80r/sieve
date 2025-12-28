/**
 * FeedSieve Frontend Application
 * Mobile-first reading sanctuary with rating visibility
 */

const FEED_URL = 'data/feed.json';

class FeedSieve {
    constructor() {
        this.items = [];
        this.filteredItems = [];
        this.currentFilter = 'today';
        this.currentSource = null;
        this.currentCategory = null;
        this.searchQuery = '';
        this.sortBy = 'date';
        this.sources = {};
        this.categories = {};
        this.expandedGroups = new Set();
        this.readItems = new Set(JSON.parse(localStorage.getItem('readItems') || '[]'));
        this.init();
    }

    markAsRead(itemId) {
        this.readItems.add(itemId);
        localStorage.setItem('readItems', JSON.stringify([...this.readItems]));
    }

    markAsUnread(itemId) {
        this.readItems.delete(itemId);
        localStorage.setItem('readItems', JSON.stringify([...this.readItems]));
    }

    isRead(itemId) {
        return this.readItems.has(itemId);
    }

    async init() {
        this.bindEvents();
        this.setupMobileMenu();
        await this.loadFeed();
    }

    setupMobileMenu() {
        const menuToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (!menuToggle || !sidebar || !overlay) return;

        const closeSidebar = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.style.overflow = '';
        };

        const openSidebar = () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
            menuToggle.classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        overlay.addEventListener('click', closeSidebar);

        // Close sidebar when nav item is clicked on mobile
        sidebar.addEventListener('click', (e) => {
            if (e.target.closest('.nav-item:not(.nav-parent)') && window.innerWidth <= 768) {
                setTimeout(closeSidebar, 150);
            }
        });

        // Close sidebar on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });
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
            this.buildCategoryIndex();
            this.updateCounts();
            this.renderSourceLists();
            this.renderCategoriesList();
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

    buildCategoryIndex() {
        this.categories = {};
        const categoryIcons = {
            'CyberSecurity': '🔒',
            'AI': '🤖',
            'Productivity': '⚡',
            'Tech': '💻',
            'Sysadmin': '🖥️',
            'Philosophy': '🤔'
        };

        this.items.forEach(item => {
            const labels = item.labels || [];
            labels.forEach(label => {
                if (!this.categories[label]) {
                    this.categories[label] = {
                        count: 0,
                        icon: categoryIcons[label] || '🏷️'
                    };
                }
                this.categories[label].count++;
            });
        });
    }

    renderCategoriesList() {
        const container = document.getElementById('categories-list');
        if (!container) return;

        const categoryNames = Object.keys(this.categories);

        if (categoryNames.length === 0) {
            container.innerHTML = '<div class="nav-empty">No categories yet</div>';
            return;
        }

        container.innerHTML = categoryNames
            .sort((a, b) => this.categories[b].count - this.categories[a].count)
            .map(name => `
                <button class="nav-item" data-filter="category" data-category="${name}">
                    <span class="nav-icon">${this.categories[name].icon}</span>
                    ${this.escapeHtml(name)}
                    <span class="nav-count">${this.categories[name].count}</span>
                </button>
            `).join('');

        // Bind click events
        container.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleCategoryClick(e));
        });
    }

    handleCategoryClick(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const category = btn.dataset.category;

        this.setActiveNav(btn);
        this.currentFilter = 'category';
        this.currentCategory = category;
        this.currentSource = null;

        document.getElementById('feed-title').textContent = category;
        this.applyFilters();

        // Auto-close sidebar on mobile
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const menuToggle = document.getElementById('mobile-menu-toggle');

            if (sidebar && overlay && menuToggle) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                menuToggle.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
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
        this.currentCategory = null;
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
        this.currentCategory = null;

        const sourceName = this.sources[sourceType]?.[sourceId]?.name || 'Source';
        document.getElementById('feed-title').textContent = sourceName;
        this.applyFilters();

        // Auto-close sidebar on mobile when source is selected
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const menuToggle = document.getElementById('mobile-menu-toggle');

            if (sidebar && overlay && menuToggle) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                menuToggle.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    }

    handleFilterClick(e) {
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;

        this.setActiveNav(btn);
        this.currentFilter = filter;
        this.currentSource = null;
        this.currentCategory = null;
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

            // Category filter
            if (this.currentFilter === 'category' && this.currentCategory) {
                const labels = item.labels || [];
                if (!labels.includes(this.currentCategory)) return false;
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

        // Bind click handlers for modal
        list.querySelectorAll('.article-item').forEach(article => {
            article.addEventListener('click', (e) => {
                if (e.target.closest('.read-link')) return;
                const itemId = parseInt(article.dataset.itemId);
                const item = this.items.find(i => i.id === itemId);
                if (item) this.showModal(item);
            });
        });
    }

    showModal(item) {
        const url = item.original_url || item.url || '#';
        const ideas = item.ideas || [];
        const rating = item.rating || null;
        const ratingHtml = rating ? this.createRatingBadgeHtml(rating, 'modal-rating') : '';

        // Mark as read when modal opens
        this.markAsRead(item.id);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                ${ratingHtml}
                <div class="modal-header">
                    <span class="source-badge ${item.source_type || 'rss'}">${item.source_type || 'rss'}</span>
                    <span class="source-name">${this.escapeHtml(item.source_name || '')}</span>
                </div>
                <h2 class="modal-title">${this.escapeHtml(item.title)}</h2>
                ${item.summary ? `<div class="modal-summary">${this.escapeHtml(item.summary)}</div>` : ''}
                ${ideas.length > 0 ? `
                    <div class="modal-ideas">
                        <h4>Key Ideas</h4>
                        <div class="modal-ideas-chips">
                            ${ideas.map(idea => `<span class="modal-idea-chip">${this.escapeHtml(idea)}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="modal-footer">
                    <button class="mark-unread-btn" data-item-id="${item.id}">
                        Mark as Unread
                    </button>
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="read-link">
                        Read Original →
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Mark as unread button
        const unreadBtn = modal.querySelector('.mark-unread-btn');
        unreadBtn.addEventListener('click', () => {
            this.markAsUnread(item.id);
            modal.remove();
            document.body.style.overflow = '';
            this.render(); // Re-render to update visual state
        });

        // Close handlers
        const closeModal = () => {
            modal.remove();
            document.body.style.overflow = '';
            this.render(); // Re-render to update visual state
        };

        modal.querySelector('.modal-close').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const closeOnEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', closeOnEsc);
            }
        };
        document.addEventListener('keydown', closeOnEsc);
    }

    createArticle(item) {
        const sourceName = item.source_name || '';
        const date = this.formatDate(item.published_at || item.processed_at);
        const url = item.original_url || item.url || '#';
        const summaryPreview = item.summary ? this.truncate(item.summary, 150) : '';
        const ideas = item.ideas || [];
        const ideasHtml = ideas.length > 0 ? this.renderIdeasChips(ideas.slice(0, 3)) : '';
        const rating = item.rating || null;
        const ratingBadgeHtml = rating ? this.createRatingBadgeHtml(rating, 'rating-badge') : '';
        const readClass = this.isRead(item.id) ? ' read' : '';

        return `
            <article class="article-item${readClass}" data-item-id="${item.id}">
                <div class="article-header">
                    <div class="article-meta">
                        ${sourceName ? `<span class="source-name">${this.escapeHtml(sourceName)}</span>` : ''}
                        <span class="article-date">${date}</span>
                    </div>
                    ${ratingBadgeHtml}
                </div>
                <h3 class="article-title">${this.escapeHtml(item.title)}</h3>
                ${summaryPreview ? `<p class="article-preview">${this.escapeHtml(summaryPreview)}</p>` : ''}
                <div class="article-footer">
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="read-link" onclick="event.stopPropagation()">
                        Read Original →
                    </a>
                </div>
            </article>
        `;
    }

    createRatingBadgeHtml(rating, className) {
        const ratingClass = this.getRatingClass(rating);
        return `<div class="${className} ${ratingClass}">${rating}</div>`;
    }

    getRatingClass(rating) {
        if (rating >= 95) return 'rating-excellent';
        if (rating >= 90) return 'rating-great';
        return 'rating-good';
    }

    truncate(str, maxLen) {
        if (!str || str.length <= maxLen) return str;
        return str.substring(0, maxLen).trim() + '...';
    }

    renderIdeasChips(ideas) {
        if (!ideas || ideas.length === 0) return '';

        const chips = ideas.map(idea =>
            `<span class="idea-chip">${this.escapeHtml(idea)}</span>`
        ).join('');

        return `<div class="article-ideas">${chips}</div>`;
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
