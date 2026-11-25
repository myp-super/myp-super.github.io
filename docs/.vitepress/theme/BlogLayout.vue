<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import BlogTheme from '@sugarat/theme'
import BlogCategoryFilter from './BlogCategoryFilter.vue'
import ArticleCategorySidebar from './ArticleCategorySidebar.vue'
import { BLOG_CATEGORIES, categoryFromMeta, categoryLabel } from './categories'

const ThemeLayout = BlogTheme.Layout
const route = useRoute()
const { frontmatter } = useData()
const categoryLabels = new Set(BLOG_CATEGORIES.map(category => category.label))

function stripCategoryTags() {
  if (typeof document === 'undefined') return
  document.querySelectorAll('.meta-des .tags').forEach(box => {
    box.querySelectorAll('a.link').forEach(link => {
      if (categoryLabels.has(link.textContent?.trim() || '')) link.remove()
    })
    if (!box.querySelector('a.link')) box.remove()
  })
}

function scheduleStripCategoryTags() {
  nextTick(() => {
    stripCategoryTags()
    window.setTimeout(stripCategoryTags, 260)
  })
}

onMounted(scheduleStripCategoryTags)
watch(() => route.path, scheduleStripCategoryTags)
const isHome = computed(() => frontmatter.value.layout === 'home')
const showBack = computed(() => route.path.includes('/posts/'))
const articleTitle = computed(() => {
  const title = frontmatter.value.title
  return typeof title === 'string' ? title.trim() : ''
})
const articleDate = computed(() => {
  const date = frontmatter.value.date
  if (!date) return ''
  if (date instanceof Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  return String(date).slice(0, 10)
})
const articleCategory = computed(() => categoryLabel(categoryFromMeta(frontmatter.value)))
const articleCategoryHref = computed(() =>
  `${withBase('/')}?tag=${encodeURIComponent(articleCategory.value)}&type=category`,
)
const articleTags = computed(() => {
  const tags = frontmatter.value.tags
  return Array.isArray(tags) ? tags.map(tag => String(tag)).filter(Boolean) : []
})
</script>

<template>
  <ThemeLayout :class="{ 'has-category-sidebar': showBack }">
    <template #home-hero-before>
      <BlogCategoryFilter v-if="isHome" />
    </template>
    <template v-if="showBack" #doc-before>
      <nav class="article-back" aria-label="文章导航">
        <a class="article-back-link" href="/">
          <span aria-hidden="true">←</span>
          <span>返回博客</span>
        </a>
      </nav>
      <header v-if="articleTitle" class="article-hero">
        <h1 class="article-hero-title">{{ articleTitle }}</h1>
        <div v-if="articleCategory || articleDate || articleTags.length" class="article-hero-meta">
          <a class="article-hero-category" :href="articleCategoryHref">{{ articleCategory }}</a>
          <span v-if="articleDate" class="article-hero-sep">·</span>
          <time v-if="articleDate">{{ articleDate }}</time>
          <span v-if="articleDate && articleTags.length" class="article-hero-sep">·</span>
          <span v-for="tag in articleTags" :key="tag" class="article-hero-tag">{{ tag }}</span>
        </div>
      </header>
    </template>
    <template v-if="showBack" #sidebar-nav-after>
      <ArticleCategorySidebar />
    </template>
  </ThemeLayout>
</template>
