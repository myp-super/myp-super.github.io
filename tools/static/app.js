const API = '';
const CATEGORY_LABELS = {
  tech: '技术札记',
  life: '生活碎片',
  thought: '思考随笔',
  story: '人间故事',
  uncategorized: '暂未归类',
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);
let currentFile = null;
let allPosts = [];
let selectedPosts = new Set();
let dirty = false;
let autosaveTimer = null;
let deployTimer = null;
let publishTimer = null;

// ---------- 基础工具 ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err));
  }
  return res.json();
}
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0, 10);
const hint = (id, text) => { $(id).textContent = text; };
const editorFields = () => ({
  title: $('f-title').value,
  description: $('f-desc').value,
  date: $('f-date').value || today(),
  category: $('f-category').value,
  tags: $('f-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
  sticky: parseInt($('f-sticky').value || '0', 10),
  author: 'Deep Reflection（邃思）',
  publish: $('f-publish').value === 'true',
  body: $('f-body').value,
});
function markCategoryRequired() {
  const category = $('f-category');
  const needsCategory = $('f-publish').value === 'true' && !category.value;
  category.classList.toggle('is-required', needsCategory);
  category.setAttribute('aria-invalid', needsCategory ? 'true' : 'false');
}
function fillEditor(data) {
  $('f-title').value = data.title || '';
  $('f-date').value = data.date || today();
  $('f-category').value = CATEGORY_KEYS.includes(data.category) ? data.category : '';
  $('f-tags').value = (data.tags || []).join(', ');
  $('f-sticky').value = data.sticky || 0;
  $('f-desc').value = data.description || '';
  $('f-publish').value = data.publish === false ? 'false' : 'true';
  $('f-body').value = data.body || '';
  markCategoryRequired();
  renderPreview();
}

// ---------- 自动保存与未保存提醒 ----------
const draftKey = () => `blog-workbench-draft-${currentFile || '__new__'}`;
function saveLocalDraft() {
  localStorage.setItem(draftKey(), JSON.stringify({ file: currentFile, data: editorFields(), savedAt: Date.now() }));
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  hint('save-hint', `有未保存修改 · 已自动保存草稿 ${time}`);
}
function markDirty() {
  dirty = true;
  renderPreview();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveLocalDraft, 800);
}
function restoreDraftIfExists() {
  const raw = localStorage.getItem(draftKey());
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (confirm('检测到此文章的本地自动草稿，是否恢复？选择“取消”将放弃这份草稿。')) {
      fillEditor(draft.data);
      dirty = true;
      hint('save-hint', '已恢复本地自动草稿，请记得保存到文章文件');
    } else {
      localStorage.removeItem(draftKey());
    }
  } catch { localStorage.removeItem(draftKey()); }
}
function confirmLeave() {
  return !dirty || confirm('当前文章有未保存修改。切换不会丢失本地自动草稿，确定继续吗？');
}
window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- 导入本地 Markdown ----------
$('btn-import-md').onclick = () => {
  if (confirmLeave()) $('md-input').click();
};
$('md-input').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  let lastFile = null;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/posts/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '导入失败');
      lastFile = data.file;
    } catch (err) {
      alert(`${file.name}：${err.message}`);
    }
  }
  await loadPosts();
  if (lastFile) {
    dirty = false;
    await openPost(lastFile);
    hint('save-hint', `导入完成，共选择 ${files.length} 个文件`);
  }
};

