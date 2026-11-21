// 主题独有配置
import { getThemeConfig } from '@sugarat/theme/node'
import type { Theme } from '@sugarat/theme'

// RSS 订阅配置
const baseUrl = 'https://deep-reflection.pages.dev'
const RSS: Theme.RSSOptions = {
  title: 'Deep Reflection（邃思）',
  baseUrl,
  description: 'AI Research · Computer Vision · Visual Perception',
  language: 'zh-cn',
  copyright: 'Copyright (c) 2026 Deep Reflection（邃思）',
}

// 所有配置项，详见文档: https://theme.sugarat.top/
const blogTheme = getThemeConfig({
  // 开启 RSS，自动生成 feed.rss
  RSS,

  // 搜索：默认开启 pagefind 离线全文搜索

  // 页脚
  footer: {
    copyright: '© 2026 Deep Reflection（邃思） | MIT License',
  },

  // 主题色
  themeColor: 'el-blue',

  // 文章默认作者
  author: 'Deep Reflection（邃思）',

  // 友链 / 公告：暂未配置，需要时按官方文档添加 friend、popover 字段
})

export { blogTheme }
