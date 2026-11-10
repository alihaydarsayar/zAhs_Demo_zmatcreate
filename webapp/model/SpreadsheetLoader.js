sap.ui.define([], () => {
    "use strict";

    // Excel benzeri düzenlenebilir ızgara: Jspreadsheet CE (MIT). UI5'te karşılığı olmadığı için
    // CDN'den, yalnızca ızgara ilk kez açıldığında yüklenir.
    const BASE = "https://cdn.jsdelivr.net/npm/";
    const STYLES = [
        BASE + "jsuites@5.13.5/dist/jsuites.min.css",
        BASE + "jspreadsheet-ce@4.15.0/dist/jspreadsheet.min.css"
    ];
    // Sıra önemli: Jspreadsheet, jSuites'e ihtiyaç duyar
    const SCRIPTS = [
        BASE + "jsuites@5.13.5/dist/jsuites.min.js",
        BASE + "jspreadsheet-ce@4.15.0/dist/index.min.js"
    ];

    let pLibrary = null;

    function addStyle(sHref) {
        if (document.querySelector('link[href="' + sHref + '"]')) {
            return;
        }
        const oLink = document.createElement("link");
        oLink.rel = "stylesheet";
        oLink.href = sHref;
        document.head.appendChild(oLink);
    }

    function addScript(sSrc) {
        return new Promise((resolve, reject) => {
            const oScript = document.createElement("script");
            oScript.src = sSrc;
            oScript.onload = resolve;
            oScript.onerror = () => reject(new Error("Yüklenemedi: " + sSrc));
            document.head.appendChild(oScript);
        });
    }

    return {
        /**
         * Jspreadsheet kütüphanesini yükler (bir kez) ve global `jspreadsheet` fonksiyonunu döndürür.
         * @returns {Promise<Function>} jspreadsheet
         */
        load() {
            if (window.jspreadsheet) {
                return Promise.resolve(window.jspreadsheet);
            }
            if (!pLibrary) {
                STYLES.forEach(addStyle);
                // Sayfada AMD define() varsa kütüphaneler global değişken yerine ona kaydolur; yüklerken gizle
                const fnDefine = window.define;
                window.define = undefined;
                pLibrary = SCRIPTS.reduce((p, sSrc) => p.then(() => addScript(sSrc)), Promise.resolve())
                    .then(() => {
                        if (!window.jspreadsheet) {
                            throw new Error("jspreadsheet tanımlanmadı");
                        }
                        return window.jspreadsheet;
                    })
                    .catch((oError) => {
                        pLibrary = null;
                        throw oError;
                    })
                    .finally(() => {
                        window.define = fnDefine;
                    });
            }
            return pLibrary;
        }
    };
});