// ---------- 文章列表、搜索与筛选 ----------
async function loadPosts() {
  allPosts = await api('/api/posts');
  renderPostList();
  loadTrashCount();
}
function filteredPosts() {
  const q = $('post-search').value.trim().toLowerCase();
  const filter = $('post-filter').value;
  return allPosts.filter(p => {
    const text = `${p.title} ${p.description} ${(p.tags || []).join(' ')} ${CATEGORY_LABELS[p.category] || ''}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (filter === 'published' && p.publish === false) return false;
    if (filter === 'draft' && p.publish !== false) return false;
    if (filter === 'sticky' && !p.sticky) return false;
    return true;
  });
}
function renderPostList() {
  const posts = filteredPosts();
  const list = $('post-list');
  list.innerHTML = '';
  $('check-all').checked = posts.length > 0 && posts.every(p => selectedPosts.has(p.file));
  if (!posts.length) {
    list.innerHTML = '<div class="empty-list">没有符合条件的文章</div>';
    return;
  }
  posts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'post-item' + (p.file === currentFile ? ' active' : '');
    const tags = (p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const category = CATEGORY_LABELS[p.category] || CATEGORY_LABELS.uncategorized;
    div.innerHTML = `
      <input class="post-check" type="checkbox" ${selectedPosts.has(p.file) ? 'checked' : ''}>
      <div class="post-open">
        <div class="t">${p.sticky ? '<span class="pin">置顶</span>' : ''}${esc(p.title)} ${p.publish === false ? '<span class="status-draft">草稿</span>' : ''}</div>
        <div class="d">${esc(p.date)} · <span class="post-category">${esc(category)}</span></div>
        <div style="margin-top:6px;">${tags}</div>
      </div>`;
    div.querySelector('.post-open').onclick = () => openPost(p.file);
    div.querySelector('.post-check').onchange = e => {
      e.target.checked ? selectedPosts.add(p.file) : selectedPosts.delete(p.file);
      $('check-all').checked = filteredPosts().every(x => selectedPosts.has(x.file));
    };
    list.appendChild(div);
  });
}
$('post-search').oninput = renderPostList;
$('post-filter').onchange = renderPostList;
$('check-all').onchange = e => {
  filteredPosts().forEach(p => e.target.checked ? selectedPosts.add(p.file) : selectedPosts.delete(p.file));
  renderPostList();
};

// ---------- 打开、新建、保存、删除 ----------
async function openPost(file) {
  if (file !== currentFile && !confirmLeave()) return;
  const data = await api(`/api/posts/${encodeURIComponent(file)}`);
  currentFile = file;
  selectedPosts.delete(file);
  fillEditor({ ...(data.frontmatter || {}), body: data.body || '' });
  dirty = false;
  restoreDraftIfExists();
  if (!dirty) hint('save-hint', `已打开 ${file}`);
  renderPostList();
}
function newPost(force = false) {
  if (!force && !confirmLeave()) return;
  currentFile = null;
  fillEditor({ date: today(), publish: true });
  dirty = false;
  if (force) {
    hint('save-hint', '新文章，保存后生成 .md 文件');
  } else {
    restoreDraftIfExists();
    if (!dirty) hint('save-hint', '新文章，保存后生成 .md 文件');
  }
  renderPostList();
  $('f-title').focus();
}
async function savePost() {
  const payload = { ...editorFields(), old_file: currentFile };
  if (!payload.title.trim()) { alert('标题不能为空'); return; }
  if (payload.category && !CATEGORY_KEYS.includes(payload.category)) {
    alert('文章分类无效，请重新选择');
    $('f-category').focus();
    return;
  }
  if (payload.publish && !payload.category) {
    markCategoryRequired();
    alert('发布前必须选择文章分类。也可以先切换到“草稿”保存。');
    $('f-category').focus();
    return;
  }
  let res;
  try {
    res = await api('/api/posts', { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
    alert(e.message);
    return;
  }
  localStorage.removeItem(draftKey());
  currentFile = res.file;
  dirty = false;
  hint('save-hint', `已保存到 ${res.file} · 发布后上线`);
  await loadPosts();
}
async function deletePost() {
  if (!currentFile) { alert('当前是新文章，无需删除'); return; }
  if (!confirm(`将「${$('f-title').value}」移入回收站？之后可以恢复。`)) return;
  await api(`/api/posts/${encodeURIComponent(currentFile)}`, { method: 'DELETE' });
  localStorage.removeItem(draftKey());
  dirty = false;
  newPost(true);
  hint('save-hint', '文章已移入回收站');
  await loadPosts();
}

// ---------- 批量操作 ----------
async function applyBulk() {
  const action = $('bulk-action').value;
  const files = [...selectedPosts];
  if (!action) { alert('请选择批量操作'); return; }
  if (!files.length) { alert('请先勾选文章'); return; }
  const payload = { files, action, tags: [] };
  if (action === 'add-tags') {
    const input = prompt('输入要添加的标签，多个标签用逗号分隔：');
    if (!input) return;
    payload.tags = input.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
  if (action === 'delete' && !confirm(`确定将选中的 ${files.length} 篇文章移入回收站？`)) return;
  const result = await api('/api/posts/bulk', { method: 'POST', body: JSON.stringify(payload) });
  const failed = (result.results || []).filter(item => !item.ok);
  if (failed.length) alert(`有 ${failed.length} 篇文章未处理：\n${failed.map(item => `${item.file}：${item.message}`).join('\n')}`);
  if (action === 'delete' && currentFile && files.includes(currentFile)) newPost(true);
  selectedPosts.clear();
  $('bulk-action').value = '';
  dirty = false;
  await loadPosts();
  hint('save-hint', `批量操作已完成，成功 ${files.length - failed.length} 篇${failed.length ? `，失败 ${failed.length} 篇` : ''}`);
}
$('btn-bulk-apply').onclick = applyBulk;

// ---------- 回收站 ----------
async function loadTrashCount() {
  try { $('trash-count').textContent = (await api('/api/posts/trash')).length || ''; } catch {}
}
async function openTrash() {
  $('trash-modal').classList.remove('hidden');
  const items = await api('/api/posts/trash');
  const list = $('trash-list');
  if (!items.length) { list.innerHTML = '<div class="resource-empty">回收站是空的</div>'; return; }
  list.innerHTML = items.map(p => `
    <div class="resource-row">
      <div class="info"><div class="name">${esc(p.title)}</div><div class="sub">${esc(p.trash_name)} · 原日期 ${esc(p.date)}</div></div>
      <div class="actions">
        <button class="tb-btn" data-restore="${esc(p.trash_name)}">恢复</button>
        <button class="tb-btn" data-forever="${esc(p.trash_name)}">彻底删除</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-restore]').forEach(b => b.onclick = async () => {
    try {
      await api('/api/posts/trash/restore', { method: 'POST', body: JSON.stringify({ trash_name: b.dataset.restore }) });
      await loadPosts(); await openTrash();
    } catch (e) { alert(e.message); }
  });
  list.querySelectorAll('[data-forever]').forEach(b => b.onclick = async () => {
    if (!confirm('彻底删除后无法通过回收站恢复，确定继续？')) return;
    await api(`/api/posts/trash/${encodeURIComponent(b.dataset.forever)}`, { method: 'DELETE' });
    await openTrash(); await loadTrashCount();
  });
}

