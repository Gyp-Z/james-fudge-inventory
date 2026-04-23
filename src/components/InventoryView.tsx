import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { ItemForm } from './ItemForm';
import type { Item } from '../types';

interface InventoryViewProps {
    inventoryId: string;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ inventoryId }) => {
    const { inventories, addItem, updateItem, deleteItem, updateInventory, deleteInventory } = useInventory();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Item | undefined>(undefined);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');

    const inventory = inventories.find((inv) => inv.id === inventoryId);

    if (!inventory) return <div>Inventory not found</div>;

    const handleAddItem = (itemData: Omit<Item, 'id'>) => {
        addItem(inventoryId, itemData);
    };

    const handleUpdateItem = (itemData: Omit<Item, 'id'>) => {
        if (editingItem) {
            updateItem(inventoryId, editingItem.id, itemData);
            setEditingItem(undefined);
        }
    };

    const openEdit = (item: Item) => {
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleDeleteInventory = () => {
        if (confirm('Are you sure you want to delete this entire inventory?')) {
            deleteInventory(inventoryId);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    {isEditingName ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onBlur={() => {
                                    if (editedName.trim()) {
                                        updateInventory(inventoryId, editedName.trim());
                                    }
                                    setIsEditingName(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (editedName.trim()) {
                                            updateInventory(inventoryId, editedName.trim());
                                        }
                                        setIsEditingName(false);
                                    } else if (e.key === 'Escape') {
                                        setIsEditingName(false);
                                    }
                                }}
                                autoFocus
                                className="text-4xl font-bold text-fudge-green tracking-tight px-3 py-1 border-2 border-fudge-green rounded-lg focus:outline-none focus:ring-2 focus:ring-fudge-green/20"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <h1 className="text-4xl font-bold text-fudge-green tracking-tight">{inventory.name}</h1>
                            <button
                                onClick={() => {
                                    setEditedName(inventory.name);
                                    setIsEditingName(true);
                                }}
                                className="p-2 text-fudge-brown/40 hover:text-fudge-green hover:bg-fudge-green/10 rounded-lg transition-all"
                                title="Edit inventory name"
                            >
                                <Pencil size={20} />
                            </button>
                        </div>
                    )}
                    <p className="text-fudge-brown/60 font-medium mt-1">{inventory.items.length} items in stock</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleDeleteInventory}
                        className="px-6 py-3 text-fudge-red hover:bg-fudge-red/10 rounded-full transition-all font-medium flex items-center gap-2"
                    >
                        <Trash2 size={20} />
                        Delete Inventory
                    </button>
                    <button
                        onClick={() => {
                            setEditingItem(undefined);
                            setIsFormOpen(true);
                        }}
                        className="px-6 py-3 bg-fudge-green text-white rounded-full hover:bg-fudge-green/90 shadow-lg shadow-fudge-green/20 hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-2 font-semibold"
                    >
                        <Plus size={22} />
                        Add Item
                    </button>
                </div>
            </div>

            {inventory.items.length === 0 ? (
                <div className="text-center py-24 bg-white/50 rounded-3xl border-2 border-dashed border-fudge-brown/10 backdrop-blur-sm animate-scale-in">
                    <div className="w-20 h-20 bg-fudge-tan text-fudge-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <Package size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-fudge-green mb-2">No items yet</h3>
                    <p className="text-fudge-brown/60 mb-8 max-w-xs mx-auto">Get started by adding your first item to this inventory.</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="px-8 py-3 bg-white text-fudge-green font-bold rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all border border-fudge-green/10"
                    >
                        Add First Item
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-3xl shadow-xl shadow-fudge-brown/5 overflow-hidden border border-fudge-brown/5 animate-slide-up">
                    <table className="w-full text-left">
                        <thead className="bg-fudge-tan/30 border-b border-fudge-brown/5">
                            <tr>
                                <th className="px-6 py-5 text-xs font-bold text-fudge-brown/50 uppercase tracking-wider">Item Name</th>
                                <th className="px-6 py-5 text-xs font-bold text-fudge-brown/50 uppercase tracking-wider">Category</th>
                                <th className="px-6 py-5 text-xs font-bold text-fudge-brown/50 uppercase tracking-wider">Stock Level</th>
                                <th className="px-6 py-5 text-xs font-bold text-fudge-brown/50 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-5 text-xs font-bold text-fudge-brown/50 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-fudge-brown/5">
                            {inventory.items.map((item) => {
                                const isLow = item.quantity <= item.threshold;
                                const isCritical = item.quantity <= item.threshold * 0.5;

                                return (
                                    <tr key={item.id} className="hover:bg-fudge-tan/10 transition-colors group">
                                        <td className="px-6 py-5 font-bold text-fudge-green text-lg">{item.name}</td>
                                        <td className="px-6 py-5 text-fudge-brown/60 font-medium">{item.category || '-'}</td>
                                        <td className="px-6 py-5 text-slate-700">
                                            <span className="text-xl font-bold">{item.quantity}</span> <span className="text-slate-400 text-sm font-medium">{item.unit || 'units'}</span>
                                            {item.size && <span className="text-slate-400 text-sm font-medium ml-1">({item.size})</span>}
                                        </td>
                                        <td className="px-6 py-5">
                                            {isCritical ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                                    Critical
                                                </span>
                                            ) : isLow ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                                    Low Stock
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                    In Stock
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openEdit(item)}
                                                    className="p-2.5 text-slate-400 hover:text-fudge-green hover:bg-fudge-tan rounded-xl transition-all hover:scale-110"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button
                                                    onClick={() => deleteItem(inventoryId, item.id)}
                                                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all hover:scale-110"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <ItemForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSubmit={editingItem ? handleUpdateItem : handleAddItem}
                initialData={editingItem}
            />
        </div>
    );
};
