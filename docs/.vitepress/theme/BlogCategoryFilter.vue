<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useData, useRoute, useRouter, withBase } from 'vitepress'
import { useBrowserLocation } from '@vueuse/core'
import { useActiveTag, useArticles, useCurrentPageNum } from '../../../node_modules/@sugarat/theme/dist/composables/config/blog.mjs'
import { BLOG_CATEGORIES, categoryFromMeta } from './categories'

const { frontmatter } = useData()
const route = useRoute()
const router = useRouter()
const docs = useArticles()
const activeTag = useActiveTag()
const currentPage = useCurrentPageNum()
const location = useBrowserLocation()
const root = ref<HTMLElement | null>(null)
const urlTag = ref('')

const isHome = computed(() => frontmatter.value.layout === 'home')
const categoryLabels = new Set(BLOG_CATEGORIES.map(category => category.label))

function isPublished(meta: Record<string, any> | undefined | null) {
  return !!meta && meta.hidden !== true && meta.publish !== false
}

const articles = computed(() =>
  docs.value.filter(page => page.route.includes('/posts/') && isPublished(page.meta)),
)

const counts = computed(() => {
  const result: Record<string, number> = { all: articles.value.length }
  BLOG_CATEGORIES.forEach(category => { result[category.key] = 0 })
  articles.value.forEach(page => {
    const key = categoryFromMeta(page.meta)
    result[key] = (result[key] || 0) + 1
  })
  return result
})

const currentTag = computed(() => urlTag.value || activeTag.value.label || '')
const activeCategory = computed(() => {
  if (!currentTag.value || !categoryLabels.has(currentTag.value)) return ''
  return BLOG_CATEGORIES.find(category => category.label === currentTag.value)?.key || ''
})
const isOtherTag = computed(() => !!currentTag.value && !categoryLabels.has(currentTag.value))
const activeKey = computed(() => currentTag.value ? (activeCategory.value || 'other') : 'all')

function paintActive() {
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLElement>('.category-filter .category-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === activeKey.value)
  })
}

function syncFromUrl() {
  if (typeof window === 'undefined') return
  const tag = new URL(window.location.href).searchParams.get('tag') || ''
  urlTag.value = categoryLabels.has(tag) ? tag : ''
  if (tag && categoryLabels.has(tag)) {
    activeTag.value = { label: tag, type: 'category' }
  }
  nextTick(paintActive)
}

function goCategory(key: string) {
  currentPage.value = 1
  if (key === 'all') {
    urlTag.value = ''
    activeTag.value = { label: '', type: '' }
    router.go(withBase('/'))
  } else {
    const category = BLOG_CATEGORIES.find(item => item.key === key)
    if (!category) return
    urlTag.value = category.label
    activeTag.value = { label: category.label, type: 'category' }
    router.go(`${withBase('/')}?tag=${encodeURIComponent(category.label)}&type=category`)
  }
  nextTick(paintActive)
  window.setTimeout(paintActive, 180)
}

function clearTagFilter() {
  goCategory('all')
}

function placeFilter() {
  if (typeof window === 'undefined' || !isHome.value) return
  const target = document.querySelector('.blog-list-wrapper')
  if (target && root.value && root.value.parentElement !== target) {
    target.prepend(root.value)
  }
}

onMounted(() => {
  syncFromUrl()
  paintActive()
  window.setTimeout(paintActive, 120)
  let tries = 0
  const attempt = () => {
    placeFilter()
    if (++tries < 6) window.setTimeout(attempt, 120)
  }
  requestAnimationFrame(attempt)
})

watch(location, syncFromUrl, { immediate: true })
watch(() => route.path, () => {
  requestAnimationFrame(placeFilter)
})
</script>

<template>
  <div ref="root" class="category-filter-wrap">
  <nav class="category-filter" aria-label="文章栏目" data-pagefind-ignore="all">
    <button
      type="button"
      class="category-tab"
      data-category="all"
      @click="goCategory('all')"
    >
      全部
      <span class="category-count">{{ counts.all }}</span>
    </button>
    <button
      v-for="category in BLOG_CATEGORIES"
      :key="category.key"
      type="button"
      class="category-tab"
      :data-category="category.key"
      @click="goCategory(category.key)"
    >
      {{ category.label }}
      <span class="category-count">{{ counts[category.key] || 0 }}</span>
    </button>
    <button
      v-if="isOtherTag"
      type="button"
      class="category-tag-filter"
      title="清除标签筛选"
      @click="clearTagFilter"
    >
      标签：{{ currentTag }} ×
    </button>
  </nav>
  <p v-if="activeCategory && counts[activeCategory] === 0" class="category-empty">
    该栏目还没有文章。
  </p>
  </div>
</template>

<style scoped>
.category-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 2px 0 8px;
  padding: 0 0 18px;
  border-bottom: 1px solid var(--dr-line);
}

.category-tab {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dr-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}

.category-tab:hover {
  color: var(--dr-accent);
  background: var(--vp-c-brand-soft);
}

.category-tab.active {
  color: var(--dr-accent);
  background: var(--vp-c-brand-soft);
}

.category-count {
  color: var(--dr-muted);
  font-size: 10px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.category-tab.active .category-count {
  color: var(--dr-accent);
  opacity: 0.8;
}

.category-tag-filter {
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid var(--dr-line);
  border-radius: 999px;
  background: transparent;
  color: var(--dr-muted);
  font-size: 11px;
  cursor: pointer;
}

.category-tag-filter:hover {
  border-color: rgba(189, 91, 56, 0.35);
  color: var(--dr-accent);
}

.category-empty {
  margin: 0;
  padding: 4px 4px 22px;
  color: var(--dr-muted);
  font-size: 13px;
}

html.dark .category-empty {
  color: #a29b90;
}

html.dark .category-filter {
  border-bottom-color: rgba(235, 227, 214, 0.13);
}

html.dark .category-tab {
  color: #a29b90;
}

html.dark .category-tab.active,
html.dark .category-tab:hover {
  color: #df8562;
  background: rgba(189, 91, 56, 0.14);
}

@media (max-width: 768px) {
  .category-filter {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin-top: 0;
    padding-bottom: 14px;
    scrollbar-width: none;
  }

  .category-filter::-webkit-scrollbar {
    display: none;
  }

  .category-tab {
    flex: 0 0 auto;
    padding: 6px 8px;
    font-size: 12px;
  }

  .category-tag-filter {
    flex: 0 0 auto;
    margin-left: 4px;
  }
}
</style>
