import { defineAsyncComponent } from 'vue'
import type { AppModuleItem } from '@/core/type'

const module: AppModuleItem = {
  moduleType: 'site',
  typeFlag: 'phpstudy-import',
  label: 'phpStudy 导入',
  icon: import('@/svg/host.svg?raw'),
  index: defineAsyncComponent(() => import('./Index.vue')),
  aside: defineAsyncComponent(() => import('./aside.vue')),
  asideIndex: 0.5,
  platform: ['Windows']
}
export default module
