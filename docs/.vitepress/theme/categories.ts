export interface BlogCategory {
  key: string
  label: string
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  { key: 'tech', label: '技术札记' },
  { key: 'life', label: '生活碎片' },
  { key: 'thought', label: '思考随笔' },
  { key: 'story', label: '人间故事' },
  { key: 'uncategorized', label: '暂未归类' },
]

export const DEFAULT_CATEGORY = 'uncategorized'

export const CATEGORY_LABELS = Object.fromEntries(
  BLOG_CATEGORIES.map(category => [category.key, category.label]),
) as Record<string, string>

export const CATEGORY_KEYS = new Set(BLOG_CATEGORIES.map(category => category.key))

export const CATEGORY_BY_LABEL = new Map(
  BLOG_CATEGORIES.map(category => [category.label, category]),
)

export function normalizeCategory(value: unknown): string {
  return typeof value === 'string' && CATEGORY_KEYS.has(value) ? value : DEFAULT_CATEGORY
}

export function categoryLabel(value: unknown): string {
  return CATEGORY_LABELS[normalizeCategory(value)] || CATEGORY_LABELS[DEFAULT_CATEGORY]
}

export function categoryFromMeta(meta: Record<string, any> | undefined | null): string {
  if (!meta) return DEFAULT_CATEGORY
  if (typeof meta.category === 'string') return normalizeCategory(meta.category)
  const categories = meta.categories
  if (Array.isArray(categories)) {
    const found = categories.map(item => CATEGORY_BY_LABEL.get(String(item))?.key).find(Boolean)
    if (found) return found
  }
  return DEFAULT_CATEGORY
}