// ---------- 图片资源库 ----------
const formatSize = n => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
async function openImages() {
  $('images-modal').classList.remove('hidden');
  const items = await api('/api/images');
  const list = $('image-list');
  if (!items.length) { list.innerHTML = '<div class="resource-empty">还没有上传图片</div>'; return; }
  list.innerHTML = items.map(img => `
    <div class="image-card">
      <img src="${esc(img.path)}" alt="${esc(img.name)}" loading="lazy">
      <div class="image-info">
        <div class="image-name" title="${esc(img.name)}">${esc(img.name)}</div>
        <div class="image-meta">${formatSize(img.size)} · ${img.used_by.length ? `<span class="used">${img.used_by.length} 处引用</span>` : '未引用'}</div>
        <div class="image-actions">
          <button class="tb-btn" data-img-insert="${esc(img.markdown)}">插入</button>
          <button class="tb-btn" data-img-copy="${esc(img.markdown)}">复制</button>
          <button class="tb-btn" data-img-delete="${esc(img.name)}" ${img.used_by.length ? 'disabled title="仍被引用，不能删除"' : ''}>删除</button>
        </div>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-img-insert]').forEach(b => b.onclick = () => {
    insertAtCursor('\n' + b.dataset.imgInsert + '\n');
    $('images-modal').classList.add('hidden');
  });
  list.querySelectorAll('[data-img-copy]').forEach(b => b.onclick = async () => {
    await navigator.clipboard.writeText(b.dataset.imgCopy);
    b.textContent = '已复制';
  });
  list.querySelectorAll('[data-img-delete]').forEach(b => b.onclick = async () => {
    if (!confirm('确定删除这张未引用图片？')) return;
    try { await api(`/api/images/${encodeURIComponent(b.dataset.imgDelete)}`, { method: 'DELETE' }); await openImages(); }
    catch (e) { alert(e.message); }
  });
}

// ---------- 实时预览与编辑器 ----------
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'style' && !/^color:\s*#[0-9a-fA-F]{6};?$/.test(String(data.attrValue || '').trim())) {
    data.keepAttr = false;
  }
});
const bodyEditor = $('f-body');
function renderPreview() {
  const title = $('f-title').value, desc = $('f-desc').value, body = $('f-body').value;
  const md = (title ? `# ${title}\n\n` : '') + (desc ? `> ${desc}\n\n` : '') + body;
  $('preview').innerHTML = DOMPurify.sanitize(marked.parse(md), { ADD_ATTR: ['style'] });
}
['f-title', 'f-desc', 'f-body', 'f-date', 'f-category', 'f-tags', 'f-sticky', 'f-publish'].forEach(id => {
  $(id).addEventListener('input', markDirty);
  $(id).addEventListener('change', markDirty);
});
$('f-publish').addEventListener('change', markCategoryRequired);
$('f-category').addEventListener('change', markCategoryRequired);
const SNIPPETS = {
  code: '\n```python\n# 在这里写代码\n\n```\n',
  'formula-block': '\n$$\nE = mc^2\n$$\n',
  'formula-inline': '$a^2 + b^2 = c^2$',
  link: '[链接文字](https://example.com)',
  table: '\n| 列1 | 列2 | 列3 |\n|---|---|---|\n| 内容 | 内容 | 内容 |\n',
};
function insertAtCursor(text) {
  const ta = $('f-body'), start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length;
  markDirty();
}
document.querySelectorAll('[data-insert]').forEach(btn => btn.onclick = () => insertAtCursor(SNIPPETS[btn.dataset.insert]));

// ---------- 选中文字格式化与段落样式 ----------
let savedSelection = { start: 0, end: 0 };
function rememberSelection() {
  if (document.activeElement === bodyEditor) {
    savedSelection = { start: bodyEditor.selectionStart, end: bodyEditor.selectionEnd };
  }
}
['select', 'keyup', 'mouseup', 'input'].forEach(evt => bodyEditor.addEventListener(evt, rememberSelection));

function selectionRange() {
  const length = bodyEditor.value.length;
  if (document.activeElement === bodyEditor) {
    return {
      start: Math.max(0, Math.min(bodyEditor.selectionStart, length)),
      end: Math.max(0, Math.min(bodyEditor.selectionEnd, length)),
    };
  }
  return {
    start: Math.max(0, Math.min(savedSelection.start, length)),
    end: Math.max(0, Math.min(savedSelection.end, length)),
  };
}

function replaceRange(start, end, text, selectStart, selectEnd) {
  const value = bodyEditor.value;
  bodyEditor.value = value.slice(0, start) + text + value.slice(end);
  bodyEditor.focus();
  bodyEditor.selectionStart = selectStart;
  bodyEditor.selectionEnd = selectEnd;
  savedSelection = { start: selectStart, end: selectEnd };
  markDirty();
}

const INLINE_FORMATS = {
  bold: { open: '**', close: '**', placeholder: '加粗文字', label: '加粗' },
  italic: { open: '*', close: '*', placeholder: '倾斜文字', label: '倾斜' },
  underline: { open: '<u>', close: '</u>', placeholder: '下划线文字', label: '下划线' },
  strike: { open: '~~', close: '~~', placeholder: '删除线文字', label: '删除线' },
  code: { open: '`', close: '`', placeholder: '代码', label: '行内代码' },
};

function applyInlineFormat(kind) {
  const format = INLINE_FORMATS[kind];
  if (!format) return;
  const { start, end } = selectionRange();
  const selected = bodyEditor.value.slice(start, end);
  const parts = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = parts ? parts[1] : '';
  const core = parts ? parts[2] : '';
  const trail = parts ? parts[3] : '';

  // 再点一次同一种格式：选中文字外侧已有标记时，直接取消。
  const before = start - lead.length - format.open.length;
  const after = end + trail.length;
  if (before >= 0
      && bodyEditor.value.slice(before, before + format.open.length) === format.open
      && bodyEditor.value.slice(after, after + format.close.length) === format.close) {
    const inner = bodyEditor.value.slice(before + format.open.length, after);
    replaceRange(before, after + format.close.length, inner, before, before + inner.length);
    hint('save-hint', `已取消${format.label}`);
    return;
  }

  if (core && core.startsWith(format.open) && core.endsWith(format.close)
      && core.length >= format.open.length + format.close.length) {
    const inner = core.slice(format.open.length, core.length - format.close.length);
    const text = lead + inner + trail;
    replaceRange(start, end, text, start + lead.length, start + lead.length + inner.length);
    hint('save-hint', `已取消${format.label}`);
    return;
  }

  if (!core) {
    const text = lead + format.open + format.placeholder + format.close + trail;
    const innerStart = start + lead.length + format.open.length;
    replaceRange(start, end, text, innerStart, innerStart + format.placeholder.length);
    hint('save-hint', `${format.label}占位文字已选中，直接输入即可替换`);
    return;
  }

  const text = lead + format.open + core + format.close + trail;
  const innerStart = start + lead.length + format.open.length;
  replaceRange(start, end, text, innerStart, innerStart + core.length);
  hint('save-hint', `已应用${format.label}`);
}

function applyFontSize(size) {
  if (!size) return;
  const { start, end } = selectionRange();
  const selected = bodyEditor.value.slice(start, end);
  const parts = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = parts ? parts[1] : '';
  const core = parts ? parts[2] : '';
  const trail = parts ? parts[3] : '';
  if (/\n\s*\n/.test(core)) {
    hint('save-hint', '字号只能设置在同一段落内的文字');
    return;
  }
  const className = `dr-text-${size}`;
  const labelMap = { sm: '小', base: '标准', lg: '大', xl: '特大', '2xl': '超大' };
  const label = labelMap[size] || '标准';

  if (!core) {
    const text = `${lead}<span class="${className}">字号示例</span>${trail}`;
    const innerStart = start + lead.length + `<span class="${className}">`.length;
    replaceRange(start, end, text, innerStart, innerStart + 4);
    hint('save-hint', `字号已设为${label}，占位文字已选中`);
    return;
  }

  const whole = core.match(/^<span class="dr-text-(?:sm|base|lg|xl|2xl)">([\s\S]*)<\/span>$/);
  if (whole) {
    const inner = whole[1];
    if (size === 'base') {
      const text = lead + inner + trail;
      replaceRange(start, end, text, start + lead.length, start + lead.length + inner.length);
    } else {
      const text = lead + `<span class="${className}">${inner}</span>` + trail;
      const innerStart = start + lead.length + `<span class="${className}">`.length;
      replaceRange(start, end, text, innerStart, innerStart + inner.length);
    }
    hint('save-hint', `字号已设为${label}`);
    return;
  }

  // 光标/选区在字号标签内部时，替换外层字号而不是继续套一层。
  const beforeText = bodyEditor.value.slice(Math.max(0, start - 60), start);
  const around = beforeText.match(/<span class="dr-text-(?:sm|base|lg|xl|2xl)">$/);
  const afterText = bodyEditor.value.slice(end, Math.min(bodyEditor.value.length, end + 8));
  if (around && afterText.startsWith('</span>')) {
    const tagStart = start - around[0].length;
    const tagEnd = end + '</span>'.length;
    const replacement = size === 'base' ? core : `<span class="${className}">${core}</span>`;
    const innerStart = tagStart + (size === 'base' ? 0 : `<span class="${className}">`.length);
    replaceRange(tagStart, tagEnd, replacement, innerStart, innerStart + core.length);
    hint('save-hint', `字号已设为${label}`);
    return;
  }

  const text = lead + `<span class="${className}">${core}</span>` + trail;
  const innerStart = start + lead.length + `<span class="${className}">`.length;
  replaceRange(start, end, text, innerStart, innerStart + core.length);
  hint('save-hint', `字号已设为${label}`);
}

function findMatchingSpanEnd(text, openStart) {
  const re = /<span[^>]*>|<\/span>/gi;
  re.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match[0].startsWith('</')) {
      depth--;
      if (depth === 0) return match.index + match[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

function findColorSpanContainer(text, start, end) {
  const re = /<span class="dr-color-text" style="color: #[0-9a-fA-F]{6};">/g;
  const opens = [];
  let match;
  while ((match = re.exec(text)) && match.index < start) opens.push(match.index);
  for (let i = opens.length - 1; i >= 0; i--) {
    const closeEnd = findMatchingSpanEnd(text, opens[i]);
    if (closeEnd >= end) return { start: opens[i], end: closeEnd };
  }
  return null;
}

function applyTextColor(color, reset = false) {
  const normalized = String(color || '').toLowerCase();
  if (!reset && !/^#[0-9a-fA-F]{6}$/.test(normalized)) return;
  let { start, end } = selectionRange();
  const value = bodyEditor.value;
  if (start === end && reset) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = value.indexOf('\n', start);
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    start = lineStart;
    end = lineEnd;
  }
  const selected = bodyEditor.value.slice(start, end);
  const parts = selected.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = parts ? parts[1] : '';
  const core = parts ? parts[2] : '';
  const trail = parts ? parts[3] : '';
  if (/\n\s*\n/.test(core)) {
    hint('save-hint', '字体颜色只能设置在同一段落内的文字');
    return;
  }

  const whole = core.match(/^<span class="dr-color-text" style="color: (#[0-9a-fA-F]{6});">([\s\S]*)<\/span>$/);
  const beforeText = bodyEditor.value.slice(Math.max(0, start - 80), start);
  const around = beforeText.match(/<span class="dr-color-text" style="color: (#[0-9a-fA-F]{6});">$/);
  const afterText = bodyEditor.value.slice(end, Math.min(bodyEditor.value.length, end + 8));

  if (reset) {
    if (whole) {
      const text = lead + whole[2] + trail;
      replaceRange(start, end, text, start + lead.length, start + lead.length + whole[2].length);
      hint('save-hint', '已恢复默认文字颜色');
      return;
    }
    if (around && afterText.startsWith('</span>')) {
      const tagStart = start - around[0].length;
      const inner = lead + core + trail;
      replaceRange(tagStart, end + 7, inner, tagStart, tagStart + inner.length);
      hint('save-hint', '已恢复默认文字颜色');
      return;
    }
    const container = findColorSpanContainer(value, start, end);
    if (container) {
      const openLen = value.slice(container.start).match(/^<span class="dr-color-text" style="color: #[0-9a-fA-F]{6};">/)[0].length;
      const inner = value.slice(container.start + openLen, container.end - 7);
      replaceRange(container.start, container.end, inner, container.start, container.start + inner.length);
      hint('save-hint', '已恢复默认文字颜色');
      return;
    }
    const cleaned = selected.replace(/<span class="dr-color-text" style="color: #?[0-9a-fA-F]{6};?">([\s\S]*?)<\/span>/g, '$1');
    if (cleaned !== selected) {
      replaceRange(start, end, cleaned, start, start + cleaned.length);
      hint('save-hint', '已恢复默认文字颜色');
    } else {
      hint('save-hint', '选区或当前行没有字体颜色');
    }
    return;
  }

  if (!core) {
    const openTag = `<span class="dr-color-text" style="color: ${normalized};">`;
    const text = `${lead}${openTag}彩色文字</span>${trail}`;
    const innerStart = start + lead.length + openTag.length;
    replaceRange(start, end, text, innerStart, innerStart + 4);
    hint('save-hint', '已应用字体颜色，占位文字已选中');
    return;
  }

  if (whole) {
    const openTag = `<span class="dr-color-text" style="color: ${normalized};">`;
    const text = lead + openTag + whole[2] + '</span>' + trail;
    const innerStart = start + lead.length + openTag.length;
    replaceRange(start, end, text, innerStart, innerStart + whole[2].length);
    hint('save-hint', `字体颜色已设为 ${normalized}`);
    return;
  }

  if (around && afterText.startsWith('</span>')) {
    const tagStart = start - around[0].length;
    const openTag = `<span class="dr-color-text" style="color: ${normalized};">`;
    const inner = lead + core + trail;
    replaceRange(tagStart, end + 7, openTag + inner + '</span>', tagStart + openTag.length, tagStart + openTag.length + inner.length);
    hint('save-hint', `字体颜色已设为 ${normalized}`);
    return;
  }

  const openTag = `<span class="dr-color-text" style="color: ${normalized};">`;
  const text = lead + openTag + core + '</span>' + trail;
  const innerStart = start + lead.length + openTag.length;
  replaceRange(start, end, text, innerStart, innerStart + core.length);
  hint('save-hint', `字体颜色已设为 ${normalized}`);
}

function clearInlineFormat() {
  let { start, end } = selectionRange();
  const value = bodyEditor.value;
  if (start === end) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = value.indexOf('\n', start);
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    start = lineStart;
    end = lineEnd;
  }
  const selected = value.slice(start, end);
  const cleaned = selected
    .replace(/<span class="dr-color-text" style="color: #?[0-9a-fA-F]{6};?">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<span class="dr-text-(?:sm|base|lg|xl|2xl)">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1');
  if (cleaned === selected) {
    hint('save-hint', '选区或当前行没有可清除的行内格式');
    return;
  }
  replaceRange(start, end, cleaned, start, start + cleaned.length);
  hint('save-hint', '已清除行内格式');
}

function applyBlockStyle(style) {
  const value = bodyEditor.value;
  let { start, end } = selectionRange();
  let blockStart = value.lastIndexOf('\n', start - 1) + 1;
  let probe = end > start ? end - 1 : end;
  let blockEnd = value.indexOf('\n', probe);
  if (blockEnd === -1) blockEnd = value.length;

  const lines = value.slice(blockStart, blockEnd).split('\n');
  let listIndex = 1;
  const nextLines = lines.map(line => {
    let content = line.replace(/^\s+/, '');
    for (let i = 0; i < 2; i++) content = content.replace(/^(#{1,6}|>|[-*+]|\d+\.)\s+/, '');
    content = content.trimEnd();
    if (!content) return '';
    switch (style) {
      case 'h1': return `# ${content}`;
      case 'h2': return `## ${content}`;
      case 'h3': return `### ${content}`;
      case 'quote': return `> ${content}`;
      case 'ul': return `- ${content}`;
      case 'ol': return `${listIndex++}. ${content}`;
      default: return content;
    }
  });

  const text = nextLines.join('\n');
  replaceRange(blockStart, blockEnd, text, blockStart, blockStart + text.length);
  const labels = { p: '正文', h1: '一级标题', h2: '二级标题', h3: '三级标题', quote: '引用', ul: '无序列表', ol: '有序列表' };
  hint('save-hint', `段落样式：${labels[style] || '正文'}`);
}

document.querySelectorAll('[data-format]').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.onclick = () => {
    if (btn.dataset.format === 'clear') clearInlineFormat();
    else applyInlineFormat(btn.dataset.format);
  };
});

const formatStyle = $('format-style');
formatStyle.addEventListener('pointerdown', rememberSelection);
formatStyle.addEventListener('change', () => {
  applyBlockStyle(formatStyle.value);
  bodyEditor.focus();
});

const fontSizeSelect = $('format-size');
fontSizeSelect.addEventListener('pointerdown', rememberSelection);
fontSizeSelect.addEventListener('change', () => {
  const size = fontSizeSelect.value;
  if (!size) return;
  applyFontSize(size);
  fontSizeSelect.value = '';
  bodyEditor.focus();
});

document.querySelectorAll('.color-swatch').forEach(btn => {
  btn.addEventListener('pointerdown', rememberSelection);
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.onclick = () => {
    document.querySelectorAll('.color-swatch').forEach(item => {
      item.classList.remove('is-active');
      item.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
    applyTextColor(btn.dataset.color || '', btn.dataset.reset === 'true');
    bodyEditor.focus();
  };
});

bodyEditor.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (e.altKey && ['0', '1', '2', '3'].includes(key)) {
    e.preventDefault();
    const style = key === '1' ? 'h1' : key === '2' ? 'h2' : key === '3' ? 'h3' : 'p';
    formatStyle.value = style;
    applyBlockStyle(style);
    return;
  }
  if (key === 'b') { e.preventDefault(); applyInlineFormat('bold'); }
  else if (key === 'i') { e.preventDefault(); applyInlineFormat('italic'); }
  else if (key === 'u') { e.preventDefault(); applyInlineFormat('underline'); }
  else if (key === 'x' && e.shiftKey) { e.preventDefault(); applyInlineFormat('strike'); }
});

// ---------- 图片上传与粘贴 ----------
async function uploadImageFile(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/images', { method: 'POST', body: fd });
  if (!res.ok) { alert('图片上传失败'); return; }
  const data = await res.json();
  insertAtCursor('\n' + data.markdown + '\n');
  hint('save-hint', '图片已上传并插入，请保存文章');
}
$('btn-upload-img').onclick = () => $('img-input').click();
$('img-input').onchange = e => { const f = e.target.files[0]; if (f) uploadImageFile(f); e.target.value = ''; };
$('f-body').addEventListener('paste', e => {
  for (const item of (e.clipboardData?.items || [])) {
    if (item.type.startsWith('image/')) {
      e.preventDefault(); const file = item.getAsFile(); if (file) uploadImageFile(file); return;
    }
  }
});

// 拖拽图片到编辑区：上传后按拖入顺序插入 Markdown
['dragenter', 'dragover'].forEach(type => bodyEditor.addEventListener(type, e => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  bodyEditor.classList.add('dragover');
}));
bodyEditor.addEventListener('dragleave', e => {
  if (!bodyEditor.contains(e.relatedTarget)) bodyEditor.classList.remove('dragover');
});
bodyEditor.addEventListener('drop', async e => {
  e.preventDefault();
  bodyEditor.classList.remove('dragover');
  const images = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!images.length) return;
  bodyEditor.focus();
  for (const image of images) await uploadImageFile(image);
});
// 阻止浏览器把图片拖到页面其他区域时直接导航走
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// ---------- 站点设置 ----------
async function openSettings() {
  const s = await api('/api/settings/home');
  $('s-name').value = s.name || ''; $('s-motto').value = s.motto || '';
  $('s-inspiring').value = (s.inspiring || []).join('\n');
  $('s-timeout').value = s.inspiringTimeout || 3500; $('s-pagesize').value = s.pageSize || 6;
  $('settings-modal').classList.remove('hidden');
}
async function saveSettings() {
  const payload = {
    name: $('s-name').value, motto: $('s-motto').value,
    inspiring: $('s-inspiring').value.split('\n').map(s => s.trim()).filter(Boolean),
    inspiringTimeout: parseInt($('s-timeout').value || '3500', 10),
    pageSize: parseInt($('s-pagesize').value || '6', 10),
  };
  await api('/api/settings/home', { method: 'POST', body: JSON.stringify(payload) });
  hint('settings-hint', '已保存，发布后生效');
  setTimeout(() => $('settings-modal').classList.add('hidden'), 800);
}

// ---------- 发布前变更清单 ----------
async function openPublish() {
  $('publish-modal').classList.remove('hidden');
  $('publish-log').innerHTML = ''; $('deploy-status').textContent = '';
  const box = $('publish-changes'); box.textContent = '正在读取…';
  try {
    const s = await api('/api/git/status');
    if (!s.ok) { box.textContent = s.detail; return; }
    box.innerHTML = s.changed.length
      ? s.changed.map(c => `<div class="change-row"><span class="change-kind ${c.kind}">${c.kind}</span><span>${esc(c.path)}</span></div>`).join('')
      : '<div class="resource-empty">没有待发布的更改</div>';
    const job = await api('/api/git/publish/job').catch(() => null);
    $('btn-do-publish').disabled = !s.changed.length || job?.status === 'running';
    if (job && job.status !== 'idle') {
      renderPublishJob(job);
      if (job.status === 'running') startPublishPolling(new Date(job.started_at).getTime());
    }
  } catch (e) { box.textContent = e.message; }
}
function publishJobHTML(job) {
  const elapsed = job.started_at ? Math.max(0, Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000)) : 0;
  let head = '';
  if (job.status === 'running') head = `<span class="ok">●</span> 正在发布，已等待 ${elapsed} 秒`;
  else if (job.status === 'success') head = '<span class="ok">✓ 发布完成</span>';
  else if (job.status === 'failed') head = `<span class="fail">✗ 发布失败</span>${job.error ? `<br><small>${esc(job.error)}</small>` : ''}`;
  const logs = (job.logs || []).map(s => {
    const out = String(s.output || '').slice(0, 800);
    return `<div class="step"><span class="${s.ok ? 'ok' : 'fail'}">${s.ok ? '✓' : '✗'}</span> ${esc(s.step)}` +
      (out ? `<br><small>${esc(out)}</small>` : '') + '</div>';
  }).join('');
  return head ? `<div class="step">${head}</div>${logs}` : logs;
}
function renderPublishJob(job) {
  $('publish-log').innerHTML = publishJobHTML(job);
}
function startPublishPolling(startedAt) {
  clearInterval(publishTimer);
  let attempts = 0;
  const poll = async () => {
    attempts++;
    try {
      const job = await api('/api/git/publish/job');
      renderPublishJob(job);
      if (job.status === 'running') return;
      clearInterval(publishTimer);
      $('btn-do-publish').disabled = false;
      if (job.status === 'success') startDeployPolling(startedAt || Date.now());
    } catch (e) {
      $('publish-log').innerHTML = `<div class="step"><span class="fail">状态查询失败</span><br><small>${esc(e.message)}</small></div>`;
    }
    if (attempts >= 120) {
      clearInterval(publishTimer);
      $('publish-log').innerHTML += '<div class="step">已停止自动查询，请刷新工作台查看最终结果。</div>';
    }
  };
  poll();
  publishTimer = setInterval(poll, 1200);
}
async function doPublish() {
  const log = $('publish-log');
  log.innerHTML = '<div class="step">正在启动发布任务…</div>';
  $('btn-do-publish').disabled = true;
  const startedAt = Date.now();
  try {
    await api('/api/git/publish/start', { method: 'POST', body: JSON.stringify({ message: $('p-message').value || '更新文章' }) });
    startPublishPolling(startedAt);
  } catch (e) {
    log.innerHTML = `<div class="step"><span class="fail">✗ 发布失败</span><br><small>${esc(e.message)}</small></div>`;
    $('btn-do-publish').disabled = false;
  }
}
function blogURL(s) {
  return s.version ? `${s.url}/?v=${encodeURIComponent(s.version)}` : s.url;
}
function startDeployPolling(startedAt) {
  clearInterval(deployTimer);
  let attempts = 0;
  const poll = async () => {
    attempts++;
    const el = $('deploy-status');
    try {
      const s = await api('/api/git/deploy-status');
      if (s.error) { el.textContent = `查询失败：${s.error}（继续重试）`; return; }
      const isNew = new Date(s.created_at).getTime() >= startedAt - 120000;
      const statusMap = { completed: '已完成', in_progress: '构建中', queued: '排队中' };
      const conclusionMap = { success: '部署成功', failure: '部署失败', cancelled: '已取消' };
      el.innerHTML = `${isNew ? '本次部署' : '等待新部署'}：${esc(s.name)}<br>状态：${statusMap[s.status] || s.status}` +
        (s.conclusion ? ` · ${conclusionMap[s.conclusion] || s.conclusion}` : '') +
        (s.message ? `<br>${esc(s.message)}` : '') +
        `<br><a href="${blogURL(s)}" target="_blank">打开博客</a>`;
      if (isNew && s.status === 'completed') {
        clearInterval(deployTimer);
        if (s.conclusion === 'success') el.innerHTML += '<br><strong style="color:#16a34a">线上已更新，可以访问博客查看。</strong>';
      }
    } catch (e) { el.textContent = `查询失败：${e.message}（继续重试）`; }
    if (attempts >= 30) { clearInterval(deployTimer); el.innerHTML += '<br>已停止自动查询，可手动点击“查看部署状态”。'; }
  };
  poll();
  deployTimer = setInterval(poll, 12000);
}
async function checkDeploy() {
  const el = $('deploy-status'); el.textContent = '查询中…';
  const s = await api('/api/git/deploy-status');
  if (s.error) { el.textContent = '查询失败：' + s.error; return; }
  const statusMap = { completed: '已完成', in_progress: '构建中', queued: '排队中' };
  const conclusionMap = { success: '部署成功', failure: '部署失败', cancelled: '已取消' };
  el.innerHTML = `部署：${esc(s.name)}<br>状态：${statusMap[s.status] || esc(s.status)}` +
    (s.conclusion ? ` · ${conclusionMap[s.conclusion] || esc(s.conclusion)}` : '') +
    (s.message ? `<br>${esc(s.message)}` : '') +
    `<br><a href="${blogURL(s)}" target="_blank">打开博客</a>`;
}

// ---------- 工作台明暗主题 ----------
function syncThemeButton() {
  $('btn-theme').textContent = document.documentElement.dataset.theme === 'dark' ? '浅色模式' : '深色模式';
}
$('btn-theme').onclick = () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (isDark) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = 'dark';
  localStorage.setItem('blog-workbench-theme', isDark ? 'light' : 'dark');
  syncThemeButton();
};
syncThemeButton();

// ---------- 预览与事件 ----------
async function openPreview() {
  await api('/api/preview/start', { method: 'POST' });
  setTimeout(() => window.open('http://localhost:5173/', '_blank'), 2500);
}
$('btn-new').onclick = () => newPost();
$('btn-save').onclick = savePost;
$('btn-delete').onclick = deletePost;
$('btn-trash').onclick = openTrash;
$('btn-images').onclick = openImages;
$('btn-settings').onclick = openSettings;
$('btn-save-settings').onclick = saveSettings;
$('btn-publish').onclick = openPublish;
$('btn-do-publish').onclick = doPublish;
$('btn-check-deploy').onclick = checkDeploy;
$('btn-preview').onclick = openPreview;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); savePost(); }
});

// ---------- 启动 ----------
newPost(true);
restoreDraftIfExists();
loadPosts();
