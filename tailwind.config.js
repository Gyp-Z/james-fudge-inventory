/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'fudge-green': '#004d00',
                'fudge-tan': '#E8E4C9',
                'fudge-brown': '#4a3728',
                'fudge-red': '#c41e3a',
            }
        },
    },
    plugins: [],
}
