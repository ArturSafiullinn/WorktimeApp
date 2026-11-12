// Execute the actual calculation declarations without mounting the React app.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = fs.readFileSync('src/main.tsx', 'utf8');
const names = new Set(['normalizedEmployeeName','hasMetalworkingNoLunchException','timeMinutes','durationHours','durationHoursBetween','roundHours','isRegularSchedule','lunchHoursFor','plannedPaidHoursFor','payableManualHours','payableFactHours']);
const ast = ts.createSourceFile('main.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => names.has(d.name.getText(ast)))).map(s => s.getText(ast)).join('\n');
const context = vm.createContext({formatScheduleText: x => x, hasCompensatedEarlyLeave: () => false, hasHusainovOzonException: () => false});
vm.runInContext(ts.transpile(declarations, {target: ts.ScriptTarget.ES2020}) + '\nglobalThis.calc = {payableManualHours,payableFactHours};', context);
const shu = {name:'Шувалов Михаил Валентинович',department:'Металлобработка',scheduleCode:'standard',scheduleKind:'weekly',schedulePaidHours:8,schedule:'08:00–17:00',entry:'08:00',exit:'17:00',fact:8};
assert.equal(context.calc.payableManualHours(shu,'08:00','17:00'),9);
assert.equal(context.calc.payableFactHours(shu),9);
assert.equal(context.calc.payableFactHours({...shu,exit:'19:00'}),11);
assert.equal(context.calc.payableManualHours(shu,'08:00','17:00',30),8.5);
assert.equal(context.calc.payableFactHours({...shu,fact:0,exit:'—'}),0);
const regular = {...shu,name:'Иванов Иван Иванович'};
assert.equal(context.calc.payableManualHours(regular,'08:00','17:00'),8);
assert.equal(context.calc.payableFactHours(regular),8);
assert.equal(context.calc.payableManualHours(regular,'08:00','17:00',0,undefined,undefined,true),9);
console.log('8 payroll regression checks passed');
// Workbook import must recognize the spelling used in the production directory.
const {createRequire} = await import('node:module');
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const skudContext = vm.createContext({require,exports:{}});
vm.runInContext(ts.transpile(fs.readFileSync('src/skud.ts','utf8'),{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}),skudContext);
for (const department of ['Металлобработка','Металлообработка']) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ID сотрудника','Имя','Дата записи','Самое раннее время','Самое позднее время','Имя отдела','Записано раз'],
    [154,'Шувалов Михаил Валентинович','2026-10-14','08:02','16:56',department,2],
  ]);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'Data');
  const [result] = skudContext.exports.parseSkudWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
  assert.equal(result.fact,8.9);
  assert.equal(context.calc.payableFactHours({...shu,department}),9);
}
console.log('Workbook import and both department spellings passed');
