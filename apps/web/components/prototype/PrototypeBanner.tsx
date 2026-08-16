// Every page under /prototype/operator must show this. It exists so the
// prototype can never be mistaken for a production-ready operator tool —
// see RepairScope HK — Local Post-Intake Prototype, Slice 1, §4.
export function PrototypeBanner() {
  return (
    <div className="proto-banner" role="note">
      <strong>內部原型 — 不可供客戶或師傅使用</strong>
      <span>INTERNAL PROTOTYPE — NOT FOR CUSTOMER OR CONTRACTOR USE</span>
    </div>
  );
}
