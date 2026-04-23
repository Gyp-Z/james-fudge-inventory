import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Inventory, Item } from '../types';

interface InventoryContextType {
    inventories: Inventory[];
    addInventory: (name: string) => void;
    updateInventory: (id: string, name: string) => void;
    deleteInventory: (id: string) => void;
    addItem: (inventoryId: string, item: Omit<Item, 'id'>) => void;
    updateItem: (inventoryId: string, itemId: string, updates: Partial<Item>) => void;
    deleteItem: (inventoryId: string, itemId: string) => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [inventories, setInventories] = useState<Inventory[]>(() => {
        const saved = localStorage.getItem('james-fudge-inventories');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('james-fudge-inventories', JSON.stringify(inventories));
    }, [inventories]);

    const addInventory = (name: string) => {
        const newInventory: Inventory = {
            id: crypto.randomUUID(),
            name,
            items: [],
        };
        setInventories([...inventories, newInventory]);
    };

    const updateInventory = (id: string, name: string) => {
        setInventories(
            inventories.map((inv) =>
                inv.id === id ? { ...inv, name } : inv
            )
        );
    };

    const deleteInventory = (id: string) => {
        setInventories(inventories.filter((inv) => inv.id !== id));
    };

    const addItem = (inventoryId: string, item: Omit<Item, 'id'>) => {
        setInventories(
            inventories.map((inv) => {
                if (inv.id === inventoryId) {
                    return {
                        ...inv,
                        items: [...inv.items, { ...item, id: crypto.randomUUID() }],
                    };
                }
                return inv;
            })
        );
    };

    const updateItem = (inventoryId: string, itemId: string, updates: Partial<Item>) => {
        setInventories(
            inventories.map((inv) => {
                if (inv.id === inventoryId) {
                    return {
                        ...inv,
                        items: inv.items.map((item) =>
                            item.id === itemId ? { ...item, ...updates } : item
                        ),
                    };
                }
                return inv;
            })
        );
    };

    const deleteItem = (inventoryId: string, itemId: string) => {
        setInventories(
            inventories.map((inv) => {
                if (inv.id === inventoryId) {
                    return {
                        ...inv,
                        items: inv.items.filter((item) => item.id !== itemId),
                    };
                }
                return inv;
            })
        );
    };

    return (
        <InventoryContext.Provider
            value={{ inventories, addInventory, updateInventory, deleteInventory, addItem, updateItem, deleteItem }}
        >
            {children}
        </InventoryContext.Provider>
    );
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (context === undefined) {
        throw new Error('useInventory must be used within an InventoryProvider');
    }
    return context;
};
