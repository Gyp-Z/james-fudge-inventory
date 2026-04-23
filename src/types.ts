interface Item {
    id: string;
    name: string;
    quantity: number;
    unit?: string; // Optional: e.g., kg, lbs, or undefined
    size?: string; // Optional: e.g., 50lb, 12oz
    threshold: number; // Reorder point
    category?: string;
}

items: Item[];
}
