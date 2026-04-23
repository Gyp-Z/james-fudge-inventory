import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Item } from '../types';

interface ItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (item: Omit<Item, 'id'>) => void;
    initialData?: Item;
}

export const ItemForm: React.FC<ItemFormProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [formData, setFormData] = useState<Omit<Item, 'id'>>({
        name: '',
        quantity: 0,
        quantity: 0,
        unit: 'units',
        size: '',
        threshold: 0,
        category: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                quantity: initialData.quantity,
                unit: initialData.unit,
                size: initialData.size || '',
                threshold: initialData.threshold,
                category: initialData.category || '',
            });
        } else {
            setFormData({
                name: '',
                quantity: 0,
                quantity: 0,
                unit: 'units',
                size: '',
                threshold: 0,
                category: '',
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">
                        {initialData ? 'Edit Item' : 'Add New Item'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => {
                                // Auto-capitalize first letter of each word
                                const val = e.target.value;
                                const capitalized = val.replace(/\b\w/g, c => c.toUpperCase());
                                setFormData({ ...formData, name: capitalized });
                            }}
                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                            placeholder="e.g., Sugar"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                            <input
                                type="number"
                                required
                                min="0"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Unit (Optional)</label>
                            <input
                                type="text"
                                value={formData.unit || ''}
                                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                                placeholder="e.g., kg"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Unit Size (Optional)</label>
                        <input
                            type="text"
                            value={formData.size || ''}
                            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                            placeholder="e.g., 50lb"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Reorder Threshold</label>
                        <input
                            type="number"
                            required
                            min="0"
                            value={formData.threshold}
                            onChange={(e) => setFormData({ ...formData, threshold: Number(e.target.value) })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                        />
                        <p className="text-xs text-slate-500 mt-1">Alert when stock falls below this amount</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Category (Optional)</label>
                        <input
                            type="text"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-fudge-green focus:ring-2 focus:ring-fudge-green/20 outline-none transition-all"
                            placeholder="e.g., Dry Goods"
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-fudge-green text-white rounded-lg hover:bg-fudge-green/90 shadow-md shadow-fudge-green/20 transition-all"
                        >
                            {initialData ? 'Save Changes' : 'Add Item'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
