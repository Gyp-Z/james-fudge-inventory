import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

export const Chatbot: React.FC = () => {
    const { inventories, addItem, deleteItem, updateItem, addInventory, deleteInventory } = useInventory();
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: '1',
            text: "Hi! I'm your inventory assistant. You can ask me to add items, remove them, or manage inventories. Type 'help' to see what I can do.",
            sender: 'bot',
            timestamp: new Date(),
        },
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            text: input,
            sender: 'user',
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        processCommand(input);
        setInput('');
    };

    const addBotMessage = (text: string) => {
        setMessages((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                text,
                sender: 'bot',
                timestamp: new Date(),
            },
        ]);
    };

    const processCommand = (cmd: string) => {
        const lowerCmd = cmd.toLowerCase().trim();

        // Helper to capitalize words
        const capitalize = (str: string) => str.replace(/\b\w/g, c => c.toUpperCase());

        if (lowerCmd === 'help') {
            addBotMessage(
                "Here are some commands I understand:\n" +
                "- 'report': Show items that need attention.\n" +
                "- 'create inventory [name]': Create a new inventory.\n" +
                "- 'delete inventory [name]': Delete an inventory.\n" +
                "- 'add [qty] [unit?] [item], ... to [inventory]': Add items.\n" +
                "  Example: 'add 5 kg Sugar, 10 Flour to Kitchen'\n" +
                "- 'reorder [item] when lower than [amount]': Set alert threshold.\n" +
                "  Example: 'reorder Sugar when lower than 20'\n" +
                "- 'remove [item] from [inventory]': Remove an item."
            );
            return;
        }

        if (lowerCmd === 'report') {
            const critical = inventories.flatMap(inv => inv.items).filter(i => i.quantity <= i.threshold * 0.5);
            const low = inventories.flatMap(inv => inv.items).filter(i => i.quantity <= i.threshold && i.quantity > i.threshold * 0.5);

            if (critical.length === 0 && low.length === 0) {
                addBotMessage("Great news! All items are well-stocked.");
            } else {
                let report = "";
                if (critical.length > 0) {
                    report += `CRITICAL (${critical.length}): ${critical.map(i => i.name).join(', ')}. `;
                }
                if (low.length > 0) {
                    report += `LOW (${low.length}): ${low.map(i => i.name).join(', ')}.`;
                }
                addBotMessage(report);
            }
            return;
        }

        // Create Inventory
        const createInvMatch = lowerCmd.match(/^create\s+inventory\s+(.+)$/i);
        if (createInvMatch) {
            const rawName = createInvMatch[1];
            const invName = capitalize(rawName);

            if (inventories.some(inv => inv.name.toLowerCase() === invName.toLowerCase())) {
                addBotMessage(`Inventory '${invName}' already exists.`);
            } else {
                addInventory(invName);
                addBotMessage(`Created new inventory: ${invName}`);
            }
            return;
        }

        // Delete Inventory
        const deleteInvMatch = lowerCmd.match(/^delete\s+inventory\s+(.+)$/i);
        if (deleteInvMatch) {
            const [, invName] = deleteInvMatch;
            const inventory = inventories.find(inv => inv.name.toLowerCase() === invName.toLowerCase());
            if (inventory) {
                deleteInventory(inventory.id);
                addBotMessage(`Deleted inventory: ${inventory.name}`);
            } else {
                addBotMessage(`I couldn't find an inventory named '${invName}'.`);
            }
            return;
        }

        // Custom Threshold Command
        // Pattern: reorder [item name] when lower than [number]
        const thresholdMatch = lowerCmd.match(/^reorder\s+(.+)\s+when\s+lower\s+than\s+(\d+)$/i);
        if (thresholdMatch) {
            const [, itemName, thresholdStr] = thresholdMatch;
            const threshold = parseInt(thresholdStr);
            const capItemName = capitalize(itemName);

            // Search for item across all inventories
            let found = false;
            inventories.forEach(inv => {
                const item = inv.items.find(i => i.name.toLowerCase() === itemName.toLowerCase());
                if (item) {
                    updateItem(inv.id, item.id, { threshold });
                    found = true;
                }
            });

            if (found) {
                addBotMessage(`Updated reorder threshold for ${capItemName} to ${threshold}.`);
            } else {
                addBotMessage(`I couldn't find any item named '${capItemName}'.`);
            }
            return;
        }

        // Bulk Add Item
        // Pattern: add [qty] [unit?] [item], [qty] [unit?] [item]... to [inventory]
        // New pattern: add [qty] [unit] of [size] [item]
        const addToMatch = lowerCmd.match(/^add\s+(.+)\s+to\s+(.+)$/i);
        if (addToMatch) {
            const [, itemsPart, inventoryName] = addToMatch;
            const targetInventory = inventories.find(inv => inv.name.toLowerCase() === inventoryName.toLowerCase());

            if (!targetInventory) {
                addBotMessage(`I couldn't find an inventory named '${inventoryName}'. Available: ${inventories.map(i => i.name).join(', ')}\n\nTry: 'add 10 beers to ${inventories[0]?.name || 'Kitchen'}'`);
                return;
            }

            const itemEntries = itemsPart.split(',').map(s => s.trim());
            const results: string[] = [];

            itemEntries.forEach(entry => {
                // Parse patterns:
                // 1. "10 bags of 50lb Sugar" -> Qty: 10, Unit: bags, Size: 50lb, Name: Sugar
                // 2. "5 kg Sugar" -> Qty: 5, Unit: kg, Name: Sugar
                // 3. "5 Sugar" -> Qty: 5, Name: Sugar

                const match = entry.match(/^(\d+)\s+(.+)$/);
                if (!match) return;

                const qty = parseInt(match[1]);
                let rest = match[2].trim();
                let unit: string | undefined = undefined;
                let size: string | undefined = undefined;
                let itemName = rest;

                // Check for "of" pattern first (Unit of Size Name)
                // "bags of 50lb Sugar"
                const ofMatch = rest.match(/^(\w+)\s+of\s+(\w+)\s+(.+)$/i);
                if (ofMatch) {
                    unit = ofMatch[1]; // bags
                    size = ofMatch[2]; // 50lb
                    itemName = ofMatch[3]; // Sugar
                } else {
                    // Fallback to standard parsing
                    const commonUnits = ['kg', 'lbs', 'lb', 'g', 'oz', 'box', 'boxes', 'pack', 'packs', 'bag', 'bags', 'unit', 'units', 'pcs', 'piece', 'pieces', 'can', 'cans', 'jar', 'jars', 'bottle', 'bottles', 'beer', 'beers'];
                    const parts = rest.split(' ');

                    if (parts.length > 1 && commonUnits.includes(parts[0].toLowerCase())) {
                        unit = parts[0];
                        itemName = parts.slice(1).join(' ');
                    }
                }

                const capItemName = capitalize(itemName);

                const existingItem = targetInventory.items.find(i => i.name.toLowerCase() === itemName.toLowerCase());

                if (existingItem) {
                    updateItem(targetInventory.id, existingItem.id, { quantity: existingItem.quantity + qty });
                    results.push(`Updated ${existingItem.name} (+${qty})`);
                } else {
                    // Default threshold 10
                    addItem(targetInventory.id, { name: capItemName, quantity: qty, unit, size, threshold: 10 });
                    results.push(`Added ${capItemName} (${qty} ${unit || ''}${size ? ' of ' + size : ''})`);
                }
            });

            if (results.length > 0) {
                addBotMessage(`Done in ${targetInventory.name}: ${results.join(', ')}.`);
            } else {
                addBotMessage("I couldn't parse the items.\n\nExamples:\n- 'add 10 beers to Fridge'\n- 'add 5 kg Sugar to Kitchen'\n- 'add 10 bags of 50lb Sugar to Warehouse'");
            }
            return;
        }

        // Remove Item
        const removeMatch = lowerCmd.match(/^remove\s+(.+)\s+from\s+(.+)$/i);
        if (removeMatch) {
            const [, itemName, inventoryName] = removeMatch;

            const inventory = inventories.find(inv => inv.name.toLowerCase() === inventoryName.toLowerCase());
            if (!inventory) {
                addBotMessage(`I couldn't find an inventory named '${inventoryName}'.`);
                return;
            }

            const item = inventory.items.find(i => i.name.toLowerCase() === itemName.toLowerCase());
            if (!item) {
                addBotMessage(`I couldn't find '${itemName}' in ${inventory.name}.`);
                return;
            }

            deleteItem(inventory.id, item.id);
            addBotMessage(`Removed ${item.name} from ${inventory.name}.`);
            return;
        }

        addBotMessage("I didn't understand that command. Try 'help' to see what I can do.");
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 p-4 bg-fudge-green text-white rounded-full shadow-xl shadow-fudge-green/30 hover:bg-fudge-green/90 hover:scale-110 transition-all duration-300 z-50 ${isOpen ? 'hidden' : 'flex'} animate-bounce`}
            >
                <MessageSquare size={28} />
            </button>

            {/* Chat Window */}
            <div
                className={`fixed bottom-6 right-6 w-80 md:w-96 bg-white rounded-3xl shadow-2xl shadow-fudge-brown/20 border border-fudge-brown/10 flex flex-col transition-all duration-300 z-50 ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-10 pointer-events-none'
                    }`}
                style={{ height: '550px', maxHeight: '80vh' }}
            >
                {/* Header */}
                <div className="p-4 bg-fudge-green text-white rounded-t-2xl flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Bot size={20} />
                        <span className="font-semibold">Inventory Assistant</span>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-fudge-tan/30">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm ${msg.sender === 'user'
                                    ? 'bg-fudge-green text-white rounded-br-none'
                                    : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
                                    }`}
                            >
                                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                                <p className={`text-[10px] mt-1.5 ${msg.sender === 'user' ? 'text-fudge-tan/80' : 'text-slate-400'}`}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type a command..."
                            className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-fudge-green/20 focus:border-fudge-green transition-all text-sm"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="p-3 bg-fudge-green text-white rounded-xl hover:bg-fudge-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
};
