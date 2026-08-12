import { useState } from "react";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("instances");
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);

  // Mock data for initial scaffolding
  const instances = [
    { id: "1", name: "Create: Astral", version: "1.18.2", status: "Ready" },
    { id: "2", name: "All The Mods 9", version: "1.20.1", status: "Updating" },
    { id: "3", name: "Vanilla+ Server", version: "1.20.4", status: "Ready" },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-300 font-sans text-sm overflow-hidden selection:bg-blue-600 selection:text-white">
      
      {/* Primary Sidebar (Slim Navigation) */}
      <nav className="w-16 bg-gray-950 flex flex-col items-center py-4 border-r border-gray-800">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-8 shadow-lg shadow-blue-900/20">
          P
        </div>
        
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => setActiveTab("instances")}
            className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors ${activeTab === "instances" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"}`}
          >
            📦
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors ${activeTab === "settings" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"}`}
          >
            ⚙️
          </button>
        </div>
      </nav>

      {/* Secondary Sidebar (List View) */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4">
          <h2 className="font-semibold text-gray-200 uppercase tracking-wider text-xs">Instances</h2>
          <button className="text-gray-400 hover:text-white transition-colors">
            +
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {instances.map(inst => (
            <button
              key={inst.id}
              onClick={() => setSelectedInstance(inst.id)}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between group ${selectedInstance === inst.id ? "bg-blue-600/10 text-blue-400" : "hover:bg-gray-800/50 text-gray-400"}`}
            >
              <div>
                <div className="font-medium">{inst.name}</div>
                <div className="text-xs opacity-70 font-mono mt-0.5">{inst.version}</div>
              </div>
              <div className={`w-2 h-2 rounded-full ${inst.status === "Ready" ? "bg-emerald-500" : "bg-amber-500"} opacity-0 group-hover:opacity-100 transition-opacity`} />
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-gray-900 flex flex-col">
        {selectedInstance ? (
          <>
            {/* Header */}
            <header className="h-14 border-b border-gray-800 flex items-center px-6 justify-between bg-gray-900/50">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-white">
                  {instances.find(i => i.id === selectedInstance)?.name}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-gray-800 text-xs font-mono text-gray-400 border border-gray-700">
                  {instances.find(i => i.id === selectedInstance)?.version}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors border border-gray-700">
                  Configure
                </button>
                <button className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-blue-900/20">
                  Play
                </button>
              </div>
            </header>

            {/* Content Tabs */}
            <div className="border-b border-gray-800 px-6 flex gap-6">
              <button className="py-3 border-b-2 border-blue-500 text-blue-400 font-medium">Mods</button>
              <button className="py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-300">Settings</button>
              <button className="py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-300">Logs</button>
            </div>

            {/* Mods Table (Mock) */}
            <div className="flex-1 overflow-auto p-6">
              <div className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80 text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3 font-medium">Mod Name</th>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50 font-mono text-xs">
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-sans text-sm">Sodium</td>
                      <td className="px-4 py-3 text-gray-500">mc1.20.1-0.5.3</td>
                      <td className="px-4 py-3 text-emerald-400">Modrinth</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-gray-500 hover:text-red-400 transition-colors">✕</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-sans text-sm">Iris Shaders</td>
                      <td className="px-4 py-3 text-gray-500">1.6.10</td>
                      <td className="px-4 py-3 text-emerald-400">Modrinth</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-gray-500 hover:text-red-400 transition-colors">✕</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-sans text-sm">OptiFine (Legacy)</td>
                      <td className="px-4 py-3 text-gray-500">HD_U_I5</td>
                      <td className="px-4 py-3 text-amber-400">Local Jar</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-gray-500 hover:text-red-400 transition-colors">✕</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="text-6xl mb-4 opacity-50">📦</div>
            <p>Select an instance from the sidebar</p>
          </div>
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-6 bg-blue-600 text-white flex items-center px-4 justify-between text-xs absolute bottom-0 left-0 right-0 z-50 shadow-lg shadow-blue-900/50">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            Tauri Daemon Ready
          </span>
          <span className="opacity-80">v0.1.0</span>
        </div>
        <div className="opacity-80 font-mono">
          Memory: 42MB
        </div>
      </footer>
    </div>
  );
}

export default App;
