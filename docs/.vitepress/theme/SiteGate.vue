<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import siteGateConfig from '../site-gate.json'

const gateEnabled = computed(() => !!siteGateConfig.enabled && !!siteGateConfig.hash)
const visible = ref(gateEnabled.value)
const password = ref('')
const error = ref('')
const checking = ref(false)
const passwordInput = ref<HTMLInputElement | null>(null)

const storageKey = computed(() => `dr-site-gate-${String(siteGateConfig.hash).slice(0, 16)}`)

function releasePage() {
  visible.value = false
  document.documentElement.classList.remove('site-gate-locked')
}

function hasLocalAccess() {
  try {
    return localStorage.getItem(storageKey.value) === '1'
  } catch {
    return false
  }
}

function rememberAccess() {
  try {
    localStorage.setItem(storageKey.value, '1')
  } catch {
    /* localStorage 不可用时，仅本次页面有效 */
  }
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function unlock() {
  const value = password.value
  if (!value) {
    error.value = '先输入口令。'
    passwordInput.value?.focus()
    return
  }
  if (!window.crypto?.subtle) {
    error.value = '当前浏览器不支持口令校验，请换一个浏览器。'
    return
  }

  checking.value = true
  error.value = ''
  try {
    const data = new TextEncoder().encode(`${siteGateConfig.salt}:${value}`)
    const digest = await window.crypto.subtle.digest('SHA-256', data)
    if (toHex(digest) === siteGateConfig.hash) {
      rememberAccess()
      releasePage()
      return
    }
    error.value = '口令不对，再试一次。'
    password.value = ''
    await nextTick()
    passwordInput.value?.focus()
  } catch {
    error.value = '校验失败，请稍后再试。'
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  if (!gateEnabled.value) {
    visible.value = false
    return
  }
  if (hasLocalAccess()) {
    releasePage()
    return
  }
  document.documentElement.classList.add('site-gate-locked')
  nextTick(() => passwordInput.value?.focus())
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('site-gate-locked')
})
</script>

<template>
  <div v-if="visible" class="site-gate" role="dialog" aria-modal="true" aria-label="访问口令">
    <section class="sg-left">
      <header class="sg-brand">
        <span class="sg-mark">✳</span>
        <span class="sg-name">Deep Reflection</span>
        <span class="sg-rule"></span>
        <span class="sg-sub">Members only</span>
      </header>

      <div class="sg-hero">
        <div class="sg-kicker">A quieter corner of the internet</div>
        <h1>留一处，<em>只给自己。</em></h1>
        <p>有些文字不适合被所有人读到。这里收着未完成的思考、偶然的片段，以及只想给熟人看的部分。</p>
      </div>

      <footer class="sg-foot">
        <div class="sg-quote">“写作，是把房间里的灯，留给下一个进来的人。”<span>Deep Reflection · 2026</span></div>
        <div>31.8° N<br>112.5° E</div>
      </footer>
    </section>

    <section class="sg-right">
      <div class="sg-form-wrap">
        <div class="sg-form-top"><b>Private access</b><span>No. 001</span></div>
        <h2>好久不见。</h2>
        <p class="sg-desc">输入访问口令，推门进来。</p>

        <form autocomplete="off" @submit.prevent="unlock">
          <label for="site-gate-pass">访问口令</label>
          <div class="sg-field" :class="{ 'is-error': !!error }">
            <input
              id="site-gate-pass"
              ref="passwordInput"
              v-model="password"
              type="password"
              maxlength="128"
              placeholder="Enter your passphrase"
              aria-describedby="site-gate-error"
            >
            <button type="submit" :disabled="checking">
              {{ checking ? '校验中…' : '进入 →' }}
            </button>
          </div>
          <div class="sg-small">
            <span>仅限受邀读者</span>
            <a href="#" @click.prevent>如何获取口令？</a>
          </div>
          <p v-if="error" id="site-gate-error" class="sg-error" aria-live="polite">{{ error }}</p>
        </form>

        <div class="sg-divider"></div>
        <div class="sg-note"><i></i><span>口令只在本机校验，不会上传，也不会被记录。</span></div>
      </div>
      <div class="sg-vertical">Read slowly · stay awhile</div>
    </section>
  </div>
</template>

<style scoped>
:global(html.site-gate-locked),
:global(html.site-gate-locked body) {
  overflow: hidden !important;
}

:global(html.site-gate-locked .Layout) {
  display: none !important;
}

.site-gate {
  --sg-ink: #f1ece2;
  --sg-muted: #a79f91;
  --sg-dim: #8f877a;
  --sg-accent: #d97757;
  --sg-line: rgba(241, 236, 226, 0.15);
  position: relative;
  z-index: 10000;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(440px, 0.78fr);
  width: 100%;
  height: 100dvh;
  min-height: 640px;
  overflow-y: auto;
  background: #191816;
  color: var(--sg-ink);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.site-gate::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  opacity: 0.16;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
}

.sg-left {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(34px, 4vw, 62px);
  background: radial-gradient(760px 620px at 12% 2%, #25231f 0%, #191816 48%, #121110 100%);
}

.sg-left::before {
  content: "";
  position: absolute;
  inset: 22px;
  border: 1px solid rgba(242, 237, 227, 0.13);
  pointer-events: none;
}

.sg-left::after {
  content: "";
  position: absolute;
  width: 420px;
  height: 420px;
  right: -190px;
  top: -190px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(217, 119, 87, 0.34), rgba(217, 119, 87, 0) 68%);
  filter: blur(10px);
}

.sg-brand {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 13px;
}

.sg-mark {
  color: var(--sg-accent);
  font-size: 25px;
  line-height: 1;
}

.sg-name {
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  font-size: 18px;
  letter-spacing: -0.01em;
}

.sg-rule {
  width: 38px;
  height: 1px;
  margin: 0 3px;
  background: rgba(242, 237, 227, 0.24);
}

.sg-sub {
  color: #a79f92;
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.sg-hero {
  position: relative;
  z-index: 2;
  padding: 44px 0;
}

.sg-kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--sg-accent);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.sg-kicker::before {
  content: "";
  width: 28px;
  height: 1px;
  background: var(--sg-accent);
}

.sg-hero h1 {
  margin: 28px 0 0;
  color: #f6f1e7;
  font-family: "Iowan Old Style", "Palatino Linotype", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(58px, 6vw, 104px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.05em;
}

.sg-hero h1 em {
  display: block;
  color: var(--sg-accent);
  font-style: italic;
  font-weight: 400;
}

.sg-hero p {
  max-width: 420px;
  margin-top: 30px;
  color: #a79f92;
  font-size: 13px;
  line-height: 1.9;
}

.sg-foot {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  color: #a79f92;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sg-quote {
  max-width: 270px;
  color: #c9c0b3;
  font-family: "Songti SC", "STSong", serif;
  font-size: 13px;
  line-height: 1.8;
  letter-spacing: 0.08em;
  text-transform: none;
}

.sg-quote span {
  display: block;
  margin-top: 10px;
  color: #857d70;
  font-family: "Segoe UI", sans-serif;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.sg-right {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(30px, 4vw, 70px);
  background:
    radial-gradient(760px 600px at 92% 4%, rgba(217, 119, 87, 0.17), transparent 62%),
    radial-gradient(720px 560px at 4% 100%, rgba(88, 67, 48, 0.18), transparent 72%),
    #23211d;
}

.sg-right::before {
  content: "";
  position: absolute;
  left: 0;
  top: 12%;
  bottom: 12%;
  width: 1px;
  background: linear-gradient(to bottom, transparent, rgba(217, 119, 87, 0.38) 20%, rgba(241, 236, 226, 0.17) 50%, rgba(217, 119, 87, 0.30) 80%, transparent);
}

.sg-form-wrap {
  width: 100%;
  max-width: 390px;
}

.sg-form-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 44px;
  color: var(--sg-muted);
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.sg-form-top b {
  color: var(--sg-accent);
  font-weight: 600;
}

.sg-form-wrap h2 {
  margin: 0;
  color: #f5efe5;
  font-family: "Iowan Old Style", "Palatino Linotype", "Songti SC", Georgia, serif;
  font-size: 44px;
  font-weight: 400;
  line-height: 1.08;
  letter-spacing: -0.035em;
}

.sg-desc {
  margin-top: 14px;
  color: var(--sg-muted);
  font-size: 13px;
  line-height: 1.8;
}

.site-gate form {
  margin-top: 42px;
}

.site-gate label {
  display: block;
  margin-bottom: 10px;
  color: var(--sg-dim);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.sg-field {
  display: flex;
  align-items: center;
  padding: 4px 4px 4px 16px;
  border: 1px solid rgba(241, 236, 226, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sg-field:focus-within {
  border-color: rgba(217, 119, 87, 0.72);
  box-shadow: 0 0 0 4px rgba(217, 119, 87, 0.10);
}

.sg-field.is-error {
  border-color: rgba(211, 91, 69, 0.8);
  animation: sg-shake 0.3s ease;
}

.sg-field input {
  flex: 1;
  min-width: 0;
  padding: 13px 6px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f1ece2;
  font-size: 14px;
}

.sg-field input::placeholder {
  color: #8d8578;
  font-family: "Iowan Old Style", "Songti SC", Georgia, serif;
  font-style: italic;
}

.sg-field button {
  flex: none;
  padding: 12px 18px;
  border: 0;
  border-radius: 7px;
  background: var(--sg-accent);
  color: #fffaf2;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.sg-field button:hover:not(:disabled) {
  background: #ba5a39;
  transform: translateX(2px);
}

.sg-field button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.sg-small {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  margin-top: 13px;
  color: var(--sg-muted);
  font-size: 10px;
  line-height: 1.6;
}

.sg-small a {
  color: var(--sg-accent);
  text-decoration: none;
}

.sg-error {
  margin-top: 12px;
  color: #e39777;
  font-size: 11px;
  line-height: 1.5;
}

.sg-divider {
  height: 1px;
  margin: 42px 0 22px;
  background: var(--sg-line);
}

.sg-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--sg-muted);
  font-size: 11px;
  line-height: 1.75;
}

.sg-note i {
  flex: none;
  width: 5px;
  height: 5px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--sg-accent);
}

.sg-vertical {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  color: #b5ad9e;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

@keyframes sg-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@media (max-width: 900px) {
  .site-gate {
    grid-template-columns: 1fr;
    height: 100dvh;
  }

  .sg-left {
    min-height: 44vh;
    padding: 28px 24px 34px;
  }

  .sg-left::before {
    inset: 12px;
  }

  .sg-hero {
    padding: 30px 0 10px;
  }

  .sg-hero h1 {
    font-size: clamp(46px, 11vw, 68px);
  }

  .sg-hero p {
    margin-top: 18px;
  }

  .sg-foot {
    margin-top: 28px;
  }

  .sg-quote {
    display: none;
  }

  .sg-right {
    padding: 46px 26px 54px;
  }

  .sg-right::before {
    display: none;
  }

  .sg-vertical {
    display: none;
  }

  .sg-form-top {
    margin-bottom: 30px;
  }

  .site-gate form {
    margin-top: 30px;
  }
}
</style>
