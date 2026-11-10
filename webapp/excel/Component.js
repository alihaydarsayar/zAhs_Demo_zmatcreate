sap.ui.define([
    "com/alihaydarsayar/zmatcreate/Component"
], (BaseComponent) => {
    "use strict";

    /** Excel önizleme ve düzenleme özellikleri açık sürüm; ayarı kendi manifest.json dosyasında. */
    return BaseComponent.extend("com.alihaydarsayar.zmatcreate.excel.Component", {
        metadata: {
            manifest: "json"
        }
    });
});
