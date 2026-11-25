<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import { useArticles } from '../../../node_modules/@sugarat/theme/dist/composables/config/blog.mjs'
import { BLOG_CATEGORIES, categoryFromMeta, categoryLabel, DEFAULT_CATEGORY } from './categories'

const { frontmatter } = useData()
const route = useRoute()
const docs = useArticles()

function isPublished(meta: Record<string, any> | undefined | null) {
  return !!meta && meta.hidden !== true && meta.publish !== false
}

const articles = computed(() =>
  docs.value.filter(page => page.route.includes('/posts/') && isPublished(page.meta)),
)

const currentCategory = computed(() => categoryFromMeta(frontmatter.value))
const currentCategoryLabel = computed(() => categoryLabel(currentCategory.value))

const counts = computed(() => {
  const result: Record<string, number> = { all: articles.value.length }
  BLOG_CATEGORIES.forEach(category => { result[category.key] = 0 })
  articles.value.forEach(page => {
    const key = categoryFromMeta(page.meta)
    result[key] = (result[key] || 0) + 1
  })
  return result
})

const categoryArticles = computed(() =>
  articles.value
    .filter(page => categoryFromMeta(page.meta) === currentCategory.value)
    .sort((a, b) => {
      const topDiff = Number(b.meta.top || 0) - Number(a.meta.top || 0)
      if (topDiff) return topDiff
      return +new Date(b.meta.date || 0) - +new Date(a.meta.date || 0)
    }),
)

function isCurrent(page: any) {
  const clean = (value: string) => decodeURIComponent(value || '')
    .replace(/\.html$/, '')
    .replace(/\/index$/, '')
    .replace(/\/$/, '')
  return clean(route.path) === clean(page.route)
}

function categoryHref(key: string) {
  if (key === 'all') return withBase('/')
  const category = BLOG_CATEGORIES.find(item => item.key === key) || BLOG_CATEGORIES[0]
  return `${withBase('/')}?tag=${encodeURIComponent(category.label)}&type=category`
}

function articleHref(page: any) {
  return withBase(page.route)
}

function displayDate(value: unknown) {
  return String(value || '').replace(/\//g, '-').slice(0, 10)
}
</script>

<template>
  <aside class="article-category-sidebar" aria-label="文章栏目导航">
    <div class="acs-heading">栏目</div>
    <nav class="acs-nav">
      <a class="acs-category" :href="categoryHref('all')">
        <span>全部</span>
        <span class="acs-count">{{ counts.all }}</span>
      </a>
      <a
        v-for="category in BLOG_CATEGORIES"
        :key="category.key"
        class="acs-category"
        :class="{ active: currentCategory === category.key }"
        :href="categoryHref(category.key)"
      >
        <span>{{ category.label }}</span>
        <span class="acs-count">{{ counts[category.key] || 0 }}</span>
      </a>
    </nav>

    <div class="acs-heading acs-list-heading">本栏目文章</div>
    <ul v-if="categoryArticles.length" class="acs-list">
      <li v-for="page in categoryArticles" :key="page.route">
        <a
          class="acs-article"
          :class="{ active: isCurrent(page) }"
          :href="articleHref(page)"
        >
          <span class="acs-article-title">{{ page.meta.title }}</span>
          <span class="acs-article-date">{{ displayDate(page.meta.date) }}</span>
        </a>
      </li>
    </ul>
    <div v-else class="acs-empty">
      {{ currentCategory === DEFAULT_CATEGORY ? '暂未归类下还没有文章' : `${currentCategoryLabel}下还没有文章` }}
    </div>
  </aside>
</template>

<style scoped>
.article-category-sidebar {
  width: 100%;
  max-height: calc(100vh - var(--vp-nav-height, 64px) - 92px);
  overflow-y: auto;
  padding: 2px 2px 28px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--vp-c-divider, rgba(60, 60, 67, 0.2)) transparent;
}

.article-category-sidebar::-webkit-scrollbar {
  width: 4px;
}

.article-category-sidebar::-webkit-scrollbar-thumb {
  background: var(--vp-c-divider, rgba(60, 60, 67, 0.2));
  border-radius: 4px;
}

.acs-heading {
  margin: 10px 4px 7px;
  color: var(--dr-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.acs-list-heading {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--dr-line);
}

.acs-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.acs-category {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 6px 10px;
  border-radius: 7px;
  color: var(--dr-muted);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.16s ease, background 0.16s ease;
}

.acs-category:hover {
  color: var(--dr-accent);
  background: var(--vp-c-brand-soft);
}

.acs-category.active {
  color: var(--dr-accent);
  background: var(--vp-c-brand-soft);
}

.acs-count {
  color: var(--dr-muted);
  font-size: 10px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}

.acs-category.active .acs-count {
  color: var(--dr-accent);
}

.acs-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.acs-article {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px 9px 12px;
  border-left: 2px solid transparent;
  border-radius: 6px;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.16s ease, background 0.16s ease;
}

.acs-article:hover {
  color: var(--dr-accent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 7%, transparent);
}

.acs-article.active {
  color: var(--dr-accent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 9%, transparent);
  border-left-color: var(--dr-accent);
}

.acs-article-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.acs-article-date {
  color: var(--dr-muted);
  font-size: 10px;
  line-height: 1.2;
}

.acs-article.active .acs-article-date {
  color: var(--dr-accent);
  opacity: 0.8;
}

.acs-empty {
  padding: 10px 4px;
  color: var(--dr-muted);
  font-size: 12px;
}

html.dark .acs-heading,
html.dark .acs-article-date,
html.dark .acs-empty {
  color: #a29b90;
}

html.dark .acs-list-heading {
  border-top-color: rgba(235, 227, 214, 0.13);
}

html.dark .acs-category {
  color: #a29b90;
}

html.dark .acs-category.active,
html.dark .acs-category:hover,
html.dark .acs-article.active,
html.dark .acs-article:hover {
  color: #df8562;
}

html.dark .acs-article {
  color: #ece9e1;
}

html.dark .acs-article.active,
html.dark .acs-article:hover {
  background: rgba(189, 91, 56, 0.14);
}

html.dark .acs-article.active .acs-article-date {
  color: #df8562;
}
</style>
