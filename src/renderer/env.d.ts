/// <reference types="vite/client" />
import type { ApiSonoplastia } from '../shared/ipc'

declare global {
  interface Window {
    api: ApiSonoplastia
  }
}
