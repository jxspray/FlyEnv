import { defineStore } from 'pinia'

// 设置页只保留标签选择，功能使用不依赖在线许可证状态。
export const SetupStore = defineStore('setup', {
  state: () => ({ tab: 'base' })
})
