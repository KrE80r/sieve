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
        this.init();
    }

    async init() {
        this.bindEvents();
        this.setupMobileMenu();
        this.setupBackToTop();
        this.setupPullToRefresh();
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

    setupPullToRefresh() {
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshFeed());
        }

        // Pull-to-refresh on article list
        const list = document.getElementById('article-list');
        if (!list) return;

        const indicator = document.createElement('div');
        indicator.className = 'pull-indicator';
        indicator.textContent = 'Release to refresh';
        list.parentNode.insertBefore(indicator, list);

        let startY = 0, pulling = false;

        list.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        list.addEventListener('touchmove', (e) => {
            if (!pulling) return;
            const delta = e.touches[0].clientY - startY;
            if (delta > 0 && window.scrollY === 0) {
                indicator.style.height = Math.min(delta * 0.5, 60) + 'px';
            }
        }, { passive: true });

        list.addEventListener('touchend', () => {
            if (!pulling) return;
            const h = parseInt(indicator.style.height) || 0;
            if (h > 40) {
                indicator.classList.add('active');
                indicator.textContent = 'Refreshing...';
                this.refreshFeed().then(() => {
                    indicator.classList.remove('active');
                    indicator.style.height = '0';
                    indicator.textContent = 'Release to refresh';
                });
            } else {
                indicator.style.height = '0';
            }
            pulling = false;
        }, { passive: true });
    }

    async refreshFeed() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.classList.add('spinning');
        await this.loadFeed();
        if (refreshBtn) refreshBtn.classList.remove('spinning');
    }

    setupBackToTop() {
        const btn = document.createElement('button');
        btn.className = 'back-to-top';
        btn.setAttribute('aria-label', 'Back to top');
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        document.body.appendChild(btn);

        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

        window.addEventListener('scroll', () => {
            const threshold = window.innerHeight * 2;
            btn.classList.toggle('visible', window.scrollY > threshold);
        }, { passive: true });
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
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value.toLowerCase();
                    this.applyFilters();
                }, 200);
            });
        }

        // Sort pills
        document.querySelectorAll('.sort-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                document.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.sortBy = e.currentTarget.dataset.sort;
                this.applyFilters();
            });
        });

        // Search toggle (mobile)
        const searchToggle = document.getElementById('search-toggle');
        const headerRight = document.getElementById('header-right');
        if (searchToggle && headerRight) {
            searchToggle.addEventListener('click', () => {
                headerRight.classList.toggle('expanded');
                searchToggle.classList.toggle('active');
                if (headerRight.classList.contains('expanded')) {
                    const input = document.getElementById('search-input');
                    if (input) input.focus();
                }
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
        this.items.forEach(item => {
            const labels = item.labels || [];
            labels.forEach(label => {
                if (!this.categories[label]) {
                    this.categories[label] = 0;
                }
                this.categories[label]++;
            });
        });
    }

    renderCategoriesList() {
        const container = document.getElementById('categories-list');
        if (!container) return;

        const categoryIcons = {
            'CyberSecurity': '🛡️',
            'AI': '🤖',
            'Productivity': '📈',
            'Tech': '💻',
            'Sysadmin': '⚙️',
            'Philosophy': '🧠'
        };

        const categories = Object.keys(this.categories).sort((a, b) =>
            this.categories[b] - this.categories[a]
        );

        if (categories.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = categories.map(category => `
            <button class="nav-item" data-filter="category" data-category="${category}">
                <span class="nav-icon">${categoryIcons[category] || '🏷️'}</span>
                ${category}
                <span class="nav-count">${this.categories[category]}</span>
            </button>
        `).join('');

        // Bind click events to category buttons
        container.querySelectorAll('[data-filter="category"]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleCategoryClick(e));
        });
    }

    renderSourceLists() {
        const types = ['rss', 'youtube', 'newsletter', 'nitter'];

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

    handleCategoryClick(e) {
        const btn = e.currentTarget;
        const category = btn.dataset.category;

        this.setActiveNav(btn);
        this.currentFilter = 'category';
        this.currentCategory = category;
        this.currentSource = null;

        document.getElementById('feed-title').textContent = category;
        this.applyFilters();
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
            newsletter: 'Newsletters',
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
            if (['rss', 'youtube', 'newsletter', 'nitter'].includes(this.currentFilter)) {
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
            newsletter: 0,
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

        // Apply read state from localStorage
        list.querySelectorAll('.article-item').forEach(article => {
            const itemId = article.dataset.itemId;
            if (this.isRead(itemId)) {
                article.classList.add('read');
            }
        });

        // Bind click handlers for modal
        list.querySelectorAll('.article-item').forEach(article => {
            article.addEventListener('click', (e) => {
                if (e.target.closest('.read-link')) return;
                if (e.target.closest('.mark-unread-btn')) return;

                const itemId = parseInt(article.dataset.itemId);
                const item = this.items.find(i => i.id === itemId);
                if (item) {
                    this.markAsRead(itemId);
                    this.showModal(item);
                }
            });
        });

        // Bind mark-unread buttons
        list.querySelectorAll('.mark-unread-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = e.currentTarget.dataset.itemId;
                this.markAsUnread(itemId);
            });
        });

        // Bind "Read Original" links to mark as read
        list.querySelectorAll('.read-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const article = e.target.closest('.article-item');
                const itemId = article.dataset.itemId;
                this.markAsRead(itemId);
            });
        });
    }

    isRead(itemId) {
        return localStorage.getItem('read_' + itemId) === 'true';
    }

    markAsRead(itemId) {
        localStorage.setItem('read_' + itemId, 'true');
        const article = document.querySelector(`[data-item-id="${itemId}"]`);
        if (article) {
            article.classList.add('read');
        }
    }

    markAsUnread(itemId) {
        localStorage.removeItem('read_' + itemId);
        const article = document.querySelector(`[data-item-id="${itemId}"]`);
        if (article) {
            article.classList.remove('read');
        }
    }

    showModal(item) {
        const itemIndex = this.filteredItems.findIndex(i => i.id === item.id);
        this._showModalAtIndex(itemIndex !== -1 ? itemIndex : 0);
    }

    _showModalAtIndex(index) {
        // Remove existing modal if navigating
        const existing = document.querySelector('.modal-overlay');
        if (existing) {
            existing.remove();
        }

        const item = this.filteredItems[index];
        if (!item) return;

        this.currentModalIndex = index;
        const url = item.original_url || item.url || '#';
        const ideas = item.ideas || [];
        const rating = item.rating || null;
        const ratingHtml = rating ? this.createRatingBadgeHtml(rating, 'modal-rating') : '';
        const hasPrev = index > 0;
        const hasNext = index < this.filteredItems.length - 1;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                ${ratingHtml}
                <div class="modal-body">
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
                </div>
                <div class="modal-footer">
                    <div class="modal-nav">
                        <button class="modal-nav-btn" data-dir="prev" ${!hasPrev ? 'disabled style="opacity:0.3;pointer-events:none"' : ''}>&#8592;</button>
                        <button class="modal-nav-btn" data-dir="next" ${!hasNext ? 'disabled style="opacity:0.3;pointer-events:none"' : ''}>&#8594;</button>
                    </div>
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="read-link">
                        Read Original →
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Mark as read
        this.markAsRead(item.id);

        // Push history state (only on first open, not on nav)
        if (!existing) {
            history.pushState({ modal: true }, '');
        }

        const closeModal = () => {
            if (!document.body.contains(modal)) return;
            modal.remove();
            document.body.style.overflow = '';
            this.currentModalIndex = null;
            document.removeEventListener('keydown', onKeydown);
            window.removeEventListener('popstate', onPopState);
        };

        const navigateModal = (dir) => {
            const newIndex = this.currentModalIndex + (dir === 'next' ? 1 : -1);
            if (newIndex >= 0 && newIndex < this.filteredItems.length) {
                document.removeEventListener('keydown', onKeydown);
                window.removeEventListener('popstate', onPopState);
                this._showModalAtIndex(newIndex);
            }
        };

        const onPopState = () => closeModal();
        window.addEventListener('popstate', onPopState);

        // Close handlers
        modal.querySelector('.modal-close').addEventListener('click', () => history.back());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) history.back();
        });

        // Nav buttons
        modal.querySelectorAll('.modal-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateModal(btn.dataset.dir);
            });
        });

        // Keyboard: Escape to close, j/k or arrows for nav
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                history.back();
            } else if (e.key === 'ArrowLeft' || e.key === 'k') {
                navigateModal('prev');
            } else if (e.key === 'ArrowRight' || e.key === 'j') {
                navigateModal('next');
            }
        };
        document.addEventListener('keydown', onKeydown);

        // Swipe-to-dismiss (vertical) and swipe nav (horizontal)
        const content = modal.querySelector('.modal-content');
        let startX = 0, startY = 0, deltaX = 0, deltaY = 0, swiping = null;

        content.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            deltaX = 0;
            deltaY = 0;
            swiping = null;
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            deltaX = e.touches[0].clientX - startX;
            deltaY = e.touches[0].clientY - startY;

            // Lock direction after 10px of movement
            if (!swiping && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                swiping = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
            }

            // Vertical swipe-to-dismiss (only when scrolled to top)
            if (swiping === 'vertical' && deltaY > 0 && content.scrollTop <= 0) {
                content.style.transform = `translateY(${deltaY}px)`;
                content.style.transition = 'none';
            }
        }, { passive: true });

        content.addEventListener('touchend', () => {
            if (swiping === 'vertical' && deltaY > 100 && content.scrollTop <= 0) {
                history.back();
            } else if (swiping === 'vertical') {
                content.style.transform = '';
                content.style.transition = '';
            }

            if (swiping === 'horizontal') {
                if (deltaX < -80) navigateModal('next');
                else if (deltaX > 80) navigateModal('prev');
            }

            swiping = null;
        }, { passive: true });
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

        return `
            <article class="article-item" data-item-id="${item.id}">
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
                    <button class="mark-unread-btn" data-item-id="${item.id}" title="Mark as unread">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="8" cy="8" r="6"/>
                        </svg>
                    </button>
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
