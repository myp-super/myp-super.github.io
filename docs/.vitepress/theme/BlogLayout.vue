<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'
import BlogTheme from '@sugarat/theme'

const ThemeLayout = BlogTheme.Layout
const route = useRoute()
const { frontmatter } = useData()
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
const articleTags = computed(() => {
  const tags = frontmatter.value.tags
  return Array.isArray(tags) ? tags.map(tag => String(tag)).filter(Boolean) : []
})
</script>

<template>
  <ThemeLayout>
    <template v-if="showBack" #doc-before>
      <nav class="article-back" aria-label="文章导航">
        <a class="article-back-link" href="/">
          <span aria-hidden="true">←</span>
          <span>返回博客</span>
        </a>
      </nav>
      <header v-if="articleTitle" class="article-hero">
        <h1 class="article-hero-title">{{ articleTitle }}</h1>
        <div v-if="articleDate || articleTags.length" class="article-hero-meta">
          <time v-if="articleDate">{{ articleDate }}</time>
          <span v-if="articleDate && articleTags.length" class="article-hero-sep">·</span>
          <span v-for="tag in articleTags" :key="tag" class="article-hero-tag">{{ tag }}</span>
        </div>
      </header>
    </template>
  </ThemeLayout>
</template>
