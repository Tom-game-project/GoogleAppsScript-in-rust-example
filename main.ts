import { $init, scream, sayHello } from "./target/jco/playground_jco.js";
//import { TextDecoder, TextEncoder } from "./textencoderdecoder.js";
import "./textencoderdecoder"

declare const global: any;

global.aaa = function() {
  $init.then(() => {
    let msg = scream("hello world");
    sayHello(msg);
  });
}
