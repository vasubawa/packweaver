import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CreateInstanceModal } from "./components/CreateInstanceModal";
import "./App.css";

interface Instance {
  id: string;
  name: string;
  base_pack_id: string;
  base_pack_version_id: string;
  mc_version: string;
  loader: string;
  source: string;
  mods_count: number;
  status: string;
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const loadInstances = async () => {
    try {
      const data = await invoke('get_instances');
      // For now, attach mock images until we wire up the real Modrinth API
      const enrichedData = (data as any[]).map(inst => ({
        ...inst,
        imageUrl: inst.source === 'modrinth' ? "https://cdn.modrinth.com/data/1KVo5zza/a334ec484d31e843f55d5be5a21ff7c0c17ed2ad.png" : ""
      }));
      setInstances(enrichedData);
    } catch (e) {
      console.error("Failed to load instances:", e);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const getSourceColorClasses = (source: string) => {
    if (source === 'modrinth') {
      return {
        border: 'border-[#42e887]/40 hover:border-[#42e887]',
        button: 'bg-[#42e887] hover:bg-[#3bc475] text-black border-transparent shadow-sm font-semibold'
      };
    }
    if (source === 'curseforge') {
      return {
        border: 'border-[#f16436]/40 hover:border-[#f16436]',
        button: 'bg-[#f16436] hover:bg-[#d6572e] text-white border-transparent shadow-sm'
      };
    }
    return {
      border: 'border-[#c49474]/50 hover:border-[#c49474]',
      button: 'bg-[#c49474] hover:bg-[#a37659] text-white border-transparent shadow-sm'
    };
  };

  // Helper for rendering the image or a colored fallback banner
  const renderCardBanner = (inst: any) => {
    if (inst.imageUrl) {
      return (
        <>
          <img 
            src={inst.imageUrl} 
            alt={inst.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </>
      );
    }

    // Fallbacks based on source
    if (inst.source === "modrinth") {
      return (
        <div className="w-full h-full bg-[#42e887] flex items-center justify-center p-4">
          <img src="/modrinth.png" alt="Modrinth" className="w-full h-full object-contain opacity-40 drop-shadow-md" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>
      );
    }
    
    if (inst.source === "curseforge") {
      return (
        <div className="w-full h-full bg-[#f16436] flex items-center justify-center p-4">
          <img src="/curseforge.png" alt="CurseForge" className="w-full h-full object-contain opacity-40 drop-shadow-md" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>
      );
    }

    // Default / Local
    return (
      <div className="w-full h-full bg-[#c49474] flex items-center justify-center p-4">
        <img src="/default.png" alt="Custom" className="w-full h-full object-contain opacity-60 drop-shadow-lg" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[var(--color-bg-secondary)]">
      
      {/* Sidebar Navigation */}
      <nav className="w-16 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] flex flex-col items-center py-4 z-10 shadow-sm">
        <div className="w-10 h-10 flex items-center justify-center font-bold text-white bg-[var(--color-accent)] rounded-xl mb-6 shadow-md">
          PW
        </div>
        
        <div className="flex flex-col gap-3 w-full px-3">
          <button className="w-full aspect-square flex items-center justify-center text-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded-xl transition-colors">
            <span className="text-xl">📦</span>
          </button>
          <button className="w-full aspect-square flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-xl transition-colors">
            <span className="text-xl">⚙️</span>
          </button>
        </div>
        
        <div className="mt-auto px-3 w-full">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full aspect-square flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-xl transition-colors text-xl"
            title="Toggle Theme"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header */}
        <header className="h-16 flex items-center px-8 justify-between shrink-0">
          <div>
            <h1 className="text-xl font-semibold">My Instances</h1>
            <p className="text-[var(--color-text-secondary)]">Manage your modpacks</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn-pro-primary"
          >
            + New Instance
          </button>
        </header>

        {/* Clean Grid View */}
        <div className="flex-1 overflow-auto p-8 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            
            {instances.map(inst => {
              const colors = getSourceColorClasses(inst.source);
              return (
                <div key={inst.id} className={`card group border-2 flex flex-col ${colors.border}`}>
                  {/* Image / Fallback Banner */}
                  <div className="h-28 w-full relative bg-[var(--color-border-subtle)] overflow-hidden shrink-0">
                    {renderCardBanner(inst)}
                    {/* Status Badge overlay */}
                    {inst.status !== "Ready" && (
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm border border-white/10 shadow-sm z-10">
                        {inst.status}
                      </div>
                    )}
                    <h2 className="absolute bottom-3 left-4 text-white font-bold text-lg drop-shadow-md z-10 truncate right-4">{inst.name}</h2>
                  </div>
                  
                  {/* Details Area */}
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    
                    {/* Base Pack & Mods */}
                    <div className="flex justify-between items-center text-[var(--color-text-secondary)] text-sm">
                      <span className="font-medium text-[var(--color-text-primary)] truncate" title={inst.base_pack_id}>
                        {inst.base_pack_id}
                      </span>
                      <span className="bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded text-xs border border-[var(--color-border-subtle)] shrink-0">
                        {inst.mods_count} Mods
                      </span>
                    </div>
                    
                    {/* Version & Loader Tags */}
                    <div className="flex gap-2 font-mono text-xs mb-2">
                      <span className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-2 py-1 rounded-md border border-[var(--color-border-subtle)]">
                        {inst.mc_version}
                      </span>
                      <span className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-2 py-1 rounded-md border border-[var(--color-border-subtle)]">
                        {inst.loader}
                      </span>
                    </div>
                    
                    {/* Actions */}
                    <div className="mt-auto pt-3 flex gap-2 border-t border-[var(--color-border-subtle)]">
                      <button className="btn-pro flex-1 justify-center text-sm px-2">Manage</button>
                      
                      {/* One-click Update Button */}
                      <button className="btn-pro flex-1 justify-center text-sm px-2 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white" title="Update Base Pack & Mods">
                        <span className="font-bold">⟳</span> Update
                      </button>
                      
                      {/* Export Button matching source */}
                      <button className={`py-2 rounded-lg flex-1 justify-center text-sm flex items-center gap-1 px-2 font-medium transition-colors ${colors.button}`} title={`Export for ${inst.source}`}>
                        <span className="opacity-80">
                          {inst.source === 'modrinth' ? '🧩' : inst.source === 'curseforge' ? '⚒️' : '📦'}
                        </span> 
                        Export
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty State / Add New */}
            <div 
              onClick={() => setIsModalOpen(true)}
              className="border-2 border-dashed border-[var(--color-border-subtle)] rounded-xl flex flex-col items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all cursor-pointer min-h-[250px]"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] flex items-center justify-center text-2xl mb-3 shadow-sm">
                +
              </div>
              <span className="font-medium">Create Instance</span>
            </div>

          </div>
        </div>
      </main>

      <CreateInstanceModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCreated={loadInstances}
      />
    </div>
  );
}

export default App;
