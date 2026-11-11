<template>
  <section class="update-settings p-5 mb-5">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="font-medium">应用更新</h3>
      <span>{{ phaseLabel }}</span>
    </div>
    <p class="text-sm opacity-70 mb-3"
      >填写存放 latest.yml 和安装包的目录地址，支持本地 HTTP 测试服务。</p
    >
    <div class="flex gap-3">
      <el-input
        v-model="source"
        placeholder="https://你的服务器/updates/windows/"
        :disabled="updater.busy"
      />
      <el-button :disabled="updater.busy" @click="save">保存更新源</el-button>
    </div>
    <p class="text-xs opacity-60 mt-2">当前更新源 {{ updater.source || '尚未配置' }}</p>
    <el-alert
      v-if="updater.error || updater.state?.error"
      :title="updater.error || updater.state?.error"
      type="error"
      :closable="false"
      class="mt-3"
    />
    <p v-if="updater.state?.version" class="mt-3">已发布版本 {{ updater.state.version }}</p>
    <pre v-if="updater.state?.releaseNotes" class="text-sm whitespace-pre-wrap mt-3">{{
      updater.state.releaseNotes
    }}</pre>
    <el-progress
      v-if="['downloading', 'downloaded', 'installing'].includes(updater.state?.phase || '')"
      class="mt-4"
      :percentage="Math.floor(updater.state?.percent || 0)"
    />
    <div class="flex gap-3 mt-4">
      <el-button
        :loading="updater.busy && updater.state?.phase === 'checking'"
        :disabled="updater.busy"
        @click="updater.check()"
        >检查更新</el-button
      >
      <el-button
        v-if="updater.state?.phase === 'available'"
        type="primary"
        :disabled="updater.busy"
        @click="updater.download()"
        >下载更新</el-button
      >
      <el-popconfirm
        v-if="updater.state?.phase === 'downloaded'"
        title="将停止当前服务并启动更新安装，是否继续？"
        @confirm="updater.install()"
      >
        <template #reference
          ><el-button type="primary" :disabled="updater.busy">重启并安装</el-button></template
        >
      </el-popconfirm>
    </div>
  </section>
</template>
<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import updater from './updateSetup'
  const source = ref(updater.source)
  const phaseLabel = computed(
    () =>
      ({
        idle: '等待检查',
        checking: '正在检查',
        current: '已是最新版本',
        available: '发现新版本',
        downloading: '正在下载',
        downloaded: '下载完成',
        installing: '正在准备安装',
        error: '更新失败'
      })[updater.state?.phase || 'idle']
  )
  async function save() {
    if (await updater.saveSource(source.value)) source.value = updater.source
  }
  onMounted(async () => {
    await updater.initialize()
    source.value = updater.source
  })
</script>
<style lang="scss" scoped>
  .update-settings {
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
  }
</style>
