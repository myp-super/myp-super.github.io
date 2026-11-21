import { defineConfig } from 'vitepress'
import mathjax3 from 'markdown-it-mathjax3'

// 导入主题的配置
import { blogTheme } from './blog-theme.ts'

// 仓库本身就是 myp-super.github.io，base 保持默认 '/'，无需修改
export default defineConfig({
  // 继承博客主题(@sugarat/theme)
  extends: blogTheme,
  lang: 'zh-cn',
  appearance: true,
  title: 'Deep Reflection（邃思）',
  description: 'AI Research · Computer Vision · Visual Perception',
  head: [
    ['script', {}, "if (location.hostname === 'myp-super.github.io') { location.replace('https://deep-reflection.pages.dev' + location.pathname + location.search + location.hash) }"],
    ['link', { rel: 'icon', href: '/avatar.jpg' }],
    // KaTeX 样式，用于公式渲染
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css' }]
  ],
  markdown: {
    breaks: true,
    config: (md) => {
      md.use(mathjax3)
    }
  },
  // 让 Vite 在 SSR 构建时打包该插件（而非外部化），
  // 否则 Node 会直接加载其 .vue 源码导致 ERR_UNKNOWN_FILE_EXTENSION
  vite: {
    ssr: {
      noExternal: ['vitepress-plugin-product-card']
    }
  },
  themeConfig: {
    // 展示 2,3 级标题在目录中
    outline: {
      level: [2, 3],
      label: '目录'
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '相关文章',
    lastUpdated: {
      text: '上次更新于',
    },

    logo: '/avatar.jpg',

    nav: [
      { text: '首页', link: '/' },
      { text: '关于', link: '/about' }
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/myp-super'
      }
    ]
  }
})
