import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import ChatWindow from './ChatWindow.jsx'

export default function Dashboard() {
  const [activeUser, setActiveUser] = useState(null)

  return (
    <main className="flex h-screen min-h-140 overflow-hidden bg-slate-950 p-0 text-slate-100 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-7xl overflow-hidden bg-slate-900 sm:rounded-2xl sm:border sm:border-slate-800 sm:shadow-2xl">
        <Sidebar activeUser={activeUser} onSelectUser={setActiveUser} />
        <ChatWindow activeUser={activeUser} onBack={() => setActiveUser(null)} />
      </div>
    </main>
  )
}
