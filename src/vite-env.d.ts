declare module '@sqlite.org/sqlite-wasm' {
    const sqlite3InitModule: (options?: any) => Promise<any>;
    export default sqlite3InitModule;
}

declare module 'vite-plugin-mkcert' {
    import { Plugin } from 'vite';
    const mkcert: (options?: any) => Plugin;
    export default mkcert;
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<{}, {}, any>;
    export default component;
}
