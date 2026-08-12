/**
 * FeedSieve Frontend Application
 * Mobile-first reading sanctuary with rating visibility
 */

const FEED_URL = 'data/feed.json';

class FeedSieve {
    constructor() {
        this.items = [];
        this.filteredItems = [];
        this.timeFilter = 'today';
        this.typeFilter = null;
        this.categoryFilter = null;
        this.sourceFilter = null;
        this.searchQuery = '';
        this.sortBy = 'date';
        this.sources = {};
        this.categories = {};
        this.expandedGroups = new Set();
        this.lastUpdated = null;
        this.init();
    }

    async init() {
        this.bindEvents();
        this.bindMobileFilters();
        this.bindSourceSheet();
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
            this.lastUpdated = data.updated_at || null;
            this.buildSourceIndex();
            this.buildCategoryIndex();
            this.updateCounts();
            this.renderSourceLists();
            this.renderCategoriesList();
            this.renderMobileFilters();
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

    renderMobileFilters() {
        const catContainer = document.getElementById('mobile-category-pills');
        if (!catContainer) return;

        const cats = Object.keys(this.categories).sort((a, b) =>
            this.categories[b] - this.categories[a]
        );

        catContainer.innerHTML = cats.map(cat =>
            `<button class="filter-pill" data-filter="category" data-category="${cat}">${cat} <span class="pill-count">${this.categories[cat]}</span></button>`
        ).join('');

        // Bind category pill clicks
        catContainer.querySelectorAll('.filter-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                const cat = e.currentTarget.dataset.category;
                if (this.categoryFilter === cat) {
                    // Toggle off
                    this.categoryFilter = null;
                    e.currentTarget.classList.remove('active');
                } else {
                    // Activate this, deactivate others in row
                    catContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.categoryFilter = cat;
                }
                this.sourceFilter = null;
                this.updateSourceChip(null);
                this.applyFilters();
            });
        });
    }

    bindMobileFilters() {
        // Time pills
        const timePills = document.getElementById('mobile-time-pills');
        if (timePills) {
            timePills.querySelectorAll('.filter-pill').forEach(pill => {
                pill.addEventListener('click', (e) => {
                    timePills.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.timeFilter = e.currentTarget.dataset.filter;
                    this.sourceFilter = null;
                    this.updateSourceChip(null);
                    this.applyFilters();
                });
            });
        }

        // Sort pills in mobile filter bar
        const mobileSortPills = document.getElementById('mobile-sort-pills');
        if (mobileSortPills) {
            mobileSortPills.querySelectorAll('.sort-pill').forEach(pill => {
                pill.addEventListener('click', (e) => {
                    // Sync both desktop and mobile sort pills
                    document.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
                    document.querySelectorAll(`.sort-pill[data-sort="${e.currentTarget.dataset.sort}"]`).forEach(p => p.classList.add('active'));
                    this.sortBy = e.currentTarget.dataset.sort;
                    this.applyFilters();
                });
            });
        }
    }

    bindSourceSheet() {
        const btn = document.getElementById('source-filter-btn');
        const overlay = document.getElementById('source-sheet-overlay');
        const sheet = document.getElementById('source-sheet');
        const listEl = document.getElementById('source-sheet-list');
        const chipClear = document.querySelector('.active-source-chip-clear');
        const handle = sheet?.querySelector('.source-sheet-handle');

        if (!btn || !overlay || !listEl) return;

        const typeIcons = {
            rss: '📡', youtube: '🎬', newsletter: '📧',
            nitter: '🐦', github: '🐙', digest: '📰'
        };
        const typeNames = {
            rss: 'RSS Feeds', youtube: 'YouTube', newsletter: 'Newsletters',
            nitter: 'Twitter/X', github: 'GitHub', digest: 'Digests'
        };

        let onKeydown = null;

        const openSheet = () => {
            if (document.querySelector('.modal-overlay')) return; // don't open over article modal

            const types = ['rss', 'youtube', 'newsletter', 'nitter', 'github', 'digest'];
            let html = '';

            types.forEach(type => {
                const typeSources = this.sources[type] || {};
                const sourceIds = Object.keys(typeSources);
                if (sourceIds.length === 0) return;

                html += `<div class="source-sheet-group">
                    <div class="source-sheet-group-header">
                        <span class="group-icon">${typeIcons[type]}</span>
                        ${typeNames[type]}
                    </div>`;

                sourceIds
                    .sort((a, b) => typeSources[b].count - typeSources[a].count)
                    .forEach(sourceId => {
                        const isActive = this.sourceFilter &&
                            this.sourceFilter.id === sourceId &&
                            this.sourceFilter.type === type;
                        html += `<button class="source-sheet-item${isActive ? ' active' : ''}"
                            data-source-id="${sourceId}" data-source-type="${type}">
                            <span>${this.escapeHtml(typeSources[sourceId].name)}</span>
                            <span class="source-sheet-item-count">${typeSources[sourceId].count}</span>
                        </button>`;
                    });

                html += `</div>`;
            });

            if (!html) {
                html = '<p style="color:var(--color-text-muted);text-align:center;padding:var(--spacing-lg)">No sources available</p>';
            }

            listEl.innerHTML = html;
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            btn.setAttribute('aria-expanded', 'true');

            // Focus first item for keyboard accessibility
            const firstItem = listEl.querySelector('.source-sheet-item');
            if (firstItem) firstItem.focus();

            // Escape key to close
            onKeydown = (e) => { if (e.key === 'Escape') closeSheet(); };
            document.addEventListener('keydown', onKeydown);
        };

        const closeSheet = () => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
            if (onKeydown) {
                document.removeEventListener('keydown', onKeydown);
                onKeydown = null;
            }
        };

        btn.addEventListener('click', openSheet);

        // Event delegation for source items (bound once, not per-open)
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.source-sheet-item');
            if (!item) return;

            const sourceId = item.dataset.sourceId;
            const sourceType = item.dataset.sourceType;
            const sourceName = this.sources[sourceType]?.[sourceId]?.name || 'Source';

            this.typeFilter = null;
            this.categoryFilter = null;
            this.sourceFilter = { id: sourceId, type: sourceType };

            // Clear category pills active state
            const catContainer = document.getElementById('mobile-category-pills');
            if (catContainer) catContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));

            document.getElementById('feed-title').textContent = sourceName;
            this.applyFilters();
            closeSheet();
            this.updateSourceChip(sourceName);
        });

        // Close on overlay tap (outside sheet)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet();
        });

        // Swipe-to-dismiss only from handle area (not the scrollable list)
        if (handle) {
            let handleStartY = 0;
            handle.addEventListener('touchstart', (e) => {
                handleStartY = e.touches[0].clientY;
            }, { passive: true });
            handle.addEventListener('touchend', (e) => {
                const dy = e.changedTouches[0].clientY - handleStartY;
                if (dy > 60) closeSheet();
            }, { passive: true });
        }

        // Chip clear
        if (chipClear) {
            chipClear.addEventListener('click', () => {
                this.sourceFilter = null;
                this.updateSourceChip(null);
                this.updateFeedTitle(this.timeFilter);
                this.applyFilters();
            });
        }
    }

    updateSourceChip(sourceName) {
        const chip = document.getElementById('active-source-chip');
        const chipLabel = chip?.querySelector('.active-source-chip-label');
        const btn = document.getElementById('source-filter-btn');
        const badge = btn?.querySelector('.source-filter-badge');

        if (sourceName) {
            if (chipLabel) chipLabel.textContent = sourceName;
            chip?.classList.remove('hidden');
            btn?.classList.add('active');
            badge?.classList.remove('hidden');
        } else {
            chip?.classList.add('hidden');
            btn?.classList.remove('active');
            badge?.classList.add('hidden');
        }
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
        const types = ['rss', 'youtube', 'newsletter', 'nitter', 'github', 'digest'];

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

    // Sidebar handlers (desktop — exclusive behavior)
    handleParentClick(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;
        const group = btn.closest('.nav-group');

        if (group) {
            group.classList.toggle('expanded');
            const toggle = btn.querySelector('.nav-toggle');
            if (toggle) {
                toggle.textContent = group.classList.contains('expanded') ? '▲' : '▼';
            }
        }

        this.setActiveNav(btn);
        this.typeFilter = filter;
        this.categoryFilter = null;
        this.sourceFilter = null;
        this.updateFeedTitle(filter);
        this.updateSourceChip(null);
        this.applyFilters();
    }

    handleSourceClick(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const sourceId = btn.dataset.sourceId;
        const sourceType = btn.dataset.sourceType;

        this.setActiveNav(btn);
        this.typeFilter = null;
        this.categoryFilter = null;
        this.sourceFilter = { id: sourceId, type: sourceType };

        const sourceName = this.sources[sourceType]?.[sourceId]?.name || 'Source';
        document.getElementById('feed-title').textContent = sourceName;
        this.updateSourceChip(sourceName);
        this.applyFilters();
    }

    handleCategoryClick(e) {
        const btn = e.currentTarget;
        const category = btn.dataset.category;

        this.setActiveNav(btn);
        this.typeFilter = null;
        this.categoryFilter = category;
        this.sourceFilter = null;

        document.getElementById('feed-title').textContent = category;
        this.updateSourceChip(null);
        this.applyFilters();
    }

    handleFilterClick(e) {
        const btn = e.currentTarget;
        const filter = btn.dataset.filter;

        this.setActiveNav(btn);
        this.timeFilter = filter;
        this.typeFilter = null;
        this.categoryFilter = null;
        this.sourceFilter = null;
        this.updateFeedTitle(filter);
        this.updateSourceChip(null);
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
            nitter: 'Twitter/X',
            github: 'GitHub'
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

            // Time filter (always active)
            if (this.timeFilter === 'today' && !this.isToday(itemDate)) return false;
            if (this.timeFilter === 'week' && !this.isThisWeek(itemDate)) return false;

            // Type filter (optional)
            if (this.typeFilter) {
                if ((item.source_type || 'rss') !== this.typeFilter) return false;
            }

            // Category filter (optional)
            if (this.categoryFilter) {
                if (!(item.labels || []).includes(this.categoryFilter)) return false;
            }

            // Source filter (sidebar desktop only)
            if (this.sourceFilter) {
                if (String(item.source_id) !== String(this.sourceFilter.id)) return false;
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
            nitter: 0,
            github: 0,
            digest: 0
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
            // Also update mobile pill counts
            const mEl = document.getElementById(`m-count-${key}`);
            if (mEl) mEl.textContent = counts[key];
        });
    }

    render() {
        const list = document.getElementById('article-list');
        const noResults = document.getElementById('no-results');
        const feedCount = document.getElementById('feed-count');

        if (!document.body.classList.contains('awareness-active')) {
            feedCount.textContent = `${this.filteredItems.length} article${this.filteredItems.length !== 1 ? 's' : ''}`;
        }

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

        const isDigest = (item.source_type === 'digest') && item.content;

        // Build modal body — digest items show full HTML content, others show summary + ideas
        let modalBodyHtml;
        if (isDigest) {
            modalBodyHtml = `
                    <div class="modal-header">
                        <span class="source-badge ${item.source_type || 'rss'}">${item.source_type || 'rss'}</span>
                        <span class="source-name">${this.escapeHtml(item.source_name || '')}</span>
                    </div>
                    <h2 class="modal-title">${this.escapeHtml(item.title)}</h2>
                    ${item.summary ? `<div class="modal-summary">${this.escapeHtml(item.summary)}</div>` : ''}
                    <div class="modal-digest-content">${item.content}</div>`;
        } else {
            modalBodyHtml = `
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
                    ` : ''}`;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="modal-content${isDigest ? ' modal-content-digest' : ''}">
                <div class="modal-drag-handle" role="button" aria-label="Drag to dismiss" tabindex="-1"></div>
                <button class="modal-close" aria-label="Close">&times;</button>
                ${ratingHtml}
                <div class="modal-body">
                    ${modalBodyHtml}
                </div>
                <div class="modal-footer">
                    <div class="modal-nav">
                        <button class="modal-nav-btn" data-dir="prev" ${!hasPrev ? 'disabled style="opacity:0.3;pointer-events:none"' : ''}>&#8592;</button>
                        <button class="modal-nav-btn" data-dir="next" ${!hasNext ? 'disabled style="opacity:0.3;pointer-events:none"' : ''}>&#8594;</button>
                    </div>
                    <button class="modal-unread-btn" data-item-id="${item.id}" title="Mark as unread">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="8" cy="8" r="6"/>
                            <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                        </svg>
                        Unread
                    </button>
                    <a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="read-link">
                        ${isDigest ? 'View on web →' : 'Read Original →'}
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

        // Mark unread button
        const unreadBtn = modal.querySelector('.modal-unread-btn');
        if (unreadBtn) {
            unreadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = unreadBtn.dataset.itemId;
                this.markAsUnread(itemId);
                unreadBtn.classList.add('active');
                unreadBtn.textContent = 'Marked unread';
                setTimeout(() => {
                    unreadBtn.classList.remove('active');
                    unreadBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="8" cy="8" r="6"/>
                            <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
                        </svg>
                        Unread`;
                }, 1500);
            });
        }

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

        // Swipe-to-dismiss + swipe-nav
        // Two dismiss zones: drag handle (always) and content area (only when scrolled to top).
        // On mobile, only .modal-body scrolls (.modal-content has overflow-y: clip).
        // .modal-body has overscroll-behavior: none so rubber-band doesn't fight the dismiss transform,
        // allowing all content listeners to be passive (no scroll perf penalty).
        const content = modal.querySelector('.modal-content');
        const modalBody = modal.querySelector('.modal-body');
        const dragHandle = modal.querySelector('.modal-drag-handle');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let startX = 0, startY = 0, deltaX = 0, deltaY = 0;
        let swiping = null;          // 'vertical' | 'horizontal' | null
        let dismissGesture = false;   // true when drag handle owns the gesture
        let startedAtTop = false;
        let startTime = 0;

        // 1px epsilon for subpixel scroll positions on high-DPI / iOS rubber-band settle
        const isAtTop = () => !modalBody || modalBody.scrollTop <= 1;

        const applyDismissTransform = (dy) => {
            if (reduceMotion) {
                content.style.transform = `translateY(${dy}px)`;
                content.style.transition = 'none';
                return;
            }
            const progress = Math.min(dy / 250, 1);
            content.style.transform = `translateY(${dy}px) scale(${1 - progress * 0.04})`;
            content.style.opacity = 1 - progress * 0.3;
            content.style.transition = 'none';
        };

        const resetTransform = (animate) => {
            if (animate && !reduceMotion) {
                content.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
            } else {
                content.style.transition = '';
            }
            content.style.transform = '';
            content.style.opacity = '';
            content.style.willChange = '';
        };

        const shouldDismiss = (dy) => {
            const elapsed = Date.now() - startTime || 1;
            const velocity = dy / elapsed; // px/ms
            const threshold = Math.max(150, content.offsetHeight * 0.2);
            return (dy > threshold) || (dy > 60 && velocity > 0.4);
        };

        const animateDismiss = () => {
            if (reduceMotion) {
                history.back();
                return;
            }
            content.style.transform = 'translateY(100%)';
            content.style.opacity = '0';
            content.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                history.back();
            };
            content.addEventListener('transitionend', finish, { once: true });
            setTimeout(finish, 300); // fallback if transitionend doesn't fire
        };

        // --- Drag handle: always allows dismiss ---
        // touch-action: none in CSS, so passive: false is free (no scroll to block)
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                deltaX = 0; deltaY = 0;
                swiping = null;
                dismissGesture = true;
                startTime = Date.now();
                content.style.willChange = 'transform, opacity';
            }, { passive: true });

            dragHandle.addEventListener('touchmove', (e) => {
                if (!dismissGesture) return;
                deltaX = e.touches[0].clientX - startX;
                deltaY = e.touches[0].clientY - startY;

                if (!swiping && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                    swiping = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
                }

                if (swiping === 'vertical' && deltaY > 0) {
                    e.preventDefault();
                    applyDismissTransform(deltaY);
                }
            }, { passive: false });

            dragHandle.addEventListener('touchend', () => {
                if (dismissGesture && swiping === 'vertical' && shouldDismiss(deltaY)) {
                    animateDismiss();
                } else {
                    resetTransform(true);
                }
                dismissGesture = false;
                swiping = null;
            }, { passive: true });
        }

        // --- Content area: dismiss (at top only) + horizontal nav ---
        // All listeners are passive — no scroll performance penalty.
        // overscroll-behavior: none on .modal-body prevents rubber-band from
        // fighting the dismiss transform, so preventDefault() is not needed.
        content.addEventListener('touchstart', (e) => {
            if (dismissGesture) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            deltaX = 0; deltaY = 0;
            swiping = null;
            startTime = Date.now();
            startedAtTop = isAtTop();
            if (startedAtTop) content.style.willChange = 'transform, opacity';
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            if (dismissGesture) return;
            deltaX = e.touches[0].clientX - startX;
            deltaY = e.touches[0].clientY - startY;

            // Lock direction after 15px with ratio guard to reject diagonals
            if (!swiping && (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15)) {
                const ratio = Math.abs(deltaY) / (Math.abs(deltaX) || 1);
                if (ratio > 1.5) swiping = 'vertical';
                else if (ratio < 0.67) swiping = 'horizontal';
            }

            // Content dismiss: only when started at top, still at top, pulling down
            if (swiping === 'vertical' && deltaY > 0 && startedAtTop && isAtTop()) {
                applyDismissTransform(deltaY);
            }
        }, { passive: true });

        content.addEventListener('touchend', () => {
            if (dismissGesture) return;

            if (swiping === 'vertical' && startedAtTop && isAtTop() && shouldDismiss(deltaY)) {
                animateDismiss();
            } else if (swiping === 'vertical') {
                resetTransform(true);
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
                ${(item.labels || []).length > 0 ? `
                    <div class="article-labels">
                        ${(item.labels || []).map(label => `<span class="article-label label-${label.toLowerCase()}">${this.escapeHtml(label)}</span>`).join('')}
                    </div>
                ` : ''}
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
        if (el && timestamp && !document.body.classList.contains('awareness-active')) {
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
    window.feedSieve = new FeedSieve();
});
