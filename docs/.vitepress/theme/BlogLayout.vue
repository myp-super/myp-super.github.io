<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vitepress'
import BlogTheme from '@sugarat/theme'

const ThemeLayout = BlogTheme.Layout
const route = useRoute()
const showBack = computed(() => route.path.includes('/posts/'))
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
    </template>
  </ThemeLayout>
</template>
