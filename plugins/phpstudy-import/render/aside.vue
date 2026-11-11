<template>
  <li
    v-if="showItem && windows"
    :class="['non-draggable', { active: currentPage === '/phpstudy-import' }]"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block"
        ><yb-icon :svg="import('@/svg/host.svg?raw')" width="30" height="30"
      /></div>
      <span class="title">phpStudy 导入</span>
    </div>
  </li>
</template>
<script lang="ts" setup>
  import { AsideSetup } from '@/core/ASide'
  const { showItem, currentPage, nav } = AsideSetup('phpstudy-import')
  const windows = window.Server.isWindows
</script>
