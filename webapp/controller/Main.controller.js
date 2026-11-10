sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/export/Spreadsheet",
    "sap/base/Log",
    "com/alihaydarsayar/zmatcreate/model/ExcelReader"
], (Controller, JSONModel, MessageToast, MessageBox, BusyIndicator, Spreadsheet, Log, ExcelReader) => {
    "use strict";

    // Excel başlığı <-> model alanı
    const COLUMNS = [
        { key: "Mtart", header: "Malzeme Türü" },
        { key: "Maktx", header: "Malzeme Açıklaması" },
        { key: "Meins", header: "Temel Ölçü Birim" },
        { key: "Sector", header: "Sektör" },
        { key: "Division", header: "Bölüm" },
        { key: "Plant", header: "Üretim Yeri" },
        { key: "Storage", header: "Depo Yeri" }
    ];
    const REQUIRED = ["Mtart", "Maktx", "Meins", "Plant"];
    // Demo: SAP'de tanımlı kabul edilen malzeme türleri
    const KNOWN_TYPES = ["FERT", "HALB", "HAWA", "VERP", "ZRAW"];
    //   const SAMPLE = [
    //     ["FERT", "Bitmiş Motor Parçası", "ADET", "O", "2104", "2000", "8004"],
    //     ["FERT", "Tamamlanmış Pompa Ünitesi", "ADET", "O", "2110", "2000", "8010"],
    //     ["HALB", "Yarı Mamul Çelik Boru", "MT", "M", "2101", "2000", "8001"],
    //     ["HALB", "Döküm Parça", "KG", "M", "2109", "2000", "8009"],
    //     ["HAWA", "Vida Seti", "KG", "K", "2103", "2000", "8003"],
    //     ["HAWA", "Plastik Kasa", "ADET", "L", "2107", "2000", "8007"],
    //     ["ROH", "Alüminyum Levha", "KG", "M", "2105", "2000", "8005"],
    //     ["VERP", "Ahşap Palet", "ADET", "L", "2102", "2000", "8002"],
    //     ["VERP", "Karton Ambalaj Kutusu", "ADET", "L", "2108", "2000", "8008"],
    //     ["ZRAW", "Kimyasal Solvent", "LT", "C", "2106", "2000", "8006"]
    // ].map((aRow) => toRecord(aRow, COLUMNS.map((_, i) => i)));
    /** Satır dizisini sütun indekslerine göre model nesnesine çevirir. */
    function toRecord(aRow, aIdx) {
        const oRec = {};
        COLUMNS.forEach((c, i) => {
            const v = aRow[aIdx[i]];
            oRec[c.key] = v === undefined ? "" : String(v).trim();
        });
        return oRec;
    }

    /** Başlık adlarını karşılaştırmak için sadeleştirir (büyük/küçük harf, boşluk, noktalama). */
    function normalize(s) {
        return String(s).toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]/g, "");
    }

    return Controller.extend("com.alihaydarsayar.zmatcreate.controller.Main", {

        onInit() {
            this.getView().setModel(new JSONModel({ fileName: "", count: "", rows: [] }), "view");
        },

        _t(sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        /* ---------------- Excel yükleme ---------------- */

        onFileChange(oEvent) {
            const oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (!oFile) {
                return;
            }
            const oReader = new FileReader();
            oReader.onload = (e) => this._applyFile(oFile.name, e.target.result);
            oReader.onerror = () => MessageBox.error(this._t("msgBadFile"));
            oReader.readAsArrayBuffer(oFile);
        },

        _applyFile(sName, oBuffer) {
            let aAoa;
            try {
                aAoa = ExcelReader.read(oBuffer);
            } catch (oError) {
                Log.error("Excel okunamadı", oError && oError.stack);
                MessageBox.error(this._t("msgBadFile"), { details: String(oError && oError.message) });
                return;
            }

            // Başlık adına göre eşle; bulunamazsa sütun sırasına düş
            const aHead = (aAoa[0] || []).map(normalize);
            const aIdx = COLUMNS.map((c, i) => {
                const n = aHead.indexOf(normalize(c.header));
                return n >= 0 ? n : i;
            });
            const aRows = aAoa.slice(1).map((aRow) => Object.assign(toRecord(aRow, aIdx), {
                StatusCode: "", StatusMessage: "", State: "None", Icon: ""
            }));

            if (!aRows.length) {
                MessageBox.warning(this._t("msgEmptyFile"));
                return;
            }
            const oModel = this.getView().getModel("view");
            oModel.setProperty("/fileName", sName);
            oModel.setProperty("/rows", aRows);
            oModel.setProperty("/count", this._t("rowCount", [aRows.length]));
            this.byId("table").removeSelections(true);
            MessageToast.show(this._t("msgLoaded", [aRows.length]));
        },

        /* ---------------- Excel indirme (sap.ui.export.Spreadsheet) ---------------- */

        onDownloadTemplate() {
            // Boş dizi, Spreadsheet'te "bilinmeyen satır sayısı" uyarısı çıkarır; bu yüzden tek boş satır verilir
            this._export([{}], false, "Excel_Sablon");
        },

        onDownloadTable() {
            const aRows = this.getView().getModel("view").getProperty("/rows");
            if (!aRows.length) {
                MessageToast.show(this._t("msgNoData"));
                return;
            }
            this._export(aRows, true, "Malzeme_Listesi");
        },

        _export(aData, bWithStatus, sFileName) {
            const aCols = COLUMNS.map((c) => ({ label: c.header, property: c.key, type: "String" }));
            if (bWithStatus) {
                aCols.push({ label: this._t("statusCode"), property: "StatusCode", type: "String" });
                aCols.push({ label: this._t("statusMessage"), property: "StatusMessage", type: "String" });
            }
            const oSheet = new Spreadsheet({
                workbook: { columns: aCols, context: { sheetName: "Malzeme" } },
                dataSource: aData,
                fileName: sFileName + ".xlsx"
            });
            oSheet.build()
                .catch(() => MessageBox.error(this._t("msgLibFail")))
                .finally(() => oSheet.destroy());
        },

        /* ---------------- Malzeme yaratma (demo) ---------------- */

        onCreate() {
            const aCtx = this.byId("table").getSelectedContexts();
            if (!aCtx.length) {
                MessageBox.warning(this._t("msgNoSelection"));
                return;
            }
            BusyIndicator.show(0);
            // Gerçek SAP çağrısı yerine kısa gecikmeli simülasyon
            setTimeout(() => {
                const oModel = this.getView().getModel("view");
                let ok = 0;
                let fail = 0;
                aCtx.forEach((oCtx) => {
                    const oRes = this._mockCreate(oCtx.getObject());
                    const sPath = oCtx.getPath();
                    oModel.setProperty(sPath + "/StatusCode", this._t(oRes.success ? "success" : "failed"));
                    oModel.setProperty(sPath + "/State", oRes.success ? "Success" : "Error");
                    oModel.setProperty(sPath + "/Icon", oRes.success ? "sap-icon://accept" : "sap-icon://decline");
                    oModel.setProperty(sPath + "/StatusMessage", oRes.message);
                    if (oRes.success) {
                        ok++;
                    } else {
                        fail++;
                    }
                });
                BusyIndicator.hide();
                MessageToast.show(this._t("msgDone", [ok, fail]));
            }, 600);
        },

        _mockCreate(oRow) {
            const aMissing = REQUIRED.filter((k) => !oRow[k]).map((k) => COLUMNS.find((c) => c.key === k).header);
            if (aMissing.length) {
                return { success: false, message: this._t("msgMissing", [aMissing.join(", ")]) };
            }
            if (KNOWN_TYPES.indexOf(oRow.Mtart.toUpperCase()) < 0) {
                return { success: false, message: this._t("msgBadType", [oRow.Mtart]) };
            }
            return { success: true, message: this._t("msgOk", [oRow.Mtart]) };
        }
    });
});
