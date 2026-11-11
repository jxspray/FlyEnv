import { Base } from '../Base'
import { machineId } from '../../Fn'
import { ForkPromise } from '@shared/ForkPromise'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'

class App extends Base {
  constructor() {
    super()
  }

  feedback(info: any) {
    return new ForkPromise(async (resolve, reject) => {
      const uuid = await machineId()

      const data = {
        uuid,
        ...info
      }

      console.log('data: ', data)

      axios({
        url: 'https://api.one-env.com/api/app/feedback_app',
        method: 'post',
        data,
        proxy: this.getAxiosProxy()
      })
        .then(() => {
          resolve(true)
        })
        .catch((e) => {
          reject(e)
        })
    })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // App 模块负责意见反馈，不管理任何服务的配置文件
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // App 模块没有独立的运行时日志文件
    return []
  }
}

export default new App()
