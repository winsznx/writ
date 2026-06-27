import * as snarkjs from "snarkjs";
import fs from "fs";
const input = JSON.parse(fs.readFileSync("./build/input_eligible.json"));
const wasm = "./build/eligibility_js/eligibility.wasm";
const zkey = "./build/elig2_final.zkey";
const N = 5;
let times = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const { publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const dt = (performance.now() - t0) / 1000;
  times.push(dt);
  console.log(`  run ${i+1}: ${dt.toFixed(2)}s`);
}
times.sort((a,b)=>a-b);
const avg = times.reduce((a,b)=>a+b,0)/N;
console.log(`\nfullProve (witness + groth16): min ${times[0].toFixed(2)}s  median ${times[Math.floor(N/2)].toFixed(2)}s  avg ${avg.toFixed(2)}s  [Node ${process.arch}]`);
console.log(`zkey ${(fs.statSync(zkey).size/1e6).toFixed(1)}MB  wasm ${(fs.statSync(wasm).size/1e6).toFixed(2)}MB`);
process.exit(0);
