// Run from ZipLens_Astra: node --experimental-strip-types --expose-gc scripts/benchmark-reports.mjs
// Synthetic metadata only: this does not measure DOM rendering, file writes, or codec throughput.
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { buildReportRows } from '../src/report-model.ts';

function fixture(count) {
  const entries = Array.from({length:count},(_,i)=>({path:`folder/item-${String(i).padStart(6,'0')}.txt`,size:i+1}));
  return {entries, report:{success_files:entries.map(entry=>entry.path),output_paths:entries.map(entry=>`/out/${entry.path}`),failed_files:[],cancelled:false}};
}
// Previous main.ts metadata lookup, one Array.find + suffix comparison per result.
function oldRows({entries,report}) {
  return report.success_files.map(path=>entries.find(entry=>path.endsWith(entry.path))?.size ?? 0);
}
function newRows({entries,report}) {
  return buildReportRows(report,entries).successes.map(row=>row.size);
}
function measure(name,work,input,count) {
  const samples=[];
  for(let i=0;i<3;i++) {
    global.gc?.();
    const start=performance.now();
    const rows=work(input);
    const elapsed=performance.now()-start;
    assert.equal(rows.length,count);
    assert.equal(rows.reduce((sum,size)=>sum+size,0),count*(count+1)/2);
    samples.push(Number(elapsed.toFixed(3)));
  }
  return {name,count,milliseconds:samples,median_ms:[...samples].sort((a,b)=>a-b)[1]};
}
const warmup=fixture(1000);oldRows(warmup);newRows(warmup);
const small=fixture(10000),large=fixture(100000);
const results=[measure('previous_suffix_scan',oldRows,small,10000),measure('indexed_report_rows',newRows,small,10000),measure('indexed_report_rows',newRows,large,100000)];
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,scope:'Pure report metadata model, not DOM rendering or archive throughput. One 1000-row warmup, 3 samples with GC before timing. Baseline 100k not timed.',baseline_10000_comparisons:10000*10001/2,results},null,2));
