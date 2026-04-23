import React, { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { InventoryView } from './components/InventoryView';
import { StockReport } from './components/StockReport';
import { Chatbot } from './components/Chatbot';
import { LayoutDashboard, Plus, Store, ChevronRight, Menu, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const { inventories, addInventory } = useInventory();
  const [activeView, setActiveView] = useState<'report' | string>('report');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [newInventoryName, setNewInventoryName] = useState('');
  const [isAddingInventory, setIsAddingInventory] = useState(false);

  const handleAddInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newInventoryName.trim()) {
      addInventory(newInventoryName.trim());
      setNewInventoryName('');
      setIsAddingInventory(false);
    }
  };

  return (
    <div className="min-h-screen bg-fudge-tan flex">
      {/* Mobile Sidebar Toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md text-slate-600"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-fudge-green border-r border-fudge-brown/10 transform transition-transform duration-300 ease-spring ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 shadow-2xl lg:shadow-none`}
      >
        <div className="h-full flex flex-col">
          <div className="p-8">
            <div className="flex items-center gap-4 text-white mb-2 animate-fade-in">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm shadow-inner">
                <Store size={28} className="text-fudge-tan" />
              </div>
              <div>
                <h1 className="font-bold text-2xl tracking-tight text-white leading-none">James'</h1>
                <h1 className="font-bold text-2xl tracking-tight text-fudge-tan leading-none">Fudge</h1>
              </div>
            </div>
            <p className="text-xs text-fudge-tan/80 font-medium tracking-wide pl-1">INVENTORY MANAGER</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            <button
              onClick={() => setActiveView('report')}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-3xl text-base font-semibold transition-all duration-300 ${activeView === 'report'
                ? 'bg-fudge-tan text-fudge-green shadow-lg shadow-fudge-tan/20 scale-105'
                : 'text-fudge-tan/70 hover:bg-white/10 hover:text-white hover:pl-7'
                }`}
            >
              <LayoutDashboard size={22} />
              Stock Report
            </button>

            <div className="pt-8 pb-4 px-6">
              <p className="text-xs font-bold text-fudge-tan/40 uppercase tracking-widest">
                Inventories
              </p>
            </div>

            {inventories.map((inv) => (
              <button
                key={inv.id}
                onClick={() => setActiveView(inv.id)}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-3xl text-base font-semibold transition-all duration-300 group ${activeView === inv.id
                  ? 'bg-fudge-tan text-fudge-green shadow-lg shadow-fudge-tan/20 scale-105'
                  : 'text-fudge-tan/70 hover:bg-white/10 hover:text-white hover:pl-7'
                  }`}
              >
                <span className="truncate">{inv.name}</span>
                {activeView === inv.id && <ChevronRight size={18} className="text-fudge-green animate-scale-in" />}
              </button>
            ))}

            {isAddingInventory ? (
              <form onSubmit={handleAddInventory} className="px-2 mt-2">
                <input
                  autoFocus
                  type="text"
                  value={newInventoryName}
                  onChange={(e) => setNewInventoryName(e.target.value)}
                  placeholder="Inventory Name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-fudge-tan/20 bg-white/10 text-white placeholder-white/40 focus:ring-2 focus:ring-fudge-tan/50 outline-none mb-2"
                  onBlur={() => !newInventoryName && setIsAddingInventory(false)}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-3 py-1.5 bg-fudge-tan text-fudge-green text-xs rounded-md hover:bg-white"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingInventory(false)}
                    className="flex-1 px-3 py-1.5 bg-white/10 text-white text-xs rounded-md hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingInventory(true)}
                className="w-full flex items-center gap-3 px-6 py-4 text-sm font-medium text-fudge-tan/50 hover:text-white hover:bg-white/10 rounded-3xl transition-all border-2 border-dashed border-fudge-tan/10 hover:border-white/30 mt-4 group"
              >
                <div className="p-1 bg-fudge-tan/10 rounded-full group-hover:bg-white/20 transition-colors">
                  <Plus size={16} />
                </div>
                Create Inventory
              </button>
            )}
          </nav>

          <div className="p-6">
            <div className="bg-black/20 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-xs text-fudge-tan/60 text-center font-medium">
                James' Fudge &copy; {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen w-full pt-16 lg:pt-0">
        {activeView === 'report' ? (
          <StockReport />
        ) : (
          <InventoryView inventoryId={activeView} />
        )}
      </main>
      <Chatbot />
    </div>
  );
};

function App() {
  return (
    <InventoryProvider>
      <AppContent />
    </InventoryProvider>
  );
}

export default App;
