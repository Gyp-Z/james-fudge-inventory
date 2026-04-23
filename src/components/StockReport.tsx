import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { AlertTriangle, CheckCircle, AlertOctagon } from 'lucide-react';

export const StockReport: React.FC = () => {
    const { inventories } = useInventory();

    const allItems = inventories.flatMap((inv) =>
        inv.items.map((item) => ({ ...item, inventoryName: inv.name }))
    );

    const criticalItems = allItems.filter((item) => item.quantity <= item.threshold * 0.5);
    const lowItems = allItems.filter(
        (item) => item.quantity <= item.threshold && item.quantity > item.threshold * 0.5
    );
    const goodItems = allItems.filter((item) => item.quantity > item.threshold);

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="mb-10">
                <h1 className="text-4xl font-bold text-fudge-green tracking-tight">Stock Report</h1>
                <p className="text-fudge-brown/60 font-medium mt-2">Real-time audit of all inventory items across all locations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-white border border-fudge-brown/5 rounded-3xl p-6 shadow-xl shadow-fudge-brown/5 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-4 bg-red-100 text-red-600 rounded-2xl">
                            <AlertOctagon size={28} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-red-600 uppercase tracking-wider">Critical Stock</p>
                            <h3 className="text-3xl font-extrabold text-slate-800">{criticalItems.length} <span className="text-sm font-medium text-slate-400">Items</span></h3>
                        </div>
                    </div>
                    <p className="text-sm text-red-700/80 font-medium pl-1">Immediate restocking required.</p>
                </div>

                <div className="bg-white border border-fudge-brown/5 rounded-3xl p-6 shadow-xl shadow-fudge-brown/5 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl">
                            <AlertTriangle size={28} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-600 uppercase tracking-wider">Low Stock</p>
                            <h3 className="text-3xl font-extrabold text-slate-800">{lowItems.length} <span className="text-sm font-medium text-slate-400">Items</span></h3>
                        </div>
                    </div>
                    <p className="text-sm text-amber-700/80 font-medium pl-1">Plan to reorder soon.</p>
                </div>

                <div className="bg-white border border-fudge-brown/5 rounded-3xl p-6 shadow-xl shadow-fudge-brown/5 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl">
                            <CheckCircle size={28} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-600 uppercase tracking-wider">Healthy Stock</p>
                            <h3 className="text-3xl font-extrabold text-slate-800">{goodItems.length} <span className="text-sm font-medium text-slate-400">Items</span></h3>
                        </div>
                    </div>
                    <p className="text-sm text-emerald-700/80 font-medium pl-1">Inventory levels are sufficient.</p>
                </div>
            </div>

            <div className="space-y-8">
                {criticalItems.length > 0 && (
                    <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                        <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                            Critical Attention Needed
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {criticalItems.map((item) => (
                                <div key={item.id} className="bg-white border border-red-100 rounded-3xl shadow-lg shadow-red-900/5 p-5 flex justify-between items-start hover:scale-[1.02] transition-transform duration-200">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">{item.name}</h4>
                                        <p className="text-sm text-slate-500 font-medium">{item.inventoryName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-extrabold text-red-600">
                                            {item.quantity} <span className="text-xs font-bold text-slate-400">{item.unit || 'units'}{item.size ? ` (${item.size})` : ''}</span>
                                        </p>
                                        <p className="text-xs text-slate-400 font-medium">Threshold: {item.threshold}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {lowItems.length > 0 && (
                    <section className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
                        <h3 className="text-lg font-bold text-amber-600 mb-4 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            Reorder Soon
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {lowItems.map((item) => (
                                <div key={item.id} className="bg-white border border-amber-100 rounded-3xl shadow-lg shadow-amber-900/5 p-5 flex justify-between items-start hover:scale-[1.02] transition-transform duration-200">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">{item.name}</h4>
                                        <p className="text-sm text-slate-500 font-medium">{item.inventoryName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-extrabold text-amber-600">
                                            {item.quantity} <span className="text-xs font-bold text-slate-400">{item.unit || 'units'}{item.size ? ` (${item.size})` : ''}</span>
                                        </p>
                                        <p className="text-xs text-slate-400 font-medium">Threshold: {item.threshold}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {goodItems.length > 0 && (
                    <section className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
                        <h3 className="text-lg font-bold text-emerald-600 mb-4 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            Healthy Stock
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {goodItems.map((item) => (
                                <div key={item.id} className="bg-white border border-emerald-100 rounded-3xl shadow-lg shadow-emerald-900/5 p-5 flex justify-between items-start hover:scale-[1.02] transition-transform duration-200">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">{item.name}</h4>
                                        <p className="text-sm text-slate-500 font-medium">{item.inventoryName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-extrabold text-emerald-600">
                                            {item.quantity} <span className="text-xs font-bold text-slate-400">{item.unit || 'units'}{item.size ? ` (${item.size})` : ''}</span>
                                        </p>
                                        <p className="text-xs text-slate-400 font-medium">Threshold: {item.threshold}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
