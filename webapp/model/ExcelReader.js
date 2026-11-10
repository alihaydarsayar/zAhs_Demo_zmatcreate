sap.ui.define([
    "sap/ui/thirdparty/jszip"
], (JSZipModule) => {
    "use strict";

    // UI5 çekirdeğiyle gelen JSZip (v2.x) kullanılır; harici kütüphane gerekmez.
    const JSZip = JSZipModule || window.JSZip;
    const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    function parseXml(sXml) {
        return new DOMParser().parseFromString(sXml, "application/xml");
    }

    function elements(oParent, sName) {
        return Array.from(oParent.getElementsByTagNameNS("*", sName));
    }

    function readText(oZip, sPath) {
        const oFile = oZip.file(sPath);
        return oFile ? oFile.asText() : null;
    }

    // "AB12" -> 27 (0 tabanlı sütun indeksi)
    function columnIndex(sRef) {
        const sLetters = sRef.replace(/[^A-Z]/gi, "").toUpperCase();
        let n = 0;
        for (let i = 0; i < sLetters.length; i++) {
            n = n * 26 + (sLetters.charCodeAt(i) - 64);
        }
        return n - 1;
    }

    function readSharedStrings(oZip) {
        const sXml = readText(oZip, "xl/sharedStrings.xml");
        if (!sXml) {
            return [];
        }
        return elements(parseXml(sXml), "si").map((oSi) =>
            elements(oSi, "t").map((oT) => oT.textContent).join(""));
    }

    /** Çalışma kitabındaki sayfaların adını ve dosya yolunu döndürür. */
    function listSheets(oZip) {
        const sWorkbook = readText(oZip, "xl/workbook.xml");
        if (!sWorkbook) {
            throw new Error("Geçerli bir .xlsx dosyası değil");
        }
        const sRels = readText(oZip, "xl/_rels/workbook.xml.rels");
        const aRels = sRels ? elements(parseXml(sRels), "Relationship") : [];

        const aSheets = elements(parseXml(sWorkbook), "sheet").map((oSheet, i) => {
            const sRid = oSheet.getAttributeNS(NS_REL, "id");
            const oRel = aRels.find((o) => o.getAttribute("Id") === sRid);
            let sPath = "xl/worksheets/sheet" + (i + 1) + ".xml";
            if (oRel) {
                const sTarget = oRel.getAttribute("Target");
                sPath = sTarget.charAt(0) === "/" ? sTarget.slice(1) : "xl/" + sTarget;
            }
            return { name: oSheet.getAttribute("name") || "Sheet" + (i + 1), path: sPath };
        });
        if (!aSheets.length) {
            throw new Error("Çalışma sayfası bulunamadı");
        }
        return aSheets;
    }

    function cellValue(oCell, aShared) {
        const sType = oCell.getAttribute("t");
        if (sType === "inlineStr") {
            return elements(oCell, "t").map((o) => o.textContent).join("");
        }
        const oV = elements(oCell, "v")[0];
        if (!oV) {
            return "";
        }
        return sType === "s" ? (aShared[parseInt(oV.textContent, 10)] || "") : oV.textContent;
    }

    /** Tek bir sayfayı okur: rows (boş satırlar atlanmış) ve gerçek Excel satır numaraları. */
    function readSheet(oZip, sPath, aShared) {
        const sXml = readText(oZip, sPath);
        if (!sXml) {
            throw new Error("Çalışma sayfası bulunamadı: " + sPath);
        }
        const aRows = [];
        const aRowNumbers = [];

        elements(parseXml(sXml), "row").forEach((oRow, iRow) => {
            const aRow = [];
            elements(oRow, "c").forEach((oCell, i) => {
                const sRef = oCell.getAttribute("r");
                aRow[sRef ? columnIndex(sRef) : i] = String(cellValue(oCell, aShared)).trim();
            });
            const aFull = Array.from(aRow, (v) => v || "");
            if (aFull.some((v) => v !== "")) {
                aRows.push(aFull);
                aRowNumbers.push(parseInt(oRow.getAttribute("r"), 10) || iRow + 1);
            }
        });
        return { rows: aRows, rowNumbers: aRowNumbers };
    }

    return {
        /**
         * .xlsx dosyasındaki tüm sayfaları okur.
         * @param {ArrayBuffer} oBuffer Dosya içeriği
         * @returns {{name: string, rows: string[][], rowNumbers: number[]}[]} Sayfalar
         */
        readSheets(oBuffer) {
            const oZip = new JSZip(oBuffer);
            const aShared = readSharedStrings(oZip);
            return listSheets(oZip).map((oSheet) =>
                Object.assign({ name: oSheet.name }, readSheet(oZip, oSheet.path, aShared)));
        },

        /**
         * .xlsx dosyasının ilk sayfasını satır/sütun dizisi olarak döndürür.
         * @param {ArrayBuffer} oBuffer Dosya içeriği
         * @returns {string[][]} Satırlar (boş satırlar atlanır)
         */
        read(oBuffer) {
            return this.readSheets(oBuffer)[0].rows;
        }
    };
});
