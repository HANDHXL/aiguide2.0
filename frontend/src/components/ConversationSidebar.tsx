import type { ConvSummary } from '../types'

interface Props {
  conversations: ConvSummary[]
  activeId: number | null
  onSelect: (conv: ConvSummary) => void
  onNew: () => void
  onDelete: (id: number) => void
}

export default function ConversationSidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
      <div className="p-3 border-b border-gray-100">
        <button
          onClick={onNew}
          className="w-full px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
        >
          + 新对话
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">暂无对话记录</p>
        )}
        {conversations.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer text-sm mx-2 rounded-lg transition-colors ${
              activeId === conv.id
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs">{conv.title}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{conv.message_count} 条消息</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(conv.id) }}
              className="ml-1 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
              title="删除对话"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
