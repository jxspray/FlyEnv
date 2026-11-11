<template>
  <div class="soft-index-panel main-right-panel site-import-panel">
    <header class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-xl font-semibold">从 phpStudy 导入站点</h2>
        <p class="mt-2 text-sm opacity-70">扫描配置，确认站点与 PHP 版本，再批量追加到 FlyEnv。</p>
      </div>
      <el-button
        v-if="step === 2 && !controller.running"
        :disabled="controller.refreshing"
        @click="restart"
        >重新扫描</el-button
      >
    </header>
    <el-steps :active="step" finish-status="success" align-center class="mb-6">
      <el-step title="扫描站点" />
      <el-step title="核对站点与 PHP" />
      <el-step title="进度导入" />
    </el-steps>
    <el-alert
      v-if="controller.error"
      :title="controller.error"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <template v-if="step === 0">
      <div class="scan-card">
        <h3 class="font-medium mb-4">选择 phpStudy 安装目录</h3>
        <div class="flex gap-3">
          <el-input
            v-model="directory"
            placeholder="例如 E:\phpstudy_pro"
            :disabled="controller.running"
          />
          <el-button :disabled="controller.running" @click="chooseDirectory">选择目录</el-button>
          <el-button
            type="primary"
            :loading="controller.phase === 'scanning'"
            :disabled="controller.refreshing"
            @click="scan"
            >扫描站点</el-button
          >
        </div>
        <p class="text-sm opacity-70 mt-4"
          >读取 Extensions 下的 Nginx、Apache 站点配置，自动合并对应站点。</p
        >
        <p class="text-sm opacity-70 mt-2"
          >项目目录在导入后继续使用原路径。执行导入前会备份 FlyEnv 站点配置。</p
        >
      </div>
    </template>
    <template v-else-if="step === 1">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <span
          >显示 {{ filteredDrafts.length }} / {{ drafts.length }} 个站点，已选择
          {{ selected.length }} 个</span
        >
        <span v-if="hiddenSelectedCount" class="text-sm opacity-70"
          >其中 {{ hiddenSelectedCount }} 个在筛选范围外</span
        >
        <el-button :loading="controller.refreshing" @click="refreshVersions"
          >刷新 PHP 列表</el-button
        >
        <el-button @click="installerVisible = true">安装 PHP 版本</el-button>
      </div>
      <el-alert
        title="FlyEnv 同一 PHP 主次版本共用运行服务，实际版本以服务页启动的版本为准。"
        type="info"
        :closable="false"
        class="mb-4"
      />
      <div class="flex flex-wrap gap-3 items-center mb-4">
        <el-input
          v-model="filters.domain"
          clearable
          placeholder="筛选站点域名"
          aria-label="筛选站点域名"
          style="width: 260px"
        />
        <el-select
          v-model="filters.phpVersion"
          clearable
          filterable
          placeholder="来源 PHP"
          aria-label="筛选来源 PHP"
          style="width: 160px"
        >
          <el-option
            v-for="source in sourceVersions"
            :key="source"
            :label="source"
            :value="source"
          />
        </el-select>
        <el-select
          v-model="filters.webServer"
          clearable
          placeholder="Web 服务"
          aria-label="筛选 Web 服务"
          style="width: 160px"
        >
          <el-option label="Apache" value="apache" />
          <el-option label="Nginx" value="nginx" />
        </el-select>
        <el-button @click="resetFilters">重置筛选</el-button>
      </div>
      <div class="flex flex-wrap gap-3 items-center mb-4">
        <span class="text-sm">按来源版本批量匹配</span>
        <el-select v-model="batchSource" placeholder="来源 PHP" style="width: 150px">
          <el-option
            v-for="source in sourceVersions"
            :key="source"
            :label="source"
            :value="source"
          />
        </el-select>
        <el-select v-model="batchTarget" placeholder="FlyEnv 目标 PHP" style="width: 240px">
          <el-option
            v-for="version in controller.versions"
            :key="versionKey(version)"
            :label="`PHP ${version.version} · ${version.path}`"
            :value="versionKey(version)"
          />
        </el-select>
        <el-button :disabled="!batchSource || !batchTarget" @click="applyBatch"
          >应用到已选站点</el-button
        >
      </div>
      <el-table :data="filteredDrafts" row-key="candidate.key" border max-height="540">
        <el-table-column type="expand" label="展开" width="64">
          <template #default="{ row }">
            <div class="p-5">
              <el-form label-width="100px">
                <el-form-item label="域名"><el-input v-model="row.host.name" /></el-form-item>
                <el-form-item label="别名"
                  ><el-input v-model="row.host.alias" type="textarea" placeholder="每行一个别名"
                /></el-form-item>
                <el-form-item label="项目根目录"><el-input v-model="row.host.root" /></el-form-item>
                <el-form-item label="HTTP 端口">
                  <div class="flex gap-4 flex-wrap">
                    <span v-for="server in servers" :key="server"
                      >{{ server }}
                      <el-input-number
                        v-model="row.host.port[server]"
                        :min="1"
                        :max="65535"
                        :controls="false"
                        style="width: 95px"
                    /></span>
                  </div>
                </el-form-item>
                <el-form-item label="启用 SSL"
                  ><el-switch v-model="row.host.useSSL"
                /></el-form-item>
                <template v-if="row.host.useSSL">
                  <el-form-item label="HTTPS 端口">
                    <div class="flex gap-4 flex-wrap">
                      <span v-for="server in sslServers" :key="server"
                        >{{ server }}
                        <el-input-number
                          v-model="row.host.port[server]"
                          :min="1"
                          :max="65535"
                          :controls="false"
                          style="width: 95px"
                      /></span>
                    </div>
                  </el-form-item>
                  <el-form-item label="证书路径"
                    ><el-input v-model="row.host.ssl.cert"
                  /></el-form-item>
                  <el-form-item label="私钥路径"
                    ><el-input v-model="row.host.ssl.key"
                  /></el-form-item>
                </template>
                <el-form-item label="Nginx 伪静态"
                  ><el-input v-model="row.host.nginx.rewrite" type="textarea" :rows="5"
                /></el-form-item>
              </el-form>
              <p
                v-for="source in row.candidate.sources"
                :key="source"
                class="text-xs opacity-70 break-all"
                >来源文件 {{ source }}</p
              >
              <p
                v-for="warning in row.candidate.warnings"
                :key="warning"
                class="text-sm mt-2 text-amber-600"
                >{{ warning }}</p
              >
              <p
                v-for="blocker in sourceProblems(row)"
                :key="blocker"
                class="text-sm mt-2 text-red-500"
                >{{ blocker }}</p
              >
            </div>
          </template>
        </el-table-column>
        <el-table-column label="站点" min-width="260">
          <template #header>
            <div class="flex items-center gap-2">
              <el-checkbox
                :model-value="selectionState.checked"
                :indeterminate="selectionState.indeterminate"
                :disabled="selectionState.disabled"
                aria-label="选择当前筛选结果中的站点"
                @change="toggleVisibleSelection"
              />
              <span>站点</span>
            </div>
          </template>
          <template #default="{ row }">
            <div class="flex items-start gap-2">
              <el-checkbox
                v-model="row.selected"
                :disabled="sourceProblems(row).length > 0 && !row.selected"
                :aria-label="`选择 ${row.host.name || '未识别域名'}`"
              />
              <div>
                <div>{{ row.host.name || '未识别域名' }}</div>
                <div class="text-xs opacity-60 break-all mt-1">{{ row.host.root }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源 PHP" width="120"
          ><template #default="{ row }">{{
            row.candidate.phpVersion || '待核对'
          }}</template></el-table-column
        >
        <el-table-column label="迁移 PHP" min-width="235">
          <template #default="{ row }">
            <el-select v-model="row.versionKey" placeholder="请选择已安装版本">
              <el-option
                v-for="version in controller.versions"
                :key="versionKey(version)"
                :label="`PHP ${version.version} · ${version.path}`"
                :value="versionKey(version)"
              />
            </el-select>
            <p v-if="!hasExact(row)" class="text-xs mt-2 text-amber-600">{{
              row.candidate.phpVersion ? '来源版本未安装，请安装或选择其他版本' : '请选择目标版本'
            }}</p>
            <p v-if="versionChanged(row)" class="text-xs mt-2 text-amber-600"
              >将切换版本，请确认项目兼容性</p
            >
            <p v-for="problem in problems(row)" :key="problem" class="text-xs mt-1 text-red-500">{{
              problem
            }}</p>
          </template>
        </el-table-column>
      </el-table>
      <div class="flex justify-between items-center mt-5 gap-3">
        <el-button @click="step = 0">返回扫描</el-button>
        <span class="text-sm opacity-70">可导入 {{ readyCount }} / {{ selected.length }} 个</span>
        <el-button type="primary" :disabled="!canImport" @click="startImport"
          >确认导入 {{ selected.length }} 个站点</el-button
        >
      </div>
      <details v-if="controller.scanResult?.warnings.length" class="mt-4 text-sm">
        <summary>扫描提示 {{ controller.scanResult.warnings.length }} 条</summary>
        <p
          v-for="warning in controller.scanResult.warnings"
          :key="warning"
          class="mt-2 break-all"
          >{{ warning }}</p
        >
      </details>
    </template>
    <template v-else>
      <div class="scan-card">
        <div class="flex justify-between mb-4"
          ><h3>{{ controller.running ? '正在导入站点' : '导入处理结束' }}</h3
          ><span>{{ controller.progress.completed }} / {{ controller.progress.total }}</span></div
        >
        <el-progress :percentage="percentage" :stroke-width="16" />
        <p v-if="controller.progress.current" class="mt-4"
          >当前站点 {{ controller.progress.current }}</p
        >
        <p v-if="controller.result" class="mt-4"
          >成功 {{ count('success') }} 个，失败 {{ count('failed') }} 个，跳过
          {{ count('skipped') }} 个，待检查 {{ count('unknown') }} 个</p
        >
        <p v-if="controller.result" class="text-sm mt-3 break-all"
          >备份目录 {{ controller.result.backup }}</p
        >
      </div>
      <el-table :data="controller.progress.outcomes" class="mt-5" border max-height="420">
        <el-table-column prop="name" label="站点" min-width="200" />
        <el-table-column label="结果" width="100"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'success' ? 'success' : row.status === 'skipped' ? 'info' : 'danger'
              "
              >{{ statusLabels[row.status as keyof typeof statusLabels] }}</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column prop="message" label="详情" min-width="300" />
      </el-table>
      <el-alert
        title="导入完成后，可在站点列表查看配置，并在服务页启动对应 PHP 和 Web 服务。"
        type="info"
        :closable="false"
        class="mt-4"
      />
    </template>
    <el-alert
      v-for="warning in [...controller.warnings, ...(controller.result?.warnings ?? [])]"
      :key="warning"
      :title="warning"
      type="warning"
      :closable="false"
      class="mt-3"
    />
    <el-dialog
      v-model="installerVisible"
      title="PHP 版本管理"
      width="90%"
      destroy-on-close
      @closed="refreshVersions"
    >
      <div style="height: 65vh"
        ><VersionManager
          type-flag="php"
          :has-static="true"
          title="PHP"
          url="https://windows.php.net/download/"
      /></div>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import controller from './setup'
  import {
    createDraft,
    draftProblems,
    selectionOf,
    sourceProblems,
    versionKey,
    filterDrafts,
    visibleSelection,
    type SiteFilters,
    type ImportDraft
  } from './Review'
  import { AppStore } from '@/store/app'
  import { dialog } from '@/util/NodeFn'
  import VersionManager from '@/components/VersionManager/index.vue'

  const directory = ref(controller.directory)
  const viewStep = ref<number | undefined>()
  const step = computed({
    get: () => {
      if (controller.phase === 'scanning') return 0
      if (controller.phase === 'importing' || controller.phase === 'finished') return 2
      return viewStep.value ?? (controller.scanResult ? 1 : 0)
    },
    set: (value: number) => {
      viewStep.value = value
    }
  })
  const drafts = ref<ImportDraft[]>([])
  const selected = computed(() => drafts.value.filter((row) => row.selected))
  const filters = reactive<SiteFilters>({ domain: '', phpVersion: '', webServer: '' })
  const filteredDrafts = computed(() => filterDrafts(drafts.value, filters))
  const selectionState = computed(() => visibleSelection(filteredDrafts.value))
  const hiddenSelectedCount = computed(
    () => selected.value.length - filteredDrafts.value.filter((row) => row.selected).length
  )
  const installerVisible = ref(false)
  const batchSource = ref('')
  const batchTarget = ref('')
  const servers = ['nginx', 'apache', 'caddy'] as const
  const sslServers = ['nginx_ssl', 'apache_ssl', 'caddy_ssl'] as const
  const statusLabels = { success: '成功', failed: '失败', skipped: '跳过', unknown: '待检查' }
  const sourceVersions = computed(() => [
    ...new Set(drafts.value.map((row) => row.candidate.phpVersion || '未识别'))
  ])
  const problems = (row: ImportDraft) =>
    draftProblems(row, drafts.value, controller.versions, AppStore().hosts)
  const readyCount = computed(() => selected.value.filter((row) => !problems(row).length).length)
  const canImport = computed(
    () =>
      selected.value.length > 0 &&
      readyCount.value === selected.value.length &&
      controller.versionsReady &&
      !controller.refreshing &&
      !controller.running
  )
  const percentage = computed(() =>
    controller.progress.total
      ? Math.floor((controller.progress.completed / controller.progress.total) * 100)
      : 0
  )
  const hasExact = (row: ImportDraft) =>
    controller.versions.some((version) => version.version === row.candidate.phpVersion)
  const versionChanged = (row: ImportDraft) =>
    row.versionKey &&
    controller.versions.find((version) => versionKey(version) === row.versionKey)?.version !==
      row.candidate.phpVersion
  const count = (status: string) =>
    controller.progress.outcomes.filter((row) => row.status === status).length
  const resetDrafts = () => {
    resetFilters()
    drafts.value = (controller.scanResult?.candidates ?? []).map((candidate) =>
      createDraft(candidate, controller.versions)
    )
  }

  async function chooseDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: directory.value
    })
    if (!result.canceled && result.filePaths?.[0]) directory.value = result.filePaths[0]
  }
  async function scan() {
    viewStep.value = undefined
    if (await controller.scan(directory.value)) {
      resetDrafts()
      step.value = 1
    }
  }
  function toggleVisibleSelection(value: boolean | string | number) {
    const rows = value === true ? selectionState.value.eligible : filteredDrafts.value
    rows.forEach((row) => {
      row.selected = value === true
    })
  }
  function resetFilters() {
    Object.assign(filters, { domain: '', phpVersion: '', webServer: '' })
  }
  function applyBatch() {
    selected.value
      .filter((row) => (row.candidate.phpVersion || '未识别') === batchSource.value)
      .forEach((row) => {
        row.versionKey = batchTarget.value
      })
  }
  function startImport() {
    if (!canImport.value) return
    const selection = selected.value.map((row) => selectionOf(row, controller.versions))
    step.value = 2
    void controller.start(selection)
  }
  function restart() {
    controller.reset()
    step.value = 0
    directory.value = controller.directory
  }

  async function refreshVersions() {
    await controller.refreshVersions()
    for (const row of drafts.value.filter((row) => !row.versionKey)) {
      const exact = controller.versions.find(
        (version) => version.version === row.candidate.phpVersion
      )
      if (exact) {
        row.versionKey = versionKey(exact)
      }
    }
  }

  watch(
    () => controller.scanResult,
    () => {
      resetDrafts()
      viewStep.value = undefined
    },
    { immediate: true }
  )

  onMounted(async () => {
    await controller.prepare()
    directory.value = controller.directory
    resetDrafts()
  })
</script>

<style scoped lang="scss">
  .site-import-panel {
    padding: 24px;
    overflow-y: auto;
  }
  .scan-card {
    padding: 24px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
  }
</style>
