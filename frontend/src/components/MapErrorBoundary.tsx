import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/** 地图异常不应拖垮整个应用（React 无错误边界时会卸载整棵组件树导致白屏） */
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <div className="text-center p-6">
            <div className="text-3xl mb-2">🗺</div>
            <p className="text-sm text-gray-600 mb-3">地图组件出错：{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              🔄 重新加载地图
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
