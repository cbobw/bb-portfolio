---
# ═══════════════════════════════════════════
# 未來工程藍圖 — 內容編輯檔（唯一來源）
# 路徑：src/content/future-plans/blueprint.md
# 改完存檔後，開發伺服器會自動刷新頁面。
# ═══════════════════════════════════════════

drawing: "BINGLE-FUTURE"
revision: "A"
scale: "1:1"
title: "未來工程藍圖"
subtitle: "工業設計 × 純藝術的下一階段結構圖。每個單元是一顆幾何構件，Solid / Wireframe 一鍵切換檢視模式。"

# plans 陣列：每一筆 = 藍圖上的一顆幾何單元
# ─────────────────────────────────────────
# id       零件編號（顯示在單元左上）
# title    標題
# desc     簡短說明（建議 1–2 句）
# year     目標年份
# code     技術代號（顯示在幾何旁）
# status   狀態標籤：research | build | exhibit | explore
# shape    幾何造型（擇一）：
#            hex     六角構件
#            circle  圓心十字
#            tri     三角剖面
#            rect    矩形基準框
#            diamond 菱形節點
#            iso     等角立方
#            ring    同心環
#            cross   定位十字
# ─────────────────────────────────────────
plans:
  - id: "P-01"
    title: "CMF 材料研究"
    desc: "建立個人材料樣本庫：金屬陽極、彈性體、紙基複合，記錄觸感與製程參數。"
    year: "2026"
    code: "MAT-CMF"
    status: "research"
    shape: "hex"

  - id: "P-02"
    title: "互動作品集 2.0"
    desc: "將物理引擎與手勢操作延伸至更多專案敘事介面，形成可操作的作品劇場。"
    year: "2026"
    code: "UX-PHY"
    status: "build"
    shape: "iso"

  - id: "P-03"
    title: "產品原型工作坊"
    desc: "草模 → 結構驗證 → 小批量展示件的完整鏈路，練習從概念到實體的工藝閉環。"
    year: "2027"
    code: "PRT-LAB"
    status: "build"
    shape: "rect"

  - id: "P-04"
    title: "跨域聯展"
    desc: "工業設計 × 純藝術的實體展演，強調幾何秩序與工藝觸感的並置。"
    year: "2027"
    code: "EXH-X"
    status: "exhibit"
    shape: "diamond"

  - id: "P-05"
    title: "手繪—數位轉換系統"
    desc: "把素描與油畫的筆觸邏輯轉譯為建模與渲染參數，形成可重複的視覺語彙。"
    year: "2026"
    code: "ART-DIG"
    status: "explore"
    shape: "circle"

  - id: "P-06"
    title: "隱藏入口實驗"
    desc: "延續 Secret Base 的探索感，設計更多需發現才能進入的敘事節點。"
    year: "2027"
    code: "SEC-NODE"
    status: "explore"
    shape: "ring"
---

<!--
  下方 Markdown 正文目前不顯示在頁面上。
  你可以當個人筆記區使用（例如靈感、待補照片、參考連結）。
-->

## 編輯備註

- 新增規劃：在 `plans:` 底下複製一組 `- id: ...` 區塊即可。
- 刪除規劃：刪掉對應那一組即可。
- 想換造型：改 `shape` 欄位（見上方註解列表）。
- 頁面會自動依陣列順序排版，無需改程式碼。
