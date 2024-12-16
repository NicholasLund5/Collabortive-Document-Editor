module.exports = {
    mount: {
        public: { url: '/', static: true }, // Maps `public/` to the root URL
        src: { url: '/src' },              // Maps `src/` to `/src` for ES modules
    },
    plugins: [],
    devOptions: {
        port: 8080,                        // Port for the dev server
        open: "none",                      // Prevent auto-opening the browser
    },
};
