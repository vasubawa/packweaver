import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type SourceType = "local" | "modrinth" | "curseforge";

export function CreateInstanceModal({ isOpen, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<SourceType>("modrinth");
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setName("");
    setSource("modrinth");
    onClose();
  };

  const handleCreate = async (pack: any) => {
    if (!name) return;
    setIsCreating(true);
    try {
      await invoke('create_instance', {
        name: name,
        basePackId: pack.id || pack.name, // using name as mock ID for now
        basePackVersionId: pack.version || "1.0.0",
        mcVersion: "1.20.1",
        loader: "fabric",
        source: source
      });
      if (onCreated) onCreated();
      handleClose();
    } catch (e) {
      console.error("Failed to create instance:", e);
    } finally {
      setIsCreating(false);
    }
  };

  // Helper for rendering small thumbnail fallbacks
  const renderThumbnail = (pack: any) => {
    if (pack.img) {
      return <img src={pack.img} alt={pack.name} className="w-12 h-12 rounded-lg bg-[var(--color-border-subtle)] object-cover shadow-sm" />;
    }

    if (source === "modrinth") {
      return (
        <div className="w-12 h-12 rounded-lg bg-[#42e887] flex items-center justify-center shadow-sm p-1.5 shrink-0">
          <img src="/modrinth.png" alt="Modrinth" className="w-full h-full object-contain opacity-90 drop-shadow-sm" />
        </div>
      );
    }

    if (source === "curseforge") {
      return (
        <div className="w-12 h-12 rounded-lg bg-[#f16436] flex items-center justify-center shadow-sm p-1.5 shrink-0">
          <img src="/curseforge.png" alt="CurseForge" className="w-full h-full object-contain opacity-90 drop-shadow-sm" />
        </div>
      );
    }

    return (
      <div className="w-12 h-12 rounded-lg bg-[#c49474] flex items-center justify-center shadow-sm p-1.5 shrink-0">
        <img src="/default.png" alt="Custom" className="w-full h-full object-contain opacity-90 drop-shadow-sm" />
      </div>
    );
  };

  // Helper for dynamic primary button color based on source
  const getPrimaryBtnClass = () => {
    let base = "px-4 py-2 rounded-lg font-medium transition-colors shadow-sm ";
    if (source === "modrinth") return base + "bg-[#42e887] hover:bg-[#3bc475] text-black font-semibold";
    if (source === "curseforge") return base + "bg-[#f16436] hover:bg-[#d6572e] text-white";
    return base + "bg-[#c49474] hover:bg-[#a37659] text-white"; // Local
  };

  // Helper for dynamic text hover color
  const getTextHoverClass = () => {
    if (source === "modrinth") return "group-hover:text-[#42e887]";
    if (source === "curseforge") return "group-hover:text-[#f16436]";
    return "group-hover:text-[#c49474]";
  };

  // Helper for neutral button that colors on hover
  const getSelectBtnHoverClass = () => {
    let base = "border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] transition-all shadow-sm ";
    if (source === "modrinth") return base + "hover:bg-[#42e887] hover:border-[#42e887] hover:text-black hover:font-semibold";
    if (source === "curseforge") return base + "hover:bg-[#f16436] hover:border-[#f16436] hover:text-white";
    return base + "hover:bg-[#c49474] hover:border-[#c49474] hover:text-white";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="panel w-full max-w-xl flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex justify-between items-center bg-[var(--color-bg-primary)]">
          <h2 className="text-lg font-bold">Create New Instance</h2>
          <button onClick={handleClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xl">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 bg-[var(--color-bg-secondary)]">
          
          {/* Name */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-[var(--color-text-primary)]">Instance Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Modpack Setup"
              className="input-pro bg-[var(--color-bg-primary)]"
              autoFocus
            />
          </div>

          {/* Source Toggle */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-[var(--color-text-primary)]">Base Pack Source</label>
            <div className="flex p-1 bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm">
              {(['local', 'modrinth', 'curseforge'] as const).map(s => {
                
                let activeClass = 'bg-[var(--color-accent)] text-white font-medium shadow-sm';
                if (s === 'modrinth') activeClass = 'bg-[#42e887] text-black font-semibold shadow-sm';
                if (s === 'curseforge') activeClass = 'bg-[#f16436] text-white font-medium shadow-sm';
                if (s === 'local') activeClass = 'bg-[#c49474] text-white font-medium shadow-sm';

                return (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`flex-1 py-2 text-center capitalize rounded-md text-sm transition-all ${source === s ? activeClass : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Content Area (Fixed Height to prevent jitter) */}
          <div className="pt-2 h-[300px] flex flex-col">
            {source === "local" && (
              <div className="border-2 border-dashed border-[var(--color-border-subtle)] rounded-xl flex-1 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)]">
                <div className="text-4xl text-[var(--color-text-secondary)]">📥</div>
                <div className="text-center">
                  <p className="font-medium">Drag & drop your zip file</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">or click to browse</p>
                </div>
                <button className="btn-pro mt-2">Browse Files</button>
              </div>
            )}
            
            {(source === "modrinth" || source === "curseforge") && (
              <div className="h-full flex flex-col gap-4">
                <div className="flex gap-2 shrink-0">
                  <input 
                    type="text" 
                    placeholder={`Search modpacks on ${source}...`}
                    className="input-pro bg-[var(--color-bg-primary)]"
                  />
                  <button className={getPrimaryBtnClass()}>Search</button>
                </div>
                
                {/* Result List with Images / Fallbacks */}
                <div className="flex-1 border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] rounded-lg overflow-hidden overflow-y-auto">
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    
                    {[
                      { name: "Prominence II [RPG]", author: "LunaPixelStudios", img: "https://cdn.modrinth.com/data/b0aN0Ie8/72ef7b0499e19cc17a863ba9ad4c0e64c207908b.png" },
                      { name: "Cobblemon [Fabric]", author: "Cobblemon", img: "https://cdn.modrinth.com/data/MpoMuOqc/16ccbf9c39cc2455ca302e1de2ef307c0cfccfb9.png" },
                      { name: "Unknown Pack", author: "mystery_dev", img: "" } // Fallback trigger
                    ].map((pack, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer group">
                        {renderThumbnail(pack)}
                        <div className="flex-1">
                          <h4 className={`font-semibold text-[var(--color-text-primary)] transition-colors ${getTextHoverClass()}`}>{pack.name}</h4>
                          <p className="text-xs text-[var(--color-text-secondary)]">by {pack.author} • 1.20.1 (Fabric)</p>
                        </div>
                        <button 
                          onClick={() => handleCreate(pack)}
                          disabled={!name || isCreating}
                          className={`${getSelectBtnHoverClass()} rounded-md px-4 text-sm py-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${(!name || isCreating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isCreating ? '...' : 'Select'}
                        </button>
                      </div>
                    ))}

                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] flex justify-end gap-3 rounded-b-xl">
          <button onClick={handleClose} className="btn-pro">Cancel</button>
          {source === "local" && (
            <button className={`${getPrimaryBtnClass()} opacity-50 cursor-not-allowed`} disabled>Create Instance</button>
          )}
        </div>

      </div>
    </div>
  );
}
