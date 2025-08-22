//import { scream, sayHello } from "./target/jco/playground_jco.js";
import { scream, sayHello } from "./target/jco/playground_jco.js";

export function aaa()
{
	// Wasmモジュールの初期化を待ち、関数を取得する
	let msg = scream("chashu would like some tuna");
	//console.log(msg);
	sayHello(msg);
}

