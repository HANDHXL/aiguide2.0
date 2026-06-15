import { useState } from 'react'
import Sidebar from '../components/admin/Sidebar'
import DataOverview from '../components/admin/DataOverview'
import KnowledgeManager from '../components/admin/KnowledgeManager'
import DigitalHumanSettings from '../components/admin/DigitalHumanSettings'
import VisitorReports from '../components/admin/VisitorReports'

const TABS: Record<string, React.ComponentType> = {
  overview: DataOverview,
  knowledge: KnowledgeManager,
  avatar: DigitalHumanSettings,
  reports: VisitorReports,
}

export default function AdminDashboard() {
  const [active, setActive] = useState('overview')
  const Content = TABS[active] || DataOverview

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <Content />
      </div>
    </div>
  )
}
