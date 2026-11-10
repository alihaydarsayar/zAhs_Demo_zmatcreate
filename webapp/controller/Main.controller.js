sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/export/Spreadsheet",
    "sap/base/Log",
    "sap/base/security/encodeXML",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "com/alihaydarsayar/zmatcreate/model/ExcelReader",
    "com/alihaydarsayar/zmatcreate/model/SpreadsheetLoader"
], (Controller, JSONModel, MessageToast, MessageBox, BusyIndicator, Spreadsheet, Log, encodeXML, Fragment, Filter, FilterOperator, ExcelReader, SpreadsheetLoader) => {
    "use strict";

    // Model alanı <-> i18n anahtarı (Excel başlıkları kullanıcının diline göre gelir)
    const COLUMNS = [
        { key: "Mtart", i18n: "colMtart" },
        { key: "Maktx", i18n: "colMaktx" },
        { key: "Meins", i18n: "colMeins" },
        { key: "Sector", i18n: "colSector" },
        { key: "Division", i18n: "colDivision" },
        { key: "Plant", i18n: "colPlant" },
        { key: "Storage", i18n: "colStorage" }
    ];
    const REQUIRED = ["Mtart", "Maktx", "Meins", "Plant"];
    // Demo: SAP'de tanımlı kabul edilen malzeme türleri
    const KNOWN_TYPES = ["FERT", "HALB", "HAWA", "VERP", "ZRAW"];

    // Durum -> görünüm eşlemesi
    const STATUS = {
        success: { state: "Success", highlight: "Success", icon: "sap-icon://accept", textKey: "success" },
        failed: { state: "Error", highlight: "Error", icon: "sap-icon://decline", textKey: "failed" },
        incomplete: { state: "Warning", highlight: "Warning", icon: "sap-icon://alert", textKey: "incomplete" }
    };

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

    // Izgara sütun genişlikleri (px): açıklama, durum kodu ve durum mesajı daha geniş
    const GRID_WIDTHS = [110, 190, 130, 90, 90, 110, 100, 120, 280];

    /** Tamamen boş satırları ayıklar. */
    function withoutBlankRows(aRows) {
        return aRows.filter((aRow) => aRow.some((v) => String(v === undefined || v === null ? "" : v).trim() !== ""));
    }

    return Controller.extend("com.alihaydarsayar.zmatcreate.controller.Main", {

        onInit() {
            this._oModel = new JSONModel({
                fileName: "",
                count: "",
                hasRows: false,
                // /excel uygulaması manifest'te bunu true yapar (Excel önizleme ve Excel Görünümü)
                excelEnabled: !!this.getOwnerComponent().getManifestEntry("/sap.ui5/config/excelEnabled"),
                rows: [],
                message: { visible: false, type: "Information", text: "" },
                filter: "all",
                summary: { successCount: 0, errorCount: 0, incompleteCount: 0, success: "", error: "", incomplete: "" }
            });
            this.getView().setModel(this._oModel, "view");
            this._oPreview = new JSONModel({
                title: "", mode: "upload", info: "", sheets: [], selected: "0", canLoad: false
            });
            this._oPending = null;
            this._oGrid = null;
            this._iGridSheet = 0;
        },

        _t(sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        /** Boş bırakılmış zorunlu alanların (çevrilmiş) başlıklarını döndürür. */
        _missingFields(oRow) {
            return REQUIRED.filter((k) => !oRow[k]).map((k) => this._t(COLUMNS.find((c) => c.key === k).i18n));
        },

        /**
         * Sayfanın üstündeki mesaj şeridini gösterir (type: Success|Warning|Error|Information).
         * bPopup true ve tip Warning/Error ise aynı mesaj popup olarak da açılır;
         * aDetails (satır listesi) popup'ta "Ayrıntılar" bölümüne yazılır.
         */
        _showMessage(sType, sText, bPopup, aDetails) {
            this._oModel.setProperty("/message", { visible: true, type: sType, text: sText });
            if (bPopup && (sType === "Warning" || sType === "Error")) {
                const oOptions = {};
                if (aDetails && aDetails.length) {
                    oOptions.details = "<ul>" + aDetails.map((d) => "<li>" + encodeXML(d) + "</li>").join("") + "</ul>";
                }
                MessageBox[sType === "Error" ? "error" : "warning"](sText, oOptions);
            }
        },

        _hideMessage() {
            this._oModel.setProperty("/message/visible", false);
        },

        /** Satırın durum alanlarını tek seferde ayarlar. */
        _setStatus(oRow, sStatus, sMessage) {
            const oS = STATUS[sStatus];
            Object.assign(oRow, {
                StatusCode: this._t(oS.textKey),
                StatusMessage: sMessage,
                State: oS.state,
                Highlight: oS.highlight,
                Icon: oS.icon
            });
        },

        /** Üst bardaki başarılı/başarısız sayaçlarını günceller. */
        _updateSummary() {
            const aRows = this._oModel.getProperty("/rows");
            const iOk = aRows.filter((r) => r.Highlight === "Success").length;
            const iErr = aRows.filter((r) => r.Highlight === "Error").length;
            const iWarn = aRows.filter((r) => r.Highlight === "Warning").length;
            this._oModel.setProperty("/summary", {
                successCount: iOk,
                errorCount: iErr,
                incompleteCount: iWarn,
                success: this._t("summarySuccess", [iOk]),
                error: this._t("summaryError", [iErr]),
                incomplete: this._t("summaryIncomplete", [iWarn])
            });
        },

        /* ---------------- Tablo filtre / arama ---------------- */

        onFilterChange() {
            this._applyFilters();
        },

        onSearch(oEvent) {
            this._sQuery = (oEvent.getParameter("newValue") || "").trim();
            this._applyFilters();
        },

        /** Durum filtresi ve arama metnini birlikte uygular. */
        _applyFilters() {
            const aFilters = [];
            const sStatus = this._oModel.getProperty("/filter");
            if (sStatus && sStatus !== "all") {
                aFilters.push(new Filter("Highlight", FilterOperator.EQ, sStatus));
            }
            if (this._sQuery) {
                aFilters.push(new Filter({
                    filters: ["Mtart", "Maktx", "Plant", "Storage", "StatusMessage"]
                        .map((k) => new Filter(k, FilterOperator.Contains, this._sQuery)),
                    and: false
                }));
            }
            this.byId("table").getBinding("items").filter(aFilters);
        },

        /** Yalnızca hatalı satırları gösterip hepsini seçer; düzeltip tekrar denemek için. */
        onSelectFailed() {
            this._oModel.setProperty("/filter", "Error");
            this._applyFilters();
            this.byId("table").selectAll();
        },

        /* ---------------- Excel yükleme ---------------- */

        onTypeMismatch() {
            this._showMessage("Error", this._t("msgBadFileType"), true);
        },

        onFileChange(oEvent) {
            const oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (!oFile) {
                return;
            }
            const bPreview = this._oModel.getProperty("/excelEnabled");
            const oReader = new FileReader();
            oReader.onload = (e) => bPreview
                ? this._openPreview(oFile.name, e.target.result)
                : this._loadDirect(oFile.name, e.target.result);
            oReader.onerror = () => this._showMessage("Error", this._t("msgBadFile"), true);
            oReader.readAsArrayBuffer(oFile);
        },

        /** Önizleme olmadan: ilk sayfayı doğrudan tabloya aktarır. */
        _loadDirect(sName, oBuffer) {
            let aRows;
            try {
                aRows = withoutBlankRows(ExcelReader.read(oBuffer));
            } catch (oError) {
                Log.error("Excel okunamadı", oError && oError.stack);
                MessageBox.error(this._t("msgBadFile"), { details: String(oError && oError.message) });
                return;
            }
            this._applyRows(sName, aRows);
        },

        /* ---------------- Excel önizleme / düzenleme (Jspreadsheet) ---------------- */

        _openPreview(sName, oBuffer) {
            let aSheets;
            try {
                aSheets = ExcelReader.readSheets(oBuffer);
            } catch (oError) {
                Log.error("Excel okunamadı", oError && oError.stack);
                MessageBox.error(this._t("msgBadFile"), { details: String(oError && oError.message) });
                return;
            }
            this._oPending = { name: sName, sheets: aSheets };
            this._oPreview.setProperty("/mode", "upload");
            this._oPreview.setProperty("/title", this._t("previewTitle"));
            this._showGridDialog();
        },

        /** Tablodaki güncel veriyi (durum sütunlarıyla) Excel benzeri düzenlenebilir ızgarada açar. */
        onShowGrid() {
            const aData = this._oModel.getProperty("/rows");
            if (!aData.length) {
                MessageToast.show(this._t("msgNoData"));
                return;
            }
            const aHead = COLUMNS.map((c) => this._t(c.i18n)).concat([this._t("statusCode"), this._t("statusMessage")]);
            const aRows = [aHead].concat(aData.map((r) =>
                COLUMNS.map((c) => r[c.key]).concat([r.StatusCode, r.StatusMessage])));
            this._oPending = {
                name: this._oModel.getProperty("/fileName") || this._t("sheetName"),
                sheets: [{ name: this._t("sheetName"), rows: aRows }]
            };
            this._oPreview.setProperty("/mode", "view");
            this._oPreview.setProperty("/title", this._t("gridTitle"));
            this._showGridDialog();
        },

        _showGridDialog() {
            this._oPreview.setProperty("/sheets", this._oPending.sheets.map((o, i) => ({ key: String(i), name: o.name })));
            this._oPreview.setProperty("/selected", "0");
            this._iGridSheet = 0;
            this._updatePreview();

            if (!this._pDialog) {
                this._pDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "com.alihaydarsayar.zmatcreate.view.PreviewDialog",
                    controller: this
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    oDialog.setModel(this._oPreview, "preview");
                    // Hücre düzenlerken Esc yalnızca düzenlemeyi iptal etsin, pencereyi kapatmasın
                    oDialog.setEscapeHandler((oPromise) => {
                        if (this._oGrid && this._oGrid.edition) {
                            oPromise.reject();
                        } else {
                            oPromise.resolve();
                        }
                    });
                    return oDialog;
                });
            }
            this._pDialog.then((oDialog) => oDialog.open());
        },

        /** Bilgi satırını ve Yükle düğmesinin durumunu günceller. */
        _updatePreview() {
            const oSheet = this._oPending.sheets[parseInt(this._oPreview.getProperty("/selected"), 10)];
            const iRows = oSheet.rows.length;
            this._oPreview.setProperty("/info", this._oPending.name + " · " + this._t("rowCount", [iRows]));
            this._oPreview.setProperty("/canLoad", iRows > 0);
        },

        onPreviewAfterOpen() {
            this._renderGrid();
        },

        onPreviewAfterClose() {
            this._destroyGrid();
            this._oPending = null;
        },

        /** Seçili sayfa için ızgarayı (yeniden) oluşturur. */
        _renderGrid() {
            const oSheet = this._oPending.sheets[parseInt(this._oPreview.getProperty("/selected"), 10)];
            const bView = this._oPreview.getProperty("/mode") === "view";
            Promise.all([this._pDialog, SpreadsheetLoader.load()]).then(([oDialog, jspreadsheet]) => {
                const oHost = oDialog.getDomRef() && oDialog.getDomRef().querySelector(".zmcSheetHost");
                if (!oHost || !this._oPending) {
                    return;
                }
                this._destroyGrid();
                const iCols = Math.max(COLUMNS.length, ...oSheet.rows.map((r) => r.length));
                const aData = oSheet.rows.map((aRow) =>
                    Array.from({ length: iCols }, (_, i) => (aRow[i] === undefined ? "" : aRow[i])));
                const oStyle = {};
                for (let i = 0; i < iCols; i++) {
                    oStyle[jspreadsheet.getColumnNameFromId([i, 0])] = "font-weight: bold; background-color: #f7f9fc;";
                }
                const oT = (k) => this._t(k);
                this._oGrid = jspreadsheet(oHost, {
                    data: aData,
                    // Görünüm modunda Durum sütunları salt okunur
                    columns: Array.from({ length: iCols }, (_, i) => ({
                        type: "text", width: GRID_WIDTHS[i] || 120, readOnly: bView && i >= COLUMNS.length
                    })),
                    minDimensions: [iCols, Math.max(aData.length + 5, 15)],
                    tableOverflow: true,
                    tableWidth: Math.max(280, oHost.clientWidth) + "px",
                    tableHeight: Math.round(Math.min(window.innerHeight * 0.55, 460)) + "px",
                    style: oStyle,
                    columnSorting: false,
                    allowComments: false,
                    allowRenameColumn: false,
                    allowInsertColumn: !bView,
                    allowDeleteColumn: !bView,
                    allowManualInsertColumn: !bView,
                    about: false,
                    text: {
                        insertANewRowBefore: oT("gridRowBefore"),
                        insertANewRowAfter: oT("gridRowAfter"),
                        deleteSelectedRows: oT("gridDelRows"),
                        insertANewColumnBefore: oT("gridColBefore"),
                        insertANewColumnAfter: oT("gridColAfter"),
                        deleteSelectedColumns: oT("gridDelCols"),
                        copy: oT("gridCopy"),
                        paste: oT("gridPaste"),
                        saveAs: oT("gridSaveCsv"),
                        areYouSureToDeleteTheSelectedRows: oT("gridConfirmDelRows"),
                        areYouSureToDeleteTheSelectedColumns: oT("gridConfirmDelCols")
                    }
                });
                this._iGridSheet = parseInt(this._oPreview.getProperty("/selected"), 10);
            }).catch((oError) => {
                Log.error("Izgara yüklenemedi", oError && oError.stack);
                this._closePreview();
                this._showMessage("Error", this._t("msgGridFail"), true);
            });
        },

        _destroyGrid() {
            if (!this._oGrid) {
                return;
            }
            const oHost = this._oGrid.el && this._oGrid.el.parentNode;
            try {
                window.jspreadsheet.destroy(this._oGrid.el);
            } catch (e) {
                Log.warning("Izgara temizlenemedi", e && e.message);
            }
            if (oHost) {
                oHost.innerHTML = "";
            }
            this._oGrid = null;
        },

        /** Izgaradaki (düzenlenmiş) veriyi ilgili sayfanın satırlarına geri yazar. */
        _syncGrid() {
            if (this._oGrid && this._oPending) {
                this._oPending.sheets[this._iGridSheet].rows = this._oGrid.getData().map((aRow) => aRow.slice());
            }
        },

        onPreviewSheetChange() {
            this._syncGrid();
            this._updatePreview();
            this._renderGrid();
        },

        onPreviewLoad() {
            this._syncGrid();
            const oSheet = this._oPending.sheets[parseInt(this._oPreview.getProperty("/selected"), 10)];
            const sName = this._oPending.name;
            const aRows = withoutBlankRows(oSheet.rows);
            this._closePreview();
            this._applyRows(sName, aRows);
        },

        /** Görünüm modunda düzenlenen veriyi ana tabloya uygular. */
        onGridSave() {
            this._syncGrid();
            const aGrid = withoutBlankRows(this._oPending.sheets[0].rows).slice(1); // ilk satır başlık
            const aOld = this._oModel.getProperty("/rows");
            const aIdx = COLUMNS.map((_, i) => i);

            const aRows = aGrid.map((aRow, i) => {
                const oRow = Object.assign(toRecord(aRow, aIdx), { No: i + 1 });
                const oPrev = aOld[i];
                const bSame = oPrev && COLUMNS.every((c) => oPrev[c.key] === oRow[c.key]);
                if (bSame) {
                    // Satır değişmediyse mevcut durumu (başarılı/başarısız) koru
                    Object.assign(oRow, {
                        StatusCode: oPrev.StatusCode, StatusMessage: oPrev.StatusMessage,
                        State: oPrev.State, Highlight: oPrev.Highlight, Icon: oPrev.Icon
                    });
                } else {
                    Object.assign(oRow, { StatusCode: "", StatusMessage: "", State: "None", Highlight: "None", Icon: "" });
                    const aMissing = this._missingFields(oRow);
                    if (aMissing.length) {
                        this._setStatus(oRow, "incomplete", this._t("msgMissing", [aMissing.join(", ")]));
                    }
                }
                return oRow;
            });

            this._closePreview();
            this._setRows(aRows);
            const iIncomplete = aRows.filter((r) => r.Highlight === "Warning").length;
            if (iIncomplete) {
                this._showMessage("Warning", this._t("msgGridSavedWarn", [aRows.length, iIncomplete]), true,
                    aRows.filter((r) => r.Highlight === "Warning").map((r) => "#" + r.No + ": " + r.StatusMessage));
            } else {
                this._showMessage("Success", this._t("msgGridSaved", [aRows.length]));
            }
        },

        onPreviewCancel() {
            this._closePreview();
        },

        _closePreview() {
            this._pDialog.then((oDialog) => oDialog.close());
        },

        /* ---------------- Tabloya aktarma ---------------- */

        /** Tablo satırlarını, sayaçları ve seçimi tek yerden günceller. */
        _setRows(aRows) {
            this._oModel.setProperty("/rows", aRows);
            this._oModel.setProperty("/hasRows", aRows.length > 0);
            this._oModel.setProperty("/count", aRows.length ? this._t("rowCount", [aRows.length]) : "");
            this._updateSummary();
            this.byId("table").removeSelections(true);
        },

        _applyRows(sName, aAoa) {
            // Başlık adına göre eşle; bulunamazsa sütun sırasına düş
            const aHead = (aAoa[0] || []).map(normalize);
            const aIdx = COLUMNS.map((c, i) => {
                const n = aHead.indexOf(normalize(this._t(c.i18n)));
                return n >= 0 ? n : i;
            });
            const aRows = aAoa.slice(1).map((aRow, i) => {
                const oRow = Object.assign(toRecord(aRow, aIdx), {
                    No: i + 1, StatusCode: "", StatusMessage: "", State: "None", Highlight: "None", Icon: ""
                });
                const aMissing = this._missingFields(oRow);
                if (aMissing.length) {
                    this._setStatus(oRow, "incomplete", this._t("msgMissing", [aMissing.join(", ")]));
                }
                return oRow;
            });

            if (!aRows.length) {
                this._showMessage("Warning", this._t("msgEmptyFile"), true);
                return;
            }
            const iIncomplete = aRows.filter((r) => r.Highlight === "Warning").length;

            this._sQuery = "";
            this._oModel.setProperty("/filter", "all");
            this._applyFilters();
            this._oModel.setProperty("/fileName", sName);
            this._setRows(aRows);

            if (iIncomplete) {
                this._showMessage("Warning", this._t("msgLoadedWarn", [aRows.length, iIncomplete]), true,
                    aRows.filter((r) => r.Highlight === "Warning").map((r) => "#" + r.No + ": " + r.StatusMessage));
            } else {
                this._showMessage("Success", this._t("msgLoadedOk", [aRows.length]));
            }
        },

        /* ---------------- Excel indirme (sap.ui.export.Spreadsheet) ---------------- */

        onDownloadTemplate() {
            // Boş dizi, Spreadsheet'te "bilinmeyen satır sayısı" uyarısı çıkarır; bu yüzden tek boş satır verilir
            this._export([{}], false, "Excel_Sablon");
        },

        onDownloadTable() {
            const aRows = this._oModel.getProperty("/rows");
            if (!aRows.length) {
                MessageToast.show(this._t("msgNoData"));
                return;
            }
            this._export(aRows, true, "Malzeme_Listesi");
        },

        _export(aData, bWithStatus, sFileName) {
            const aCols = COLUMNS.map((c) => ({ label: this._t(c.i18n), property: c.key, type: "String" }));
            if (bWithStatus) {
                aCols.push({ label: this._t("statusCode"), property: "StatusCode", type: "String" });
                aCols.push({ label: this._t("statusMessage"), property: "StatusMessage", type: "String" });
            }
            const oSheet = new Spreadsheet({
                workbook: { columns: aCols, context: { sheetName: this._t("sheetName") } },
                dataSource: aData,
                fileName: sFileName + ".xlsx"
            });
            oSheet.build()
                .catch(() => this._showMessage("Error", this._t("msgLibFail"), true))
                .finally(() => oSheet.destroy());
        },

        /* ---------------- Malzeme yaratma (demo) ---------------- */

        onCreate() {
            const aCtx = this.byId("table").getSelectedContexts();
            if (!aCtx.length) {
                this._showMessage("Warning", this._t("msgNoSelection"), true);
                return;
            }
            // Daha önce başarıyla yaratılan satırlar tekrar gönderilmez
            const aTodo = aCtx.filter((oCtx) => oCtx.getObject().Highlight !== "Success");
            const iSkipped = aCtx.length - aTodo.length;
            if (!aTodo.length) {
                this._showMessage("Information", this._t("msgNothingToDo"));
                return;
            }
            MessageBox.confirm(this._t("confirmText", [aTodo.length]), {
                title: this._t("confirmTitle"),
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        this._createRows(aTodo, iSkipped);
                    }
                }
            });
        },

        _createRows(aCtx, iSkipped) {
            this._hideMessage();
            BusyIndicator.show(0);
            // Gerçek SAP çağrısı yerine kısa gecikmeli simülasyon
            setTimeout(() => {
                let iOk = 0;
                let iFail = 0;
                const aFailed = [];
                aCtx.forEach((oCtx) => {
                    const oRow = oCtx.getObject();
                    const oRes = this._mockCreate(oRow);
                    this._setStatus(oRow, oRes.success ? "success" : "failed", oRes.message);
                    if (oRes.success) {
                        iOk++;
                    } else {
                        iFail++;
                        aFailed.push("#" + oRow.No + " " + oRow.Mtart + ": " + oRes.message);
                    }
                });
                this._oModel.refresh(true);
                this._updateSummary();
                this.byId("table").removeSelections(true);
                BusyIndicator.hide();
                this._showResult(iOk, iFail, iSkipped, aFailed);
            }, 600);
        },

        _showResult(iOk, iFail, iSkipped, aFailed) {
            let sType;
            let sText;
            if (!iFail) {
                sType = "Success";
                sText = this._t("msgDoneOk", [iOk]);
            } else if (iOk) {
                sType = "Warning";
                sText = this._t("msgDonePartial", [iOk, iFail]);
            } else {
                sType = "Error";
                sText = this._t("msgDoneFail", [iFail]);
            }
            if (iSkipped) {
                sText += " " + this._t("msgSkipped", [iSkipped]);
            }
            this._showMessage(sType, sText, true, aFailed);
        },

        _mockCreate(oRow) {
            const aMissing = this._missingFields(oRow);
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
